-- Migration 0002: Files and Shares

CREATE TABLE IF NOT EXISTS note_files (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_note_files_note_id ON note_files(note_id);
CREATE INDEX IF NOT EXISTS idx_note_files_user_id ON note_files(user_id);

CREATE TABLE IF NOT EXISTS note_shares (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_note_shares_id ON note_shares(id);
CREATE INDEX IF NOT EXISTS idx_note_shares_note_id ON note_shares(note_id);
