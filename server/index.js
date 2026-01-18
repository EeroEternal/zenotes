import express from "express";
import cors from "cors";
import path from "node:path";
import crypto from "node:crypto";

import { openDb } from "./db.js";

const PORT = Number(process.env.PORT || 8081);
const db = openDb();

const app = express();
app.use(cors());
app.use(express.json());

function nowIso() {
  return new Date().toISOString();
}

function rowToNote(row) {
  return {
    id: row.id,
    title: row.title ?? undefined,
    content: row.content,
    color: row.color,
    tags: JSON.parse(row.tags || "[]"),
    pinned: Boolean(row.pinned),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function maxPosition(pinned) {
  const row = db
    .prepare("SELECT COALESCE(MAX(position), 0) as maxPos FROM notes WHERE pinned = ?")
    .get(pinned ? 1 : 0);
  return row?.maxPos ?? 0;
}

app.get("/api/notes", (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM notes ORDER BY pinned DESC, position ASC, updated_at DESC")
    .all();
  res.json(rows.map(rowToNote));
});

app.post("/api/notes", (req, res) => {
  const { title, content, color = "white", tags = [] } = req.body || {};
  if (!content?.trim() && !title?.trim()) {
    return res.status(400).json({ error: "content_or_title_required" });
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const pinned = 0;
  const position = maxPosition(false) + 1;

  db.prepare(
    "INSERT INTO notes (id, title, content, color, tags, pinned, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    title?.trim() || null,
    content?.trim() || "",
    color,
    JSON.stringify(tags),
    pinned,
    position,
    createdAt,
    createdAt
  );

  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  res.status(201).json(rowToNote(row));
});

app.patch("/api/notes/:id", (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const updates = req.body || {};

  let pinned = existing.pinned;
  if (typeof updates.pinned === "boolean") pinned = updates.pinned ? 1 : 0;

  // If pinned changed, move note to end of that group.
  let position = existing.position;
  if (pinned !== existing.pinned) {
    position = maxPosition(Boolean(pinned)) + 1;
  }

  const updatedAt = nowIso();

  db.prepare(
    `UPDATE notes
     SET title = ?, content = ?, color = ?, tags = ?, pinned = ?, position = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    updates.title !== undefined ? (updates.title?.trim() || null) : existing.title,
    updates.content !== undefined ? (updates.content?.trim() || "") : existing.content,
    updates.color ?? existing.color,
    updates.tags !== undefined ? JSON.stringify(updates.tags) : existing.tags,
    pinned,
    position,
    updatedAt,
    id
  );

  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  res.json(rowToNote(row));
});

app.delete("/api/notes/:id", (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  res.status(204).end();
});

app.post("/api/notes/reorder", (req, res) => {
  const { pinned, orderedIds } = req.body || {};
  if (typeof pinned !== "boolean" || !Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const tx = db.transaction(() => {
    const stmt = db.prepare("UPDATE notes SET position = ? WHERE id = ? AND pinned = ?");
    orderedIds.forEach((id, idx) => stmt.run(idx + 1, id, pinned ? 1 : 0));
  });

  tx();
  res.json({ ok: true });
});

// Optional: serve built frontend
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(process.cwd(), "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${PORT}`);
});
