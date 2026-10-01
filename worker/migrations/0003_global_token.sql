-- Migration 0003: System settings for global token

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, updated_at)
VALUES ('global_token', 'zenotes_master_sec_token', datetime('now'));
