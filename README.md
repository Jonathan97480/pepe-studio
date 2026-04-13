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

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)
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

## Licence

MIT — Voir [LICENSE](LICENSE)
