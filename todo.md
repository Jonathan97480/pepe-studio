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

- [ ] Découper `skills.rs` en `skills/manager.rs` et `skills/executor.rs`
- [ ] Ajouter contrôles de sécurité PowerShell (blocklist de cmdlets dangereux)
- [ ] Ajouter validation syntaxique avant exécution skill
- [ ] `cargo check` ✅ + `npm run test:rust` ✅
- [ ] Commit

### Jeudi 14/05/2026 — llama_sidecar.rs & image_gen.rs

- [ ] Découper `llama_sidecar.rs` en lifecycle et streaming
- [ ] Découper `image_gen.rs` en modules séparés
- [ ] Vérifier compatibilité de toutes les commandes Tauri après découpage
- [ ] `cargo check` ✅ + `npm run test:rust` ✅
- [ ] Commit

### Vendredi 15/05/2026 — Passe globale Rust _(Jalon 2)_

- [ ] Supprimer tous les `unwrap()`/`expect()` critiques (chemins de code utilisateur)
- [ ] Uniformiser la gestion d'erreurs `Result<_, String>` sur tous les modules
- [ ] Revue de code Rust complète de la semaine
- [ ] `cargo check` ✅ + `npm run test:rust` ✅
- [ ] Commit — **Jalon 2 : backend Rust sécurisé et stabilisé**

---

## Semaine 3 — Frontend TypeScript/React

### Lundi 18/05/2026 — ModelsPanel.tsx

- [ ] Découper `ModelsPanel.tsx` en composants dédiés (< 300 lignes chacun)
- [ ] Vérifier props/types et comportements UI
- [ ] Corriger imports et chemins
- [ ] `npm run typecheck` ✅ + `npm run lint:fix` ✅
- [ ] Commit

### Mardi 19/05/2026 — useBuildMachineContext.ts

- [ ] Découper en hooks spécialisés (hardware detection, GPU config)
- [ ] Isoler détection hardware et configuration GPU
- [ ] Ajouter tests unitaires de calcul/config
- [ ] `npm run test:web` ✅
- [ ] Commit

### Mercredi 20/05/2026 — useToolCalling.ts

- [ ] Découper en validator / executor
- [ ] Vérifier anti-loop et permissions outils
- [ ] Ajouter tests sur cas limites d'exécution
- [ ] `npm run test:web` ✅
- [ ] Commit

### Jeudi 21/05/2026 — useLlama.ts & toolWebHandlers.ts

- [ ] Découper `useLlama.ts` : streaming, parsing, orchestration
- [ ] Découper `toolWebHandlers.ts`
- [ ] Vérifier stabilité du flux chat
- [ ] `npm run test:web` ✅
- [ ] Commit

### Vendredi 22/05/2026 — ChatWindow.tsx + lint final _(Jalon 3)_

- [ ] Découper `ChatWindow.tsx` (> 300 lignes → sous-composants)
- [ ] Nettoyer tous les composants > 300 lignes restants
- [ ] Passe `npm run lint:fix` + `npm run typecheck` complète
- [ ] Commit — **Jalon 3 : frontend volumineux découpé**

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
