# Desktop GPUI (zed-ui) — Milestone 2

This milestone adds an optional GPUI window (feature-gated):

- Default run performs file IO init and prints note counts
- Run with `--features gpui` to start a simple window that shows note count and root path

Store layout (shared with the web app's File System mode):
- metadata.json — list of notes
- notes/<id>.json — individual notes

Commands:

```
# IO-only
cargo run -p desktop-gpui

# With gpui window
cargo run -p desktop-gpui --features gpui

# Custom Mynotes directory
MYNOTES_DIR=/path/to/Mynotes cargo run -p desktop-gpui --features gpui
```

Next steps:
- Render list of notes in left panel
- Open note in right editor pane; edit title/body and save
- Basic keyboard shortcuts and refresh

