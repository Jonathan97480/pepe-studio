# Contributing to Pepe-Studio

Merci d'intérêt pour Pepe-Studio ! Voici le guide pour contribuer au projet.

---

## 🚀 Démarrage Rapide

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/pepe-studio.git
cd pepe-studio
git remote add upstream https://github.com/pepe-studio/pepe-studio.git
```

### 2. Installer dépendances

```bash
nvm use          # Utiliser Node 20.12.0 (.nvmrc)
npm install
```

### 3. Lancer le dev

```bash
npm run tauri:dev
```

---

## 🔍 Code Style

### Obligatoire

- **TypeScript strict mode** — `tsconfig.json` strictement validé
- **ESLint** — Avant commit : `npm run lint:fix`
- **Prettier** — Format automatique : `npm run format`
- **Rust** — `cargo fmt` + `cargo clippy`

### Conventions

#### TypeScript/React

```typescript
// ✅ Bon
const useMyHook = () => {
    const [state, setState] = useState<MyType>(initial);

    useEffect(() => {
        // Cleanup
        return () => {};
    }, [dep]);

    return { state, setState };
};

// ❌ Mauvais
const useMyHook = () => {
    let state: any; // ← `any` forbidden
    // Manque useEffect cleanup
    return state;
};
```

#### Rust

```rust
// ✅ Bon
pub async fn handle_command(input: String) -> Result<String, String> {
    validate_input(&input)?;
    do_work(input).await
}

// ❌ Mauvais
pub fn handle_command(input: String) -> String {
    // Pas de error handling
    do_work(input)
}
```

---

## 📋 Avant le commit

```bash
# 1. Lint & format
npm run lint:fix
npm run format

# 2. Type check
npm run typecheck

# 3. Tests
npm run test:web
npm run test:rust

# 4. Commit
git add -A
git commit -m "feat: add feature description"
```

---

## 🐛 Rapporter un Bug

1. Vérifier qu'il n'existe pas d'issue similaire
2. Créer une issue avec :
    - **Title** — Bref résumé
    - **Environment** — OS, Node version, GPU info
    - **Steps to reproduce** — Précis et reproducible
    - **Expected behavior** — Qu'était-ce censé faire
    - **Actual behavior** — Qu'est-ce qui s'est réellement passé
    - **Screenshots/Logs** — Si applicable

### Exemple

```markdown
## Bug: Chat crashes when using very long prompts

**Environment:**

- Windows 11 22H2
- Node 20.12.0
- RTX 4090
- Mistral 7B GGUF

**Steps to reproduce:**

1. Open Pepe-Studio
2. Select Mistral 7B
3. Paste a 10,000+ word prompt
4. Click Send

**Expected:** Chat responds normally, chunks if needed

**Actual:** App crashes with "Out of memory" error

**Log:**
```

error: CUDA out of memory
at callLlama() src/llama_sidecar.rs:156

```

```

---

## 💡 Proposer une Feature

1. Ouvrir une **Discussion** avant de coder (valider l'approche)
2. Une fois approuvé, créer une **Pull Request**

### Template de discussion

```markdown
## Feature Request: [Title]

**Use case:**
Pourquoi cette feature est-elle utile ?

**Proposed solution:**
Comment devrait-elle fonctionner ?

**Alternatives considered:**
Y a-t-il d'autres approches ?

**Additional context:**
Screenshots, mockups, références, etc.
```

---

## 🔧 Workflow Pull Request

### 1. Créer une branche

```bash
git checkout -b feat/my-feature
# ou
git checkout -b fix/my-bugfix
git checkout -b docs/update-readme
```

### 2. Implémenter

```bash
# Pendant le dev, tester fréquemment
npm run tauri:dev

# Avant de committer
npm run check && npm run test
```

### 3. Commit avec message clair

```bash
git commit -m "feat: add streaming response support

- Implement Server-Sent Events for real-time output
- Add SSE parser in frontend
- Update llama.cpp wrapper
- Tests for SSE handling
"
```

### 4. Push & Créer PR

```bash
git push origin feat/my-feature
# Puis sur GitHub: Create Pull Request
```

### 5. PR Description

```markdown
## Description

Bref résumé de la change.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## How to test

Étapes précises pour tester la feature.

## Checklist

- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
```

---

## 🎯 Focus Areas for Contributions

### 🟢 Beginner-Friendly

- [ ] Documentation improvements
- [ ] README translations (i18n)
- [ ] Test coverage for existing features
- [ ] Type definition improvements
- [ ] Bug reports with minimal reproduction

### 🟡 Intermediate

- [ ] New tool implementations (write_file, network tools, etc.)
- [ ] Performance optimizations
- [ ] UI component improvements
- [ ] Error handling enhancements

### 🔴 Advanced

- [ ] New agent architecture features
- [ ] MCP server implementations
- [ ] LLM integration improvements
- [ ] macOS/Linux native support
- [ ] Security hardening

---

## 📚 Project Architecture

### Understanding the Codebase

1. **Frontend entry** — `src/app/layout.tsx` (Next.js)
2. **Main component** — `src/components/Layout.tsx`
3. **Chat logic** — `src/hooks/useLlama.ts`
4. **Tool dispatch** — `src/hooks/useToolCalling.ts` + `src/lib/toolDispatchUtils.ts`
5. **Backend dispatcher** — `src-tauri/src/main.rs` (57 commands)
6. **Database layer** — `src-tauri/src/db.rs`
7. **LLM integration** — `src-tauri/src/llama_sidecar.rs`

### Key Files to Know

| File                           | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `src/lib/toolParsing.ts`       | Parse `<tool>...</tool>` tags from LLM output |
| `src/lib/toolDispatchUtils.ts` | Tool catalog + categorization                 |
| `src-tauri/src/main.rs`        | All 57 Tauri IPC commands                     |
| `src-tauri/src/db.rs`          | SQLite schema + RAG queries                   |
| `CLAUDE.md`                    | Full architecture reference                   |

---

## 🧪 Writing Tests

### Frontend Tests (TypeScript)

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { myFunction } from "../src/lib/myFunction";

test("myFunction - should do X", () => {
    const result = myFunction("input");
    assert.equal(result, "expected");
});
```

Run with : `npm run test:web`

### Backend Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function("input");
        assert_eq!(result, "expected");
    }
}
```

Run with : `npm run test:rust`

---

## 🚀 Performance Considerations

When contributing, please consider:

1. **Bundle size** — Avoid large dependencies
2. **Runtime performance** — Profile with DevTools
3. **LLM efficiency** — Tool execution should be fast (~<100ms)
4. **Memory usage** — Tauri app should stay <500MB
5. **Streaming** — Keep SSE low-latency

---

## 📖 Documentation

### Update docs for:

- [ ] New features (inline comments + README section)
- [ ] New Tauri commands (doc comment + CLAUDE.md)
- [ ] Breaking changes (CHANGELOG.md)
- [ ] New hook/utility (type definitions + examples)

### Doc format

```typescript
/**
 * Hook: useMyFeature
 *
 * Manages X functionality with Y capabilities.
 *
 * @param initialValue - Starting value
 * @returns Object with state and handlers
 *
 * @example
 * const { state, action } = useMyFeature("initial");
 */
export const useMyFeature = (initialValue: string) => {
    // ...
};
```

---

## 🤝 Community & Support

- **Discussions** — Feature ideas, architecture questions
- **Issues** — Bug reports, feature requests
- **Discord** — [Join our community](https://discord.gg/pepe-studio)
- **Email** — contact@pepe-studio.dev

---

## 📜 License

By contributing, you agree that your code will be licensed under the MIT License (see [LICENSE](LICENSE)).

---

## 🎉 Thank You!

Merci pour vos contributions ! Pepe-Studio est mieux grâce à vous.

**Happy coding! 🚀**
