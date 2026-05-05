# ZeNotes: Self-Evolving Serverless Agent

**Repository**: [github.com/lipish/mynotes](https://github.com/lipish/mynotes)

ZeNotes is a cutting-edge serverless note-taking application designed to be autonomous, always-online, and self-iterating. By combining Cloudflare's ecosystem with a headless agent architecture, ZeNotes can evolve its own logic based on your natural language instructions.

## The Architecture
ZeNotes follows a "Stateless Compute + Versioned Storage" paradigm:
- **Compute**: Cloudflare Workers (stateless nodes).
- **Storage**: Cloudflare Artifacts (Git-compatible versioned storage) + D1 (Database) + R2 (Storage).
- **Intelligence**: A custom-built Agent (powered by DeepSeek) that uses an in-memory virtual file system to read, reason, and rewrite its own codebase.

## Key Features
- **Autonomous Evolution**: Simply chat with the built-in Agent to request features or refactorings; the Agent handles the code modification and deployment process.
- **Always-On Serverless**: Built entirely on Cloudflare's edge network for near-zero latency.
- **Version Control**: Every Agent-driven change is automatically committed to your Git-compatible Artifacts storage.
- **Instant Feedback**: Real-time integration via a sidebar chat interface allows you to see the system evolve as you work.

## Getting Started

### Prerequisites
- [Cloudflare Account](https://dash.cloudflare.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Development
1. **Clone the repository.**
2. **Configure secrets**:
   - `DEEPSEEK_API_KEY`: Set via `wrangler secret put DEEPSEEK_API_KEY --name zenotes-api`
3. **Deploy**:
   - Use the provided CI/CD workflows for automated deployment to Cloudflare Pages and Workers.

## Agentic Development Workflow
1. Access the web interface.
2. Open the **ZeNotes Agent** sidebar (bottom-right).
3. Provide instructions (e.g., "Add a dark mode toggle").
4. Watch as the Agent autonomously updates the code via Cloudflare Artifacts.

---
*Powered by DeepSeek, Cloudflare Workers, and autonomous agentic workflows.*
