import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { NoteInput } from '@/components/NoteInput';
import { NotesGrid } from '@/components/NotesGrid';
import { NoteDialog } from '@/components/NoteDialog';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/note';
import { toast } from 'sonner';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

export default function Index() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const keepInputRef = useRef<HTMLInputElement>(null);

  const { 
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
    isImportingKeep,
    pagination,
    page,
    setPage,
    pageSize,
    setPageSize,
  } = useNotes();

  const handleDeleteNote = useCallback(
    (id: string) => {
      deleteNote(id);
      if (id === selectedNoteId) {
        setDialogOpen(false);
        setSelectedNoteId(null);
      }
    },
    [deleteNote, selectedNoteId],
  );

  const handleNoteClick = (note: Note) => {
    setSelectedNoteId(note.id);
    setDialogOpen(true);
  };

  // Derive the live note object from notes array so dialog always has fresh data
  const selectedNote = useMemo(
    () => (selectedNoteId ? notes.find(n => n.id === selectedNoteId) ?? null : null),
    [notes, selectedNoteId]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const searched = searchQuery ? searchNotes(searchQuery) : notes;
  const filtered = selectedTag ? searched.filter((n) => n.tags?.includes(selectedTag)) : searched;

  const byPos = (a: Note, b: Note) =>
    (Number.isFinite(a.position) ? a.position : 0) - (Number.isFinite(b.position) ? b.position : 0);
  const filteredPinned = filtered.filter((n) => n.pinned).sort(byPos);
  const filteredUnpinned = filtered.filter((n) => !n.pinned).sort(byPos);

  const handleImportKeepClick = () => keepInputRef.current?.click();

  const handleKeepFilesChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    try {
      const files = await Promise.all(Array.from(list).map(async (f) => ({ raw: await f.text() })));
      const result = await importGoogleKeep(files);
      toast.success(
        `Import complete: added ${result.importedCount}, skipped ${result.skippedCount}`,
      );
    } catch {
      toast.error("Google Keep import failed");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <input
        ref={keepInputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="hidden"
        aria-hidden
        onChange={handleKeepFilesChange}
      />
      <Header 
        onImportKeep={handleImportKeepClick}
        isImportingKeep={isImportingKeep}
      />
      
      <main className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl border border-border/50 bg-card/55 shadow-sm backdrop-blur-sm p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
              <div className={`
                relative flex items-center w-full
                rounded-2xl border transition-all duration-300
                ${isSearchFocused 
                  ? 'bg-card shadow-note-hover border-border' 
                  : 'bg-secondary/60 border-transparent hover:bg-secondary/80'
                }
              `}>
                <Search className={`absolute left-5 w-5 h-5 transition-colors duration-200 ${isSearchFocused ? 'text-primary' : 'text-muted-foreground'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setIsSearchFocused(false)}
                  placeholder="Search notes..."
                  className="w-full py-4 pl-14 pr-12 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-[15px]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 p-1.5 rounded-lg hover:bg-foreground/8 transition-colors"
                    title="Clear"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <NoteInput onAddNote={addNote} compact />
            </div>
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 mb-4">
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
          pinnedNotes={filteredPinned}
          unpinnedNotes={filteredUnpinned}
          onNoteClick={handleNoteClick}
          onTogglePin={togglePin}
          onDelete={handleDeleteNote}
          onMove={moveNote}
          onTagClick={(tag) => setSelectedTag(tag)}
        />

        {/* 分页控件 */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex justify-center mt-8 mb-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>

                {/* 页码按钮 */}
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
                        onClick={() => setPage(pageNum)}
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
                    onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                    className={page >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* Pagination info */}
        {pagination && (
          <div className="text-center text-sm text-muted-foreground mb-8">
            {pagination.total} notes total, Page {page} / {pagination.totalPages}
          </div>
        )}
      </main>

      <NoteDialog
        note={selectedNote}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={updateNote}
        onDelete={handleDeleteNote}
        onTogglePin={togglePin}
      />
    </div>
  );
}
