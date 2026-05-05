# 🔍 Audit du Projet Pepe-Studio - Préparation v1

**Date :** 1er mai 2026  
**Objectif :** Préparer le projet pour sa sortie officielle en v1  
**Status :** 🟡 **Actions requises avant release**

---

## 📊 Vue d'ensemble du projet

### Stack technologique

- **Frontend :** Next.js 14 (static export) + React 18 + TypeScript 5
- **Backend :** Tauri 1.x + Rust 2021 edition
- **Database :** SQLite (Rusqlite)
- **Styling :** Tailwind CSS 3
- **Package Manager :** npm
- **Node Version :** (à vérifier dans .nvmrc ou .tool-versions)

### Structure

```
src-tauri/           (15 fichiers Rust)
├── main.rs          (~7.7 KB - 57 commandes Tauri)
├── db.rs            (SQLite management)
├── llama_sidecar.rs (llama.cpp lifecycle)
├── terminal_manager.rs (PTY sessions)
├── mcp.rs           (Model Context Protocol)
└── ...14 autres fichiers

src/                 (Frontend TypeScript/React)
├── app/             (Next.js app router)
├── components/      (UI components)
├── hooks/           (~247 KB - logic hooks)
├── lib/             (utilities, parsers, dispatchers)
├── tools/           (API clients, MCP manager)
├── context/         (React context providers)
└── types/           (Type definitions)
```

---

## ✅ Points positifs

### Code Quality

- ✅ **TypeScript strict mode** activé (forceConsistentCasingInFileNames, strict)
- ✅ **ESLint + Prettier** configurés
- ✅ **No TypeScript errors** (0 erreurs actuellement)
- ✅ **No console.error/warn clutter** détecté dans les sources
- ✅ Architecture bien séparée (front/back)
- ✅ React best practices : client components, hooks patterns

### Documentation

- ✅ README détaillé avec features
- ✅ CLAUDE.md avec architecture et commandes
- ✅ architecture.md présent

### Infrastructure

- ✅ Git repository configuré
- ✅ .gitignore présent
- ✅ Production build script (`npm run tauri:build`)
- ✅ CI-friendly scripts (test, lint, typecheck)

---

## ⚠️ Problèmes identifiés

### 🔴 **CRITIQUE - Dépendances fantômes**

**Sévérité :** Haute - Peut causer des erreurs en prod

Les packages suivants sont "extraneous" (non déclarés dans package.json mais présents dans node_modules) :

- `@google/model-viewer@4.2.0` (TRELLIS - supprimé du code mais reste en node_modules)
- `@lit-labs/ssr-dom-shim@1.5.1`
- `@lit/reactive-element@2.1.2`
- `@monogrid/gainmap-js@3.4.0`
- `@types/trusted-types@2.0.7`
- `immediate@3.0.6`
- `is-promise@2.2.2`
- `lie@3.3.0`
- `lit-element@4.2.2`
- `lit-html@3.3.2`
- `lit@3.3.2`
- `promise-worker-transferable@1.0.4`
- `three@0.182.0`

**Impact :** Augmente la taille du bundle, cache les dépendances réelles, risque de vulnérabilités

**Action :**

```bash
npm ci  # Clean install depuis package-lock.json
```

### 🔴 **CRITIQUE - Pas de .nvmrc ou .tool-versions**

**Sévérité :** Haute - Risque de version mismatch

Les utilisateurs ne savent pas quelle version Node.js utiliser

**Action recommandée :**

```bash
echo "20.12.0" > .nvmrc  # Ou votre version LTS préférée
```

### 🟡 **ÉLEVÉ - Pas de tests unitaires**

**Sévérité :** Moyenne - Impossible à valider avant release

Trouvé aucun fichier `.test.ts` ou `.spec.ts` dans `src/`.  
Les fichiers dans `.codex-tests/tests/` semblent être générés et compilés en `.js`.

**Couverture actuelle :**

- Tests Rust : ✅ Présents (`npm run test:rust`)
- Tests TypeScript : ❌ Aucun tests

**Action requise :**

1. Ajouter des tests critiques pour :
    - `toolParsing.ts` - Parsing des commandes IA
    - `toolDispatchUtils.ts` - Dispatch logic
    - `useToolCalling.ts` - Exécution des outils
    - `useModels.ts` - Gestion des modèles

2. Créer `tests/` avec au minimum :
    ```
    tests/
    ├── lib/toolParsing.test.ts
    ├── lib/toolDispatchUtils.test.ts
    ├── hooks/useToolCalling.test.ts
    └── hooks/useModels.test.ts
    ```

### 🟡 **ÉLEVÉ - Pas de CHANGELOG**

**Sévérité :** Moyenne - Utilisateurs ne savent pas ce qui change

Pas de `CHANGELOG.md` ou `HISTORY.md`

**Action :** Créer `CHANGELOG.md` avec v0.1.0 → v1.0.0 et features principales

### 🟡 **MOYEN - Version 0.1.0 → Devrait être 1.0.0**

**Sévérité :** Basse - Juste cosmétique

`package.json` et `Cargo.toml` disent `0.1.0` mais c'est une v1 release

**Action :**

```json
// package.json
"version": "1.0.0"

// src-tauri/Cargo.toml
version = "1.0.0"
```

### 🟡 **MOYEN - Pas de license définie**

**Sévérité :** Basse - Nécessaire pour release publique

Pas de `LICENSE` ou `license` dans package.json

**Action :**

```bash
# Créer LICENSE (MIT, Apache-2.0, GPL-3.0, etc.)
echo "MIT License... (ou autre)" > LICENSE

# Ajouter dans package.json
"license": "MIT"
```

### 🟡 **MOYEN - Configuration Tauri incomplète pour prod**

**Sévérité :** Basse - Dépend des préférences

Vérifier `src-tauri/tauri.conf.json` :

- [ ] `bundle.windows.certificateThumbprint` pour codesigning (Windows)
- [ ] `bundle.deb.*` pour Linux
- [ ] `updater.active` pour auto-updates

### 🟡 **MOYEN - Secrets en .gitignore ?**

**Sévérité :** Basse - Vérification de sécurité

Fichiers sensibles à ignorer :

- `.env.local` - Clés API
- Hugging Face tokens
- Clés OpenAI

**Action :** Vérifier `.gitignore` contient :

```
.env.local
.env*.local
*.key
*.pem
```

### 🟢 **BAS - README.md pourrait inclure install instructions**

**Sévérité :** Très basse - UX improvement

Ajouter section "Installation" :

```markdown
## Installation

### Prérequis

- Node.js 20+
- Rust 1.70+
- Cargo

### Installation

1. Clone: `git clone ...`
2. Install: `npm install`
3. Dev: `npm run tauri:dev`
4. Build: `npm run tauri:build`
```

### 🟢 **BAS - Pas de .editorconfig**

**Sévérité :** Très basse - Consistency

Créer `.editorconfig` pour éditeurs compatibles

---

## 📈 Métriques du code

| Métrique          | Valeur     | Status              |
| ----------------- | ---------- | ------------------- |
| Fichiers Rust     | 15         | ✅                  |
| main.rs size      | ~7.7 KB    | ✅                  |
| Commandes Tauri   | 57         | ✅                  |
| TypeScript files  | 30+        | ✅                  |
| Hooks size        | ~247 KB    | ⚠️ Considérer split |
| ESLint rules      | Configured | ✅                  |
| TypeScript strict | true       | ✅                  |
| Tests coverage    | 0%         | ❌                  |

---

## 🔐 Sécurité

### ✅ Bonnes pratiques

- Pas de credentials en clair détectés
- TypeScript strict mode
- Tauri IPC security (explicit command whitelist)
- SQLite avec parameterized queries (Rusqlite)

### ⚠️ À vérifier

- [ ] `allowlist` dans tauri.conf.json pour chaque commande
- [ ] CORS policy pour llama.cpp sidecar (127.0.0.1:8765)
- [ ] Validation des chemins utilisateur (path traversal risks)
- [ ] Validation des entrées utilisateur dans parsers
- [ ] Rate limiting sur les endpoints HTTP

### Checklist avant prod

```json
// tauri.conf.json - Vérifier allowlist strict
{
    "tauri": {
        "allowlist": {
            "fs": ["read", "write"], // Limiter au nécessaire
            "shell": ["execute"], // Limiter au nécessaire
            "dialog": ["open"]
        }
    }
}
```

---

## 🚀 Checklist avant Release v1.0.0

### Immédiat (P0 - Bloquant)

- [ ] `npm ci` - Clean install et supprimer dépendances extraneous
- [ ] Créer `.nvmrc` avec Node.js version
- [ ] Ajouter tests unitaires minimaux (toolParsing, dispatch)
- [ ] Vérifier `tauri.conf.json` - allowlist complet
- [ ] Créer CHANGELOG.md
- [ ] Mettre à jour version 0.1.0 → 1.0.0

### Urgent (P1 - Fortement recommandé)

- [ ] Ajouter LICENSE
- [ ] Installer essentials avec README (npm install, build steps)
- [ ] Vérifier compilation Rust en release (`cargo build --release`)
- [ ] Tester complet workflow : dev → build → test
- [ ] Signature binaires (Windows code signing si applicable)

### Important (P2 - Avant première release)

- [ ] Security audit des paths et entrées utilisateur
- [ ] Tests d'intégration Tauri commands
- [ ] Vérifier bundle size (npm build)
- [ ] Tester sur machine vierge (fresh install)
- [ ] Documentation des erreurs courantes

### Nice-to-have (P3 - Post-v1)

- [ ] .editorconfig
- [ ] GitHub Actions pour CI/CD
- [ ] Release automation
- [ ] Localization (i18n)

---

## 📝 Recommendations architecturales

### Code Splitting (pour future)

Les hooks (`src/hooks/`) font ~247 KB. Considérer :

- Code splitting par feature
- Lazy loading des hooks non-critiques
- Tree-shaking des exports non-utilisés

### Logging

Pas de centralized logging détecté. Recommandé pour prod :

```typescript
// src/lib/logger.ts
export const logger = {
    info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data),
    error: (msg: string, err?: any) => console.error(`[ERROR] ${msg}`, err),
    warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data),
};
```

### Error Handling

Améliorer:

- Global error boundary pour React
- Fallback UI en cas de crash
- Error reporting (Sentry, etc.)

### Performance

- Vérifier LCP, FCP dans production build
- Lazy load components lourds (Chat, Editor)
- Memoization des hooks complexes

---

## 🎯 Résumé - Actions prioritaires

| #   | Action                        | Urgence | Durée  |
| --- | ----------------------------- | ------- | ------ |
| 1   | `npm ci` + clean node_modules | 🔴 P0   | 5 min  |
| 2   | Créer `.nvmrc`                | 🔴 P0   | 2 min  |
| 3   | Mettre à jour version 1.0.0   | 🔴 P0   | 3 min  |
| 4   | Ajouter tests critiques       | 🟠 P1   | 2-4h   |
| 5   | Créer CHANGELOG.md            | 🟠 P1   | 1h     |
| 6   | Créer LICENSE                 | 🟠 P1   | 10 min |
| 7   | Vérifier tauri.conf.json      | 🟠 P1   | 30 min |
| 8   | Tester build complet          | 🟠 P1   | 10 min |

**Total temps requis :** ~4-6 heures pour être prêt pour release

---

## 📌 Notes finales

Le projet est **bien structuré et mature** pour une v1 release. Les problèmes identifiés sont mineurs et corrigeables rapidement. Les points critiques sont :

1. ✅ Architecture solide (Tauri + TypeScript + Rust)
2. ✅ Code quality (strict TypeScript, ESLint)
3. ⚠️ **DÉPENDANCES** - Nettoyer les packages extraneous
4. ⚠️ **TESTS** - Ajouter tests minimaux
5. ⚠️ **DOCS** - Version, changelog, install instructions

Prêt pour v1.0.0 après 4-6h de travail.

---

**Généré par audit automatique - 01/05/2026**
