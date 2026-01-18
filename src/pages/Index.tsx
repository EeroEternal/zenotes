import { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { NoteInput } from '@/components/NoteInput';
import { NotesGrid } from '@/components/NotesGrid';
import { NoteDialog } from '@/components/NoteDialog';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/note';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { 
    notes,
    pinnedNotes, 
    unpinnedNotes, 
    addNote, 
    updateNote, 
    deleteNote, 
    togglePin,
    moveNote,
    searchNotes 
  } = useNotes();

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note);
    setDialogOpen(true);
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const searched = searchQuery ? searchNotes(searchQuery) : notes;
  const filtered = selectedTag ? searched.filter((n) => n.tags?.includes(selectedTag)) : searched;

  const filteredPinned = filtered.filter((n) => n.pinned).sort((a, b) => a.position - b.position);
  const filteredUnpinned = filtered.filter((n) => !n.pinned).sort((a, b) => a.position - b.position);

  return (
    <div className="min-h-screen bg-background">
      <Header 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
      />
      
      <main className="pt-6">
        <NoteInput onAddNote={addNote} />

        {allTags.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag(null)}
                className={
                  `px-3 py-1 rounded-full text-sm border transition-colors ` +
                  (selectedTag === null ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")
                }
              >
                全部
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTag((cur) => (cur === t ? null : t))}
                  className={
                    `px-3 py-1 rounded-full text-sm border transition-colors ` +
                    (selectedTag === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border")
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
          onMove={moveNote}
          onTagClick={(tag) => setSelectedTag(tag)}
        />
      </main>

      <NoteDialog
        note={selectedNote}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onUpdate={updateNote}
        onDelete={deleteNote}
        onTogglePin={togglePin}
      />
    </div>
  );
};

export default Index;
