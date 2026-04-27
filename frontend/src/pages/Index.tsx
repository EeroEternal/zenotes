import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { NoteInput } from '@/components/NoteInput';
import { NotesGrid } from '@/components/NotesGrid';
import { NoteDialog } from '@/components/NoteDialog';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/note';
import { toast } from 'sonner';

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

  const filteredPinned = filtered.filter((n) => n.pinned).sort((a, b) => a.position - b.position);
  const filteredUnpinned = filtered.filter((n) => !n.pinned).sort((a, b) => a.position - b.position);

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
        <div className="flex flex-col items-center gap-5">
          {/* Lovable Stylized Search Bar */}
          <div className={`
            relative flex items-center w-full max-w-2xl
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

          <NoteInput onAddNote={addNote} />
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
