import { useNotes } from "@/hooks/useNotes";
import { NotesGrid } from "./NotesGrid";
import { NoteInput } from "./NoteInput";
import { Note } from "@/types/note";
import { useNavigate } from "react-router-dom";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

export function NoteList() {
  const navigate = useNavigate();
  const {
    pinnedNotes,
    unpinnedNotes,
    addNote,
    togglePin,
    deleteNote,
    moveNote,
    allTags,
    selectedTag,
    setSelectedTag,
    pagination,
    page,
    setPage,
  } = useNotes();

  const handleNoteClick = (note: Note) => {
    navigate(`/note/${note.id}`);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="max-w-2xl mx-auto">
        <NoteInput onAddNote={addNote} />
      </div>

      {allTags.length > 0 && (
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={
                `px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ` +
                (selectedTag === null ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary text-foreground")
              }
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag((cur) => (cur === t ? null : t))}
                className={
                  `px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm ` +
                  (selectedTag === t ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary text-foreground")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <NotesGrid
        pinnedNotes={pinnedNotes}
        unpinnedNotes={unpinnedNotes}
        onNoteClick={handleNoteClick}
        onTogglePin={togglePin}
        onDelete={deleteNote}
        onMove={moveNote}
        onTagClick={(tag) => setSelectedTag(tag)}
      />

      {pagination.totalPages > 1 && (
        <div className="flex justify-center mt-8 mb-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(Math.max(1, page - 1));
                  }}
                  className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(pageNum);
                      }}
                      isActive={page === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(Math.min(pagination.totalPages, page + 1));
                  }}
                  className={page >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {pagination.total > 0 && (
        <div className="text-center text-sm text-muted-foreground mb-8">
          {pagination.total} notes total, Page {page} / {pagination.totalPages}
        </div>
      )}
    </div>
  );
}
