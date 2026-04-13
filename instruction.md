1. Rôle de l'IA
Agis en tant qu'Expert Senior en Développement Software, spécialisé dans les architectures Desktop modernes (Tauri), l'intégration de LLM locaux (Llama.cpp) et les protocoles d'agents (MCP). Ton objectif est de m'aider à coder une application nommée "Pépé-Studio".

2. Aperçu du Projet
Une application desktop de gestion de LLM (style LM Studio) permettant de discuter avec des modèles locaux (GGUF) et externes, intégrant un orchestrateur d'outils performant.

Stack Technique :
Frontend : Next.js 14+ (App Router), Tailwind CSS.

Desktop : Tauri (pour la performance Rust et l'accès système).

Moteur LLM : node-llama-cpp pour l'intégration de Llama.cpp.

Interface : UI moderne, mode sombre profond, style "Glassmorphism" avec lucide-react.

3. Architecture de l'Interface (UI)
L'interface doit être divisée en trois sections principales :

Sidebar Gauche (Navigation) : Chat, Bibliothèque de modèles, Gestionnaire d'outils MCP, Paramètres.

Zone Centrale (Chat) : Fenêtre de discussion fluide, support du Markdown, bulles de messages stylisées.

Sidebar Droite (Paramètres du Modèle) : Température, Context Window, sélecteur de système prompt, et switch pour les optimisations.

4. Fonctionnalités Clés & Optimisations
Tu dois implémenter les fonctionnalités suivantes avec une attention particulière à la performance :

A. Moteur & Compression
Intégration Llama.cpp : Gestion des modèles .gguf avec support du streaming.

KV Cache Shifting : Pour permettre une rotation fluide du contexte sans recalculer tout le prompt.

Google TurboQuant : Implémenter le support de la quantification du KV Cache en 3-bit (--cache-type-k turbo3) pour maximiser la fenêtre de contexte sur du matériel grand public (GPU/VRAM).

Context Manager : Système de "Sliding Window" avec résumé automatique (summarization) des anciens messages une fois 70% de la fenêtre atteinte.

B. Système d'Outils (Protocole MCP)
Orchestrateur "MAC" : Un agent capable de router les requêtes vers des outils externes.

Outil Recherche Web : Intégration d'une API (Brave Search, Tavily ou Serper).

Client API Universel : Capacité pour l'IA d'appeler des endpoints REST JSON dynamiques.

MCP Style Creator : Une interface permettant de définir et de tester de nouveaux outils (schémas JSON/MCP) directement dans l'application.

5. Structure de Dossiers Attendue
Plaintext
/src
  /components  (UI Components: Sidebar, Chat, Settings)
  /hooks       (useLlama, useMCP, useTurboQuant)
  /lib         (Llama.cpp wrapper, Context Manager logic)
  /tools       (SearchWeb, ApiClient, McpManager)
/src-tauri     (Configuration Rust et Sidecars Llama.cpp)
6. Instructions pour la première étape
Commence par me proposer :

La configuration du fichier tauri.conf.json pour supporter les dépendances système.

Le code du composant principal Layout (Sidebar + Zone de Chat) avec Tailwind CSS pour obtenir le look "LM Studio".

Le schéma de l'orchestrateur qui gère la communication entre l'UI et Llama.cpp.