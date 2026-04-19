-- D1 (SQLite): 元数据；正文在 R2，r2_key = {user_id}/{note_id}/body.json

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT,
  color TEXT NOT NULL DEFAULT 'white',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_user_pinned_pos ON notes(user_id, pinned DESC, position);

-- 单租户默认用户（与旧版「无用户隔离」行为一致；迁移时把笔记挂到 user_id=1）
INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at, updated_at)
VALUES (
  1,
  'default',
  'default@zenotes.site',
  '0000000000000000000000000000000000000000000000000000000000000000',
  (datetime('now')),
  (datetime('now'))
);
