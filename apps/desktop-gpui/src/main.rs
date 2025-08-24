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
    fs::write(&p, serde_json::to_vec_pretty(note)?)?;

    // Update metadata updatedAt/title if exists
    let mut list = load_metadata(paths)?;
    let mut found = false;
    for m in &mut list {
        if m.id == note.id {
            m.updatedAt = note.updatedAt;
            m.title = note.title.clone();
            found = true;
            break;
        }
    }
    if found { save_metadata(paths, &list)?; }

    Ok(())
}

fn list_notes_sorted(paths: &StorePaths) -> Result<Vec<NoteMetadata>> {
    let mut list = load_metadata(paths)?;
    list.sort_by(|a, b| b.updatedAt.cmp(&a.updatedAt));
    Ok(list)
}

fn update_note(paths: &StorePaths, mut note: Note, new_title: Option<&str>, new_content: Option<serde_json::Value>) -> Result<Note> {
    if let Some(t) = new_title { note.title = t.to_string(); }
    if let Some(c) = new_content { note.content = c; }
    note.updatedAt = Utc::now();
    save_note(paths, &note)?;
    Ok(note)
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
    // Persist file first
    fs::write(note_path(paths, &note.id), serde_json::to_vec_pretty(&note)?)?;

    // Append metadata then write
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

// With `gpui` feature, open a simple window using current gpui API from zed monorepo
#[cfg(feature = "gpui")]
use gpui::{App as GApp, Application, Bounds, WindowOptions, WindowBounds, prelude::*, div, size, px, rgb, Window, Context as GpuiContext, Render, IntoElement};
#[cfg(all(feature = "gpui", feature = "ui_input"))]
use ui_input::SingleLineInput;
#[cfg(all(feature = "gpui", feature = "ui_input"))]
use editor::{Editor, EditorElement, EditorStyle};

#[cfg(feature = "gpui")]
#[derive(Clone)]
struct UIItem { id: String, title: String, updated: DateTime<Utc> }

#[cfg(feature = "gpui")]
struct RootView {
    path: String,
    items: Vec<UIItem>,
    selected: Option<usize>,
    #[cfg(all(feature = "gpui", feature = "ui_input"))]
    title_input: gpui::Entity<SingleLineInput>,
    #[cfg(all(feature = "gpui", feature = "ui_input"))]
    body_editor: gpui::Entity<Editor>,
}

#[cfg(feature = "gpui")]
impl Render for RootView {
    fn render(&mut self, _window: &mut Window, cx: &mut GpuiContext<Self>) -> impl IntoElement {
        let container = div()
            .flex()
            .flex_row()
            .gap_2()
            .bg(rgb(0xf0f0f0))
            .w_full()
            .h_full()
            .text_color(rgb(0x000000));

        let sidebar = {
            let mut sb = div()
                .flex()
                .flex_col()
                .gap_2()
                .p_2()
                .bg(rgb(0xeeeeee))
                .text_color(rgb(0x000000))
                .size(px(320.0))
                .flex_shrink_0()
                .h_full();

            // Header row with New / Delete / Refresh
            let mut new_btn = div().p_1().bg(rgb(0x4a7a4a)).cursor_pointer().child("New");
            new_btn.interactivity().on_click(cx.listener(|this, _ev, _win, _cx| {
                let paths = StorePaths::new(PathBuf::from(&this.path));
                if let Ok(note) = create_note(&paths, "Untitled") {
                    if let Ok(list) = load_metadata(&paths) {
                        this.items = list.iter().map(|m| UIItem { id: m.id.clone(), title: m.title.clone(), updated: m.updatedAt }).collect();
                        this.selected = this.items.iter().position(|it| it.id == note.id);
                    }
                }
            }));

            let mut del_btn = div().p_1().bg(rgb(0x7a4a4a)).cursor_pointer().child("Delete");
            del_btn.interactivity().on_click(cx.listener(|this, _ev, _win, _cx| {
                if let Some(i) = this.selected {
                    if let Some(it) = this.items.get(i).cloned() {
                        let paths = StorePaths::new(PathBuf::from(&this.path));
                        let _ = delete_note(&paths, &it.id);
                        if let Ok(list) = load_metadata(&paths) {
                            this.items = list.iter().map(|m| UIItem { id: m.id.clone(), title: m.title.clone(), updated: m.updatedAt }).collect();
                            this.selected = None;
                        }
                    }
                }
            }));

            let mut refresh = div().p_1().bg(rgb(0x505050)).cursor_pointer().child("Refresh");
            refresh.interactivity().on_click(cx.listener(|this, _ev, _win, _cx| {
                let paths = StorePaths::new(PathBuf::from(&this.path));
                if let Ok(list) = load_metadata(&paths) {
                    this.items = list.iter().map(|m| UIItem { id: m.id.clone(), title: m.title.clone(), updated: m.updatedAt }).collect();
                    this.selected = None;
                }
            }));

            sb = sb.child(div().flex().gap_2().child(new_btn).child(del_btn).child(refresh));
            sb = sb.child(format!("Notes ({}):", self.items.len()));

            for (i, item) in self.items.clone().into_iter().enumerate() {
                let is_sel = self.selected == Some(i);
                let row_bg = if is_sel { rgb(0x606060) } else { rgb(0x404040) };
                let mut row = div().p_1().bg(row_bg).cursor_pointer().child(item.title.clone());
                row.interactivity().on_click(cx.listener(move |this, _ev, _win, _cx| {
                    this.selected = Some(i);
                    // Load note and populate inputs immediately
                    let paths = StorePaths::new(PathBuf::from(&this.path));
                    if let Some(it) = this.items.get(i).cloned() {
                        if let Ok(note) = load_note(&paths, &it.id) {
                            #[cfg(all(feature = "gpui", feature = "ui_input"))]
                            {
                                let title = note.title.clone();
                                let title_for_update = title.clone();
                                this.title_input.update(_cx, |input, cx2| {
                                    let ed = input.editor();
                                    ed.update(cx2, |editor, cx3| editor.set_text(title_for_update, _win, cx3));
                                });
                                let body_text = note
                                    .content
                                    .as_array()
                                    .and_then(|arr| arr.get(0))
                                    .and_then(|node| node.get("children"))
                                    .and_then(|ch| ch.as_array())
                                    .and_then(|charr| charr.get(0))
                                    .and_then(|leaf| leaf.get("text"))
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let body_for_update = body_text.clone();
                                this.body_editor.update(_cx, |ed, cx2| ed.set_text(body_for_update, _win, cx2));
                            }
                        }
                    }
                }));
                sb = sb.child(row);
            }
            sb
        };

        let content = {
            let mut ct = div()
                .flex()
                .flex_col()
                .gap_2()
                .p_2()
                .bg(rgb(0xffffff))
                .text_color(rgb(0x000000))
                .flex_1()
                .min_w(px(0.0))
                .h_full()
                .child("Editor — title/body (WIP)");

            // Title input + Body editor (ui_input/editor) + Save
            #[cfg(all(feature = "gpui", feature = "ui_input"))]
            {
                // Render title input
                ct = ct.child(div().child(self.title_input.clone()));
                // Render body editor with basic style，并占据剩余空间
                let text_style = gpui::TextStyle { color: rgb(0x000000).into(), ..Default::default() };
                let editor_style = EditorStyle { background: rgb(0xfdfdfd).into(), text: text_style, ..Default::default() };
                ct = ct.child(
                    div()
                        .flex()
                        .flex_1()
                        .min_w(px(0.0))
                        .h_full()
                        .child(EditorElement::new(&self.body_editor, editor_style))
                );
            }

            let mut save_btn = div().p_1().bg(rgb(0x4a7a4a)).cursor_pointer().child("Save");
            save_btn.interactivity().on_click(cx.listener(|this, _ev, _win, _cx| {
                if let Some(i) = this.selected {
                    if let Some(it) = this.items.get(i).cloned() {
                        let paths = StorePaths::new(PathBuf::from(&this.path));
                        if let Ok(mut note) = load_note(&paths, &it.id) {
                            // If ui_input is enabled, read title/body from inputs
                            #[cfg(all(feature = "gpui", feature = "ui_input"))]
                            {
                                // Title
                                let title_text = this.title_input.read(_cx).text(_cx);
                                if !title_text.is_empty() {
                                    note.title = title_text;
                                }
                                // Body (plain text -> JSON paragraph for now)
                                let body_text = this.body_editor.read(_cx).text(_cx);
                                if !body_text.is_empty() {
                                    note.content = serde_json::json!([
                                        {"type": "paragraph", "children": [{"text": body_text}]}
                                    ]);
                                }
                            }
                            note.updatedAt = Utc::now();
                            let _ = save_note(&paths, &note);
                            if let Ok(list) = load_metadata(&paths) {
                                this.items = list
                                    .iter()
                                    .map(|m| UIItem { id: m.id.clone(), title: m.title.clone(), updated: m.updatedAt })
                                    .collect();
                            }
                        }
                    }
                }
            }));

            // Show title input if available
            #[cfg(all(feature = "gpui", feature = "ui_input"))]
            {
                ct = ct.child(div().child(self.title_input.clone()));
            }

            ct = ct.child(div().flex().gap_2().child(save_btn));

            if let Some(i) = self.selected {
                if let Some(it) = self.items.get(i) {
                    ct = ct.child(format!("Selected: {}", it.title));
                    // Load note content into inputs/editors
                    let paths = StorePaths::new(PathBuf::from(&self.path));
                    if let Ok(note) = load_note(&paths, &it.id) {
                        #[cfg(all(feature = "gpui", feature = "ui_input"))]
                        {
                            // Note content now populated on row click to avoid nested cx borrows
                        }
                    }
                }
            }
            ct = ct.child(format!("Root: {}", self.path));
            ct
        };

        container.child(sidebar).child(content)
    }
}

#[cfg(all(not(target_os = "unknown"), feature = "gpui"))]
fn main() -> Result<()> {
    let root = std::env::var("MYNOTES_DIR").ok().map(PathBuf::from).unwrap_or_else(|| {
        dirs::document_dir().unwrap_or(std::env::current_dir().unwrap()).join("Mynotes")
    });
    let paths = StorePaths::new(&root);
    ensure_dirs(&paths)?;
    let list = load_metadata(&paths)?;
    let items: Vec<UIItem> = list.into_iter().map(|m| UIItem { id: m.id, title: m.title, updated: m.updatedAt }).collect();
    let path_display = paths.root.display().to_string();

    Application::new().run(move |cx: &mut GApp| {
        // Provide required global state for Zed components (SettingsStore)
        #[cfg(all(feature = "gpui", feature = "ui_input"))]
        {
            use settings::SettingsStore;
            // Register SettingsStore globally so language/editor crates can access it
            let store = SettingsStore::new(cx);
            cx.set_global(store);
        }
        let bounds = Bounds::centered(None, size(px(900.0), px(1100.0)), cx);
        let items2 = items.clone();
        let path2 = path_display.clone();
        cx.open_window(
            WindowOptions { window_bounds: Some(WindowBounds::Windowed(bounds)), ..Default::default() },
            move |window, cx| cx.new(|cx| {
                #[cfg(all(feature = "gpui", feature = "ui_input"))]
                let title_input = cx.new(|cx| SingleLineInput::new(window, cx, "Title").label("Title"));
                #[cfg(all(feature = "gpui", feature = "ui_input"))]
                let body_editor = cx.new(|cx| Editor::multi_line(window, cx));
                RootView {
                    path: path2.clone(),
                    items: items2.clone(),
                    selected: None,
                    #[cfg(all(feature = "gpui", feature = "ui_input"))]
                    title_input,
                    #[cfg(all(feature = "gpui", feature = "ui_input"))]
                    body_editor,
                }
            }),
        ).unwrap();
        cx.activate(true);
    });

    Ok(())
}

#[cfg(target_os = "unknown")]
fn main() {}

