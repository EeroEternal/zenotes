import Dexie, { type Table } from "dexie";

export interface LocalNote {
  id: string;
  content: string;
  title: string | null;
  color: string;
  tags: string[];
  pinned: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: "synced" | "pending" | "syncing";
  isDeleted: boolean;
}

export interface LocalImage {
  id: string;
  noteId: string | null;
  blob: Blob;
  mimeType: string;
  syncStatus: "pending" | "syncing" | "synced";
}

export interface SyncOperation {
  id?: number;
  type: "CREATE_NOTE" | "UPDATE_NOTE" | "DELETE_NOTE" | "UPLOAD_IMAGE";
  entityId: string;
  payload: Record<string, unknown>;
  retries: number;
  createdAt: number;
}

class ZenotesDb extends Dexie {
  notes!: Table<LocalNote, string>;
  images!: Table<LocalImage, string>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super("zenotes-offline");
    this.version(1).stores({
      notes: "id, syncStatus, updatedAt",
      images: "id, noteId, syncStatus",
      syncQueue: "++id, type, entityId, createdAt",
    });
  }
}

export const db = new ZenotesDb();
