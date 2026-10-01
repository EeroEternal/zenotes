export type NoteColor = 'white' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface NoteFile {
  id: string;
  noteId?: string;
  filename: string;
  path?: string;
  size: number;
  contentType?: string;
  createdAt?: string;
  downloadUrl?: string;
}

export interface NoteShare {
  shareId: string;
  isPublic: boolean;
  shareUrl: string;
}

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
  files?: NoteFile[];
  share?: NoteShare | null;
}
