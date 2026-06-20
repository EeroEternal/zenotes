import { useMemo, useCallback, useState, useEffect } from "react";
import type { Note, NoteColor } from "@/types/note";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { liveQuery } from "dexie";

import * as api from "@/lib/api";
import { ApiError } from "@/lib/api-error";
import { useNetworkStatus } from "@/offline/network";
import { processSyncQueue } from "@/offline/syncEngine";
import {
  createLocalNote,
  updateLocalNote,
  deleteLocalNote,
  getLocalNotes,
  getLocalNote,
  type NoteInput,
} from "@/offline/localNoteApi";
import { db } from "@/offline/db";

const PINNED_CONTAINER_ID = "pinned";
const UNPINNED_CONTAINER_ID = "unpinned";
const PAGE_SIZE = 50;

function sortPosition(n: Note): number {
  return Number.isFinite(n.position) ? n.position : 0;
}

function computeMove(
  notes: Note[],
  activeId: string,
  overId: string,
  destPinned: boolean,
): {
  nextNotes: Note[];
  pinnedIds: string[];
  unpinnedIds: string[];
  pinnedChanged: boolean;
} {
  const pinnedNotes = notes.filter((n) => n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b));
  const unpinnedNotes = notes.filter((n) => !n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b));

  const active = notes.find((n) => n.id === activeId);
  if (!active) {
    return {
      nextNotes: notes,
      pinnedIds: pinnedNotes.map((n) => n.id),
      unpinnedIds: unpinnedNotes.map((n) => n.id),
      pinnedChanged: false,
    };
  }

  const sourcePinned = active.pinned;
  const pinnedChanged = sourcePinned !== destPinned;

  const srcArr = sourcePinned ? pinnedNotes : unpinnedNotes;
  const dstArr = destPinned ? pinnedNotes : unpinnedNotes;

  const srcWithout = srcArr.filter((n) => n.id !== activeId);
  const dstWithout = destPinned === sourcePinned ? srcWithout : dstArr;

  const insertIndex =
    overId === PINNED_CONTAINER_ID || overId === UNPINNED_CONTAINER_ID
      ? dstWithout.length
      : Math.max(
          0,
          dstWithout.findIndex((n) => n.id === overId),
        );

  const moved: Note = { ...active, pinned: destPinned };

  const dstNext = [...dstWithout.slice(0, insertIndex), moved, ...dstWithout.slice(insertIndex)];

  const nextPinned = (destPinned ? dstNext : srcWithout)
    .map((n, idx) => ({ ...n, pinned: true, position: idx + 1 }));
  const nextUnpinned = (!destPinned ? dstNext : srcWithout)
    .map((n, idx) => ({ ...n, pinned: false, position: idx + 1 }));

  return {
    nextNotes: [...nextPinned, ...nextUnpinned],
    pinnedIds: nextPinned.map((n) => n.id),
    unpinnedIds: nextUnpinned.map((n) => n.id),
    pinnedChanged,
  };
}

export function useNotes() {
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [page, setPage] = useState(1);

  // Seed local DB from server on mount / when online
  const seedQuery = useQuery({
    queryKey: ["notes", "seed"],
    queryFn: async () => {
      const data = await api.fetchNotes(1, 1000);
      await db.transaction("rw", db.notes, async () => {
        for (const note of data.notes) {
          const exists = await db.notes.get(note.id);
          if (!exists) {
            await db.notes.add({
              ...note,
              syncStatus: "synced",
              isDeleted: false,
            } as any);
          }
        }
      });
      return data;
    },
    enabled: isOnline,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
    }
  }, [isOnline]);

  // Live local notes
  const [localNotes, setLocalNotes] = useState<Note[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => getLocalNotes()).subscribe((notes) => {
      setLocalNotes(notes as Note[]);
    });
    return () => subscription.unsubscribe();
  }, []);

  const allNotes = useMemo(() => {
    return localNotes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [localNotes]);

  const searchedNotes = useMemo(() => {
    // client-side pagination: all notes (search/filter applied)
    return allNotes;
  }, [allNotes]);

  const total = searchedNotes.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedNotes = useMemo(
    () => searchedNotes.slice(start, start + PAGE_SIZE),
    [searchedNotes, start],
  );

  const pinnedNotes = useMemo(
    () => paginatedNotes.filter((n) => n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b)),
    [paginatedNotes],
  );
  const unpinnedNotes = useMemo(
    () => paginatedNotes.filter((n) => !n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b)),
    [paginatedNotes],
  );

  const addNoteMutation = useMutation({
    mutationFn: (input: { content: string; title?: string; color?: NoteColor; tags?: string[] }) =>
      createLocalNote(input as NoteInput),
    onSuccess: () => {
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "保存失败，请稍后重试";
      toast.error(msg);
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Note> }) =>
      updateLocalNote(id, updates as NoteInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "更新失败，请稍后重试";
      toast.error(msg);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => deleteLocalNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Note deleted");
      if (isOnline) processSyncQueue();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "删除失败，请稍后重试";
      toast.error(msg);
    },
  });

  const moveMutation = useMutation({
    mutationFn: async (vars: {
      activeId: string;
      overId: string;
      destPinned: boolean;
      pinnedIds: string[];
      unpinnedIds: string[];
      pinnedChanged: boolean;
      nextNotes: Note[];
    }) => {
      // Update local positions/pinned first
      await db.transaction("rw", db.notes, async () => {
        for (const n of vars.nextNotes) {
          await db.notes.update(n.id, { pinned: n.pinned, position: n.position });
        }
      });
      // Sync to server when online
      if (vars.pinnedChanged) {
        await updateLocalNote(vars.activeId, { pinned: vars.destPinned });
      }
      await Promise.all([
        api.reorderNotes(true, vars.pinnedIds),
        api.reorderNotes(false, vars.unpinnedIds),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "Reorder failed";
      toast.error(msg);
    },
  });

  const importGoogleKeepMutation = useMutation({
    mutationFn: (files: { raw: string }[]) => api.importGoogleKeep(files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      // Force re-seed from server
      queryClient.invalidateQueries({ queryKey: ["notes", "seed"] });
    },
  });

  const addNote = useCallback(
    (content: string, title?: string, color: NoteColor = "white", tags: string[] = []) => {
      addNoteMutation.mutate({ content, title, color, tags });
    },
    [addNoteMutation],
  );

  const updateNote = useCallback(
    (id: string, updates: Partial<Omit<Note, "id">>) => {
      updateNoteMutation.mutate({ id, updates });
    },
    [updateNoteMutation],
  );

  const deleteNote = useCallback((id: string) => deleteNoteMutation.mutate(id), [deleteNoteMutation]);

  const togglePin = useCallback(
    (id: string) => {
      const note = allNotes.find((n) => n.id === id);
      if (!note) return;
      updateNoteMutation.mutate({ id, updates: { pinned: !note.pinned } });
    },
    [allNotes, updateNoteMutation],
  );

  const moveNote = useCallback(
    (activeId: string, overId: string, destPinned: boolean) => {
      const computed = computeMove(allNotes, activeId, overId, destPinned);
      moveMutation.mutate({ activeId, overId, destPinned, ...computed });
    },
    [allNotes, moveMutation],
  );

  const importGoogleKeep = useCallback(
    (files: { raw: string }[]) => importGoogleKeepMutation.mutateAsync(files),
    [importGoogleKeepMutation],
  );

  const searchNotes = useCallback(
    (query: string) => {
      if (!query.trim()) return allNotes;
      const lowerQuery = query.toLowerCase();
      return allNotes.filter(
        (note) =>
          (note.content ?? "").toLowerCase().includes(lowerQuery) ||
          note.title?.toLowerCase().includes(lowerQuery) ||
          (note.tags ?? []).some((t) => t.toLowerCase().includes(lowerQuery)),
      );
    },
    [allNotes],
  );

  return {
    notes: paginatedNotes,
    pinnedNotes,
    unpinnedNotes,
    addNote,
    updateNote,
    deleteNote,
    togglePin,
    moveNote,
    importGoogleKeep,
    searchNotes,
    isImportingKeep: importGoogleKeepMutation.isPending,
    isLoading: seedQuery.isLoading,
    isError: seedQuery.isError,
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    },
    page: safePage,
    setPage,
    pageSize: PAGE_SIZE,
    setPageSize: () => {}, // no-op; page size fixed for simplicity
  };
}

export function useNote(id: string | null) {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    if (!id) {
      setNote(null);
      return;
    }
    const subscription = liveQuery(() => getLocalNote(id)).subscribe((n) => {
      setNote(n as Note | undefined || null);
    });
    return () => subscription.unsubscribe();
  }, [id]);
  return note;
}
