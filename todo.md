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
- [ ] Commit intermédiaire par module extrait
