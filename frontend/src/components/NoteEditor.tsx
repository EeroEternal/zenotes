import { useParams, useNavigate } from "react-router-dom";
import { useNotes } from "@/hooks/useNotes";
import { NoteDialog } from "./NoteDialog";
import { toast } from "sonner";
import { idRemap } from "@/offline/idRemap";
import { useEffect } from "react";

export function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, updateNote, deleteNote, togglePin } = useNotes();

  // Handle URL redirection if the currently edited note has been remapped
  useEffect(() => {
    if (id && idRemap.has(id)) {
      const newId = idRemap.get(id);
      navigate(`/note/${newId}`, { replace: true });
    }
  }, [id, navigate]);

  const note = id ? notes.find((n) => n.id === id) ?? null : null;

  if (!note) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Note not found</p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-primary hover:underline"
          >
            Back to notes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <NoteDialog
        note={note}
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate("/");
        }}
        onUpdate={updateNote}
        onDelete={(noteId) => {
          deleteNote(noteId);
          toast.success("Note deleted");
          navigate("/");
        }}
        onTogglePin={togglePin}
      />
    </div>
  );
}
