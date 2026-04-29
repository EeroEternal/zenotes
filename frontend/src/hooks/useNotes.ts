import { useMemo, useCallback, useState } from "react";
import type { Note, NoteColor } from "@/types/note";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { ApiError } from "@/lib/api-error";

const PINNED_CONTAINER_ID = "pinned";
const UNPINNED_CONTAINER_ID = "unpinned";

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const notesQuery = useQuery({
    queryKey: ["notes", page, pageSize],
    queryFn: () => api.fetchNotes(page, pageSize),
    initialData: { notes: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } },
  });

  const notes = notesQuery.data?.notes ?? [];
  const pagination = notesQuery.data?.pagination;

  const addNoteMutation = useMutation({
    mutationFn: (input: { content: string; title?: string; color?: NoteColor; tags?: string[] }) =>
      api.createNote(input),
    onSuccess: () => {
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "保存失败，请稍后重试";
      toast.error(msg);
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Note> }) => api.updateNote(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "更新失败，请稍后重试";
      toast.error(msg);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
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
    }) => {
      if (vars.pinnedChanged) {
        await api.updateNote(vars.activeId, { pinned: vars.destPinned });
      }
      await Promise.all([
        api.reorderNotes(true, vars.pinnedIds),
        api.reorderNotes(false, vars.unpinnedIds),
      ]);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["notes"] });
      const prev = queryClient.getQueryData<Note[]>(["notes"]) ?? [];
      const { nextNotes } = computeMove(prev, vars.activeId, vars.overId, vars.destPinned);
      queryClient.setQueryData(["notes"], nextNotes);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notes"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const importGoogleKeepMutation = useMutation({
    mutationFn: (files: { raw: string }[]) => api.importGoogleKeep(files),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
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
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      updateNoteMutation.mutate({ id, updates: { pinned: !note.pinned } });
    },
    [notes, updateNoteMutation],
  );

  const moveNote = useCallback(
    (activeId: string, overId: string, destPinned: boolean) => {
      const computed = computeMove(notes, activeId, overId, destPinned);
      moveMutation.mutate({ activeId, overId, destPinned, ...computed });
    },
    [notes, moveMutation],
  );

  const importGoogleKeep = useCallback(
    (files: { raw: string }[]) => importGoogleKeepMutation.mutateAsync(files),
    [importGoogleKeepMutation],
  );

  const searchNotes = useCallback(
    (query: string) => {
      if (!query.trim()) return notes;
      const lowerQuery = query.toLowerCase();
      return notes.filter(
        (note) =>
          (note.content ?? "").toLowerCase().includes(lowerQuery) ||
          note.title?.toLowerCase().includes(lowerQuery) ||
          (note.tags ?? []).some((t) => t.toLowerCase().includes(lowerQuery)),
      );
    },
    [notes],
  );

  const pinnedNotes = useMemo(
    () => notes.filter((n) => n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b)),
    [notes],
  );
  const unpinnedNotes = useMemo(
    () => notes.filter((n) => !n.pinned).sort((a, b) => sortPosition(a) - sortPosition(b)),
    [notes],
  );

  return {
    notes,
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
    isLoading: notesQuery.isLoading,
    isError: notesQuery.isError,
    pagination,
    page,
    setPage,
    pageSize,
    setPageSize,
  };
}
