# 🔧 REFACTORING ROADMAP v1.0.0 — Plan d'Action

**Objectif :** Mettre tous les fichiers ≤ 300 lignes + Corriger risques de sécurité  
**Délai :** 2-3 semaines avant v1.0.0  
**Priority :** P0 — BLOCKING Release

---

## Phase 1️⃣ : RUST Backend (P0 CRITIQUE)

### 1.1 🔴 `api_server.rs` (1654 lignes) → 5 modules

**Raison :** Le plus grand fichier, expose 30+ endpoints sans isolation

**Plan de split :**

```
src-tauri/src/api_server/
├── mod.rs              (200 lignes) — Re-exports, main router setup
├── state.rs            (150 lignes) — ApiServerState, ProxyState
├── health.rs           (100 lignes) — GET /health endpoints
├── models.rs           (200 lignes) — GET /v1/models, list, discovery
├── chat.rs             (300 lignes) — POST /v1/chat/completions logic
├── tools.rs            (280 lignes) — execute_tool(), dispatch (SECURITY CRITICAL)
└── handlers.rs         (250 lignes) — Various endpoint handlers
```

**Sécurité :**

- [ ] Extraire `execute_tool()` dans `tools.rs`
- [ ] Ajouter validation stricte sur `name` et `args`
- [ ] Ajouter audit logging de chaque appel tool

**Effort :** 1.5 jours  
**Risk Reduction :** 🔴→🟡 (chaque module auditableben)

---

### 1.2 🔴 `db.rs` (1266 lignes) → 4 modules

**Raison :** Database layer critique, mélange models, operations, migrations

**Plan de split :**

```
src-tauri/src/db/
├── mod.rs              (150 lignes) — Exports, DbState init
├── models.rs           (300 lignes) — ModelConfig, structure types
├── conversations.rs    (280 lignes) — Conversations, messages (chat history)
├── documents.rs        (250 lignes) — Documents, RAG, search indexing
├── schema.rs           (180 lignes) — SQL CREATE TABLE + migrations
└── utils.rs            (120 lignes) — SQL helpers, common queries
```

**Sécurité :**

- [ ] Centraliser validation des IDs
- [ ] Vérifier aucune injection SQL (audit params!)
- [ ] Ajouter tests SQL pour chaque fonction

**Effort :** 1.5 jours  
**Risk Reduction :** 🔴→✅ (chaque module < 300, entièrement auditables)

---

### 1.3 🔴 `hw_info.rs` (868 lignes) → 3 modules

**Raison :** Mélange file ops, shell commands, media processing

**Plan de split :**

```
src-tauri/src/hw_info/
├── mod.rs              (150 lignes) — Exports, state
├── file_ops.rs         (280 lignes) — read_file, write_file, patch_file
│   ├─ PATH VALIDATION (CRITICAL)
├── shell_ops.rs        (250 lignes) — run_shell_command() + sanitization
│   ├─ COMMAND VALIDATION (CRITICAL)
├── media.rs            (240 lignes) — Images, PDFs, downloads
└── validators.rs       (100 lignes) — Path & command validators
```

**Sécurité :**

- [ ] **`validators.rs`** — Whitelist paths, reject `..`, check symlinks
- [ ] **`shell_ops.rs`** — Sanitize command before PowerShell exec
- [ ] Audit logging pour tous les file/shell access

**Effort :** 1 jour  
**Risk Reduction :** 🔴→🟡 (validation centralisée)

---

### 1.4 🔴 `terminal_manager.rs` (738 lignes) → 3 modules

**Raison :** PTY + command parsing + execution mélangés

**Plan de split :**

```
src-tauri/src/terminal_manager/
├── mod.rs              (180 lignes) — Exports, TerminalManagerState
├── pty.rs              (320 lignes) — PTY lifecycle, interactive sessions
├── executor.rs         (200 lignes) — terminal_exec(), command runs
└── parser.rs           (150 lignes) — parse_command() with validation
```

**Sécurité :**

- [ ] `parse_command()` → dédié, testé isolément
- [ ] Reject malicious escapes/injections
- [ ] Log all command execution

**Effort :** 1 jour  
**Risk Reduction :** 🔴→🟡

---

### 1.5 🟠 `image_gen.rs` (857 lignes) → 2 modules

**Raison :** Image generation + API calls mélangées

**Plan :**

```
src-tauri/src/image_gen/
├── mod.rs              (150 lignes) — Exports
├── generator.rs        (350 lignes) — Image generation logic
└── api_client.rs       (200 lignes) — API calls, HTTP handling
```

**Effort :** 0.5 jour

---

### 1.6 🟠 `skills.rs` (703 lignes) → 2 modules

**Raison :** PowerShell script management + execution

**Plan :**

```
src-tauri/src/skills/
├── mod.rs              (150 lignes) — Exports
├── manager.rs          (300 lignes) — CRUD operations on skills
└── executor.rs         (250 lignes) — execute skill (SECURITY!)
```

**Sécurité :**

- [ ] Sandbox PowerShell (restricted mode, no admin)
- [ ] Validate script syntax before exec
- [ ] Log execution + output

**Effort :** 1 jour

---

### 1.7 🟠 `llama_sidecar.rs` (710 lignes) → 2 modules

**Plan :**

```
src-tauri/src/llama_sidecar/
├── mod.rs              (150 lignes) — Exports
├── lifecycle.rs        (350 lignes) — Process startup, health, shutdown
└── streaming.rs        (250 lignes) — HTTP requests, SSE streaming
```

**Effort :** 0.5 jour

---

### **Rust Subtotal :** 6-7 jours

---

## Phase 2️⃣ : TypeScript Frontend (P1 IMPORTANT)

### 2.1 🟠 `ModelsPanel.tsx` (1241 lignes) → 4 components

**Split :**

```
components/models/
├── ModelsPanel.tsx          (200) — Main layout, dispatch
├── ModelsList.tsx           (280) — List rendering, selection
├── ModelConfigForm.tsx      (300) — Settings form, inputs
├── ModelActions.tsx         (180) — Buttons, delete, export
```

**Effort :** 0.5 jour

---

### 2.2 🟠 `useBuildMachineContext.ts` (1169 lignes) → 3 hooks

**Split :**

```
hooks/
├── useHardwareDetection.ts  (280) — CPU, RAM, GPU detection
├── useGpuOptimization.ts    (290) — GPU flags, n_gpu_layers calc
└── useLlmParameters.ts      (250) — Context, temp, other params
```

**Effort :** 0.5 jour

---

### 2.3 🔴 `useToolCalling.ts` (979 lignes) → 2 modules (refactor EXISTING)

**Split :**

```
hooks/
├── useToolCalling.ts        (280) — Main hook (keep name for compatibility)
├── useToolValidator.ts      (200) — Validation, permission checks

lib/
├── toolExecutor.ts          (250) — Execution logic, loop prevention
```

**Critical :** Tool dispatch est crucial, maintenir claire séparation.

**Effort :** 0.5 jour

---

### 2.4 🟠 `useLlama.ts` (835 lignes) → 2 hooks

**Split :**

```
hooks/
├── useLlama.ts              (280) — Main chat loop (keep name)
├── useLlamaStreaming.ts     (250) — Streaming, token parsing
```

**Effort :** 0.5 jour

---

### 2.5 🟠 `ChatWindow.tsx` (815 lignes) → 3 components

**Split :**

```
components/chat/
├── ChatWindow.tsx           (200) — Main, layout
├── MessageList.tsx          (300) — Message rendering
├── ChatInput.tsx            (200) — Input composition
```

**Effort :** 0.5 jour

---

### 2.6 🟠 `toolWebHandlers.ts` (858 lignes) → 2 modules

**Split :**

```
lib/tools/
├── toolWebHandlers.ts       (350) — Web tools (search, scrape, browser)
└── toolWebValidator.ts      (250) — URL validation, security checks
```

**Effort :** 0.5 jour

---

### **Other Files** (300-380 lignes)

Ceux-ci sont à la limite. Considérer :

- `MessageBubble.tsx` (378) → Extract rendering utilities
- `SettingsPanel.tsx` (332) → Extract form components
- `SkillsPanel.tsx` (308) → Extract skill list

**Effort :** 2 jours (optional but recommended)

---

### **TypeScript Subtotal :** 4-5 jours (avec optional)

---

## Phase 3️⃣ : Security Hardening (P0)

### 3.1 Centralized Input Validation

**New file :** `src-tauri/src/validators/mod.rs`

```rust
pub mod path_validator;       // All file path validation
pub mod command_validator;    // Shell command validation
pub mod request_validator;    // API request schema validation
pub mod sql_validator;        // SQL-safe queries
```

**Effort :** 1 jour

---

### 3.2 Audit Logging

**New file :** `src-tauri/src/audit.rs`

```rust
pub fn log_command_execution(cmd: &str, user: &str, result: &str);
pub fn log_file_access(path: &Path, operation: &str, success: bool);
pub fn log_api_call(endpoint: &str, args: &Value);
```

**Effort :** 0.5 jour

---

### 3.3 Error Handling Pass

Replace all `unwrap()` with `?` operator or `.map_err()`.

**Effort :** 1 jour

---

### 3.4 CORS & Rate Limiting

```rust
// In api_server/mod.rs
let cors = CorsLayer::new()
    .allow_origin("http://localhost:3000".parse().unwrap())
    .allow_origin("http://127.0.0.1:3000".parse().unwrap())
    .allow_methods([GET, POST, OPTIONS]);

let rate_limit = tower_governor::RateLimitLayer::new(
    100,  // 100 requests
    Duration::from_secs(1),
);
```

**Effort :** 0.5 jour

---

### **Security Hardening Total :** 3 jours

---

## Phase 4️⃣ : Testing & Validation (P1)

### 4.1 Unit Tests (Security-Focused)

```
tests/
├── validators.rs        — Test path, command validation
├── sql_injection.rs     — Verify no SQL injection possible
├── command_injection.rs — Verify no shell injection
└── api_security.rs      — Verify CORS, auth, rate limiting
```

**Effort :** 2 jours

---

### 4.2 Integration Tests

```
tests/
├── api_endpoints.rs     — Full API test
├── file_operations.rs   — File read/write tests
└── shell_commands.rs    — Command execution tests
```

**Effort :** 1 jour

---

### **Testing Total :** 3 jours

---

## 📊 Timeline Récapitulatif

| Phase       | Work                   | Days        | Dependencies |
| ----------- | ---------------------- | ----------- | ------------ |
| **1.1**     | `api_server.rs`        | 1.5         | None         |
| **1.2**     | `db.rs`                | 1.5         | None         |
| **1.3**     | `hw_info.rs`           | 1           | None         |
| **1.4**     | `terminal_manager.rs`  | 1           | None         |
| **1.5-1.7** | Other Rust files       | 2           | None         |
| **2.1-2.6** | TypeScript refactoring | 4           | None         |
| **3.1-3.4** | Security hardening     | 3           | Phases 1-2 ✓ |
| **4.1-4.2** | Testing                | 3           | Phases 1-3 ✓ |
| **Total**   |                        | **20 days** | ~1 month     |

---

## 🎯 Critical Path (Minimum)

If pressed for time, do ONLY these (14 days):

1. **api_server.rs** split (extract tool executor) — 1 day
2. **db.rs** split (validate no SQL injection) — 1 day
3. **hw_info.rs** split (validators + shell ops) — 1 day
4. **Security hardening** (input validation, audit logging) — 2 days
5. **Testing** (critical paths only) — 2 days
6. **Code review & bug fixes** — 3 days

**Timeline :** ~2 weeks

---

## ⚠️ Risk if NOT Done

| If We...               | Risk                            | Impact                              |
| ---------------------- | ------------------------------- | ----------------------------------- |
| Skip refactoring       | Cannot fully audit code         | 🔴 CRITICAL — Release vulnerability |
| Skip validation module | Command injection possible      | 🔴 CRITICAL                         |
| Skip testing           | Bugs in new code                | 🟠 HIGH                             |
| Skip audit logging     | No way to investigate incidents | 🟠 HIGH                             |

---

## ✅ Definition of Done

For each file refactored:

- [ ] Max 300 lines per file
- [ ] No `unwrap()` remaining
- [ ] All public functions documented
- [ ] Unit tests pass
- [ ] Security review pass
- [ ] Git commit with clear message

---

## Next Immediate Actions

1. **Create refactoring branches**

    ```bash
    git checkout -b refactor/api-server-split
    git checkout -b refactor/db-split
    git checkout -b refactor/security-hardening
    ```

2. **Start with `api_server.rs`** (highest impact)

3. **Daily commits** to track progress

4. **Weekly security reviews** of refactored code

---

**Status :** 🔴 **NOT STARTED**  
**Recommended Start :** Immediately after v1.0.0-alpha testing  
**Blocker for Production :** YES
