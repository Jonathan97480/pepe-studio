# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-01

### Added

- **Core Agent Architecture** — AI agents with autonomous tool execution
- **Local LLM Support** — Compatible with llama.cpp GGUF models (Gemma, Mistral, Qwen, etc.)
- **Tool Calling** — 57 built-in tools: file ops, terminal, web browsing, code execution
- **Persistent Memory** — SQLite-backed conversation history, plans, and context
- **Terminal Integration** — Multi-session PTY support with streaming output
- **Browser Integration** — JavaScript error capture and real-time fixing
- **MCP (Model Context Protocol)** — Connect external MCP servers
- **RAG/Document Search** — PDF extraction, indexing, and semantic search
- **Context Compression** — Automatic conversation summarization (Token Killer)
- **Skills System** — User-created reusable PowerShell scripts
- **OpenAI-Compatible API** — `/v1` endpoint for Open WebUI integration
- **Text-to-Speech** — Voice output for assistant responses
- **Agent Modes** — Ask, Plan, Agent (autonomy control)
- **Responsive UI** — Dark mode, glassmorphism, responsive design

### Technical

- Tauri 1.x desktop application (Rust backend)
- Next.js 14 with static export frontend
- TypeScript strict mode
- SQLite database with RAG indexing
- Terminal sessions via portable-pty
- HTTP/SSE streaming from llama.cpp sidecar

### Fixed

- TRELLIS 3D generation code removed (not production-ready)
- Dependency cleanup (removed extraneous packages)
- TypeScript strict validation
- Code quality fixes (lint, format)

### Known Limitations

- Linux/macOS support pending (Windows primary)
- 3D model generation feature removed
- Requires NVIDIA CUDA for optimal LLM performance

---

## [0.1.0] - Early Development

Initial alpha implementation with core features.
