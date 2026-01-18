export type NoteColor = 'white' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface Note {
  id: string;
  title?: string;
  content: string;
  color: NoteColor;
  createdAt: Date;
  updatedAt: Date;
  pinned: boolean;
}
