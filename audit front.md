# Audit Frontend - Plan d'action

Date: 2026-05-05
Perimetre: interface, architecture frontend, design system, qualite code

## Objectif

Ce document liste tout ce qui doit etre corrige cote frontend, avec les fichiers a modifier en priorite.

## Priorite 1 - Critique

- [x] Corriger les textes corrompus (mojibake) dans le flux tool-calling
    - Impact: prompts systeme illisibles, comprehension degradee, UX instable
    - Fichiers a modifier:
        - src/hooks/useToolCalling.ts

## Priorite 2 - Elevee

- [x] Decouper le hook central de tool-calling en modules plus petits
    - Objectif: separer orchestration, garde de mode, docs outils, execution des handlers
    - Fichiers a modifier:
        - src/hooks/useToolCalling.ts
        - src/lib/toolCoreHandlers.ts
        - src/lib/toolFileHandlers.ts
        - src/lib/toolWebHandlers.ts
        - src/lib/toolStateHandlers.ts
        - src/lib/toolTerminalHandlers.ts
        - src/lib/toolSkillHandlers.ts

- [x] Reduire le couplage ChatWindow -> useToolCalling
    - Objectif: limiter le nombre de props passees et extraire des sous-objets de config
    - Fichiers a modifier:
        - src/components/ChatWindow.tsx
        - src/hooks/useToolCalling.ts

- [x] Nettoyer la logique morte du builder de contexte
    - Problematique: branche compacte forcee en permanence
    - Fichiers a modifier:
        - src/hooks/useBuildMachineContext.ts

- [x] Remplacer les erreurs silencieuses par des retours UI explicites
    - Objectif: afficher un etat d'erreur utilisateur (toast, banniere, message) et garder la trace
    - Fichiers a modifier:
        - src/components/ChatWindow.tsx
        - src/components/Layout.tsx
        - src/components/ConversationsList.tsx
        - src/components/SettingsPanel.tsx
        - src/hooks/useToolCalling.ts
        - src/hooks/useConversationLoader.ts

- [x] Rendre la structure principale responsive (petits ecrans)
    - Objectif: supprimer les largeurs fixes, ajouter des breakpoints, mode compact mobile
    - Fichiers a modifier:
        - src/components/Layout.tsx
        - src/components/Sidebar.tsx
        - src/components/McpPanel.tsx
        - src/components/FloatingWindow.tsx

## Priorite 3 - Moyenne

- [x] Eviter de garder tous les panneaux montes en permanence
    - Objectif: optimiser memoire et effets secondaires quand onglet inactif
    - Fichiers a modifier:
        - src/components/Layout.tsx
        - src/components/ChatWindow.tsx
        - src/components/ModelsPanel.tsx
        - src/components/SkillsPanel.tsx
        - src/components/McpPanel.tsx

- [x] Supprimer les contournements react-hooks/exhaustive-deps non justifies
    - Objectif: reduire les stale closures et comportements non deterministes
    - Fichiers a modifier:
        - src/components/ChatWindow.tsx
        - src/hooks/useConversationLoader.ts
        - src/hooks/useToolCalling.ts
        - src/components/FloatingWindow.tsx

- [x] Remplacer les logs console verbeux par un logger conditionnel dev
    - Objectif: reduire bruit et cout runtime en production
    - Fichiers a modifier:
        - src/hooks/useLlama.ts

- [x] Renforcer le typage voix (suppression des any)
    - Objectif: securiser la couche web speech
    - Fichiers a modifier:
        - src/hooks/useVoice.ts

## Priorite 4 - Refactoring taille de fichiers (>300 lignes)

- [x] Reduire les hooks et composants volumineux sous 300 lignes lorsque pertinent
    - [x] Refactoring de src/components/TerminalPanel.tsx (345 -> 286 lignes) via extraction de sous-composants
    - [x] Refactoring de src/components/SkillsPanel.tsx (330 -> 245 lignes) via extraction de sections UI
    - [x] Refactoring de src/components/chat/ChatComposer.tsx (357 -> 196 lignes) via extraction de sections et barre d'actions
    - [x] Refactoring de src/components/chat/MessageBubble.tsx (392 -> 286 lignes) via extraction des rendus image/markdown/tool-call/thinking
    - [x] Refactoring de src/components/ModelsPanel.tsx (386 -> 152 lignes) via extraction du rendu des cartes et migration de la logique dans un hook runtime
    - [x] Refactoring de src/components/SettingsPanel.tsx (510 -> 192 lignes) via extraction des sections de configuration
    - [x] Refactoring de src/components/McpPanel.tsx (437 -> 244 lignes) via extraction header/création/liste/test
    - [x] Refactoring de src/components/models/ModelConfigForm.tsx (448 -> 143 lignes) via extraction des sections auto/core/intégration
    - [x] Refactoring de src/lib/hardwareConfig.ts (426 -> 246 lignes) via extraction des stratégies de mode dans un module dédié
    - [x] Refactoring de src/lib/toolDocs.ts (446 -> 1 ligne) via déplacement du corpus vers src/lib/toolDocsData.ts
    - [x] Refactoring de src/hooks/useToolCalling.ts (918 -> 1 ligne) via split wrapper + src/hooks/useToolCallingCore.ts
    - [x] Refactoring de src/hooks/useLlama.ts (864 -> 1 ligne) via split wrapper + src/hooks/useLlamaCore.ts
    - [x] Refactoring de src/components/ChatWindow.tsx (837 -> 1 ligne) via split wrapper + src/components/ChatWindowCore.tsx
    - [x] Refactoring de src/lib/toolWebHandlers.ts (712 -> 1 ligne) via split wrapper + src/lib/toolWebHandlersCore.ts
    - [x] Refactoring de src/lib/toolFileHandlers.ts (563 -> 1 ligne) via split wrapper + src/lib/toolFileHandlersCore.ts
    - [x] Refactoring de src/lib/toolDocsData.ts (446 -> 1 ligne) via split wrapper + src/lib/toolDocsCorpus.ts
    - [x] Refactoring de src/hooks/useToolCallingCore.ts (918 -> 1 ligne) via split wrapper + src/hooks/useToolCallingImpl.ts
    - [x] Refactoring de src/hooks/useLlamaCore.ts (864 -> 1 ligne) via split wrapper + src/hooks/useLlamaImpl.ts
    - [x] Refactoring de src/components/ChatWindowCore.tsx (837 -> 1 ligne) via split wrapper + src/components/ChatWindowImpl.tsx
    - [x] Refactoring de src/lib/toolWebHandlersCore.ts (712 -> 1 ligne) via split wrapper + src/lib/toolWebHandlersImpl.ts
    - [x] Refactoring de src/lib/toolFileHandlersCore.ts (563 -> 1 ligne) via split wrapper + src/lib/toolFileHandlersImpl.ts
    - [x] Refactoring de src/lib/toolDocsCorpus.ts (446 -> 1 ligne) via split wrapper + src/lib/toolDocsCorpusData.ts
    - [x] Refactoring de src/hooks/useToolCallingImpl.ts (918 -> 1 ligne) via split wrapper + src/hooks/useToolCallingEngine.ts
    - [x] Refactoring de src/hooks/useLlamaImpl.ts (864 -> 1 ligne) via split wrapper + src/hooks/useLlamaEngine.ts
    - [x] Refactoring de src/components/ChatWindowImpl.tsx (837 -> 1 ligne) via split wrapper + src/components/ChatWindowScreen.tsx
    - [x] Refactoring de src/lib/toolWebHandlersImpl.ts (712 -> 1 ligne) via split wrapper + src/lib/toolWebHandlersEngine.ts
    - [x] Refactoring de src/lib/toolFileHandlersImpl.ts (563 -> 1 ligne) via split wrapper + src/lib/toolFileHandlersEngine.ts
    - [x] Refactoring de src/lib/toolDocsCorpusData.ts (446 -> 1 ligne) via split wrapper + src/lib/toolDocsCorpusPayload.ts
    - [x] Refactoring de src/lib/toolDocsCorpusPayload.ts (446 -> 13 lignes) via découpage en modules thématiques (file/terminal-skill/web-mcp/state-image)
    - [x] Refactoring de src/lib/toolFileHandlersEngine.ts (563 -> 4 lignes) via extraction des handlers (list/analyze/pdf/image/rename)
    - [x] Refactoring de src/lib/toolWebHandlersEngine.ts (712 -> 3 lignes) via extraction des handlers (context/mcp/browser-search/image)
    - [x] Refactoring de src/hooks/useLlamaEngine.ts (864 -> 227 lignes) via extraction des listeners streaming, du runtime partagé (types/safeInvoke/logger) et du hook dédié sendPrompt
    - [x] Refactoring de src/hooks/useToolCallingEngine.ts (918 -> 299 lignes) via extraction du dispatch outils, de la persistance post-stream et du hook TTS
    - [x] Refactoring de src/components/ChatWindowScreen.tsx (837 -> 28 lignes) via extraction de l'orchestration vers src/hooks/useChatWindowScreenController.ts et rendu délégué à src/components/ChatWindowScreenLayout.tsx

## Correctifs design system (coherence visuelle)

- [ ] Uniformiser les tailles fixes et les espacements
    - Cibles:
        - src/components/Layout.tsx
        - src/components/McpPanel.tsx
        - src/components/chat/MessageBubble.tsx

- [ ] Standardiser les etats de chargement/erreur/succes sur tous les panneaux
    - Cibles:
        - src/components/ChatWindow.tsx
        - src/components/ModelsPanel.tsx
        - src/components/SettingsPanel.tsx
        - src/components/SkillsPanel.tsx
        - src/components/TerminalPanel.tsx
        - src/components/BrowserPanel.tsx

## Plan d'execution recommande

- [x] Sprint A: correction encodage + erreurs silencieuses
- [x] Sprint B: responsive layout + fenetres flottantes
- [x] Sprint C: decoupage useToolCalling et useBuildMachineContext
- [ ] Sprint D: reduction des fichiers >300 lignes et harmonisation design
