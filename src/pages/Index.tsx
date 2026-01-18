import { useState } from 'react';
import { Header } from '@/components/Header';
import { NoteInput } from '@/components/NoteInput';
import { NotesGrid } from '@/components/NotesGrid';
import { NoteDialog } from '@/components/NoteDialog';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/note';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { 
    pinnedNotes, 
    unpinnedNotes, 
    addNote, 
    updateNote, 
    deleteNote, 
    togglePin,
    reorderNotes,
    searchNotes 
  } = useNotes();

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note);
    setDialogOpen(true);
  };

  const filteredPinned = searchQuery 
    ? searchNotes(searchQuery).filter(n => n.pinned)
    : pinnedNotes;
  
  const filteredUnpinned = searchQuery
    ? searchNotes(searchQuery).filter(n => !n.pinned)
    : unpinnedNotes;

  return (
    <div className="min-h-screen bg-background">
      <Header 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
      />
      
      <main className="pt-6">
        <NoteInput onAddNote={addNote} />
        
        <NotesGrid
          pinnedNotes={filteredPinned}
          unpinnedNotes={filteredUnpinned}
          onNoteClick={handleNoteClick}
          onTogglePin={togglePin}
          onReorder={reorderNotes}
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
