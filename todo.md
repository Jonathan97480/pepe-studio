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

## Backlog - TRELLIS (Microsoft) dans les paramètres (sans passer par le chat)

- [ ] Ajouter une section "3D / Hugging Face" dans le panneau des paramètres.
- [ ] Ajouter un champ sécurisé pour le token Hugging Face (masqué, avec bouton afficher/cacher).
- [ ] Ajouter un bouton "Enregistrer le token" qui stocke le token via backend (pas en clair dans le front).
- [ ] Ajouter un bouton "Tester le token" (appel backend) avec retour visuel: valide/invalide/non autorisé.
- [ ] Ajouter un lien vers la page du modèle TRELLIS-image-large (microsoft/TRELLIS-image-large — MIT, public).
- [ ] Ajouter un lien vers la page des tokens Hugging Face.
- [ ] Ajouter un texte explicatif: pourquoi TRELLIS produit une meilleure qualité (Gaussians + Radiance Field + mesh), GPU ≥16 GB VRAM recommandé.
- [ ] Ajouter une checklist UI de prérequis:
    - [ ] token valide (optionnel — TRELLIS est MIT/public)
    - [ ] python/venv disponible
    - [ ] GPU NVIDIA ≥16 GB VRAM détecté
- [ ] Ajouter un bouton principal "Installer TRELLIS (1 clic)" désactivé tant que les prérequis ne sont pas validés.
- [ ] Déverrouiller automatiquement le bouton d'installation quand tous les checks sont verts.
- [ ] Ajouter une vue terminal intégrée (logs en temps réel) dédiée à l'installation TRELLIS.
- [ ] Afficher une barre d'état de progression (etape en cours, succès/erreur, durée).
- [ ] Permettre relance/retry d'une installation échouée depuis l'UI paramètres.
- [ ] Ajouter un bouton "Copier les logs" pour support/debug.
- [ ] Ajouter gestion des erreurs fréquentes:
    - [ ] CUDA Out of Memory (≥16 GB requis)
    - [ ] torch manquant
    - [ ] espace disque insuffisant (~20 Go requis)
    - [ ] CUDA/compilateur non supporté sur Windows
- [ ] Ajouter un mode "installation silencieuse" optionnel (sans spammer le chat).
- [ ] Journaliser l'état d'installation TRELLIS en base/local storage (installé, version, date, dernier statut).
- [ ] Ajouter un test d'intégration front->backend pour le flux complet "check prérequis -> installer -> generate_3d_model".
- [ ] Ajouter documentation utilisateur dans l'UI (section aide courte + liens officiels).

## Plan d'implémentation 3D (TRELLIS — Microsoft)

### Phase 1 - Quick wins (1 session)

Objectif: améliorer l'UX et réduire les runs inutiles sans modifier le moteur TRELLIS.

- [ ] Ajouter presets de génération dans l'UI: Rapide (512), Equilibre (1024), Qualite (2048).
- [ ] Ajouter contrôles seed et simplify exposés dans l'UI.
- [ ] Ajouter résumé final compact de génération (durée, mémoire pic, nombre de faces, chemin GLB).
- [ ] Ajouter validation d'image d'entrée avant run (format, taille mini, chemin existant).
- [ ] Ajouter message UX clair si l'image source est trop petite ou trop bruitée.

Livrables:

- [ ] Paramètres visibles dans SettingsPanel.
- [ ] Flux generate_3d_model piloté par preset.
- [ ] Journal de sortie plus lisible et plus court.

### Phase 2 - Robustesse et installation guidée (2 sessions)

Objectif: fiabiliser le parcours complet utilisateur sans passer par le chat.

- [ ] Implémenter section Hugging Face / TRELLIS complète dans Paramètres (token optionnel + test + liens + checklist).
- [ ] Déverrouiller "Installer TRELLIS (1 clic)" uniquement quand tous les prérequis sont verts.
- [ ] Ajouter vue terminal intégrée avec logs en streaming + bouton copier les logs.
- [ ] Ajouter états d'installation persistés (en cours, OK, erreur, timestamp, dernier message).
- [ ] Ajouter retry intelligent après erreur fréquente (OOM, disque, torch, CUDA).

Livrables:

- [ ] Installation TRELLIS entièrement pilotable depuis les Paramètres.
- [ ] Progression visible en temps réel.
- [ ] Moins de support manuel côté chat.

### Phase 3 - Qualité mesh/texture (2 sessions)

Objectif: augmenter la qualité perçue des GLB avec pré/post-traitements légers.

- [ ] Prétraitement image optionnel: crop sujet, nettoyage léger, netteté douce.
- [ ] Post-traitement mesh optionnel: suppression composantes isolées + normales + lissage léger.
- [ ] Ajouter score qualité automatique post-génération (mesh vide, faces trop faibles, texture manquante).
- [ ] Proposer relance auto avec preset supérieur si score qualité faible.
- [ ] Ajouter indicateurs QA dans le résultat final (score, recommandations).
- [ ] Exploiter les sorties Gaussians et Radiance Field de TRELLIS pour des previews supplémentaires.

Livrables:

- [ ] GLB plus propres sur images difficiles.
- [ ] Moins d'itérations manuelles utilisateur.
- [ ] Qualité plus stable entre runs.
