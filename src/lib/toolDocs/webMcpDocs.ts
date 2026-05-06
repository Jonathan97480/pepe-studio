import type { ToolDocsMap } from "../toolDocsTypes";

export const TOOL_DOCS_WEB_MCP: ToolDocsMap = {
    http_request: `=== http_request — Appel API REST direct ===
GET  : <tool>{"http_request": "GET", "url": "https://api.example.com/endpoint"}</tool>
POST : <tool>{"http_request": "POST", "url": "https://api.example.com/endpoint", "headers": "Authorization: Bearer sk-xxx\\\\nContent-Type: application/json", "body": "{\\\\"key\\\\": \\\\"value\\\\"}"}</tool>
Méthodes : GET POST PUT DELETE PATCH
Headers   : format "Clé: Valeur" séparés par \\\\n
Réponse   : HTTP <status>\\\\n<body>
Dans un skill PS1 : utilise Invoke-WebRequest / Invoke-RestMethod (http_request n'est pas disponible dans un script).`,

    search_web: `=== search_web — Recherche web ===
Usage : <tool>{"search_web": "requête", "source": "duckduckgo", "locale": "fr"}</tool>
• source : "duckduckgo" (défaut, gratuit) | "brave" | "serper" | "tavily"
• locale : code langue (défaut "fr")
Exemples :
  <tool>{"search_web": "météo Paris demain"}</tool>
  <tool>{"search_web": "prix GPU RTX 5090", "source": "brave"}</tool>
Utilise search_web pour des infos récentes, scrape_url pour lire une page précise.`,

    scrape_url: `=== scrape_url — Lire une page web ===
Usage : <tool>{"scrape_url": "https://fr.wikipedia.org/wiki/Rust", "mode": "static"}</tool>
• mode "static" : pages HTML classiques (rapide < 5s)
• mode "js"     : SPA React/Vue/Angular, contenu chargé par JS (lent ~10s)
Retourne : titre, description, texte, titres, liens.
Utilise scrape_url pour lire une page, http_request pour appeler une API REST.`,

    open_browser: `=== open_browser — Ouvrir une URL dans le navigateur intégré ===
Usage : <tool>{"open_browser": "http://127.0.0.1:7820/index.html"}</tool>
• Ouvre le navigateur intégré à l'URL spécifiée.
• Lance d'abord start_dev_server si c'est un projet local.`,

    start_dev_server: `=== start_dev_server — Démarrer le serveur de développement local ===
Usage : <tool>{"start_dev_server": "E:/mon-projet"}</tool>
• Démarre un serveur HTTP local sur le dossier spécifié.
• Retourne l'URL (ex: http://127.0.0.1:7820/index.html).
• Workflow : write_file → start_dev_server → get_browser_errors → open_browser.`,

    stop_dev_server: `=== stop_dev_server — Arrêter le serveur de développement ===
Usage : <tool>{"stop_dev_server": true}</tool>`,

    get_browser_errors: `=== get_browser_errors — Lire les erreurs JS du navigateur ===
Usage : <tool>{"get_browser_errors": true}</tool>
• Retourne les erreurs console.error, window.onerror et promesses rejetées capturées.
• Appelle après open_browser pour détecter les bugs JS avant de confirmer à l'utilisateur.`,

    get_dev_server_info: `=== get_dev_server_info — Statut du serveur dev ===
Usage : <tool>{"get_dev_server_info": true}</tool>
• Retourne : statut (actif/arrêté), port, dossier servi.`,

    save_image: `=== save_image — Sauvegarder une image base64 ===
Usage : <tool>{"save_image": "data:image/png;base64,...", "filename": "mon-image.png"}</tool>
• filename est optionnel (auto-généré si absent).
• Retourne : path, dataUrl, filename.
• Pour afficher l'image dans le chat : ![description](dataUrl)`,

    download_image: `=== download_image — Télécharger une image depuis une URL ===
Usage : <tool>{"download_image": "https://example.com/photo.jpg", "filename": "photo.jpg"}</tool>
• filename est optionnel.
• Retourne : path, dataUrl, filename.`,

    ask_user: `=== ask_user — Poser une question interactive ===
Usage : <tool>{"ask_user": "Ta question ?", "options": ["Option A", "Option B"]}</tool>
• options est optionnel — omets-le pour une réponse libre.
• Utilise dans TOUS les modes (ask, plan, agent).
• Utilise AVANT d'exécuter une action irréversible.`,

    set_mode: `=== set_mode — Changer de mode ===
Usage : <tool>{"set_mode": "ask"}</tool>  |  "plan"  |  "agent"
• ask   : réponses texte uniquement, pas d'actions
• plan  : explique avant chaque action, confirme les actions risquées
• agent : exécute librement tous les outils
• set_mode: "ask" sert à revenir en mode conversation après une tâche.
⚠️ NE PAS combiner set_mode + ask_user dans la même réponse — utilise ask_user directement.`,

    request_agent_mode: `=== request_agent_mode — Demander le passage en mode Agent ===
Usage : <tool>{"request_agent_mode": "Besoin d'exécuter X pour Y."}</tool>
• Déclenche une demande de permission à l'utilisateur.
• N'exécute aucune action — attend la confirmation.
• Utilise uniquement en mode ask/plan si une action est nécessaire.`,

    get_plan: `=== get_plan — Lire le plan PLAN.md ===
Usage : <tool>{"get_plan": ""}</tool>
• Retourne le contenu du fichier PLAN.md s'il existe.`,

    save_plan: `=== save_plan — Sauvegarder / mettre à jour le plan ===
Usage : <tool>{"save_plan": "# Tâche : Mon projet\\\\n\\\\n## État : EN COURS\\\\n\\\\n## Étapes\\\\n- [x] Étape 1\\\\n- [ ] Étape 2"}</tool>
• Remplace le contenu de PLAN.md.
• Mets à jour [x] et le Checkpoint à chaque étape complétée.`,

    search_conversation: `=== search_conversation — Chercher dans les conversations passées ===
Usage : <tool>{"search_conversation": "python"}</tool>
  Tout parcourir : <tool>{"search_conversation": "*"}</tool>
  Par id         : <tool>{"search_conversation": "#3"}</tool>`,

    "context7-search": `=== context7-search — Trouver une bibliothèque dans Context7 ===
Usage : <tool>{"context7-search": "react", "query": "hooks state management"}</tool>
• Retourne les IDs Context7 (ex: /facebook/react).
• Étape 1 avant context7-docs si l'ID est inconnu.`,

    "context7-docs": `=== context7-docs — Obtenir la documentation officielle ===
Usage : <tool>{"context7-docs": "/vercel/next.js", "query": "authentication middleware", "tokens": 4000}</tool>
• context7-docs : ID Context7 exact (ex: /vercel/next.js, /tauri-apps/tauri)
• query         : question précise en anglais
• tokens        : budget optionnel (défaut 4000, max 10000)
IDs courants : /facebook/react | /vercel/next.js | /tauri-apps/tauri | /supabase/supabase | /tailwindlabs/tailwindcss.com`,

    create_mcp_server: `=== create_mcp_server — Créer un serveur MCP Node.js ===
Usage : <tool>{"create_mcp_server": "nom-serveur", "description": "Ce que fait ce serveur", "content": "...code JS..."}</tool>
• content = code Node.js COMPLET implémentant le protocole MCP (stdio JSON-RPC 2.0).
• RÈGLE : utilise UNIQUEMENT des guillemets simples (') dans le code JS du content.
• Après création : démarre avec start_mcp_server.`,

    start_mcp_server: `=== start_mcp_server — Démarrer un serveur MCP ===
Usage : <tool>{"start_mcp_server": "nom-serveur"}</tool>
• Retourne la liste des outils exposés par le serveur.`,

    call_mcp_tool: `=== call_mcp_tool — Appeler un outil d'un serveur MCP ===
Usage : <tool>{"call_mcp_tool": "nom-serveur", "tool": "nom-outil", "args": "{\\\\"param\\\\": \\\\"valeur\\\\"}"}</tool>`,

    list_mcp_servers: `=== list_mcp_servers — Lister les serveurs MCP ===
Usage : <tool>{"list_mcp_servers": ""}</tool>`,

};

