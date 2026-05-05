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

- [ ] Decouper le hook central de tool-calling en modules plus petits
    - Objectif: separer orchestration, garde de mode, docs outils, execution des handlers
    - Fichiers a modifier:
        - src/hooks/useToolCalling.ts
        - src/lib/toolCoreHandlers.ts
        - src/lib/toolFileHandlers.ts
        - src/lib/toolWebHandlers.ts
        - src/lib/toolStateHandlers.ts
        - src/lib/toolTerminalHandlers.ts
        - src/lib/toolSkillHandlers.ts

- [ ] Reduire le couplage ChatWindow -> useToolCalling
    - Objectif: limiter le nombre de props passees et extraire des sous-objets de config
    - Fichiers a modifier:
        - src/components/ChatWindow.tsx
        - src/hooks/useToolCalling.ts

- [ ] Nettoyer la logique morte du builder de contexte
    - Problematique: branche compacte forcee en permanence
    - Fichiers a modifier:
        - src/hooks/useBuildMachineContext.ts

- [ ] Remplacer les erreurs silencieuses par des retours UI explicites
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

- [ ] Eviter de garder tous les panneaux montes en permanence
    - Objectif: optimiser memoire et effets secondaires quand onglet inactif
    - Fichiers a modifier:
        - src/components/Layout.tsx
        - src/components/ChatWindow.tsx
        - src/components/ModelsPanel.tsx
        - src/components/SkillsPanel.tsx
        - src/components/McpPanel.tsx

- [ ] Supprimer les contournements react-hooks/exhaustive-deps non justifies
    - Objectif: reduire les stale closures et comportements non deterministes
    - Fichiers a modifier:
        - src/components/ChatWindow.tsx
        - src/hooks/useConversationLoader.ts
        - src/hooks/useToolCalling.ts
        - src/components/FloatingWindow.tsx

- [ ] Remplacer les logs console verbeux par un logger conditionnel dev
    - Objectif: reduire bruit et cout runtime en production
    - Fichiers a modifier:
        - src/hooks/useLlama.ts

- [ ] Renforcer le typage voix (suppression des any)
    - Objectif: securiser la couche web speech
    - Fichiers a modifier:
        - src/hooks/useVoice.ts

## Priorite 4 - Refactoring taille de fichiers (>300 lignes)

- [ ] Reduire les hooks et composants volumineux sous 300 lignes lorsque pertinent
    - Fichiers a traiter en premier:
        - src/hooks/useBuildMachineContext.ts
        - src/hooks/useToolCalling.ts
        - src/hooks/useLlama.ts
        - src/components/ChatWindow.tsx
        - src/lib/toolWebHandlers.ts
        - src/lib/toolFileHandlers.ts
        - src/lib/toolDocs.ts
        - src/components/chat/MessageBubble.tsx
        - src/components/McpPanel.tsx
        - src/lib/hardwareConfig.ts
        - src/components/ModelsPanel.tsx
        - src/components/chat/ChatComposer.tsx
        - src/components/models/ModelConfigForm.tsx
        - src/components/SettingsPanel.tsx
        - src/components/SkillsPanel.tsx
        - src/components/TerminalPanel.tsx

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

- [ ] Sprint A: correction encodage + erreurs silencieuses
- [x] Sprint B: responsive layout + fenetres flottantes
- [ ] Sprint C: decoupage useToolCalling et useBuildMachineContext
- [ ] Sprint D: reduction des fichiers >300 lignes et harmonisation design
