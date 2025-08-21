use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub id: String,
    pub title: String,
    pub createdAt: DateTime<Utc>,
    pub updatedAt: DateTime<Utc>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: serde_json::Value,
    pub createdAt: DateTime<Utc>,
    pub updatedAt: DateTime<Utc>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
}

#[derive(Debug, Clone)]
pub struct StorePaths {
    root: PathBuf,
    notes_dir: PathBuf,
    metadata: PathBuf,
}

impl StorePaths {
    pub fn new(root: impl AsRef<Path>) -> Self {
        let root = root.as_ref().to_path_buf();
        let notes_dir = root.join("notes");
        let metadata = root.join("metadata.json");
        Self { root, notes_dir, metadata }
    }
}

fn ensure_dirs(paths: &StorePaths) -> Result<()> {
    std::fs::create_dir_all(&paths.notes_dir)?;
    if !paths.metadata.exists() {
        let empty: Vec<NoteMetadata> = vec![];
        fs::write(&paths.metadata, serde_json::to_vec_pretty(&empty)?)?;
    } else {
        // Validate JSON; if corrupted, back up and reset to empty
        if let Ok(bytes) = fs::read(&paths.metadata) {
            if serde_json::from_slice::<serde_json::Value>(&bytes).is_err() {
                let backup = paths.root.join("metadata.bak.json");
                let _ = fs::write(&backup, bytes);
                fs::write(&paths.metadata, serde_json::to_vec_pretty(&Vec::<NoteMetadata>::new())?)?;
            }
        }
    }
    Ok(())
}

fn load_metadata(paths: &StorePaths) -> Result<Vec<NoteMetadata>> {
    let bytes = fs::read(&paths.metadata)?;
    let list: Vec<NoteMetadata> = serde_json::from_slice(&bytes)?;
    Ok(list)
}

fn save_metadata(paths: &StorePaths, list: &[NoteMetadata]) -> Result<()> {
    fs::write(&paths.metadata, serde_json::to_vec_pretty(list)?)?;
    Ok(())
}

fn note_path(paths: &StorePaths, id: &str) -> PathBuf {
    paths.notes_dir.join(format!("{}.json", id))
}

fn load_note(paths: &StorePaths, id: &str) -> Result<Note> {
    let p = note_path(paths, id);
    let bytes = fs::read(p)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn save_note(paths: &StorePaths, note: &Note) -> Result<()> {
    let p = note_path(paths, &note.id);
    fs::write(p, serde_json::to_vec_pretty(note)?)?;
    Ok(())
}

fn create_note(paths: &StorePaths, title: &str) -> Result<Note> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let note = Note {
        id: id.clone(),
        title: title.to_string(),
        content: serde_json::json!([
            {"type": "paragraph", "children": [{"text": ""}]}
        ]),
        createdAt: now,
        updatedAt: now,
        tags: Some(vec![]),
        category: Some(String::new()),
    };
    save_note(paths, &note)?;

    // Append metadata
    let mut list = load_metadata(paths)?;
    list.push(NoteMetadata { id, title: title.to_string(), createdAt: now, updatedAt: now, tags: Some(vec![]), category: Some(String::new()) });
    save_metadata(paths, &list)?;
    Ok(note)
}

fn delete_note(paths: &StorePaths, id: &str) -> Result<()> {
    let p = note_path(paths, id);
    if p.exists() { let _ = fs::remove_file(p); }
    let mut list = load_metadata(paths)?;
    list.retain(|m| m.id != id);
    save_metadata(paths, &list)?;
    Ok(())
}

// Minimal run entry: without feature `gpui` we just do IO init/print
#[cfg(all(not(target_os = "unknown"), not(feature = "gpui")))]
fn main() -> Result<()> {
    let root = std::env::var("MYNOTES_DIR").ok().map(PathBuf::from).unwrap_or_else(|| {
        dirs::document_dir().unwrap_or(std::env::current_dir().unwrap()).join("Mynotes")
    });
    let paths = StorePaths::new(&root);
    ensure_dirs(&paths)?;
    let list = load_metadata(&paths)?;
    println!("Loaded {} notes from {}", list.len(), paths.root.display());
    println!("Run with --features gpui to start the window UI");
    Ok(())
}

// With `gpui` feature, open a simple window and show counts
#[cfg(all(not(target_os = "unknown"), feature = "gpui"))]
fn main() -> Result<()> {
    use gpui::*;

    let root = std::env::var("MYNOTES_DIR").ok().map(PathBuf::from).unwrap_or_else(|| {
        dirs::document_dir().unwrap_or(std::env::current_dir().unwrap()).join("Mynotes")
    });
    let paths = StorePaths::new(&root);
    ensure_dirs(&paths)?;
    let list = load_metadata(&paths)?;

    App::new().run(|cx| {
        cx.open_window(WindowOptions::default().with_title("Mynotes GPUI"), move |cx| {
            let count = list.len();
            let path_display = paths.root.display().to_string();
            view! { cx,
                hstack(|cx| {
                    vstack(|cx| {
                        label(cx, "Notes");
                        label(cx, format!("{} items", count));
                        button(cx, "New", move |_, _| {
                            // TODO: create and refresh
                        });
                        button(cx, "Delete", move |_, _| {
                            // TODO: delete selected
                        });
                    }).class("sidebar");

                    vstack(|cx| {
                        label(cx, "Editor");
                        label(cx, format!("Root: {}", path_display));
                        button(cx, "Refresh", move |_, _| {
                            // TODO: reload metadata and current note
                        });
                    }).class("content");
                })
            }
        }).unwrap();
    });

    Ok(())
}

#[cfg(target_os = "unknown")]
fn main() {}

