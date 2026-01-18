export type NoteColor = 'white' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface Note {
  id: string;
  title?: string;
  content: string;
  color: NoteColor;
  tags: string[];
  pinned: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}
