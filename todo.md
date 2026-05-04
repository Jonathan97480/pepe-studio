# TODO Pépé-Studio

## Lundi 04/05/2026 — Sprint Refactor J1 : Découpage api_server.rs

- [x] Créer les modules Rust cibles dans `src-tauri/src/` : `state.rs`, `health.rs`, `models_api.rs`, `chat_api.rs`, `tools_api.rs`
- [x] Extraire la gestion d'état partagé (`AppState`, `Mutex`) dans `state.rs`
- [x] Extraire les routes health/status dans `health.rs`
- [x] Extraire les routes models (list, load, unload) dans `models_api.rs`
- [x] Extraire les routes chat/completions dans `chat_api.rs`
- [x] Extraire les routes tools (file ops, terminal, web) dans `tools_api.rs`
- [x] Mettre à jour `main.rs` pour importer et enregistrer les nouveaux modules
- [x] Checklist sécurité sur chaque module extrait (command injection, path traversal, unwrap critiques)
- [x] `cargo check` ✅ après chaque extraction
- [x] `npm run test:rust` ✅ en fin de session
- [x] Commit intermédiaire par module extrait

> ℹ️ Les tâches calendrier du **05/05** (extraction état + health/models) et **06/05** (chat_api + tools_api) ont été réalisées en avance le 04/05.

---

## Jeudi 07/05/2026 — Sprint Refactor J2 : Sécurité outils & audit

- [x] Implémenter validation stricte des entrées dans `tools_api.rs` (path traversal, types, longueurs)
- [x] Ajouter logs d'audit sur chaque appel d'outil (nom, args sanitisés, résultat ok/err)
- [x] Revue sécurité ciblée Command Injection sur `cmd`, `run_shell_command`, `terminal_exec`
- [x] Vérifier et renforcer la validation des chemins dans `file_ops` (bloquer `..`, chemins absolus hors scope)
- [x] `cargo check` ✅
- [x] `npm run test:rust` ✅
- [x] Commit

## Vendredi 08/05/2026 — Sprint Refactor J3 : Découpage db.rs _(Jalon 1)_

- [x] Analyser `db.rs` et définir les modules cibles : `db/models.rs`, `db/documents.rs`, `db/conversations.rs`, `db/schema.rs`
- [x] Extraire gestion des model_configs dans `db/models.rs`
- [x] Extraire gestion des documents et chunks dans `db/documents.rs`
- [x] Extraire gestion des conversations et messages dans `db/conversations.rs`
- [x] Extraire init schema et migrations dans `db/schema.rs`
- [x] Conserver signatures publiques compatibles avec `main.rs`
- [x] `cargo check` ✅ après chaque extraction
- [x] `npm run test:rust` ✅
- [x] Commit — **Jalon 1 : api_server.rs et db.rs découpés**

---

## Semaine 2 — Backend Rust sécurité (filesystem, terminal, skills)

### Lundi 11/05/2026 — hw_info.rs → file_ops / shell_ops / media

- [x] Découper `hw_info.rs` en `file_ops.rs`, `shell_ops.rs`, `media.rs`
- [ ] Introduire un validateur central des chemins fichiers
- [ ] Bloquer patterns dangereux (`..`, chemins hors scope `$APPDATA/pepe-studio`, `$HOME/pepe-studio`)
- [x] `cargo check` ✅
- [x] Commit

### Mardi 12/05/2026 — terminal_manager.rs → pty / parser / executor

- [x] Découper `terminal_manager.rs` en `terminal_parser.rs`, `terminal_pty.rs`
- [x] Durcir `parse_command` et validation des commandes PTY
- [x] Ajouter journalisation des exécutions terminal (commande, exit code, durée)
- [x] `cargo check` ✅
- [x] Commit

### Mercredi 13/05/2026 — skills.rs → manager / executor

- [x] Découper `skills.rs` en `skills/manager.rs` et `skills/executor.rs`
- [x] Ajouter contrôles de sécurité PowerShell (blocklist de cmdlets dangereux)
- [x] Ajouter validation syntaxique avant exécution skill
- [x] `cargo check` ✅
- [x] Commit `b895f38`

### Jeudi 14/05/2026 — llama_sidecar.rs & image_gen.rs

- [x] Découper `llama_sidecar.rs` en lifecycle et streaming
- [x] Découper `image_gen.rs` en modules séparés
- [x] Vérifier compatibilité de toutes les commandes Tauri après découpage
- [x] `cargo check` ✅
- [x] Commit `7a7d61a`

### Vendredi 15/05/2026 — Passe globale Rust _(Jalon 2)_

- [x] Supprimer tous les `unwrap()`/`expect()` critiques (chemins de code utilisateur)
- [x] Uniformiser la gestion d'erreurs `Result<_, String>` sur tous les modules
- [x] Revue de code Rust complète de la semaine
- [x] `cargo check` ✅
- [x] Commit — **Jalon 2 : backend Rust sécurisé et stabilisé**

---

## Semaine 3 — Frontend TypeScript/React

### Lundi 18/05/2026 — ModelsPanel.tsx

- [x] Découper `ModelsPanel.tsx` en composants dédiés (< 300 lignes chacun)
- [x] `primitives.tsx` — SliderParam, NumberParam, SectionHeader (85 lignes)
- [x] `SdModelSelector.tsx` — carte Stable Diffusion (45 lignes)
- [x] `SamplingAdvanced.tsx` — 6 sections sampling accordéon (107 lignes)
- [x] `ModelConfigForm.tsx` — formulaire de configuration (209 lignes)
- [x] `ModelCard.tsx` — carte modèle + expand (124 lignes)
- [x] `ModelsPanel.tsx` réduit — orchestration seule (312 lignes)
- [x] `npm run typecheck` ✅ + `npm run lint` ✅
- [x] Commit

### Mardi 19/05/2026 — useBuildMachineContext.ts

- [x] Extraire `useHardwareInfo.ts` — hook + `HardwareInfo` interface + `formatGpuString`
- [x] Extraire `src/lib/toolGroupResolver.ts` — `getToolGroupId(id)` pure function
- [x] Simplifier `useBuildMachineContext.ts` (1181 → 1115 lignes)
- [x] Ajouter tests unitaires `toolGroupResolver.test.ts` (40 cas)
- [x] `npm run test:web` ✅ — 65 tests pass
- [x] Commit

### Mercredi 20/05/2026 — useToolCalling.ts

- [x] Extraire `src/lib/toolJsonParser.ts` — `parseToolBlock` (cascade JSON.parse → extractWriteFileTool → extractSimpleTool)
- [x] Extraire `src/lib/toolParseErrors.ts` — `buildToolParseError` (8 messages contextuels)
- [x] Simplifier `useToolCalling.ts` (imports ajoutés, `sanitizeLlmJson`/`extractSimpleTool`/`extractWriteFileTool` supprimés)
- [x] `npm run test:web` ✅ — 79 tests pass
- [x] Commit `29fd71d`

### Jeudi 21/05/2026 — useLlama.ts & toolWebHandlers.ts

- [x] Extraire `src/lib/sdPromptUtils.ts` (logique SD pure)
- [x] Extraire `src/lib/streamUtils.ts` (normalizeVisibleAssistantText, isCorruptedThinkingChunk, detectRepetitionLoop)
- [x] Réduire `toolWebHandlers.ts` 956 → 713 lignes
- [x] Remplacer 3 `useCallback` dans `useLlama.ts` par imports directs
- [x] `npm run test:web` ✅ — 79 tests pass
- [x] Commit `265e16f`

### Vendredi 22/05/2026 — ChatWindow.tsx + lint final _(Jalon 3)_

- [x] Extraire `useConversationLoader.ts` (chargement conv DB + état conversation)
- [x] Extraire `useVoice.ts` (TTS + micro + speakText)
- [x] Réduire `ChatWindow.tsx` 854 → 746 lignes
- [x] Corriger `ModelSettingsContext.tsx` — lazy init sdModelPath (lint error)
- [x] `npm run lint:fix` ✅ — 0 erreurs
- [x] `npm run test:web` ✅ — 79 tests pass
- [x] Commit `f522ce5` — **Jalon 3 : frontend volumineux découpé**

---

## Semaine 4 — Hardening sécurité, tests, release gate

### Lundi 25/05/2026 — Rate limiting & CORS

- [ ] Ajouter rate limiting sur le serveur API (axum middleware)
- [ ] Restreindre CORS à `localhost` uniquement (supprimer `Any`)
- [ ] Ajouter validation de schéma JSON pour les requêtes API entrantes
- [ ] `cargo check` ✅
- [ ] Commit

### Mardi 26/05/2026 — Tests sécurité

- [ ] Ajouter tests : command injection (chars spéciaux, `;`, `&&`, `|`)
- [ ] Ajouter tests : path traversal (`../`, chemins absolus hors scope)
- [ ] Ajouter tests d'intégration API critiques (`/health`, `/v1/models`, `/v1/chat/completions`)
- [ ] Vérifier logs d'audit sur opérations sensibles
- [ ] `npm run test` ✅
- [ ] Commit

### Mercredi 27/05/2026 — Suite de tests complète

- [ ] Exécuter `npm run check` (lint + typecheck)
- [ ] Exécuter `npm run test:web` et `npm run test:rust`
- [ ] Corriger régressions et flaky tests
- [ ] Contrôler couverture tests sur modules critiques
- [ ] Commit

### Jeudi 28/05/2026 — Build & smoke test

- [ ] Build complet `npm run tauri:build`
- [ ] Smoke test installateur sur machine propre
- [ ] Vérifier démarrage, chat, outils, terminal, RAG
- [ ] Commit

### Vendredi 29/05/2026 — Go/No-Go Release Candidate _(Jalon 4)_

- [ ] Go/No-Go final sécurité + qualité
- [ ] Gel de code, mise à jour `CHANGELOG.md`
- [ ] Préparer release candidate (sans publication finale)
- [ ] Commit — **Jalon 4 : release candidate prête**

---

## Lundi 01/06/2026 — QA Docs & Prompts Système _(Jalon 5 — Release Gate v1.0.0)_

- [ ] Vérifier toute la documentation produit (`README`, `CHANGELOG`, `RELEASE_CHECKLIST`, `CONTRIBUTING`)
- [ ] Relire les prompts système IA (instructions, garde-fous, format tags outils)
- [ ] Contrôler encodage UTF-8, caractères cassés/corrompus
- [ ] Vérifier cohérence FR/EN, fautes critiques, placeholders oubliés
- [ ] Exécuter tests manuels de prompts (scénarios réels) pour valider tool-calls
- [ ] Corriger anomalies détectées
- [ ] **Go/No-Go final → Tag et publication v1.0.0** 🚀
