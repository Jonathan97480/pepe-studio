# 📅 Calendrier Refactorisation Avant Release (Option 2)

Période : du lundi 4 mai 2026 au lundi 1 juin 2026  
Objectif : sécuriser et modulariser avant publication v1.0.0

## Semaine 1 — Backend Rust critique (API + DB)

### Lundi 04/05/2026

- Cadrage technique et création de branche refactor.
- Sauvegarde état actuel et baseline de tests.
- Préparer arborescence cible pour découpage de api_server.rs.

### Mardi 05/05/2026

- Extraire état et routes health/models de api_server.rs.
- Créer modules dédiés avec exports propres.
- Vérifier compilation Rust après extraction.

### Mercredi 06/05/2026

- Extraire logique chat completions dans module séparé.
- Isoler exécution d’outils dans un module dédié.
- Vérifier non-régression des endpoints existants.

### Jeudi 07/05/2026

- Implémenter validation stricte des entrées outils.
- Ajouter logs d’audit sur appels d’outils.
- Revue sécurité ciblée Command Injection.

### Vendredi 08/05/2026

- Découper db.rs (models, documents, conversations, schema).
- Conserver signatures publiques compatibles.
- Lancer tests Rust et corriger erreurs de migration.

## Semaine 2 — Backend Rust sécurité (filesystem, terminal, skills)

### Lundi 11/05/2026

- Refactor de hw_info.rs en modules file_ops, shell_ops, media.
- Introduire validateur central des chemins.
- Bloquer patterns dangereux (.., chemins hors scope).

### Mardi 12/05/2026

- Refactor terminal_manager.rs en pty, parser, executor.
- Durcir parse_command et validation des commandes.
- Ajouter journalisation des exécutions terminal.

### Mercredi 13/05/2026

- Refactor skills.rs en manager/executor.
- Ajouter contrôles de sécurité PowerShell.
- Ajouter validation syntaxique avant exécution skill.

### Jeudi 14/05/2026

- Refactor llama_sidecar.rs et image_gen.rs en modules.
- Séparer lifecycle et streaming côté LLM.
- Vérifier compatibilité des commandes Tauri.

### Vendredi 15/05/2026

- Passe globale suppression unwrap/expect critiques.
- Uniformiser gestion d’erreurs Result.
- Revue de code Rust complète de la semaine.

## Semaine 3 — Frontend TypeScript/React (fichiers volumineux)

### Lundi 18/05/2026

- Découper ModelsPanel.tsx en composants dédiés.
- Vérifier props/types et comportements UI.
- Corriger imports et chemins.

### Mardi 19/05/2026

- Découper useBuildMachineContext.ts en hooks spécialisés.
- Isoler détection hardware et configuration GPU.
- Ajouter tests unitaires de calcul/config.

### Mercredi 20/05/2026

- Découper useToolCalling.ts (validator/executor).
- Vérifier anti-loop et permissions outils.
- Ajouter tests sur cas limites d’exécution.

### Jeudi 21/05/2026

- Découper useLlama.ts et toolWebHandlers.ts.
- Séparer streaming, parsing et orchestration.
- Vérifier stabilité du flux chat.

### Vendredi 22/05/2026

- Découper ChatWindow.tsx + nettoyage composants >300 lignes.
- Vérifier rendu, performances et états UI.
- Passe lint + typecheck complète frontend.

## Semaine 4 — Hardening sécurité, tests, release gate

### Lundi 25/05/2026

- Ajouter rate limiting API.
- Restreindre CORS à localhost.
- Ajouter validation schéma pour requêtes API.

### Mardi 26/05/2026

- Ajouter tests sécurité : command injection, path traversal.
- Ajouter tests intégration API critiques.
- Vérifier logs d’audit sur opérations sensibles.

### Mercredi 27/05/2026

- Exécuter suite complète : check, test:web, test:rust.
- Corriger régressions et flaky tests.
- Contrôler couverture tests sur modules critiques.

### Jeudi 28/05/2026

- Build complet tauri:build.
- Smoke test installateur sur machine propre.
- Vérifier démarrage, chat, outils, terminal, RAG.

### Vendredi 29/05/2026

- Go/No-Go final sécurité + qualité.
- Gel de code, mise à jour changelog.
- Préparer release candidate (sans publication finale).

## Semaine 5 — QA Documentation & Prompts Système IA

### Lundi 01/06/2026

- Vérifier toute la documentation produit (README, CHANGELOG, RELEASE_CHECKLIST, CONTRIBUTING).
- Relire les prompts système envoyés à l'IA (instructions, garde-fous, format des tags outils).
- Contrôler encodage UTF-8, caractères cassés, caractères bizarres et texte corrompu.
- Vérifier cohérence FR/EN, fautes critiques et placeholders oubliés.
- Exécuter tests manuels de prompts (scénarios réels) pour valider réponses et tool-calls.
- Corriger anomalies détectées puis valider Go/No-Go final.
- Tag et publication v1.0.0 si tous critères verts.

## Critères de sortie quotidiens

- Aucun fichier critique au-dessus de 300 lignes dans la zone traitée du jour.
- Build local vert après chaque lot de refactor.
- Tests associés au module modifié exécutés le jour même.
- Revue sécurité rapide incluse dans chaque PR.
- Aucune chaîne corrompue ou caractère anormal dans docs/prompts après vérification.

## Jalons

- Jalon 1 (08/05) : api_server.rs et db.rs découpés.
- Jalon 2 (15/05) : backend Rust sécurisé et stabilisé.
- Jalon 3 (22/05) : frontend volumineux découpé.
- Jalon 4 (29/05) : release candidate prête.
- Jalon 5 (01/06) : QA docs + prompts système validée et release gate final v1.0.0.
