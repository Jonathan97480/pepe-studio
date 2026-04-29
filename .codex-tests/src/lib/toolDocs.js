"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_DOCS = void 0;
exports.TOOL_DOCS = {
    get_hardware_info: `=== get_hardware_info — Informations matérielles locales ===
Usage : <tool>{"get_hardware_info": true}</tool>
• Retourne la RAM totale, le nombre de threads CPU et le GPU détecté avec sa VRAM.
• À utiliser pour les questions comme : "liste mes cartes graphiques", "combien j'ai de RAM ?", "quelle config machine ?"
• Plus fiable que cmd pour les infos matériel de base.`,
    cmd: `=== cmd — Commande PowerShell ponctuelle ===
Usage : <tool>{"cmd": "Get-Date"}</tool>
• Exécute une commande dans un processus isolé (le cwd ne persiste PAS).
• Enchaîne plusieurs commandes avec ; (JAMAIS &&).
• Utilise des chemins absolus ou Set-Location ; avant ta commande.
⛔ RÈGLE JSON ABSOLUE : utilise TOUJOURS des guillemets SIMPLES (') pour les chemins et chaînes dans la valeur cmd.
   Les guillemets doubles (\\") à l'intérieur du JSON brisent le parseur — erreur garantie.
   ✗ JAMAIS  : {"cmd": "Rename-Item -Path \\\\"E:/Mon Dossier/f.pdf\\\\" -NewName \\\\"n.pdf\\\\""}
   ✓ CORRECT : {"cmd": "Rename-Item -Path 'E:/Mon Dossier/f.pdf' -NewName 'n.pdf'"}
Exemples :
  <tool>{"cmd": "node --version"}</tool>
  <tool>{"cmd": "New-Item -ItemType Directory -Force 'E:/projet'; Set-Location 'E:/projet'; git init"}</tool>
  <tool>{"cmd": "Get-ChildItem -Recurse -Name 'E:/mon-projet'"}</tool>
  <tool>{"cmd": "Rename-Item -Path 'E:/Mon Dossier/ancien.pdf' -NewName 'nouveau.pdf'"}</tool>
Quand utiliser cmd (et non terminal persistant) :
  ✅ Commande unique sans besoin de rester dans le même dossier
  ✅ Info système, lecture chemin absolu, action ponctuelle
  ❌ Séquence ≥ 2 commandes dans le même dossier → utilise create_terminal`,
    write_file: `=== write_file — Créer un fichier ===
UNIQUEMENT pour les NOUVEAUX fichiers. Pour modifier un existant : utilise patch_file.

Format TAG (OBLIGATOIRE pour HTML/CSS/JS/TS — guillemets libres, pas d'escaping) :
  <write_file path="E:/projet/index.html">
  <!DOCTYPE html>
  <html lang="fr">
  ...contenu brut complet...
  </html>
  </write_file>

Format JSON (uniquement pour .txt/.json SIMPLES, contenu < 200 caractères sans guillemets doubles) :
  <tool>{"write_file": "E:/projet/config.txt", "content": "valeur simple"}</tool>

Règles :
  • Chemin absolu obligatoire (ex: E:/tetris/index.html)
  • Les dossiers parents sont créés automatiquement
  • ⛔ N'utilise JAMAIS le format JSON pour du HTML/CSS/JS → erreurs inévitables`,
    patch_file: `=== patch_file — Modifier un fichier existant ===
Utilise patch_file pour toute modification dans un fichier qui EXISTE DÉJÀ (< 30 lignes changées).
NE RÉÉCRIS JAMAIS tout un fichier pour changer quelques lignes.

Format (SEARCH: et REPLACE: sont obligatoires, sur leur propre ligne) :
  <patch_file path="E:/projet/index.html">SEARCH:
  <h2>Titre ancien</h2>
  REPLACE:
  <h2>Titre nouveau</h2>
  </patch_file>

Règles CRITIQUES :
  • SEARCH doit correspondre EXACTEMENT au texte du fichier (espaces, sauts de ligne inclus)
  • Si doute sur le texte exact → lis d'abord avec read_file
  • SEARCH doit être unique dans le fichier (ajoute du contexte si nécessaire)
  • Si le résultat contient ✗ → STOP. Lis le fichier, corrige SEARCH, relance.
  • Tu peux enchaîner plusieurs blocs patch_file dans la même réponse`,
    read_file: `=== read_file — Lire un fichier ===
Usage : <tool>{"read_file": "E:/projet/index.html"}</tool>
• Retourne le contenu complet du fichier dans le contexte.
• Chemin absolu recommandé.
• Limite : 512 Ko.
• ⚠️ Ne fonctionne PAS pour les PDF (binaire) → utilise read_pdf à la place.
Toujours lire un fichier avant de le modifier (RÈGLE 0).`,
    analyze_folder: `=== analyze_folder — Analyser un dossier local mixte ===
Usage : <tool>{"analyze_folder": "E:/documents"}</tool>
Avec récursivité : <tool>{"analyze_folder": "E:/documents", "recursive": true}</tool>
Avec limite : <tool>{"analyze_folder": "E:/documents", "max_files": 40}</tool>
• Liste les fichiers du dossier, les classe (PDF, images, textes, autres) et extrait des aperçus utiles.
• Pour les PDF : preview de la première page, avec OCR si nécessaire.
• Pour les images : OCR local si du texte est détectable, et joint quelques images au modèle.
• Pour les fichiers texte : extrait un aperçu du contenu.
• Utile quand l'utilisateur dit "analyse ce dossier" sans détailler chaque fichier.`,
    list_folder_files: `=== list_folder_files — Lister les fichiers d'un dossier ===
Usage : <tool>{"list_folder_files": "E:/documents"}</tool>
Avec extensions : <tool>{"list_folder_files": "E:/documents", "extensions": ["pdf", "png", "jpg"]}</tool>
Avec récursivité : <tool>{"list_folder_files": "E:/documents", "recursive": true}</tool>
• Retourne la liste des fichiers du dossier.
• extensions est optionnel et accepte un tableau JSON natif ou une chaîne CSV simple.
• Utile comme première étape pour analyser un dossier mixte.`,
    read_pdf: `=== read_pdf — Lire un fichier PDF complet (toutes les pages) ===
Usage : <tool>{"read_pdf": "E:/documents/rapport.pdf"}</tool>
• Retourne le texte de TOUTES les pages — utile pour analyse détaillée ou résumé d'un seul document.
• ⚠️ Retourne beaucoup de contexte — réservé à l'analyse approfondie d'UN seul PDF.
• Si le PDF est scanné et n'a pas de texte natif, un fallback OCR est tenté.
• Pour traiter plusieurs PDFs → utilise read_pdf_batch.`,
    read_pdf_brief: `=== read_pdf_brief — Lire la 1ère page d'un seul PDF ===
Usage : <tool>{"read_pdf_brief": "E:/documents/facture.pdf"}</tool>
• 1ère page uniquement, max 2000 caractères.
• Si la page est une image scannée, un fallback OCR est tenté.
• ⚠️ Pour traiter PLUSIEURS PDFs en une seule opération → utilise read_pdf_batch (plus efficace).`,
    read_pdf_batch: `=== read_pdf_batch — Lire la 1ère page de PLUSIEURS PDFs en un seul appel ===
Usage : <tool>{"read_pdf_batch": "[\\\\"E:/Test IA PDF/fichier1.pdf\\\\", \\\\"E:/Test IA PDF/fichier2.pdf\\\\", ...]"}</tool>
• ✅ OUTIL PRINCIPAL pour tout traitement en lot de PDFs.
• Retourne la 1ère page de chaque PDF (max 2000 caractères par fichier) en UN SEUL appel.
• Si un PDF n'a pas de texte natif, un OCR est tenté sur la première page.
• ⛔ INTERDIT d'appeler read_pdf_brief fichier par fichier quand on traite un lot — utilise read_pdf_batch.
• Recommandation : envoyer 30 chemins max par appel pour éviter les timeouts.
Workflow batch PDF OBLIGATOIRE (≥ 2 fichiers à renommer/analyser) :
  ÉTAPE 1 : list_folder_pdfs → liste complète
  ÉTAPE 2 : read_pdf_batch sur les 30 premiers chemins → extraire émetteur + numéro de chaque
  ÉTAPE 3 : Si > 30 fichiers, read_pdf_batch sur le lot suivant, etc.
  ÉTAPE FINALE : batch_rename avec toutes les entrées [{from, to}] en un seul appel`,
    list_folder_pdfs: `=== list_folder_pdfs — Lister les PDFs d'un dossier ===
Usage : <tool>{"list_folder_pdfs": "E:/documents"}</tool>
Usage récursif : <tool>{"list_folder_pdfs": "E:/documents", "recursive": "true"}</tool>
• Liste tous les fichiers .pdf dans le dossier indiqué.
• Puis utilise read_pdf_batch pour lire les métadonnées de tous les fichiers.`,
    read_image: `=== read_image — Charger une image locale pour analyse ===
Usage : <tool>{"read_image": "E:/images/photo.png"}</tool>
• Charge une image depuis le disque et la joint au modèle.
• Si du texte est visible dans l'image, un OCR local est tenté et injecté dans le contexte.
• À utiliser pour analyser une capture d'écran, une photo ou un document image local.
• Répond ensuite uniquement à partir du contenu visible.`,
    read_image_batch: `=== read_image_batch — Charger plusieurs images locales ===
Usage : <tool>{"read_image_batch": ["E:/images/1.png", "E:/images/2.jpg"]}</tool>
• Charge plusieurs images du disque en un seul appel.
• Format attendu : tableau JSON natif.
• Utile après list_folder_images pour analyser un dossier d'images.`,
    list_folder_images: `=== list_folder_images — Lister les images d'un dossier ===
Usage : <tool>{"list_folder_images": "E:/images"}</tool>
Usage récursif : <tool>{"list_folder_images": "E:/images", "recursive": true}</tool>
• Liste les fichiers image courants : png, jpg, jpeg, webp, gif, bmp, svg.
• Utilise ensuite read_image ou read_image_batch pour les analyser.`,
    batch_rename: `=== batch_rename — Renommer plusieurs fichiers en une seule opération ===
Usage : <tool>{"batch_rename": [{"from": "E:/dossier/ancien.pdf", "to": "nouveau.pdf"}, ...]}</tool>
• Format TABLEAU NATIF JSON — PAS de guillemets extra autour du tableau.
• Renomme une liste de fichiers en un seul appel — parfait pour le traitement en lot.
• "to" peut être un nom simple (reste dans le même dossier) ou un chemin absolu.
• Retourne le détail de chaque renommage (succès/échec).
• ⚠️ Maximum 15 fichiers par appel. Si > 15, fais 2 appels séparés.
⛔ RÈGLE : ne jamais utiliser Rename-Item (cmd) quand on veut renommer plusieurs fichiers — utilise batch_rename.`,
    create_terminal: `=== create_terminal — Ouvrir un terminal persistant ===
Usage : <tool>{"create_terminal": "nom-projet", "cwd": "E:/MesProjets/mon-projet"}</tool>
• cwd est OBLIGATOIRE — ne jamais l'omettre.
• ⚠️ INTERDIT : cwd pointant sur E:/CustomApp ou le dossier de l'application.
• Si le dossier n'existe pas, il est créé automatiquement.
• Retourne un terminal_id (ex: "term-1744456789") à réutiliser dans terminal_exec.
Quand utiliser :
  ✅ Séquence ≥ 2 commandes dans le même dossier (git + npm + build…)
  ✅ Initialisation scaffold (npx create-*, cargo new…)`,
    terminal_exec: `=== terminal_exec — Exécuter dans un terminal persistant ===
Usage : <tool>{"terminal_exec": "git status", "terminal_id": "term-1744456789"}</tool>
• Le répertoire courant est conservé entre les appels.
• cd dans terminal_exec change le cwd pour les commandes suivantes.
• Si l'ID est inconnu → appelle list_terminals d'abord.
• OBLIGATOIRE : fermer avec close_terminal en fin de tâche.`,
    close_terminal: `=== close_terminal — Fermer un terminal persistant ===
Usage : <tool>{"close_terminal": "term-1744456789"}</tool>
• OBLIGATOIRE en fin de tâche pour libérer les ressources.`,
    list_terminals: `=== list_terminals — Lister les terminaux ouverts ===
Usage : <tool>{"list_terminals": ""}</tool>
• Retourne la liste des terminaux avec leur id, nom, cwd et nombre de commandes exécutées.`,
    get_terminal_history: `=== get_terminal_history — Historique d'un terminal ===
Usage : <tool>{"get_terminal_history": "term-1744456789"}</tool>
• Retourne la liste des commandes exécutées avec leurs sorties.`,
    terminal_start_interactive: `=== terminal_start_interactive — Processus interactif (SSH, REPL…) ===
Usage : <tool>{"terminal_start_interactive": "ssh user@host", "terminal_id": "term-1744456789"}</tool>
• Utilise pour TOUTE commande qui nécessite une saisie utilisateur : ssh, telnet, python REPL, node REPL…
• La sortie s'affiche EN TEMPS RÉEL dans le panneau Terminal (xterm.js).
• ⚠️ OBLIGATOIRE pour SSH — jamais cmd ni terminal_exec pour des connexions SSH.
Exemples :
  <tool>{"terminal_start_interactive": "ssh beroute@192.168.1.28", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_start_interactive": "ssh -o StrictHostKeyChecking=no beroute@192.168.1.28", "terminal_id": "term-xxx"}</tool>
Flux SSH recommandé :
  1. create_terminal (cwd = dossier quelconque)
  2. terminal_start_interactive avec la commande ssh
  3. Attendre que l'utilisateur entre son mot de passe (session en cours)
  4. Envoyer les commandes distantes via terminal_send_stdin`,
    terminal_send_stdin: `=== terminal_send_stdin — Envoyer une commande dans un terminal interactif actif ===
Usage : <tool>{"terminal_send_stdin": "ls -la\\\\n", "terminal_id": "term-xxx"}</tool>
• Envoie du texte brut au processus interactif en cours (SSH, REPL, etc.).
• ✅ LA SORTIE EST AUTOMATIQUEMENT RETOURNÉE après ~2.5 s — tu n'as pas besoin de lire l'historique manuellement.
• ⚠️ TOUJOURS ajouter \\\\n à la fin pour exécuter la commande (Entrée).
• Ctrl+C : envoyer "\\\\x03" pour interrompre.
• N'utilise JAMAIS terminal_exec quand un processus interactif est actif.
Exemples (SSH connecté sur machine distante) :
  <tool>{"terminal_send_stdin": "ls -la\\\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "cat /etc/hostname\\\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "iptables -L -n -v\\\\n", "terminal_id": "term-xxx"}</tool>`,
    create_skill: `=== create_skill — Créer un skill ===
Types disponibles : ps1 (défaut), python, nodejs, http (single), http (multi-routes), composite.

PS1 :
  <tool>{"create_skill": "nom", "description": "desc", "content": "# PS1\\\\nGet-Date"}</tool>
Python :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "python", "content": "print('hello')"}</tool>
Node.js :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "nodejs", "content": "console.log('hello')"}</tool>
HTTP single :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "method": "GET", "url": "https://api.example.com/v1/endpoint", "headers": "Authorization: Bearer sk-xxx"}</tool>
HTTP multi-routes (recommandé pour plusieurs endpoints) :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "base_url": "https://api.example.com/v1", "headers": "x-api-key: sk-xxx", "routes": "{\\\\"list\\\\":{\\\\"method\\\\":\\\\"GET\\\\",\\\\"url\\\\":\\\\"/items\\\\"},\\\\"create\\\\":{\\\\"method\\\\":\\\\"POST\\\\",\\\\"url\\\\":\\\\"/items\\\\"}}"}</tool>
Composite (pipeline de skills) :
  <tool>{"create_skill": "pipeline", "description": "desc", "skill_type": "composite", "content": "[{\\\\"skill\\\\":\\\\"step1\\\\"},{\\\\"skill\\\\":\\\\"step2\\\\",\\\\"chain\\\\":true}]"}</tool>

Règles JSON content :
  • guillemet → \\\\"  |  saut de ligne → \\\\n  |  pas de vrai saut de ligne dans la valeur JSON
  • Après "[Skill créé]" : NE recrée PAS le skill, réponds ou teste-le.`,
    run_skill: `=== run_skill — Exécuter un skill ===
Sans args  : <tool>{"run_skill": "nom-du-skill"}</tool>
Avec args  : <tool>{"run_skill": "nom-du-skill", "args": "-Param valeur"}</tool>
HTTP multi : <tool>{"run_skill": "nom-api", "args": "{\\\\"action\\\\": \\\\"list\\\\"}"}</tool>
HTTP body  : <tool>{"run_skill": "nom-api", "args": "{\\\\"action\\\\": \\\\"create\\\\", \\\\"body\\\\": \\\\"{...}\\\\"}"}</tool>`,
    read_skill: `=== read_skill — Lire le contenu d'un skill ===
Usage : <tool>{"read_skill": "nom-du-skill"}</tool>
• Retourne le code source du skill pour inspection avant modification.
• TOUJOURS lire avant patch_skill.`,
    patch_skill: `=== patch_skill — Modifier un skill existant ===
Usage : <tool>{"patch_skill": "nom-du-skill", "search": "texte exact", "replace": "nouveau texte"}</tool>
• Même logique que patch_file : SEARCH doit être exactement dans le contenu.
• Lis d'abord avec read_skill si tu n'es pas sûr du contenu.`,
    delete_skill: `=== delete_skill — Supprimer un skill ===
Usage : <tool>{"delete_skill": "nom-du-skill"}</tool>
• Action irréversible. Demande confirmation avec ask_user avant.`,
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
    save_fact: `=== save_fact — Mémoriser un fait utilisateur ===
⚠️ Ce n'est PAS un outil JSON. C'est une balise inline dans le texte de ta réponse.
Format : <save_fact key="prénom" value="Jean"/>
• Insère discrètement dans ta réponse quand l'utilisateur mentionne une info personnelle.
• INTERDIT : <tool>{"save_fact": ...}</tool> — utilise TOUJOURS la balise inline.`,
    get_tool_doc: `=== get_tool_doc — Obtenir la documentation d'un outil ===
Usage : <tool>{"get_tool_doc": "write_file"}</tool>
• Retourne la documentation complète de l'outil demandé.
• Supporte la recherche partielle (ex: "terminal" retourne tous les outils terminal).
• Utilise quand tu veux vérifier le format exact d'un outil avant de l'utiliser.`,
    set_todo: `=== set_todo — Créer/remplacer la todo list ===
Usage : <tool>{"set_todo": ["Étape 1 : créer index.html", "Étape 2 : ajouter CSS", "Étape 3 : tester"]}</tool>
• Crée une liste de tâches visible au-dessus de la zone de saisie de l'utilisateur.
• La liste ne s'affiche QUE si tu en crées une — n'en crée pas pour de simples réponses.
• Utilise UNIQUEMENT pour les tâches multi-étapes (≥ 3 étapes) en mode agent.
• Marque chaque tâche terminée avec check_todo au fur et à mesure.
• Quand toutes sont cochées, la liste disparaît automatiquement.`,
    check_todo: `=== check_todo — Marquer une tâche comme terminée ===
Usage : <tool>{"check_todo": 0}</tool>   → marque la tâche n°0 (première)
         <tool>{"check_todo": "all"}</tool> → marque TOUTES les tâches
• L'index est 0-basé (première tâche = 0, deuxième = 1…).
• Quand toutes les tâches sont cochées, la liste disparaît automatiquement après 1,5s.
• Appelle check_todo IMMÉDIATEMENT après avoir accompli chaque étape.`,
    save_project_structure: `=== save_project_structure — Mémoriser la structure du projet ===
Usage : <tool>{"save_project_structure": "E:/monprojet/\\\\n├── index.html\\\\n├── style.css\\\\n└── script.js"}</tool>
• Sauvegarde la structure dans la base de données, liée à la conversation.
• Elle persiste : si l'utilisateur reprend la conversation plus tard, la structure est rechargée.
• Elle est injectée AUTOMATIQUEMENT dans le contexte système à chaque message — tu n'as pas besoin de la relire.
• Mets à jour après avoir créé/modifié des fichiers ou des dossiers importants.
• IMPORTANT : appelle save_project_structure dès que tu crées ou modifies la structure d'un projet.`,
    get_project_structure: `=== get_project_structure — Lire la structure mémorisée ===
Usage : <tool>{"get_project_structure": ""}</tool>
• Retourne la structure de projet actuellement mémorisée pour cette conversation.
• Note : la structure est déjà injectée dans le contexte — utilise get_project_structure seulement si tu veux la relire explicitement.`,
    generate_image: `=== generate_image — Générer une image avec Stable Diffusion ===
Usage : <tool>{"generate_image": "un chat roux assis sur un toit au coucher de soleil, photoréaliste"}</tool>
Usage avancé : <tool>{"generate_image": "portrait d'une guerrière elfe", "aspect_ratio": "16/9", "negative_prompt": "flou, mauvaise qualité", "steps": 25, "upscale": true, "seed": 42}</tool>

Paramètres optionnels :
• aspect_ratio : ratio souhaité (ex: "16/9", "9:16", "1:1", "landscape", "portrait", "square")
    - Si width/height sont absents, ils sont calculés automatiquement depuis ce ratio
• negative_prompt : ce que tu NE veux PAS dans l'image (ex: "flou, texte, marque")
    - Alias tolérés : negativePrompt, negativeprompt
    - Si absent, un negative_prompt par défaut est appliqué automatiquement
• steps : nombre d'étapes (défaut: 20, max recommandé: 30)
• width/height : dimensions en pixels, multiples de 64 (défaut: 512x512)
• upscale : true pour appliquer Real-ESRGAN x4 après génération
• seed : graine pour reproductibilité (-1 = aléatoire)
• model : nom du fichier modèle .safetensors dans models/sd/ (auto-détection si absent)

IMPORTANT :
• Modèles SD à placer dans : models/sd/ (format .safetensors ou .ckpt)
• La génération peut prendre 15s (GPU) à 4min (CPU si le LLM occupe le GPU)
• L'image générée est affichée automatiquement dans le chat`,
    list_sd_models: `=== list_sd_models — Lister les modèles Stable Diffusion disponibles ===
Usage : <tool>{"list_sd_models": true}</tool>
• Retourne la liste des modèles .safetensors et .ckpt trouvés dans models/sd/ et models/
• À utiliser avant generate_image pour choisir le bon modèle`,
};
