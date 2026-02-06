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
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useState } from 'react';
import { NoteCard } from './NoteCard';

const PINNED_CONTAINER_ID = 'pinned';
const UNPINNED_CONTAINER_ID = 'unpinned';

function DroppableArea({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

interface NotesGridProps {
  pinnedNotes: Note[];
  unpinnedNotes: Note[];
  onNoteClick: (note: Note) => void;
  onTogglePin: (id: string) => void;
  onMove: (activeId: string, overId: string, destPinned: boolean) => void;
  onTagClick?: (tag: string) => void;
}

export function NotesGrid({ 
  pinnedNotes, 
  unpinnedNotes, 
  onNoteClick, 
  onTogglePin,
  onMove,
  onTagClick,
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

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const overNote = [...pinnedNotes, ...unpinnedNotes].find((n) => n.id === overId);
    const destPinned =
      overId === PINNED_CONTAINER_ID ? true : overId === UNPINNED_CONTAINER_ID ? false : Boolean(overNote?.pinned);

    onMove(activeId, overId, destPinned);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pb-8">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Pinned Notes */}
        <DroppableArea id={PINNED_CONTAINER_ID} className="min-h-[24px]">
          {(pinnedNotes.length > 0 || unpinnedNotes.length > 0) && (
            <div className="mb-8">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
                已固定
              </h2>
              {pinnedNotes.length > 0 ? (
                <SortableContext items={pinnedNotes.map((n) => n.id)} strategy={rectSortingStrategy}>
                  <div className="masonry">
                    {pinnedNotes.map((note) => (
                      <SortableNoteCard
                        key={note.id}
                        note={note}
                        onClick={() => onNoteClick(note)}
                        onTogglePin={() => onTogglePin(note.id)}
                        onTagClick={onTagClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  拖到这里以固定
                </div>
              )}
            </div>
          )}
        </DroppableArea>

        {/* Other Notes */}
        <DroppableArea id={UNPINNED_CONTAINER_ID} className="min-h-[24px]">
          {(pinnedNotes.length > 0 || unpinnedNotes.length > 0) && (
            <div>
              {pinnedNotes.length > 0 && (
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">
                  其他笔记
                </h2>
              )}
              {unpinnedNotes.length > 0 ? (
                <SortableContext items={unpinnedNotes.map((n) => n.id)} strategy={rectSortingStrategy}>
                  <div className="masonry">
                    {unpinnedNotes.map((note) => (
                      <SortableNoteCard
                        key={note.id}
                        note={note}
                        onClick={() => onNoteClick(note)}
                        onTogglePin={() => onTogglePin(note.id)}
                        onTagClick={onTagClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              ) : (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  拖到这里以取消固定
                </div>
              )}
            </div>
          )}
        </DroppableArea>

        <DragOverlay>
          {activeNote && (
            <NoteCard note={activeNote} onClick={() => {}} onTogglePin={() => {}} onTagClick={onTagClick} />
          )}
        </DragOverlay>
      </DndContext>

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
