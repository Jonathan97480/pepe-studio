# TODO Pépé-Studio

1. Configurer tauri.conf.json pour les dépendances système (Llama.cpp, accès fichiers, sidecars)
2. Créer le composant principal Layout (Sidebar + Zone de Chat) avec Tailwind CSS
3. Définir le schéma TypeScript de l’orchestrateur UI <-> Llama.cpp
4. Générer les composants Sidebar, ChatWindow, SettingsPanel
5. Implémenter le wrapper Rust/Node pour Llama.cpp (sidecar Tauri)
6. Mettre en place le Context Manager (sliding window, summarization)
7. Développer le système d’outils MCP (orchestrateur, SearchWeb, ApiClient, McpManager)
8. [x] Intégrer le support TurboQuant (quantification KV Cache)
9. Styliser l’UI (mode sombre, glassmorphism, lucide-react)
10. Tests et optimisation des performances
