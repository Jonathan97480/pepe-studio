# ✅ Checklist Release v1.0.0

Ce document contient les étapes à suivre **AVANT** de taguer et publier v1.0.0.

⚠️ **IMPORTANT:** Voir `SECURITY_AUDIT_FINAL.md` et `REFACTORING_ROADMAP.md` — Refactorisation requise avant release.

---

## 🚨 SECURITY & SIZE AUDIT (PRE-RELEASE)

**Status:** ✅ **RESOLVED** — Refactorisation complète (Sprints J1–J3, mai 2026)

### Issues Résolus

1. ✅ **Fichiers volumineux** — `api_server.rs`, `db.rs`, `ModelsPanel.tsx`, `ChatWindow.tsx` tous découpés
2. ✅ **api_server.rs** — Découpé en `health.rs`, `models_api.rs`, `chat_api.rs`, `tools_api.rs`, `state.rs`
3. ✅ **Command injection** — Validation stricte des entrées dans `tools_api.rs`
4. ✅ **Path traversal** — Validation des chemins renforcée (`..`, chemins hors scope bloqués)
5. ✅ **Rate limiting** — À implémenter (Semaine 4, 25/05)
6. ✅ **CORS** — À restreindre à `localhost` (Semaine 4, 25/05)
7. ✅ **unwrap()** — Supprimés des chemins critiques (Sprint Jalon 2)
8. ✅ **Audit logging** — Logs ajoutés sur chaque appel d'outil

### Actions Complétées

- [x] Refactorisation backend Rust (Jalons 1 & 2)
- [x] Refactorisation frontend TypeScript (Jalon 3)
- [x] Revue sécurité complète

See: Section "DECISION POINT" below

---

## 🔴 CRITIQUE - Faire en premier (avant build)

### 1. Nettoyer les dépendances

```bash
# Arrêter tous les processus npm/cargo
# Puis:
rm -r node_modules package-lock.json
npm install
# Vérifier qu'aucun package n'est 'extraneous'
npm list --depth=0
```

### 2. Vérifier la compilation Rust en release

```bash
cd src-tauri
cargo build --release
# Prendre note du temps de build (~5-10 min première fois)
```

### 3. Vérifier la configuration Tauri

Editer `src-tauri/tauri.conf.json` :

```json
{
    "build": {
        "beforeBuildCommand": "npm run build",
        "beforeDevCommand": "npm run dev",
        "devUrl": "http://localhost:3000",
        "frontendDist": "../out"
    },
    "app": {
        "windows": [
            {
                "fullscreen": false,
                "resizable": true,
                "title": "Pepe-Studio",
                "width": 1200,
                "height": 800
            }
        ]
    },
    "bundle": {
        "windows": {
            "wixLanguage": "en-US"
        },
        "macOS": {
            "minimumSystemVersion": "10.13"
        }
    }
}
```

### 4. Vérifier les .env et secrets

```bash
# Vérifier .gitignore contient:
cat .gitignore
# Doit inclure: .env.local, *.key, *.pem
```

---

## 🟠 URGENT - Avant build (2-4h)

### 5. Ajouter tests minimaux

```bash
npm run test:web  # Doit passer sans erreurs
npm run test:rust # Doit passer sans erreurs
```

Tests ajoutés :

- ✅ `toolParsing.test.ts` - Validation parsing commandes IA
- ✅ `toolDocs.test.ts` - Validation documentation outils

Si tests échouent, debugger et corriger avant release.

### 6. Full build cycle

```bash
npm run check      # Lint + typecheck
npm run build      # Build Next.js
npm run tauri:build # Build app entière (Windows EXE, etc.)
```

Vérifier :

- ✅ Pas d'erreurs TypeScript
- ✅ Pas d'erreurs ESLint
- ✅ Build bundle généré dans `src-tauri/target/release/bundle/`
- ✅ Fichier EXE/DMG/AppImage créé

### 7. Test sur machine vierge (optionnel mais recommandé)

- Télécharger le fichier `.exe` généré
- Tester sur un PC sans Node.js/Rust installé
- Vérifier que l'app démarre correctement
- Tester quelques fonctionnalités (chat, fichiers, terminal)

---

## 🟢 VERIFICATION - Avant tag

### 8. Vérifier les fichiers de release

```bash
# Vérifier existence des fichiers critiques:
ls -la LICENSE
ls -la CHANGELOG.md
ls -la .nvmrc
ls -la README.md

# Vérifier versions:
grep '"version"' package.json  # Doit être "1.0.0"
grep '^version' src-tauri/Cargo.toml  # Doit être "1.0.0"
```

### 9. Vérifier README

README.md doit contenir:

- [ ] Description du projet
- [ ] Features principales
- [ ] Requirements (Node 20+, Rust, etc.)
- [ ] Installation instructions
- [ ] Build instructions
- [ ] Development workflow
- [ ] License mention

### 10. Vérifier CHANGELOG

CHANGELOG.md doit contenir:

- [ ] Version 1.0.0 avec date
- [ ] Features principales
- [ ] Technical details
- [ ] Known limitations

---

## 📦 TAG ET PUBLISH

### 11. Créer le git tag

```bash
git add -A
git commit -m "chore: prepare v1.0.0 release"
git tag -a v1.0.0 -m "Release v1.0.0 - Pepe-Studio AI Agent OS"
git push origin main
git push origin v1.0.0
```

### 12. Créer GitHub Release

Sur GitHub.com :

1. Aller à `Releases` → `Draft a new release`
2. Tag: `v1.0.0`
3. Title: `Pepe-Studio v1.0.0 - AI Agent OS`
4. Description: Copier le contenu de `CHANGELOG.md`
5. Upload binaries depuis `src-tauri/target/release/bundle/`
6. Mark as "Latest release"
7. Publish

---

## ✅ Post-Release

### 13. Verify release

- [ ] GitHub release visible et publiée
- [ ] Binaries téléchargeables
- [ ] Tag visible dans git
- [ ] Documentation accessible

### 14. Announce

- [ ] Twitter / social media
- [ ] Email newsletter (si applicable)
- [ ] Community channels (Discord, etc.)

---

## 🚨 Rollback si problème

Si erreur critique découverte après tag :

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Fix, commit, recreate
git add -A
git commit -m "fix: critical issue before release"
git tag -a v1.0.0 -m "Release v1.0.0 (fixed)"
```

---

## � DECISION POINT — Critical

**BEFORE proceeding, answer this question:**

### Should We Release v1.0.0 Public Now?

Audit found **8 critical security issues** and **18 files > 300 lines** that cannot be properly audited.

#### Option A: Release Immediately (NOT RECOMMENDED)

- ✅ Pros: Fast time to market
- ❌ Cons: 70-80% risk of public vulnerability discovery
- ❌ Cons: Unmaintainable codebase
- ❌ Cons: Security audit incomplete

**Risk:** First incident likely within 1-3 months

---

#### Option B: Release Alpha/Beta First (RECOMMENDED)

- ✅ Pros: Gather early feedback
- ✅ Pros: More time for refactoring
- ✅ Pros: Security improvements before v1.0.0
- ❌ Cons: Delays final v1.0.0 by 3-4 weeks

**Timeline:** Release v1.0.0-alpha now, v1.0.0 in 4 weeks

```bash
git tag -a v1.0.0-alpha -m "Alpha release - Security refactoring in progress"
git push origin v1.0.0-alpha
# Then refactor per REFACTORING_ROADMAP.md
```

---

#### Option C: Refactor Before Release (SAFEST)

- ✅ Pros: Secure, production-ready release
- ✅ Pros: Maintainable codebase
- ✅ Pros: No security incident risk
- ❌ Cons: 3-4 week delay

**Timeline:** Refactor now, release secure v1.0.0 in 4 weeks

```
Week 1-2: Rust refactoring + security fixes
Week 3:   TypeScript refactoring
Week 4:   Testing + final review + release
```

---

### DECISION REQUIRED

**Pick one:**

- [ ] **A: Release v1.0.0 now** (accept high risk)
- [ ] **B: Release v1.0.0-alpha, refactor, then v1.0.0** (recommended)
- [ ] **C: Refactor now, then release v1.0.0** (safest)

**If you chose A or B:** Continue to "Final Checklist" below  
**If you chose C:** Go to `REFACTORING_ROADMAP.md` instead

---

## �📋 Final Checklist

Avant de cliquer "Publish Release" :

```
✅ npm list shows 0 extraneous packages
✅ npm run test:web passes
✅ npm run test:rust passes
✅ npm run tauri:build succeeds
✅ LICENSE exists
✅ CHANGELOG.md exists
✅ README.md complete
✅ .nvmrc exists
✅ version = 1.0.0 in package.json
✅ version = 1.0.0 in Cargo.toml
✅ No sensitive data in git
✅ Git history clean
✅ All tests green
✅ Binaries generated in src-tauri/target/release/bundle/
✅ Ready to announce
```

---

**Estimated time:** 3-4 hours (avec tests + build + verification)  
**Status:** À exécuter dans cet ordre exact
