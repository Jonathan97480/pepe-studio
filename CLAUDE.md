# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Pepe-Studio — desktop AI agent OS. Tauri 1.x (Rust) + Next.js 14 (static export) + llama.cpp sidecar. Runs local GGUF models and gives them tool-calling capabilities (file ops, terminal, web, MCP, skills).

## Commands

```bash
npm run tauri:dev       # Start dev mode (next dev + cargo run)
npm run tauri:build     # Production build (next build + tauri build)
npm run check           # Lint + typecheck
npm run test:web        # TypeScript compile + node --test tests/
npm run test:rust       # cargo test --manifest-path src-tauri/Cargo.toml
npm run test            # test:web && test:rust
npm run typecheck       # tsc --noEmit
npm run lint:fix        # ESLint with auto-fix
```

## Architecture

### Frontend-Backend Bridge

Next.js builds as static export (`output: "export"` in next.config.mjs), served by Tauri webview. No SSR. All components needing Tauri APIs must be client components.

Communication channels:
- **Tauri commands** — direct invoke from TS → Rust (57 commands in main.rs)
- **HTTP/SSE** — llama.cpp sidecar on 127.0.0.1:8765, events: `llama-stream`, `llama-done`, `llama-error`, `llama-usage`
- **Tauri events** — terminal output, streaming updates

### Backend (src-tauri/src/)

| File | Responsibility |
|------|---------------|
| `main.rs` | All Tauri command handlers (57 commands) |
| `db.rs` | SQLite via Rusqlite — model_configs, documents, document_chunks, document_chunks_fts, conversations, messages, user_facts |
| `llama_sidecar.rs` | llama-server process lifecycle, health check, streaming |
| `terminal_manager.rs` | Persistent PTY terminal sessions via portable-pty (ConPTY on Windows) |
| `mcp.rs` | Model Context Protocol — JSON-RPC 2.0 over stdio to Node.js servers |
| `scraper.rs` | Web scraping |
| `search.rs` | Web search |
| `http_client.rs` | HTTP request proxy |
| `dev_server.rs` | Local dev server with error capture |
| `skills.rs` | PowerShell skill management |
| `hw_info.rs` | Hardware detection (RAM, GPU, CPU) |
| `model_metadata.rs` | GGUF model metadata inspection |

State is shared via `Mutex<T>` in Tauri managed state.

### Frontend (src/)

**State management**: Context providers + custom hooks. No Redux/Zustand.

| Hook | Purpose |
|------|---------|
| `useLlama` | Core chat loop — streaming, message state, tool call detection |
| `useToolCalling` | Tool dispatch dispatcher — parses tool tags, calls Tauri commands |
| `useModels` | Model file discovery, config persistence, auto-detection |
| `useBuildMachineContext` | Hardware detection + auto-configuration (gpu_only, balanced, max_context) |
| `useAutoCompact` | Automatic conversation history compression |
| `useMCP` | MCP server integration |
| `useFileAttachments` | File handling with OCR and PDF extraction |

**Context providers**: `ModelSettingsContext` (model params, GPU config, thinking mode), `SkillsContext` (skill enable/disable, localStorage persistence).

**Tool calling flow**:
1. Model emits `<tool>{...}</tool>` block or specialized tag (`<read_file>`, `<cmd>`, etc.)
2. `src/lib/toolParsing.ts` normalizes and parses tool tags (pure functions, tested)
3. `useToolCalling` dispatches to corresponding Tauri command or local handler
4. Result injected back into conversation as system/user message

### Three Agent Modes

- **ask**: text-only responses, no tool execution
- **plan**: agent proposes actions, asks confirmation before executing
- **agent**: direct tool execution, full autonomy

### Key Conventions

- **Path alias**: `@/*` → `./src/*` (tsconfig paths)
- **Tests**: Pure parser/dispatch logic in `tests/` (toolParsing, patchParsing, toolDispatch). Rust tests in each .rs module. No frontend component tests.
- **Models**: `models/` directory (gitignored), llama.cpp binaries in `llama.cpp/`
- **FS scope**: Tauri scoped to `$APPDATA/pepe-studio`, `$HOME/pepe-studio`, `$RESOURCE/*`
- **Bundle ID**: `com.pepestudio.app`
- **DB location**: SQLite `models.db`
