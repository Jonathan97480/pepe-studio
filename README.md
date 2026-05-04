# Pepe-Studio

**L'OS de l'Agent IA** — Interface locale haut de gamme pour transformer vos modèles de langage en agents autonomes capables d'agir sur le monde réel.

![Pepe-Studio](public/icon.png)

---

## Présentation

Pepe-Studio est une application desktop construite avec **Tauri + Next.js + Rust**, conçue pour exécuter des modèles LLM locaux (via llama.cpp) et les doter de capacités d'action réelles : écriture de fichiers, exécution de commandes, navigation web, gestion de terminaux, et bien plus.

L'IA ne se contente plus de répondre — elle **agit**.

---

## Fonctionnalités

- **Agents autonomes** — L'IA exécute des outils en chaîne (write_file, cmd, start_dev_server, patch_file…) sans intervention manuelle
- **Modèles locaux** — Compatible llama.cpp (GGUF), gemma, mistral, qwen, etc.
- **Mémoire par conversation** — Plan, structure de projet et contexte persistés en SQLite
- **Navigateur intégré** — L'IA ouvre, inspecte et corrige les erreurs JS en temps réel
- **Terminal multi-sessions** — Création et gestion de terminaux persistants depuis le chat
- **Compresseur de contexte** — Résumé automatique des échanges anciens (Token Killer)
- **RAG + documents** — Indexation et recherche dans des fichiers PDF/texte
- **MCP (Model Context Protocol)** — Connexion à des serveurs MCP externes
- **Skills système** — Scripts PowerShell réutilisables créés et gérés par l'IA
- **API OpenAI-compatible (Open WebUI)** — Endpoint `/v1` local avec streaming SSE, réflexion en temps réel et exécution d'outils
- **TTS** — Lecture vocale des réponses de l'assistant
- **Modes Ask / Plan / Agent** — Contrôle fin du niveau d'autonomie de l'IA

---

## Stack technique

| Couche          | Technologie                                 |
| --------------- | ------------------------------------------- |
| Frontend        | Next.js 14, React, TypeScript, Tailwind CSS |
| Desktop         | Tauri 1.x (Rust)                            |
| LLM runtime     | llama.cpp (sidecar)                         |
| Base de données | SQLite (via Rusqlite)                       |
| Styling         | Tailwind CSS + Glassmorphism                |

---

## Prérequis

- [Node.js](https://nodejs.org/) **20.12.0** (LTS) — Voir `.nvmrc`
- [Rust](https://rustup.rs/) (stable 1.70+)
- **Windows 10+**, macOS 10.13+, ou Linux (Ubuntu 20.04+)
- **GPU NVIDIA** recommandé pour les modèles LLM (CUDA 11.8+)

## Installation

### 1. Cloner le repository

```bash
git clone https://github.com/pepe-studio/pepe-studio.git
cd pepe-studio
```

### 2. Installer les dépendances

**Frontend :**

```bash
npm install
```

**Backend (Rust) :** S'installe automatiquement lors du build

### 3. Télécharger un modèle GGUF

Placer un modèle GGUF dans le dossier `models/` (ex: `models/mistral-7b.gguf`)

Modèles recommandés :

- [Mistral 7B](https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2) — Équilibré
- [Qwen 14B](https://huggingface.co/Qwen/Qwen-14B-Chat) — Puissant
- [Gemma 7B](https://huggingface.co/google/gemma-7b-it) — Léger

**Note :** llama.cpp doit être présent dans `llama.cpp/` (fourni avec le repo)

## Développement

### Mode dev

```bash
npm run tauri:dev
```

Lance simultanément :

- Frontend Next.js sur `http://localhost:3000`
- Backend Tauri + Rust
- Hot reload automatique sur changements

### Scripts disponibles

```bash
npm run tauri:dev      # 🚀 Mode développement
npm run tauri:build    # 🏗️ Build production
npm run check          # 🔍 Lint + TypeScript
npm run lint:fix       # 🧹 Autofix ESLint
npm run format         # ✨ Format avec Prettier
npm run typecheck      # ✅ Vérifier types
npm run test:web       # 🧪 Tests TypeScript
npm run test:rust      # 🦀 Tests Rust
npm run test           # 🧪 Tous les tests
```

### Structure du code

```
src/                   # Frontend React/TypeScript
├── app/               # Next.js app router
├── components/        # Composants React
├── hooks/             # Custom hooks (chat, models, tools)
├── lib/               # Utilities (parsing, dispatch, etc.)
├── tools/             # API clients (Context7, MCP, etc.)
├── context/           # React context providers
└── types/             # Type definitions

src-tauri/             # Backend Rust
├── src/
│   ├── main.rs        # 57+ commandes Tauri
│   ├── db.rs          # SQLite + RAG
│   ├── llama_sidecar.rs    # LLM lifecycle
│   ├── terminal_manager.rs # PTY sessions
│   ├── mcp.rs         # Model Context Protocol
│   └── ...
└── Cargo.toml
```

## Build Production

```bash
npm run tauri:build
```

Génère :

- Windows: `src-tauri/target/release/bundle/msi/` (installer .msi)
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/deb/` (Debian) + AppImage

## Configuration

### Modèles LLM

Ajouter des modèles dans `models/` dossier. L'app les détecte automatiquement.

Modèles supportés :

- Format : GGUF (via llama.cpp)
- Architectures : Gemma, Mistral, Qwen, Llama, etc.

### Clés API (optionnel)

Pour activer search web, context7, etc., paramétrer dans **Settings** :

- `BRAVE_SEARCH_KEY` / `SERPER_SEARCH_KEY` / `TAVILY_SEARCH_KEY` (Web search)
- `CONTEXT7_API_KEY` (Documentation search)
- Hugging Face token (pour gated models)

## Troubleshooting

### L'app ne démarre pas

```bash
# Vérifier les dépendances
npm ci
cargo check --manifest-path src-tauri/Cargo.toml

# Vérifier le modèle GGUF existe
ls models/
```

### LLM lent ou erreurs CUDA

- Vérifier NVIDIA CUDA 11.8+ installé
- Vérifier GPU détecté : `nvidia-smi`
- Réduire taille du contexte dans Settings
- Essayer modèle plus petit (7B au lieu de 14B)

### Terminal ne fonctionne pas (Windows)

- Nécessite Windows 10 Build 19041+
- Vérifier ConPTY support en exécutant Powershell 7+

## Support & Contribution

- 🐛 [Signaler un bug](https://github.com/pepe-studio/pepe-studio/issues)
- 💡 [Proposer une feature](https://github.com/pepe-studio/pepe-studio/discussions)
- 🤝 [Contribuer au code](CONTRIBUTING.md)

## License

MIT License — Voir [LICENSE](LICENSE) pour détails.

---

## Roadmap

- [ ] Support Linux/macOS complet
- [ ] Interface web (sans Tauri)
- [ ] Ollama integration
- [ ] Streaming responses optimization
- [ ] Plugins système
- [ ] Multi-user mode

---

**Pepe-Studio v1.0.0** — AI Agent OS  
[GitHub](https://github.com/pepe-studio/pepe-studio) | [Documentation](https://pepe-studio.dev) | [Discord](https://discord.gg/pepe-studio)

- Un modèle LLM au format GGUF
- Les binaires **llama.cpp**

---

## Installation

```bash
git clone https://github.com/Jonathan97480/pepe-studio.git
cd pepe-studio
npm install
```

### 1. Télécharger llama.cpp

Téléchargez la dernière release depuis [github.com/ggerganov/llama.cpp/releases](https://github.com/ggerganov/llama.cpp/releases).

Choisissez l'archive correspondant à votre configuration (ex: `llama-b...-bin-win-cuda-cu12.x-x64.zip` pour GPU NVIDIA, ou `llama-b...-bin-win-noavx-x64.zip` pour CPU seul), puis extrayez son contenu dans le dossier `llama.cpp/` à la racine du projet :

```
llama.cpp/
├── llama-server.exe
├── llama.dll
├── ggml.dll
└── ...
```

### 2. Télécharger un modèle GGUF

Placez votre modèle GGUF dans le dossier `models/` :

```
models/
└── votre-modele.gguf
```

> Modèles recommandés : [Gemma 3](https://huggingface.co/google), [Mistral](https://huggingface.co/mistralai), [Qwen2.5](https://huggingface.co/Qwen) au format Q4/Q8.

---

## Lancement

```bash
# Mode développement
npm run tauri:dev

# Build de production
npm run tauri:build
```

## Qualité

```bash
# Lint + typecheck
npm run check

# Tests web ciblés sur les parseurs/utilitaires purs
npm run test:web

# Tests Rust
npm run test:rust
```

`npm run tauri:dev` est désormais portable : le script lance `next dev` puis `cargo run` depuis le dossier courant, sans chemin absolu machine.

---

## Structure du projet

```
pepe-studio/
├── src/
│   ├── app/              # Next.js pages
│   ├── components/       # Composants React (ChatWindow, Sidebar, BrowserPanel…)
│   ├── hooks/            # Logique métier (useLlama, useToolCalling, useBuildMachineContext…)
│   ├── lib/              # Utilitaires (chatUtils, orchestrator, ragRetrieval…)
│   └── tools/            # Clients externes (MCP, Context7, SearchWeb…)
├── src-tauri/
│   └── src/              # Backend Rust (db, llama_sidecar, terminal_manager, scraper…)
├── models/               # Modèles GGUF (non versionnés)
└── public/               # Assets statiques
```

---

## Notes d'architecture

### Frontend

- `src/components/ChatWindow.tsx` orchestre la conversation, mais l'UI est désormais découpée entre en-tête, panneaux de conversation et composeur.
- `src/hooks/useToolCalling.ts` reste le point d'exécution des outils; les parseurs purs ont été isolés dans `src/lib/toolParsing.ts` pour être testables.
- `src/components/Layout.tsx` garde l'état global des panneaux, tandis que `src/components/WorkspaceWindows.tsx` porte les fenêtres flottantes navigateur/terminal.

### Backend Rust

- `src-tauri/src/main.rs` expose les commandes Tauri.
- `src-tauri/src/db.rs` gère la persistance SQLite.
- `src-tauri/src/terminal_manager.rs`, `scraper.rs`, `mcp.rs` et `llama_sidecar.rs` couvrent respectivement terminal, web, MCP et runtime modèle.
- `src-tauri/src/api_server.rs` expose une API OpenAI-compatible (`/v1/models`, `/v1/chat/completions`) pour connecter Open WebUI.

### Intégration Open WebUI

- URL API : `http://localhost:8766/v1`
- Endpoint principal : `POST /v1/chat/completions`
- Fonctionnement stream : la réflexion (`reasoning_content`) est diffusée en continu tout en conservant l'exécution des outils (tool calls) côté proxy.
- Mode non-stream : boucle locale d'outils puis réponse finale JSON compatible OpenAI.

### Flux d'un tool call

1. Le modèle émet un bloc `<tool>` ou un tag spécialisé.
2. `useToolCalling` normalise et parse ce bloc.
3. Le frontend appelle la commande Tauri ou le handler local correspondant.
4. Le résultat revient dans la conversation sous forme de message système/utilisateur.

### Modes Ask / Plan / Agent

- `ask` : réponse textuelle, pas d'action automatique.
- `plan` : l'agent propose puis demande confirmation avant les actions sensibles.
- `agent` : exécution directe des outils disponibles.

### Choix `output: "export"`

Ce projet utilise l'export statique Next pour s'intégrer proprement à Tauri.

Conséquences :

- pas de SSR Next côté runtime
- routes et assets devant rester compatibles export statique
- préférence pour des composants client explicites quand l'UI dépend d'API navigateur/Tauri

---

## Licence

MIT — Voir [LICENSE](LICENSE)
