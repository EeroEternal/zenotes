import { useMemo, useCallback } from "react";
import type { Note, NoteColor } from "@/types/note";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";

import * as api from "@/lib/api";

export function useNotes() {
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ["notes"],
    queryFn: api.fetchNotes,
    initialData: [],
  });

  const notes = notesQuery.data;

  const addNoteMutation = useMutation({
    mutationFn: (input: { content: string; title?: string; color?: NoteColor; tags?: string[] }) =>
      api.createNote(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Note> }) => api.updateNote(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ pinned, orderedIds }: { pinned: boolean; orderedIds: string[] }) =>
      api.reorderNotes(pinned, orderedIds),
    onMutate: async ({ pinned, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: ["notes"] });
      const prev = queryClient.getQueryData<Note[]>(["notes"]) ?? [];

      const pinnedNotes = prev.filter((n) => n.pinned);
      const unpinnedNotes = prev.filter((n) => !n.pinned);
      const target = pinned ? pinnedNotes : unpinnedNotes;

      const byId = new Map(target.map((n) => [n.id, n]));
      const reordered = orderedIds
        .map((id, idx) => {
          const n = byId.get(id);
          return n ? { ...n, position: idx + 1 } : undefined;
        })
        .filter(Boolean) as Note[];

      const next = pinned ? [...reordered, ...unpinnedNotes] : [...pinnedNotes, ...reordered];
      queryClient.setQueryData(["notes"], next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notes"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notes"] }),
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

  const reorderNotes = useCallback(
    (activeId: string, overId: string, isPinned: boolean) => {
      const target = notes.filter((n) => n.pinned === isPinned);
      const oldIndex = target.findIndex((n) => n.id === activeId);
      const newIndex = target.findIndex((n) => n.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(target, oldIndex, newIndex);
      reorderMutation.mutate({ pinned: isPinned, orderedIds: reordered.map((n) => n.id) });
    },
    [notes, reorderMutation],
  );

  const searchNotes = useCallback(
    (query: string) => {
      if (!query.trim()) return notes;
      const lowerQuery = query.toLowerCase();
      return notes.filter(
        (note) =>
          note.content.toLowerCase().includes(lowerQuery) ||
          note.title?.toLowerCase().includes(lowerQuery) ||
          note.tags.some((t) => t.toLowerCase().includes(lowerQuery)),
      );
    },
    [notes],
  );

  const pinnedNotes = useMemo(() => notes.filter((n) => n.pinned).sort((a, b) => a.position - b.position), [notes]);
  const unpinnedNotes = useMemo(
    () => notes.filter((n) => !n.pinned).sort((a, b) => a.position - b.position),
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
    reorderNotes,
    searchNotes,
    isLoading: notesQuery.isLoading,
    isError: notesQuery.isError,
  };
}
