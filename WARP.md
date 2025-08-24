# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Core Development
```bash
# Start development server (runs on port 3033)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Type checking and linting
npm run lint
```

### Testing & Development
```bash
# Run single test file (when tests are added)
npm test -- --testNamePattern="specific test name"

# Watch mode for development
npm run dev --turbopack  # Already enabled by default
```

## High-Level Architecture

### Application Structure
This is a **Next.js 15 personal note-taking application** with the following core architecture:

**Frontend Architecture:**
- **Single-page application** with sidebar + main content layout
- **Real-time rich text editor** built on Slate.js for Markdown editing
- **Client-side storage** using localStorage with intelligent storage management
- **Modal-based workflows** for import, settings, and image management

**Data Flow:**
- **Centralized storage layer** (`lib/storage.ts`) manages all note operations
- **Automatic storage cleanup** with configurable thresholds (85% by default)
- **Image processing pipeline** that copies and manages images in `public/images/`
- **Settings management** with validation via Zod schemas

### Key Components Architecture

**Core Editor System (`components/editor/`):**
- `SlateEditor` - Main rich text editor with drag/drop image support
- Custom Slate.js elements for headings, lists, code blocks, images
- Real-time Markdown parsing and rendering

**Storage Management (`lib/storage.ts` + `lib/storage-manager.ts`):**
- **Smart storage cleanup** - automatically removes oldest notes when storage exceeds thresholds
- **Batch operations** for importing multiple notes with space management
- **Metadata separation** - lightweight note metadata stored separately for performance
- **Compression support** for large notes

**Import System:**
- **Batch Markdown import** from local directories with front-matter parsing
- **Automatic image discovery** and copying from related directories
- **URL rewriting** to convert local image paths to web-accessible paths

**Settings Architecture (`lib/settings.ts`):**
- **Singleton pattern** with real-time persistence
- **Typed settings groups** (markdown, images, storage, editor, import, export)
- **Validation via Zod** with automatic migration of legacy settings

### Critical Storage Behavior
- **Auto-cleanup triggers** when storage exceeds 85% (configurable)
- **Emergency cleanup** for critically low space (95%+)
- **Note size limits** (500KB default) with compression fallback
- **Browser storage limits** automatically detected (Chrome: 10MB, Others: 5MB)

### Image Management Pipeline
1. **Detection** - Finds images in Markdown during import
2. **Processing** - Copies to `public/images/` via API routes
3. **URL rewriting** - Updates references to use `/images/` paths
4. **Cleanup** - Removes orphaned images during storage cleanup

## Development Guidelines

### Working with Storage
- Always use functions from `lib/storage.ts` for note operations
- Storage cleanup is automatic but can be manually triggered via `triggerEmergencyCleanup()`
- Test storage limits with the debug panel in the app (temporary debugging UI)

### Adding New Features
- **Settings**: Add to `lib/settings.ts` schema and update UI in `components/settings-panel.tsx`
- **Editor elements**: Extend Slate.js types in `components/editor/slate-editor.tsx`
- **Import formats**: Extend `lib/markdown-importer.ts` and `lib/markdown-utils.ts`

### API Routes (for images)
- Image processing happens via Next.js API routes (check `app/api/` if exists)
- Images are stored in `public/images/` and served via `/images/` URL path

### Component Dependencies
- **shadcn/ui**: All UI components follow this design system
- **Slate.js**: Core editor functionality - understand Descendant[] structure
- **React 19**: Uses latest React features including concurrent features
- **Next.js 15**: Latest framework features including turbopack in dev mode

### State Management Patterns
- **Local state** for UI interactions and temporary data
- **localStorage** for persistence with automatic serialization/deserialization
- **Settings singleton** for configuration management
- **No external state management** - relies on React state and localStorage

### Key File Relationships
- `app/page.tsx` - Main application orchestration and state management
- `lib/storage.ts` - Central data layer for all note operations
- `lib/settings.ts` - Configuration management with validation
- `components/editor/slate-editor.tsx` - Rich text editing core
- `lib/markdown-utils.ts` - Markdown parsing and conversion utilities

