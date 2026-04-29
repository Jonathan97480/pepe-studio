Oui. Voici un audit d’actions à faire, avec les fichiers concernés et un classement par niveau d’importance.

Priorité critique

1. Mettre une vraie barrière de sécurité sur les actions système

Pourquoi : aujourd’hui l’application peut lire, écrire, patcher des fichiers et lancer des commandes shell avec une liberté très large. C’est le risque principal du projet.

À faire :

interdire les accès fichiers hors d’un ou plusieurs dossiers autorisés
distinguer lecture / écriture / exécution / réseau
ajouter une validation centralisée avant chaque action sensible
bloquer ou confirmer les commandes dangereuses
journaliser les actions exécutées

Fichiers concernés :

src-tauri/src/hw_info.rs : run_shell_command, read_file_content, write_file, patch_file, read_pdf_bytes, list_folder_pdfs, batch_rename_files, download_image, save_image
src-tauri/src/main.rs : exposition globale des commandes Tauri
src-tauri/tauri.conf.json : CSP et allowlist beaucoup trop ouvertes 2. Réduire les permissions Tauri

Pourquoi : la config actuelle est trop permissive pour une app qui pilote un agent IA.

À faire :

resserrer csp
supprimer unsafe-eval si possible
supprimer unsafe-inline si possible
réduire fs.all, shell.all, process.all
limiter scope aux dossiers vraiment nécessaires

Fichier concerné :

src-tauri/tauri.conf.json 3. Séparer la logique d’orchestration des tools

Pourquoi : useToolCalling.ts est devenu un énorme centre de contrôle. Il est trop gros, trop couplé, trop risqué à faire évoluer.

À faire :

extraire le parsing des balises <tool>, <write_file>, <patch_file>
séparer les handlers par domaine :
fichiers
terminal
navigateur
PDF
MCP
skills
mémoire
plan/todo
centraliser la logique de permissions ask/plan/agent dans un module dédié

Fichier concerné :

src/hooks/useToolCalling.ts
Priorité haute 4. Découper ChatWindow.tsx

Pourquoi : ce composant gère trop de responsabilités à la fois : affichage, chargement de conversation, envoi, auto-load de modèle, RAG, TTS, micro, todo, structure, plan, permissions.

À faire :

créer un composant pour la zone de saisie
créer un composant pour les pièces jointes
créer un composant pour les blocs todo/plan/structure
sortir la gestion conversation dans un hook
sortir la gestion voix dans un hook
sortir la logique d’envoi dans un hook dédié

Fichier concerné :

src/components/ChatWindow.tsx 5. Corriger le script de dev non portable

Pourquoi : le script tauri:dev contient un chemin Windows codé en dur vers E:\CustomApp. C’est fragile et non portable.

À faire :

supprimer les chemins absolus perso
utiliser le dossier courant du projet
rendre le script compatible machine propre / CI

Fichier concerné :

package.json 6. Aligner les versions de l’outillage frontend

Pourquoi : il y a un signal d’incohérence entre next 14.2.x et eslint-config-next 16.2.x.

À faire :

aligner next, eslint-config-next, et le reste de l’écosystème
vérifier que react / react-dom sont cohérents avec Next
tester build, typecheck, lint

Fichier concerné :

package.json 7. Introduire des tests sur la logique sensible

Pourquoi : l’application a beaucoup de logique métier critique et très peu de sécurité contre les régressions visibles dans les fichiers inspectés.

À faire :

tests unitaires sur le parsing des tools
tests sur les règles ask/plan/agent
tests sur sanitation JSON / extraction
tests backend Rust sur write/read/patch/shell
tests d’intégration sur les cas critiques

Fichiers à créer ou compléter :

src/hooks/useToolCalling.ts
src/lib/chatUtils._
src/lib/skillPatcher._
src-tauri/src/hw_info.rs
config de tests à ajouter au repo

Base concernée :

package.json pour ajouter scripts et dépendances de test
Priorité moyenne 8. Mieux structurer le layout global

Pourquoi : Layout.tsx reste lisible, mais il commence déjà à devenir un orchestrateur d’état multi-panels.

À faire :

sortir la gestion des fenêtres flottantes
sortir la gestion des conversations
isoler la navigation latérale
préparer un store global léger si nécessaire

Fichier concerné :

src/components/Layout.tsx 9. Clarifier les choix d’architecture Next/Tauri

Pourquoi : output: "export" est un choix fort. Il faut documenter ce que ça interdit et ce que ça impose.

À faire :

documenter pourquoi export est utilisé
documenter les limites côté routing / SSR / assets
vérifier que tous les composants client sont compatibles avec ce choix

Fichiers concernés :

next.config.mjs
README.md 10. Clarifier le contrat des modules Rust

Pourquoi : main.rs expose beaucoup de commandes. Le projet gagnerait à mieux séparer “outil interne” et “outil public exposé à l’agent”.

À faire :

regrouper les commandes exposées par domaine
documenter celles qui sont dangereuses
créer une couche de policy avant invoke_handler

Fichier concerné :

src-tauri/src/main.rs
Priorité basse mais utile 11. Renforcer la doc développeur

Pourquoi : le README vend bien le produit, mais il manque de doc “maintenance/dev interne”.

À faire :

documenter l’architecture frontend
documenter l’architecture backend Rust
documenter le flux d’un tool call
documenter les modes Ask / Plan / Agent
documenter les risques sécurité connus

Fichier concerné :

README.md 12. Ajouter scripts qualité standard

Pourquoi : il y a déjà typecheck, format, lint:fix, mais il manque un flux qualité complet et cohérent.

À faire :

ajouter lint
ajouter check
ajouter test
ajouter éventuellement test:rust / test:web

Fichier concerné :

package.json
Classement final ultra simple
Critique
Sécuriser les commandes système et accès fichiers
Réduire les permissions Tauri
Refactorer useToolCalling.ts
Haute
Découper ChatWindow.tsx
Corriger package.json et le script tauri:dev
Aligner les versions frontend
Ajouter des tests sur la logique sensible
Moyenne
Refactorer Layout.tsx
Documenter le choix Next export
Clarifier l’exposition des commandes Rust
Basse
Améliorer la doc dev
Ajouter une vraie chaîne qualité standard
Ordre recommandé de travail
src-tauri/tauri.conf.json
src-tauri/src/hw_info.rs
src-tauri/src/main.rs
src/hooks/useToolCalling.ts
src/components/ChatWindow.tsx
package.json
src/components/Layout.tsx
README.md
