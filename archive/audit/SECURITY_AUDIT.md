# 🔒 AUDIT SÉCURITÉ v1.0.0 — Rapport Détaillé

**Date :** Mai 2026  
**Status :** ⚠️ **CRITIQUE — Refactorisation Requise**  
**Priority :** P0 — Avant Release

---

## 🚨 Résumé Exécutif

**Problème Principal :** Fichiers **EXCESSIVEMENT VOLUMINEUX** (jusqu'à 1654 lignes) → Risques accrus de vulnérabilités non-détectées

### Scores de Sécurité

| Domaine                         | Score  | Status   | Actions Requises                                   |
| ------------------------------- | ------ | -------- | -------------------------------------------------- |
| **SQL Injection**               | ✅ 95% | SAFE     | Usa params!, no direct concatenation               |
| **Command Injection**           | ⚠️ 65% | RISKY    | Multiple shell commands, needs sanitization review |
| **Path Traversal**              | ⚠️ 70% | RISKY    | File ops scattered, validation unclear             |
| **File Size (Maintainability)** | 🔴 15% | CRITICAL | 18 fichiers > 300 lignes                           |
| **DoS Prevention**              | 🟡 50% | UNKNOWN  | No visible rate-limiting or timeouts               |
| **Error Handling**              | 🟡 60% | MIXED    | Some .map_err, many .unwrap() calls                |

---

## 📋 Fichiers Oversized (Critiques)

### 🔴 Backend Rust — 7 fichiers CRITIQUES

| Fichier               | Lignes   | Risque | Modules                        |
| --------------------- | -------- | ------ | ------------------------------ |
| `api_server.rs`       | **1654** | 🔴🔴🔴 | 30+ endpoints sans isolation   |
| `db.rs`               | **1266** | 🔴🔴   | 15+ fonctions DB mélangées     |
| `hw_info.rs`          | **868**  | 🔴     | Shell + File ops non-séparées  |
| `image_gen.rs`        | **857**  | 🔴     | Image processing + API calls   |
| `terminal_manager.rs` | **738**  | 🔴     | PTY + Command parsing + Exec   |
| `skills.rs`           | **703**  | 🔴     | PowerShell + Script execution  |
| `llama_sidecar.rs`    | **710**  | 🔴     | LLM lifecycle + HTTP streaming |

### 🟠 Frontend TypeScript/React — 11 fichiers IMPORTANTS

| Fichier                     | Lignes | Risque | Raison                                     |
| --------------------------- | ------ | ------ | ------------------------------------------ |
| `ModelsPanel.tsx`           | 1241   | 🟠     | Component monolithe (UI + state + logic)   |
| `useBuildMachineContext.ts` | 1169   | 🟠     | Hook complexe avec 20+ states              |
| `useToolCalling.ts`         | 979    | 🟠     | Tool dispatch criticality requiert clarité |
| `useLlama.ts`               | 835    | 🟠     | Chat loop complexe                         |
| `ChatWindow.tsx`            | 815    | 🟠     | UI monolithe                               |
| `toolWebHandlers.ts`        | 858    | 🟠     | Web tools + HTTP requests                  |
| `MessageBubble.tsx`         | 378    | 🟡     | Rendering logic + edge cases               |
| `SettingsPanel.tsx`         | 332    | 🟡     | Config panel UI                            |
| `SkillsPanel.tsx`           | 308    | 🟡     | Skills management                          |
| `TerminalPanel.tsx`         | 307    | 🟡     | Terminal output rendering                  |
| `toolDocs.ts`               | 380    | 🟡     | Documentation lookup                       |

---

## 🔍 Vulnerabilités Potentielles Identifiées

### 1. Command Injection Risk (api_server.rs : 1654 lignes)

**Problem :** `execute_tool()` dispatche à `run_shell_command()` sans sanitization visible

```rust
// api_server.rs line ~1336, 1345, 1587
let out = run_shell_command(ps)?;      // ← User command passed directly
let out = run_shell_command(command)?; // ← No escaping visible
```

**Risk Level :** 🔴 HIGH — Si `command` provient du LLM sans validation strict

**Fix Required :**

- [ ] Separate shell validation module
- [ ] Whitelist allowed commands or patterns
- [ ] Escape/quote properly before shell exec
- [ ] Add command audit logging

---

### 2. File Path Traversal Risk (hw_info.rs : 868 lignes)

**Problem :** Multiple file operations scattered across huge file

```rust
// hw_info.rs (multiple functions)
read_file_content()
write_file()
patch_file()
download_image()
list_folder_files()
// No centralized path validation visible
```

**Risk Level :** 🔴 HIGH — Tauri scoped FS helps, but local validation needed

**Fix Required :**

- [ ] Create `path_validator.rs` module
- [ ] All file paths must pass validation
- [ ] Reject `..`, absolute paths, symlinks to outside scope
- [ ] Log all file access

---

### 3. SQL Injection (db.rs : 1266 lignes)

**Status :** ✅ **LIKELY SAFE** — Uses `params![]` macro

```rust
// GOOD (using params! - prevents injection)
conn.execute("DELETE FROM model_configs WHERE path = ?1", params![path])

// GOOD (prepared statements)
conn.execute("INSERT INTO documents ... VALUES (?1, ?2)", params![name, total_pages])
```

**But :** Code too large to audit fully without refactoring

**Fix Required :**

- [ ] Extract DB operations to smaller modules by domain
- [ ] Add comprehensive SQL tests
- [ ] Review any dynamic SQL construction (line 580-597 uses `format!`)

---

### 4. PowerShell Injection (skills.rs : 703 lignes)

**Problem :** PowerShell scripts executed from user input

```rust
// skills.rs (implied)
// User creates PowerShell skills → executed via run_skill()
// Risk if user input not sanitized
```

**Risk Level :** 🔴 HIGH — PowerShell is powerful, mistakes fatal

**Fix Required :**

- [ ] Sandbox PowerShell execution (restricted mode, no admin)
- [ ] Validate script before execution
- [ ] Whitelist allowed cmdlets
- [ ] Add execution audit log

---

### 5. Unwrap() Calls — Panic Risk

**Found Multiple :**

```rust
// db.rs line 93: app.path_resolver().app_data_dir().unwrap_or_else()
// terminal_manager.rs: parse_command() may unwrap on malformed input
// etc.
```

**Risk Level :** 🟡 MEDIUM — Can crash app (DoS)

**Fix Required :**

- [ ] Replace unwrap() with proper error handling
- [ ] Use Result<T, E> throughout
- [ ] Add graceful degradation

---

### 6. CORS (api_server.rs line ~88)

**Found :**

```rust
let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);
```

**Risk Level :** 🟠 MEDIUM — Overly permissive CORS

**Fix Required :**

- [ ] Restrict origins to localhost only (API is local-only)
- [ ] Restrict methods to GET, POST, OPTIONS
- [ ] Whitelist headers

---

### 7. No Rate Limiting

**Problem :** No visible rate-limiting on API endpoints

**Risk Level :** 🟡 MEDIUM — DoS vulnerability

**Fix Required :**

- [ ] Add tower-governor or similar
- [ ] Limit requests per second per endpoint
- [ ] Limit concurrency

---

### 8. No Request Validation

**Problem :** API endpoints accept Value (JSON) without schema validation

**Risk Level :** 🟡 MEDIUM — Type confusion, unexpected input

**Fix Required :**

- [ ] Add serde validation derive macros
- [ ] Validate request schemas
- [ ] Reject unknown fields

---

## 📏 Refactoring Plan — 300 Line Limit

### Phase 1 — Rust Backend (P0 CRITICAL)

#### api_server.rs (1654 → 4 modules × 250-350 lines)

**Split into :**

```
api_server/
├── lib.rs              (150 lines) — State, utilities
├── routes.rs           (300 lines) — GET /health, GET /v1/models
├── chat_handler.rs     (350 lines) — POST /v1/chat/completions
├── tool_executor.rs    (250 lines) — execute_tool(), tool dispatch
└── auth.rs             (100 lines) — Auth/CORS validation
```

**Timeline :** 2-3 days  
**Risk Reduction :** 🔴→🟡 (from critical to moderate)

---

#### db.rs (1266 → 3 modules × 280-350 lines)

**Split into :**

```
db/
├── lib.rs              (200 lines) — DbState, init_db()
├── models.rs           (320 lines) — model_configs operations
├── documents.rs        (280 lines) — documents, RAG search
├── conversations.rs    (300 lines) — conversations, messages
└── migrations.rs       (150 lines) — Schema, migrations
```

**Timeline :** 2-3 days  
**Risk Reduction :** 🔴→✅ (can fully audit each module)

---

#### hw_info.rs (868 → 3 modules × 250-290 lines)

**Split into :**

```
hw_info/
├── lib.rs              (150 lines) — Exports, utilities
├── file_ops.rs         (280 lines) — read, write, patch (with validation)
├── shell_ops.rs        (250 lines) — run_shell_command() + sanitization
└── media.rs            (280 lines) — Images, PDFs, downloads
```

**Timeline :** 1-2 days  
**Risk Reduction :** 🔴→🟡 (auditable, centralized validation)

---

#### terminal_manager.rs (738 → 2 modules × 300-350 lines)

**Split into :**

```
terminal_manager/
├── lib.rs              (200 lines) — TerminalManagerState, commands
├── pty.rs              (350 lines) — PTY management, interactive sessions
├── command_parser.rs   (150 lines) — parse_command() with validation
└── exec.rs             (200 lines) — terminal_exec() with audit logging
```

**Timeline :** 1-2 days  
**Risk Reduction :** 🔴→🟡 (command injection risks clearer)

---

#### Other Rust Files

| File               | Size → Target | Effort                            |
| ------------------ | ------------- | --------------------------------- |
| `skills.rs`        | 703 → 280×2   | Extract PowerShell validation     |
| `llama_sidecar.rs` | 710 → 300×2   | Separate lifecycle from streaming |
| `image_gen.rs`     | 857 → 300×3   | Split image processing stages     |

**Total Rust Effort :** ~1-2 weeks

---

### Phase 2 — TypeScript Frontend (P1 URGENT)

#### ModelsPanel.tsx (1241 → 3 components × 250-350)

**Split into :**

```
components/
├── ModelsPanel.tsx       (200 lines) — Layout, dispatch
├── ModelsList.tsx        (300 lines) — List + selection
├── ModelConfig.tsx       (300 lines) — Settings, form
└── ModelActions.tsx      (150 lines) — Buttons, actions
```

**Timeline :** 1 day  
**Benefit :** Better testability, reusability

---

#### useBuildMachineContext.ts (1169 → 3 hooks × 300 lines)

**Split into :**

```
hooks/
├── useHardwareDetection.ts  (280 lines) — CPU, RAM, GPU detection
├── useGpuOptimization.ts    (250 lines) — GPU config, n_gpu_layers
└── useLlmConfiguration.ts    (240 lines) — Context window, parameters
```

**Timeline :** 1 day  
**Benefit :** Reusable hooks

---

#### useToolCalling.ts (979 → 3 modules × 250-300)

**Split into :**

```
lib/
├── toolDispatchUtils.ts     (280 lines) — Catalog, categorization [EXISTING]
├── toolExecutor.ts          (250 lines) — Execution loop, anti-loop
└── toolValidator.ts         (150 lines) — Validation, permissions
```

**Timeline :** 1 day  
**Benefit :** Critical tool dispatch more auditable

---

#### Other TS/React Files

| File                       | Action                       | Effort |
| -------------------------- | ---------------------------- | ------ |
| `useLlama.ts` (835)        | Extract streaming, state mgt | 1 day  |
| `ChatWindow.tsx` (815)     | Separate UI, logic, state    | 1 day  |
| `toolWebHandlers.ts` (858) | Extract web scrape, search   | 1 day  |

**Total Frontend Effort :** ~3-4 days

---

## 🔒 Security Improvements (Alongside Refactoring)

### Tier 1 — Must Do (P0)

- [ ] **Input Validation Module** — Centralized validation for all inputs
- [ ] **Path Sanitization** — All file paths validated
- [ ] **Command Audit Logging** — Log all shell/terminal commands
- [ ] **CORS Lockdown** — Restrict to localhost only
- [ ] **Remove unwrap()** — Use proper error handling

### Tier 2 — Should Do (P1)

- [ ] **Rate Limiting** — Add tower-governor
- [ ] **Request Validation** — Schema validation on API
- [ ] **SQL Review** — Full audit of db.rs
- [ ] **PowerShell Sandboxing** — Restricted mode
- [ ] **Add Unit Tests** — Security-focused tests

### Tier 3 — Nice (P2)

- [ ] **Security Headers** — X-Frame-Options, CSP, etc.
- [ ] **TLS/HTTPS** — For API endpoints
- [ ] **Key Rotation** — If using secrets
- [ ] **Penetration Testing** — External security audit

---

## 📋 Checklist Before Release

### Code Quality

- [ ] No file > 300 lines (except migrations, tests)
- [ ] No unsafe{} blocks without SAFETY comments
- [ ] All .unwrap() replaced with Result handling
- [ ] All .expect() with descriptive message
- [ ] No panic!() in library code

### Security

- [ ] Command input validated
- [ ] File paths sanitized
- [ ] SQL injection prevented (params!)
- [ ] CORS restricted
- [ ] Rate limiting configured
- [ ] Audit logs for sensitive operations
- [ ] Error messages don't leak paths/internals

### Testing

- [ ] Unit tests for parsing, validation
- [ ] Integration tests for critical paths
- [ ] Security-focused test cases
- [ ] 70%+ code coverage on critical modules

### Documentation

- [ ] Security guidelines in CONTRIBUTING.md
- [ ] Architecture docs explain security boundaries
- [ ] Threat model documented
- [ ] Incident response plan (if public)

---

## 🚦 Timeline to Secure Release

### Week 1 (Immediate)

- [ ] Refactor `api_server.rs` (P0)
- [ ] Refactor `db.rs` (P0)
- [ ] Add input validation module (P0)

### Week 2

- [ ] Refactor remaining Rust files
- [ ] Refactor TypeScript critical modules
- [ ] Add security tests

### Week 3

- [ ] Full test suite pass
- [ ] Security audit sign-off
- [ ] Release v1.0.0-secure

---

## ⚠️ Risk Summary if NOT Refactored

| Risk                            | Impact   | Likelihood |
| ------------------------------- | -------- | ---------- |
| Command injection via LLM       | Critical | Medium     |
| Path traversal                  | High     | Medium     |
| DoS via API flooding            | Medium   | High       |
| Code maintenance bugs           | High     | Very High  |
| Missed vulnerabilities in audit | High     | High       |

---

## ✅ Recommended Next Steps

1. **Immediate :** Create refactoring branches for `api_server.rs`, `db.rs`
2. **Week 1 :** Complete Rust refactoring
3. **Week 2 :** Complete TS refactoring
4. **Week 3 :** Full security testing
5. **Final :** Release v1.0.0 with security stamp

---

**Current Status :** 🔴 **NOT READY FOR RELEASE**  
**Action Required :** Begin refactoring immediately  
**Estimated Time to Release :** +2-3 weeks (instead of days)

---

## References

- [Rust Security Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Rust_Security_Cheat_Sheet.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Common Weakness Enum.](https://cwe.mitre.org/)
- [Tauri Security](https://tauri.app/v1/guides/distribution/windows/#signing)
