import { Note } from '@/types/note';
import { SortableNoteCard } from './SortableNoteCard';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import { NoteCard } from './NoteCard';

interface NotesGridProps {
  pinnedNotes: Note[];
  unpinnedNotes: Note[];
  onNoteClick: (note: Note) => void;
  onTogglePin: (id: string) => void;
  onReorder: (activeId: string, overId: string, isPinned: boolean) => void;
}

export function NotesGrid({ 
  pinnedNotes, 
  unpinnedNotes, 
  onNoteClick, 
  onTogglePin,
  onReorder 
}: NotesGridProps) {
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const note = [...pinnedNotes, ...unpinnedNotes].find(n => n.id === active.id);
    setActiveNote(note || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveNote(null);
    
    if (!over || active.id === over.id) return;

    const isPinned = pinnedNotes.some(n => n.id === active.id);
    onReorder(active.id as string, over.id as string, isPinned);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pb-8">
      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
            已固定
          </h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={pinnedNotes.map(n => n.id)} 
              strategy={rectSortingStrategy}
            >
              <div className="masonry">
                {pinnedNotes.map((note) => (
                  <SortableNoteCard
                    key={note.id}
                    note={note}
                    onClick={() => onNoteClick(note)}
                    onTogglePin={() => onTogglePin(note.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeNote && activeNote.pinned && (
                <NoteCard 
                  note={activeNote} 
                  onClick={() => {}} 
                  onTogglePin={() => {}}
                />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Other Notes */}
      {unpinnedNotes.length > 0 && (
        <div>
          {pinnedNotes.length > 0 && (
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
              其他笔记
            </h2>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={unpinnedNotes.map(n => n.id)} 
              strategy={rectSortingStrategy}
            >
              <div className="masonry">
                {unpinnedNotes.map((note) => (
                  <SortableNoteCard
                    key={note.id}
                    note={note}
                    onClick={() => onNoteClick(note)}
                    onTogglePin={() => onTogglePin(note.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeNote && !activeNote.pinned && (
                <NoteCard 
                  note={activeNote} 
                  onClick={() => {}} 
                  onTogglePin={() => {}}
                />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Empty State */}
      {pinnedNotes.length === 0 && unpinnedNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <div className="w-20 h-20 mb-4 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <p className="text-lg font-medium mb-1">没有笔记</p>
          <p className="text-sm">点击上方添加你的第一条笔记</p>
        </div>
      )}
    </div>
  );
}
