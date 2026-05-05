# Serverless Autonomous Agent Architecture (ZeNotes)

This document describes the radical transformation of the ZeNotes infrastructure into a stateless, self-iterating system powered by Cloudflare's ecosystem and the Flue agent framework.

## Core Philosophy

The system is designed as a **Stateless Compute Node** paired with a **Versioned Storage Interface**. It treats code as a dynamic data stream that can be read, reasoned about, and overwritten in real-time by AI agents.

## Architectural Components

### 1. Stateless Compute (Cloudflare Workers)
The runtime environment is a Cloudflare Worker. It provides:
- **Low Latency**: Near-instant cold starts.
- **V8 Isolates**: Secure, isolated execution.
- **Node.js Compatibility**: Enabled via `nodejs_compat` to support standard libraries.

### 2. Versioned Codebase (Cloudflare Artifacts)
Instead of a static deployment, the codebase resides in Cloudflare Artifacts (Native Git-compatible storage).
- **Git Protocol**: Supports standard `clone`, `commit`, and `push` operations.
- **Versioned Memory**: Every evolution of the Agent is tracked in a git history.

### 3. Memory File System (memfs)
Since Workers lack a traditional disk, we utilize `memfs` to create a virtual file system in the V8 heap.
- **Zero I/O Latency**: Operations happen at memory speeds.
- **Sandbox Safety**: Modifications are contained within the session's memory until pushed.

### 4. Decision Engine (withastro/flue)
The agent logic is driven by the Flue framework.
- **Tool-Based Interaction**: The agent uses specific tools (`read_file`, `write_file`, `list_directory`) to interact with the MemoryFS.
- **Autonomous Workflow**: The agent receives a prompt, explores the codebase, applies changes, and verifies (implicitly or via logic).

## The "Read-Reason-Write" Cycle

1.  **Trigger**: A request hits the `/api/agent/run` endpoint.
2.  **Clone**: The Worker uses `isomorphic-git` to clone the current state from Artifacts into `MemoryFS`.
3.  **Execute**: The Flue Agent runs the requested task using the virtualized filesystem tools.
4.  **Commit**: `isomorphic-git` identifies changes, creates a new commit, and pushes it back to the Artifacts repository.
5.  **Response**: The system returns success, and the new code is ready for the next Worker execution.

## Key Benefits

- **Always-On Evolution**: The system can modify its own API endpoints or internal logic without manual deployment.
- **Infinite Undo**: Every change made by the Agent is a Git commit, allowing for easy rollback.
- **Stateless Resilience**: No local state is maintained between requests; the "truth" always lives in the versioned storage.

## Implementation Details

- **Dependencies**: `@flue/sdk`, `isomorphic-git`, `memfs`.
- **Primary Files**:
    - `worker/src/index.ts`: The main entry point and Agent orchestrator.
    - `worker/src/memory-fs.ts`: The adapter for memory-based file operations.
    - `worker/wrangler.jsonc`: Infrastructure bindings (Artifacts, D1, R2).
