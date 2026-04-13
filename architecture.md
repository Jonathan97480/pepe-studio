# Architecture — Injection Système Prompt & Gestion du Contexte

## Vue d'ensemble du flux

```
Utilisateur
    │ message + pièces jointes (images, PDF, texte)
    ▼
ChatWindow.tsx
    │
    ├─► buildMachineContext()          ← au démarrage / changement mode / conv
    │       │
    │       ├─ get_hardware_info()     → OS, RAM, CPU, GPU
    │       ├─ list_skills()           → skills activés (filtrés via SkillsContext)
    │       ├─ get_conversations_summary() → résumé long terme des convs passées
    │       └─ get_user_facts()        → profil utilisateur appris
    │
    │   machineContext = string assemblé (SYSTEM OVERRIDE + contexte machine + skills + mémoire + profil)
    │   Stocké dans useState machineContext, setIsContextReady(true)
    │
    ├─► RAG (si pièces jointes PDF indexées)
    │       └─ retrieveChunks(query, docIds)
    │               ├─ search_chunks() FTS5 (passages pertinents)
    │               └─ get_document_chunks() positionnels (fallback)
    │               → injecté dans le prompt texte utilisateur
    │
    └─► sendPrompt(prompt, cfg)  [useLlama.ts]
            │
            │  cfg.systemPrompt = machineContext + "\n\n" + systemPromptUtilisateur
            │
            ├─ Construction apiMessages :
            │       [{ role:"system", content: cfg.systemPrompt }]
            │     + [...historyTrimmed           ]   ← paires user/assistant trimées
            │     + [{ role:"user", content: ... }]  ← message courant (texte + images)
            │
            ├─ Troncature du contexte (algorithme intégré)
            │
            └─► safeInvoke("send_llama_prompt", { messages: apiMessages, ... })
                        │
                        ▼
                llama-server (sidecar Tauri — llama.cpp)
                        │ streaming par événements Tauri
                        ▼
                useLlama — listeners Tauri events :
                    "llama-stream"  → append chunk → updateLastAssistantContent()
                    "llama-done"    → setStreaming(false), setLoading(false)
                    "llama-error"   → setError()
                    "llama-usage"   → setTokenUsage({ used, limit })
                        │
                        ▼
                ChatWindow.tsx — useEffect sur streaming
```

---

## 1. Composition du System Prompt

```
┌────────────────────────────────────────────────────────────────────────┐
│  cfg.systemPrompt (injecté à chaque sendPrompt)                        │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  machineContext  (buildMachineContext, rebuild si mode/conv change)│  │
│  │                                                                  │  │
│  │  ### SYSTEM OVERRIDE — LIS CECI EN PREMIER ###                  │  │
│  │    • Règles INTERDIT ABSOLU (ne pas lister cmds, pas d'excuses) │  │
│  │    • COMPORTEMENT OBLIGATOIRE (question→texte, action→<tool>)   │  │
│  │    • Exemples corrects                                           │  │
│  │  ### FIN SYSTEM OVERRIDE ###                                     │  │
│  │                                                                  │  │
│  │  [Contexte machine hôte]                                        │  │
│  │    OS / RAM / CPU threads / GPU / VRAM                          │  │
│  │                                                                  │  │
│  │  [Skills disponibles]           ← list_skills() + isEnabled()   │  │
│  │    - skill_name: description                                     │  │
│  │    (absent si aucun skill activé)                                │  │
│  │                                                                  │  │
│  │  [Résumé conversations passées] ← get_conversations_summary()   │  │
│  │    (absent si aucune conv précédente)                            │  │
│  │                                                                  │  │
│  │  [Profil utilisateur]           ← get_user_facts()              │  │
│  │    key: value ...                                                │  │
│  │    (absent si aucun fait enregistré)                             │  │
│  │                                                                  │  │
│  │  === OUTILS DISPONIBLES ===                                      │  │
│  │    MCP, HTTP, Terminal, Fichiers, Images, Dev Server,            │  │
│  │    Context7, Skills, Mémoire, ask_user...                       │  │
│  │                                                                  │  │
│  │  === RÈGLES OBLIGATOIRES (RÈGLE 0 à 9b) ===                    │  │
│  │    Lire avant d'agir, Patch avant écrire, Responsive, etc.     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  +  systemPromptUtilisateur  (depuis SettingsPanel / personnalité)     │
│     (optionnel, vide par défaut)                                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Gestion du Contexte (Troncature — useLlama.ts sendPrompt)

```
apiMessages = [systemMsg, ...history, newUserMsg]

                              contextWindow (ex: 8192 tokens)
                              ├──────────────────────────────┤
                              │           75%                │
                              ├─────────────────────┬────────┤
                              │    maxTokens         │ marge │

Estimation tokens :
  • texte : chars / 4
  • image base64 : 256 (patches) + longueur_base64 / 6

Algorithme de troncature :
  while estimatedTokens > maxTokens && history.length > 0 :
      → retire la paire user/assistant la plus ancienne (depuis le début)

Fallback hard-cap (90%) :
  if system prompt seul > 90% contextWindow :
      → tronque le system prompt + "[contexte tronqué]"

Résultat    : badge tokenUsage mis à jour en temps réel (avant même la réponse)
Persistance : aucune — la troncature est calculée à chaque sendPrompt, l'historique
              React (messagesRef) reste intact côté UI
```

---

## 3. Boucle Tool Calling (ChatWindow.tsx)

```
streaming passe false
        │
        ▼
useEffect → scan du dernier message assistant (normalizeToolTags)
        │
        ├─► <patch_file path="...">SEARCH:..REPLACE:..</patch_file>  (priorité 1)
        │       → invoke("patch_file", { path, search, replace })
        │       → résultat injecté comme nouveau message user → sendPrompt() → LLM
        │
        ├─► <write_file path="...">contenu brut</write_file>         (priorité 2)
        │       → invoke("write_file", { path, content })
        │       → résultat injecté → sendPrompt() → LLM
        │
        └─► <tool>{ JSON }</tool>                                     (priorité 3)
                │
                ├─ JSON.parse() + sanitizeLlmJson()
                │   Si erreur : extractWriteFileTool() fallback (regex sans JSON.parse)
                │   Si 2e erreur : errMsg ciblé → sendPrompt() → LLM
                │
                ├─ Gate de mode (isActionTool) :
                │     mode "ask"  → setPendingAgentPermission → UI modale
                │     mode "plan" → setPendingPlanConfirm     → UI confirmation
                │     mode "agent"→ exécution directe
                │
                └─ Dispatch par type de parsedTool :
                       read only (avant gate) :
                         list_terminals, get_terminal_history
                         get_dev_server_info, get_plan, get_skill, ...
                         context7-search, read_skill, read_file
                       actions (après gate) :
                         cmd, terminal_exec, create_terminal, close_terminal
                         http_request, write_file, patch_skill
                         create_skill, run_skill, delete_skill
                         create_mcp_server, start_mcp_server, call_mcp_tool
                         start_dev_server, stop_dev_server, open_browser
                         get_browser_errors, save_image, download_image
                         save_plan, save_memory, search_memory
                         ask_user, context7-docs
                       Chaque handler → invoke(cmd, args) → sendPrompt(résultat, cfg)
```

---

## 4. Gestion de l'Historique Messages (useLlama.ts)

```
useState<LlamaMessage[]> messages
    │
    │  LlamaMessage {
    │    role: "user" | "assistant" | "system"
    │    content: string          ← affichage UI (peut contenir "📎 fichier.pdf")
    │    apiContent?: any         ← contenu réel API (multimodal si images)
    │    thinking?: string        ← bloc <think>...</think>
    │    displayOnly?: boolean    ← vrai = exclu de l'historique API
    │    meta?: string
    │  }
    │
    │  messagesRef.current        ← ref synchronisée (pour les closures)
    │
    ├─ sendPrompt() construit history :
    │     messages
    │       .filter(!displayOnly && content non vide OU role=user)
    │       .map(m => { role, content: m.apiContent ?? m.content })
    │
    ├─ pushUserMessage()  → ajoute user(displayOnly=true) + assistant("") immédiatement
    │                        pour UX instantanée
    │
    ├─ sendPrompt(skipUserMessage=false) → ajoute user + assistant vide dans state
    │   sendPrompt(skipUserMessage=true) → retire displayOnly sur le message existant
    │
    ├─ Conversations SQLite (db.rs) :
    │     start_conversation()   → crée une conv, retourne un id
    │     load_conversation(id)  → charge l'historique depuis SQLite
    │     save_message()         → sauvegarde chaque message (à la fin du streaming)
    │     get_conversations_summary() → résumé des convs pour le system prompt
    │
    └─ resetMessages() ← chargement d'une conv existante depuis ConversationsList
```

---

## 5. Code Mort / Non Branché

| Fichier | Rôle prévu | Statut |
|---|---|---|
| `lib/context/manager.ts` | Sliding window + summarization (classe ContextManager) | ❌ Non importé, non utilisé |
| `lib/context/summarizer.ts` | Stub de summarizer (concat tronquée) | ❌ Non utilisé |
| `lib/orchestrator.ts` | Abstraction LLM + outils (OrchestratorImpl) | ❌ Non utilisé dans le flow principal |
| `tools/SearchWeb.ts` | Recherche web | ❌ Probablement non branché |

Le vrai algorithme de troncature est **inline dans useLlama.ts** (sendPrompt),
pas dans ContextManager. ContextManager est du code de R&D non activé.

---

## 6. RAG (Retrieval Augmented Generation)

```
Utilisateur attache un PDF
    │
    ▼
ChatWindow → invoke("index_document", { path, name })
    → llama.cpp ou Rust: découpe en chunks → stocke dans SQLite (table rag_chunks)
    → retourne docId → stocké dans Attachment.docId

Au moment de sendPrompt(prompt, cfg, attachments) :
    si attachments[].docId présent :
        retrieveChunks(prompt, docIds, limit=6)
            → search_chunks() FTS5  (recherche full-text SQLite)
            → get_document_chunks() (chunks positionnels en fallback)
        → injecté dans apiText AVANT le message utilisateur :
            "===== FICHIER : nom.pdf =====\n...contenu...\n===== FIN ====="
        → envoyé dans newUserMsg.content (texte, puis images)
```

---

## 7. Déclencheurs de Rebuild du System Prompt

| Événement | Effet |
|---|---|
| `useEffect([disabled, chatMode, convRequest?.key])` | `buildMachineContext()` → nouveau machineContext |
| Changement de mode (ask / plan / agent) | Rebuild |
| Chargement d'une autre conversation | Rebuild |
| Après `create_skill` | `buildMachineContext()` pour inclure le nouveau skill |
| Démarrage de l'app | Rebuild |

Le system prompt est **reconstruit à chaque changement de contexte** et injecté
**à chaque appel sendPrompt** — il n'est pas mis en cache côté llama.cpp.
