import React, { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { searchLibrary, queryDocs } from "../tools/Context7Client";
import { hasPatchBlocks, applyAllPatches, type PatchResult } from "../lib/skillPatcher";
import { normalizeToolTags, sanitizeLlmJson, extractWriteFileTool, invokeWithTimeout } from "../lib/chatUtils";
import { extractPdfPagesFromBase64 } from "../lib/pdfExtract";
import type { LlamaMessage, Attachment } from "./useLlama";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { TurboQuantType } from "../context/ModelSettingsContext";
import type { ChatMode } from "../lib/chatUtils";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

// Curseurs de lecture par terminal_id — pour ne retourner que le NOUVEAU texte après terminal_send_stdin
const terminalReadCursors: Map<string, number> = new Map();

/** Supprime les séquences d'échappement ANSI/VT pour ne passer que du texte brut au LLM. */
function stripAnsi(s: string): string {
    return s
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") // CSI sequences: ESC [ ... letter
        .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC sequences
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "") // DCS/SOS/PM/APC
        .replace(/\x1b[=>]/g, "") // VT52 mode switches
        .replace(/\r/g, "") // carriage returns
        .replace(/\x1b\[\d*[ABCDK]/g, ""); // cursor movement leftovers
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentation intégrée de chaque outil — utilisée par get_tool_doc
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_DOCS: Record<string, string> = {
    cmd: `=== cmd — Commande PowerShell ponctuelle ===
Usage : <tool>{"cmd": "Get-Date"}</tool>
• Exécute une commande dans un processus isolé (le cwd ne persiste PAS).
• Enchaîne plusieurs commandes avec ; (JAMAIS &&).
• Utilise des chemins absolus ou Set-Location ; avant ta commande.
⛔ RÈGLE JSON ABSOLUE : utilise TOUJOURS des guillemets SIMPLES (') pour les chemins et chaînes dans la valeur cmd.
   Les guillemets doubles (\") à l'intérieur du JSON brisent le parseur — erreur garantie.
   ✗ JAMAIS  : {"cmd": "Rename-Item -Path \\"E:/Mon Dossier/f.pdf\\" -NewName \\"n.pdf\\""}
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

    read_pdf: `=== read_pdf — Lire un fichier PDF complet (toutes les pages) ===
Usage : <tool>{"read_pdf": "E:/documents/rapport.pdf"}</tool>
• Retourne le texte de TOUTES les pages — utile pour analyse détaillée ou résumé d'un seul document.
• ⚠️ Retourne beaucoup de contexte — réservé à l'analyse approfondie d'UN seul PDF.
• Pour traiter plusieurs PDFs → utilise read_pdf_batch.`,

    read_pdf_brief: `=== read_pdf_brief — Lire la 1ère page d'un seul PDF ===
Usage : <tool>{"read_pdf_brief": "E:/documents/facture.pdf"}</tool>
• 1ère page uniquement, max 2000 caractères.
• ⚠️ Pour traiter PLUSIEURS PDFs en une seule opération → utilise read_pdf_batch (plus efficace).`,

    read_pdf_batch: `=== read_pdf_batch — Lire la 1ère page de PLUSIEURS PDFs en un seul appel ===
Usage : <tool>{"read_pdf_batch": "[\\"E:/Test IA PDF/fichier1.pdf\\", \\"E:/Test IA PDF/fichier2.pdf\\", ...]"}</tool>
• ✅ OUTIL PRINCIPAL pour tout traitement en lot de PDFs.
• Retourne la 1ère page de chaque PDF (max 2000 caractères par fichier) en UN SEUL appel.
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
Usage : <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "term-xxx"}</tool>
• Envoie du texte brut au processus interactif en cours (SSH, REPL, etc.).
• ✅ LA SORTIE EST AUTOMATIQUEMENT RETOURNÉE après ~2.5 s — tu n'as pas besoin de lire l'historique manuellement.
• ⚠️ TOUJOURS ajouter \\n à la fin pour exécuter la commande (Entrée).
• Ctrl+C : envoyer "\\x03" pour interrompre.
• N'utilise JAMAIS terminal_exec quand un processus interactif est actif.
Exemples (SSH connecté sur machine distante) :
  <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "cat /etc/hostname\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "iptables -L -n -v\\n", "terminal_id": "term-xxx"}</tool>`,

    create_skill: `=== create_skill — Créer un skill ===
Types disponibles : ps1 (défaut), python, nodejs, http (single), http (multi-routes), composite.

PS1 :
  <tool>{"create_skill": "nom", "description": "desc", "content": "# PS1\\nGet-Date"}</tool>
Python :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "python", "content": "print('hello')"}</tool>
Node.js :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "nodejs", "content": "console.log('hello')"}</tool>
HTTP single :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "method": "GET", "url": "https://api.example.com/v1/endpoint", "headers": "Authorization: Bearer sk-xxx"}</tool>
HTTP multi-routes (recommandé pour plusieurs endpoints) :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "base_url": "https://api.example.com/v1", "headers": "x-api-key: sk-xxx", "routes": "{\\"list\\":{\\"method\\":\\"GET\\",\\"url\\":\\"/items\\"},\\"create\\":{\\"method\\":\\"POST\\",\\"url\\":\\"/items\\"}}"}</tool>
Composite (pipeline de skills) :
  <tool>{"create_skill": "pipeline", "description": "desc", "skill_type": "composite", "content": "[{\\"skill\\":\\"step1\\"},{\\"skill\\":\\"step2\\",\\"chain\\":true}]"}</tool>

Règles JSON content :
  • guillemet → \\"  |  saut de ligne → \\n  |  pas de vrai saut de ligne dans la valeur JSON
  • Après "[Skill créé]" : NE recrée PAS le skill, réponds ou teste-le.`,

    run_skill: `=== run_skill — Exécuter un skill ===
Sans args  : <tool>{"run_skill": "nom-du-skill"}</tool>
Avec args  : <tool>{"run_skill": "nom-du-skill", "args": "-Param valeur"}</tool>
HTTP multi : <tool>{"run_skill": "nom-api", "args": "{\\"action\\": \\"list\\"}"}</tool>
HTTP body  : <tool>{"run_skill": "nom-api", "args": "{\\"action\\": \\"create\\", \\"body\\": \\"{...}\\"}"}</tool>`,

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
POST : <tool>{"http_request": "POST", "url": "https://api.example.com/endpoint", "headers": "Authorization: Bearer sk-xxx\\nContent-Type: application/json", "body": "{\\"key\\": \\"value\\"}"}</tool>
Méthodes : GET POST PUT DELETE PATCH
Headers   : format "Clé: Valeur" séparés par \\n
Réponse   : HTTP <status>\\n<body>
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
Usage : <tool>{"save_plan": "# Tâche : Mon projet\\n\\n## État : EN COURS\\n\\n## Étapes\\n- [x] Étape 1\\n- [ ] Étape 2"}</tool>
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
Usage : <tool>{"call_mcp_tool": "nom-serveur", "tool": "nom-outil", "args": "{\\"param\\": \\"valeur\\"}"}</tool>`,

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
Usage : <tool>{"save_project_structure": "E:/monprojet/\\n├── index.html\\n├── style.css\\n└── script.js"}</tool>
• Sauvegarde la structure dans la base de données, liée à la conversation.
• Elle persiste : si l'utilisateur reprend la conversation plus tard, la structure est rechargée.
• Elle est injectée AUTOMATIQUEMENT dans le contexte système à chaque message — tu n'as pas besoin de la relire.
• Mets à jour après avoir créé/modifié des fichiers ou des dossiers importants.
• IMPORTANT : appelle save_project_structure dès que tu crées ou modifies la structure d'un projet.`,

    get_project_structure: `=== get_project_structure — Lire la structure mémorisée ===
Usage : <tool>{"get_project_structure": ""}</tool>
• Retourne la structure de projet actuellement mémorisée pour cette conversation.
• Note : la structure est déjà injectée dans le contexte — utilise get_project_structure seulement si tu veux la relire explicitement.`,
};

interface UseToolCallingOptions {
    streaming: boolean;
    toolRunning: boolean;
    setToolRunning: Dispatch<SetStateAction<boolean>>;
    messages: LlamaMessage[];
    modelPath: string;
    temperature: number;
    contextWindow: number;
    turboQuant: TurboQuantType;
    sampling: LlamaLaunchConfig["sampling"];
    thinkingEnabled: boolean;
    machineContext: string | null;
    systemPrompt: string;
    sendPrompt: (
        prompt: string,
        config: Partial<LlamaLaunchConfig>,
        attachments?: Attachment[],
        save?: boolean,
    ) => Promise<unknown>;
    updateLastAssistantContent: (content: string) => void;
    buildMachineContext: () => Promise<void>;
    chatModeRef: MutableRefObject<ChatMode>;
    prevStreamingRef: MutableRefObject<boolean>;
    lastToolSignatureRef: MutableRefObject<string | null>;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    jsonParseErrorCountRef: MutableRefObject<number>;
    convTitleSetRef: MutableRefObject<boolean>;
    dispatchToolRef: MutableRefObject<
        | ((parsed: Record<string, string>, cfg: Partial<LlamaLaunchConfig>, forceExecute?: boolean) => Promise<void>)
        | null
    >;
    setPendingQuestion: Dispatch<
        SetStateAction<{
            question: string;
            options: string[];
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPendingAgentPermission: Dispatch<
        SetStateAction<{
            reason: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPendingPlanConfirm: Dispatch<
        SetStateAction<{
            description: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPatchResults: Dispatch<SetStateAction<PatchResult[] | null>>;
    applyMode: (mode: ChatMode) => void;
    onOpenBrowserUrl?: (url: string) => void;
    onOpenTerminal?: () => void;
    onConversationTitleChanged?: () => void;
    conversationId: number | null;
    ttsEnabled: boolean;
    speakText: (text: string) => void;
    setTodoItems: Dispatch<SetStateAction<{ text: string; done: boolean }[]>>;
    setProjectStructure: Dispatch<SetStateAction<string>>;
    projectStructureRef: React.MutableRefObject<string>;
    setPlanContent: Dispatch<SetStateAction<string>>;
    planRef: React.MutableRefObject<string>;
}

export function useToolCalling({
    streaming,
    toolRunning,
    setToolRunning,
    messages,
    modelPath,
    temperature,
    contextWindow,
    turboQuant,
    sampling,
    thinkingEnabled,
    machineContext,
    systemPrompt,
    sendPrompt,
    updateLastAssistantContent,
    buildMachineContext,
    chatModeRef,
    prevStreamingRef,
    lastToolSignatureRef,
    lastToolWasErrorRef,
    jsonParseErrorCountRef,
    convTitleSetRef,
    dispatchToolRef,
    setPendingQuestion,
    setPendingAgentPermission,
    setPendingPlanConfirm,
    setPatchResults,
    applyMode,
    onOpenBrowserUrl,
    onOpenTerminal,
    onConversationTitleChanged,
    conversationId,
    ttsEnabled,
    speakText,
    setTodoItems,
    setProjectStructure,
    projectStructureRef,
    setPlanContent,
    planRef,
}: UseToolCallingOptions): void {
    // Tool calling : détecter <tool>{...}</tool> après fin du streaming
    // Scanne TOUS les <tool> dans le message et les exécute en séquence avant de renvoyer au LLM.
    useEffect(() => {
        if (prevStreamingRef.current && !streaming && !toolRunning) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const normalizedContent = normalizeToolTags(lastMsg.content);

                // ── Format <patch_file path="...">SEARCH:\n...\nREPLACE:\n...</patch_file> ──
                const pfTagMatches = [
                    ...normalizedContent.matchAll(/<patch_file\s+path="([^"]+)">([\s\S]*?)<\/patch_file>/g),
                ];
                if (pfTagMatches.length > 0) {
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };
                    setToolRunning(true);
                    (async () => {
                        const results: string[] = [];
                        for (const m of pfTagMatches) {
                            const filePath = m[1];
                            const body = m[2];
                            const searchMatch = body.match(
                                /SEARCH:[ \t]?\r?\n?([\s\S]*?)(?=\r?\n?[ \t]*REPLACE:[ \t]?\r?\n?)/,
                            );
                            const replaceMatch = body.match(/REPLACE:[ \t]?\r?\n?([\s\S]*)$/);
                            if (!searchMatch || !replaceMatch) {
                                lastToolWasErrorRef.current = true;
                                const missingPart = !searchMatch ? "SEARCH" : "REPLACE";
                                results.push(
                                    `✗ ${filePath} : bloc ${missingPart} manquant dans <patch_file>.\n` +
                                        `⚠️ Format obligatoire — exemple correct :\n` +
                                        `<patch_file path="${filePath}">\n` +
                                        `SEARCH:\n` +
                                        `texte exact à trouver (copié mot pour mot depuis le fichier)\n` +
                                        `REPLACE:\n` +
                                        `nouveau texte à mettre à la place\n` +
                                        `</patch_file>\n` +
                                        `RÈGLE : N'utilise JAMAIS ce tag sans bloc REPLACE — même pour montrer un aperçu.`,
                                );
                                continue;
                            }
                            const search = searchMatch[1].trim();
                            const replace = replaceMatch[1].trimEnd();
                            try {
                                const r = await invokeWithTimeout<string>(
                                    "patch_file",
                                    { path: filePath, search, replace },
                                    20000,
                                );
                                results.push(`✓ ${r}`);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                results.push(`✗ ${filePath} : ${err}`);
                            }
                        }
                        const allOk = results.every((r) => r.startsWith("✓"));
                        if (!allOk) lastToolWasErrorRef.current = true;
                        await sendPrompt(
                            `[Résultats patch_file]\n${results.join("\n")}\n` +
                                (allOk
                                    ? `Patch(es) appliqué(s) avec succès.`
                                    : `⛔ PATCH ÉCHOUÉ — PROTOCOLE OBLIGATOIRE :\n` +
                                      `  1. Appelle read_file sur le fichier pour voir le texte EXACT\n` +
                                      `  2. Compare caractère par caractère ton bloc SEARCH avec le texte réel\n` +
                                      `  3. Corrige le SEARCH et relance patch_file\n` +
                                      `INTERDIT : basculer vers write_file pour réécrire le fichier — la capitulation est une erreur grave.\n` +
                                      `INTERDIT : dire "le patching est un leurre" ou "je vais réécrire" — la cause est toujours un SEARCH incorrect.\n` +
                                      `Ne fais RIEN d'autre avant que le patch soit appliqué avec succès.`),
                            config,
                        );
                    })().finally(() => setToolRunning(false));
                    return;
                }

                // ── Format <write_file path="...">CONTENT</write_file> ────────────────
                const wfTagMatches = [
                    ...normalizedContent.matchAll(/<write_file\s+path="([^"]+)">([\/\s\S]*?)<\/write_file>/g),
                ];
                if (wfTagMatches.length > 0) {
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };
                    setToolRunning(true);
                    (async () => {
                        const results: string[] = [];
                        for (const m of wfTagMatches) {
                            const filePath = m[1];
                            const fileContent = m[2];
                            try {
                                const r = await invokeWithTimeout<string>(
                                    "write_file",
                                    { path: filePath, content: fileContent },
                                    20000,
                                );
                                results.push(`✓ ${r}`);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                results.push(`✗ ${filePath} : ${err}`);
                            }
                        }
                        await sendPrompt(
                            `[Fichiers écrits]\n${results.join("\n")}\n` +
                                `PROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`,
                            config,
                        );
                    })().finally(() => setToolRunning(false));
                    return;
                }

                // Extraire TOUS les blocs <tool> dans l'ordre
                const allToolMatches = [...normalizedContent.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)];
                const toolMatch = allToolMatches.length > 0 ? allToolMatches[0] : null;
                if (toolMatch) {
                    let parsed: Record<string, string> | null = null;
                    let parseError: unknown = null;
                    try {
                        parsed = JSON.parse(sanitizeLlmJson(toolMatch[1]));
                    } catch (jsonErr) {
                        parseError = jsonErr;
                        if (toolMatch[1].includes('"write_file"')) {
                            const extracted = extractWriteFileTool(toolMatch[1]);
                            if (extracted) {
                                parsed = extracted as unknown as Record<string, string>;
                                parseError = null;
                            }
                        }
                    }
                    if (parseError !== null || parsed === null) {
                        jsonParseErrorCountRef.current += 1;
                        const config: Partial<LlamaLaunchConfig> = {
                            modelPath,
                            temperature,
                            contextWindow,
                            turboQuant,
                            sampling,
                            thinkingEnabled,
                            systemPrompt: machineContext
                                ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                                : systemPrompt,
                        };
                        setToolRunning(true);
                        let errMsg: string;
                        const isWriteFile = toolMatch[1].includes('"write_file"');
                        const isBatchRename = toolMatch[1].includes('"batch_rename"');
                        const isReadPdfBatch = toolMatch[1].includes('"read_pdf_batch"');
                        if (jsonParseErrorCountRef.current <= 2) {
                            if (isBatchRename) {
                                errMsg =
                                    `[Erreur batch_rename — JSON invalide ou trop long]\n` +
                                    `Le JSON de ton batch_rename est mal formé (${parseError}).\n` +
                                    `SOLUTION OBLIGATOIRE : Divise les renommages en 2 appels séparés de 15 fichiers max :\n` +
                                    `Appel 1 → <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ← 15 premiers\n` +
                                    `Appel 2 → <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ← 15 suivants\n` +
                                    `⚠️ Format TABLEAU NATIF obligatoire — PAS de guillemets supplémentaires autour du tableau.\n` +
                                    `⚠️ Aucun guillemet à échapper dans les chemins de fichiers.`;
                            } else if (isReadPdfBatch) {
                                errMsg =
                                    `[Erreur read_pdf_batch — JSON invalide]\n` +
                                    `Le JSON est mal formé (${parseError}).\n` +
                                    `SOLUTION : Utilise un tableau natif JSON (PAS une chaîne sérialisée) :\n` +
                                    `<tool>{"read_pdf_batch": ["E:/chemin/fichier1.pdf", "E:/chemin/fichier2.pdf", ...]}</tool>\n` +
                                    `⚠️ Maximum 30 chemins par appel. Si > 30 fichiers, fais 2 appels séparés.`;
                            } else if (isWriteFile) {
                                errMsg =
                                    `[Erreur write_file — FORMAT TAG OBLIGATOIRE]\n` +
                                    `ARRÊTE toute tentative JSON pour write_file. Utilise EXACTEMENT ce format (commence par < pas par {) :\n` +
                                    `\n` +
                                    `<write_file path="D:/projetavenire/index.html">\n` +
                                    `<!DOCTYPE html>\n` +
                                    `<html>...contenu complet ici...</html>\n` +
                                    `</write_file>\n` +
                                    `\n` +
                                    `⚠️ La balise DOIT commencer par le caractère < (chevron), PAS par { (accolade).\n` +
                                    `⚠️ NE pas envelopper dans <tool>...</tool> — le format TAG est DIRECT, sans wrapper.\n` +
                                    `Adapte le path avec le vrai chemin du fichier à créer.`;
                            } else {
                                errMsg =
                                    `[Erreur JSON dans <tool>] Le JSON est invalide (${parseError}).\n` +
                                    `Cause : les guillemets dans le champ content ne sont PAS echappes.\n` +
                                    `Regles absolues :\n` +
                                    `  1. Remplace CHAQUE guillemet dans content par backslash+guillemet (\\\")\n` +
                                    `  2. Remplace chaque saut de ligne par backslash+n (\\n)\n` +
                                    `  3. NE mets AUCUN vrai saut de ligne dans la valeur JSON\n` +
                                    `Exemple valide : {"create_skill":"x","content":"Write-Host \\\"bonjour\\\""}\n` +
                                    `Reemet le <tool> avec le JSON corrige.`;
                            }
                        } else {
                            jsonParseErrorCountRef.current = 0;
                            if (isBatchRename) {
                                errMsg =
                                    `[Erreur batch_rename persistante — SPLIT OBLIGATOIRE]\n` +
                                    `Impossible de parser le JSON. RÈGLE : max 10 fichiers par appel batch_rename.\n` +
                                    `Génère autant d'appels <tool>{"batch_rename": [...]}</tool> que nécessaire (10 par appel).`;
                            } else if (isReadPdfBatch) {
                                errMsg =
                                    `[Erreur read_pdf_batch persistante — SPLIT OBLIGATOIRE]\n` +
                                    `Impossible de parser le JSON. Réduis à 10 chemins maximum par appel.\n` +
                                    `<tool>{"read_pdf_batch": ["chemin1.pdf", ..., "chemin10.pdf"]}</tool>`;
                            } else if (isWriteFile) {
                                errMsg =
                                    `[ECHEC REPEATED write_file — FALLBACK CMD OBLIGATOIRE]\n` +
                                    `Le format TAG n'a pas fonctionné. Ecris le fichier via PowerShell cmd à la place :\n` +
                                    `\n` +
                                    `<tool>{"cmd": "New-Item -ItemType Directory -Force 'D:/projetavenire'; Set-Content -Path 'D:/projetavenire/index.html' -Encoding UTF8 -Value '<!DOCTYPE html><html><head><title>Page</title></head><body><h1>Pepe-Studio</h1></body></html>'"}</tool>\n` +
                                    `\n` +
                                    `Adapte le -Path et le -Value avec le vrai contenu. NE retente PAS write_file.`;
                            } else {
                                errMsg =
                                    `[Erreur JSON persistante apres plusieurs tentatives] Nouvelle strategie OBLIGATOIRE :\n` +
                                    `Remplace TOUS les guillemets doubles dans ton script PowerShell par des apostrophes simples (').\n` +
                                    `PowerShell accepte les deux. Exemple : Write-Host 'Bonjour' au lieu de Write-Host "Bonjour".\n` +
                                    `Reemet le <tool> create_skill avec uniquement des apostrophes simples dans content.`;
                            }
                        }
                        sendPrompt(errMsg, config).finally(() => setToolRunning(false));
                        return;
                    }
                    jsonParseErrorCountRef.current = 0;

                    setToolRunning(true);
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };

                    const dispatch = async (
                        parsedTool: Record<string, string>,
                        cfg: Partial<LlamaLaunchConfig>,
                        forceExecute = false,
                    ): Promise<void> => {
                        /** Injecte une directive d'auto-correction si la sortie contient des marqueurs d'erreur. */
                        const withAutoCritique = (output: string, toolName: string): string => {
                            const stripped = output.replace(/"(?:[^"\\]|\\.)*"/g, '""');
                            const isError =
                                /\b(error|exception|traceback|failed|erreur|introuvable|not found|cannot|refused|access denied|permission denied|syntax error|nameerror|typeerror|valueerror|referenceerror|cannot find|no such file|module not found|is not defined|unexpected token)\b/i.test(
                                    stripped,
                                );
                            if (!isError) return output;
                            return (
                                output +
                                `\n\n[⚠ AUTO-CRITIQUE] La sortie de "${toolName}" contient une erreur. ` +
                                `Analyse la cause racine et applique un correctif IMMÉDIATEMENT ` +
                                `(patch_skill / patch_file / cmd selon le contexte). ` +
                                `Ne répète PAS la même action. Si c'est un skill, lis-le d'abord avec read_skill.`
                            );
                        };
                        // ── Détection de boucle : même tool call deux fois de suite ──
                        const toolSignature = JSON.stringify(parsedTool);
                        if (toolSignature === lastToolSignatureRef.current && !lastToolWasErrorRef.current) {
                            await sendPrompt(
                                `[Système] Action bloquée : tu viens d'exécuter exactement ce même outil. Stop la boucle et réponds directement à l'utilisateur.`,
                                cfg,
                            );
                            return;
                        }
                        lastToolSignatureRef.current = toolSignature;
                        lastToolWasErrorRef.current = false;

                        // ── ask_user (question interactive) ──────────────────
                        if (parsedTool.ask_user !== undefined) {
                            let options: string[] = [];
                            try {
                                const raw = parsedTool.options;
                                options = Array.isArray(raw) ? raw : JSON.parse(raw ?? "[]");
                            } catch {
                                options = [];
                            }
                            setPendingQuestion({ question: parsedTool.ask_user, options, config: cfg });
                            return;
                        }

                        // ── set_mode (l'IA change de mode) ───────────────────
                        if (parsedTool.set_mode !== undefined) {
                            const requested = parsedTool.set_mode as ChatMode;
                            if (requested === "agent" && chatModeRef.current !== "agent") {
                                setPendingAgentPermission({
                                    reason:
                                        parsedTool.reason ??
                                        "L'IA souhaite passer en mode Agent pour exécuter des actions.",
                                    parsed: parsedTool,
                                    config: cfg,
                                });
                                return;
                            }
                            applyMode(requested);
                            await sendPrompt(`[Système] Mode changé : ${requested}`, cfg);
                            return;
                        }

                        // ── request_agent_mode ───────────────────────────────
                        if (parsedTool.request_agent_mode !== undefined) {
                            setPendingAgentPermission({
                                reason: parsedTool.request_agent_mode || "L'IA souhaite passer en mode Agent.",
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }

                        // ── get_tool_doc (lookup documentation — pas gatable) ──
                        if (parsedTool.get_tool_doc !== undefined) {
                            const query = String(parsedTool.get_tool_doc).toLowerCase().trim();
                            const exactMatch = TOOL_DOCS[query];
                            if (exactMatch) {
                                await sendPrompt(`[Documentation : ${query}]\n\n${exactMatch}`, cfg);
                            } else {
                                // Recherche partielle : tous les outils dont le nom contient la requête
                                const matches = Object.entries(TOOL_DOCS).filter(([key]) =>
                                    key.toLowerCase().includes(query),
                                );
                                if (matches.length === 1) {
                                    await sendPrompt(`[Documentation : ${matches[0][0]}]\n\n${matches[0][1]}`, cfg);
                                } else if (matches.length > 1) {
                                    const combined = matches
                                        .map(([, doc]) => doc)
                                        .join("\n\n" + "─".repeat(60) + "\n\n");
                                    await sendPrompt(
                                        `[Documentation — ${matches.length} outils trouvés pour "${parsedTool.get_tool_doc}"]\n\n${combined}`,
                                        cfg,
                                    );
                                } else {
                                    const available = Object.keys(TOOL_DOCS).join(", ");
                                    await sendPrompt(
                                        `[get_tool_doc] Aucun outil trouvé pour "${parsedTool.get_tool_doc}".\n\nOutils documentés :\n${available}`,
                                        cfg,
                                    );
                                }
                            }
                            return;
                        }

                        // ── set_todo (IA crée/remplace la todo list) ─────────
                        if (parsedTool.set_todo !== undefined) {
                            try {
                                let items: string[] = [];
                                const raw = parsedTool.set_todo;
                                if (Array.isArray(raw)) {
                                    items = raw.map(String);
                                } else if (typeof raw === "string") {
                                    try {
                                        const parsed = JSON.parse(raw);
                                        items = Array.isArray(parsed) ? parsed.map(String) : [raw];
                                    } catch {
                                        items = [raw];
                                    }
                                }
                                if (items.length === 0) {
                                    setTodoItems([]);
                                    await sendPrompt(`[Todo] Liste vidée.`, cfg);
                                } else {
                                    setTodoItems(items.map((text) => ({ text, done: false })));
                                    await sendPrompt(
                                        `[Todo] Liste créée avec ${items.length} tâche(s) :\n${items.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}\nMarque chaque tâche terminée avec check_todo quand tu l'as accomplie.`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur set_todo]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── check_todo (IA marque une/plusieurs tâches faites) ──
                        if (parsedTool.check_todo !== undefined) {
                            const val = parsedTool.check_todo;
                            setTodoItems((prev) => {
                                if (String(val).toLowerCase() === "all") {
                                    return prev.map((t) => ({ ...t, done: true }));
                                } else {
                                    const idx = Number(val);
                                    return prev.map((t, i) => (i === idx ? { ...t, done: true } : t));
                                }
                            });
                            await sendPrompt(
                                `[Todo] Tâche ${String(val) === "all" ? "toutes" : `n°${Number(val) + 1}`} marquée(s) ✓. CONTINUE IMMÉDIATEMENT avec la prochaine tâche sans attendre de confirmation utilisateur.`,
                                cfg,
                            );
                            return;
                        }

                        // ── save_project_structure (IA mémorise la structure) ──
                        if (parsedTool.save_project_structure !== undefined) {
                            const structure = String(parsedTool.save_project_structure);
                            setProjectStructure(structure);
                            if (conversationId) {
                                invokeWithTimeout("save_project_structure", { conversationId, structure }, 5000).catch(
                                    () => {},
                                );
                            }
                            await sendPrompt(
                                `[Structure projet sauvegardée] La structure est mémorisée pour cette conversation et sera rechargée à la prochaine reprise.`,
                                cfg,
                            );
                            return;
                        }

                        // ── get_project_structure (IA relit la structure) ─────
                        if (parsedTool.get_project_structure !== undefined) {
                            const current = projectStructureRef.current;
                            if (current.trim()) {
                                await sendPrompt(`[Structure du projet mémorisée]\n\`\`\`\n${current}\n\`\`\``, cfg);
                            } else {
                                await sendPrompt(
                                    `[Structure du projet] Aucune structure mémorisée pour cette conversation. Utilise save_project_structure pour en enregistrer une.`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ── get_plan (lecture pure — pas gatable) ────────────
                        if (parsedTool.get_plan !== undefined) {
                            try {
                                let content = planRef.current;
                                if (!content && conversationId) {
                                    content = await invokeWithTimeout<string>(
                                        "get_conversation_plan",
                                        { conversationId },
                                        5000,
                                    );
                                    if (content) setPlanContent(content);
                                }
                                if (!content) {
                                    await sendPrompt(
                                        `[PLAN.md] Aucun plan pour cette conversation. Crée-en un avec save_plan.`,
                                        cfg,
                                    );
                                } else {
                                    const firstLine = content.split("\n")[0] ?? "";
                                    await sendPrompt(
                                        `[PLAN.md — Plan actuel (titre : ${firstLine})]\n\`\`\`markdown\n${content}\n\`\`\``,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_plan]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── get_terminal_history (lecture pure — pas gatable) ──
                        if (parsedTool.get_terminal_history !== undefined) {
                            try {
                                const entries = await invokeWithTimeout<
                                    { command: string; output: string; timestamp: string }[]
                                >(
                                    "get_terminal_history",
                                    { terminalId: String(parsedTool.get_terminal_history) },
                                    5000,
                                );
                                if (entries.length === 0) {
                                    await sendPrompt(
                                        `[Historique terminal] Aucune commande exécutée dans ce terminal.`,
                                        cfg,
                                    );
                                } else {
                                    const lines = entries
                                        .map(
                                            (e, i) =>
                                                `[${i + 1}] ${e.timestamp}\n$ ${e.command}\n${e.output.slice(0, 500)}${e.output.length > 500 ? "\n...(tronqué)" : ""}`,
                                        )
                                        .join("\n\n");
                                    await sendPrompt(
                                        `[Historique terminal \`${parsedTool.get_terminal_history}\`]\n${lines}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_terminal_history]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── get_dev_server_info (lecture pure — pas gatable) ──
                        if (parsedTool.get_dev_server_info !== undefined) {
                            try {
                                const info = await invokeWithTimeout<Record<string, string>>(
                                    "get_dev_server_info",
                                    {},
                                    5000,
                                );
                                const status = info.running === "true" ? "🟢 Actif" : "🔴 Arrêté";
                                await sendPrompt(
                                    `[Serveur dev] Statut : ${status}\nPort : ${info.port || "(aucun)"}\nDossier : ${info.base_dir || "(aucun)"}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_dev_server_info]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── list_terminals (lecture pure — pas gatable) ───────
                        if (parsedTool.list_terminals !== undefined) {
                            try {
                                const list = await invokeWithTimeout<
                                    { id: string; name: string; cwd: string; entry_count: number }[]
                                >("list_terminals", {}, 5000);
                                if (list.length === 0) {
                                    await sendPrompt(
                                        "[Terminaux] Aucun terminal ouvert. Crée-en un avec create_terminal.",
                                        cfg,
                                    );
                                } else {
                                    const lines = list
                                        .map(
                                            (t) =>
                                                `  - ${t.id}  "${t.name}"  |  ${t.cwd}  (${t.entry_count} cmd${t.entry_count !== 1 ? "s" : ""})`,
                                        )
                                        .join("\n");
                                    await sendPrompt(`[Terminaux ouverts]\n${lines}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur list_terminals]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── read_file (lecture pure — pas gatable) ────────────────
                        if (parsedTool.read_file) {
                            try {
                                const content = await invokeWithTimeout<string>(
                                    "read_file_content",
                                    { path: parsedTool.read_file },
                                    15000,
                                );
                                await sendPrompt(
                                    `[Contenu de ${parsedTool.read_file}]\n\`\`\`\n${content}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur lecture fichier]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── list_folder_pdfs — liste les PDFs d'un dossier ────────
                        if (parsedTool.list_folder_pdfs) {
                            try {
                                const recursive = parsedTool.recursive === "true";
                                const files = await invokeWithTimeout<string[]>(
                                    "list_folder_pdfs",
                                    { folder: parsedTool.list_folder_pdfs, recursive },
                                    15000,
                                );
                                if (files.length === 0) {
                                    await sendPrompt(
                                        `[list_folder_pdfs] Aucun fichier PDF trouvé dans : ${parsedTool.list_folder_pdfs}`,
                                        cfg,
                                    );
                                } else {
                                    await sendPrompt(
                                        `[PDFs dans ${parsedTool.list_folder_pdfs}] ${files.length} fichier(s) :\n${files.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur list_folder_pdfs]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── read_pdf — lit et extrait le texte d'un PDF sur disque ──
                        if (parsedTool.read_pdf) {
                            try {
                                const base64 = await invokeWithTimeout<string>(
                                    "read_pdf_bytes",
                                    { path: parsedTool.read_pdf },
                                    30000,
                                );
                                const pages = await extractPdfPagesFromBase64(base64);
                                if (pages.length === 0) {
                                    await sendPrompt(
                                        `[read_pdf] Le PDF "${parsedTool.read_pdf}" ne contient aucun texte extractible (PDF image ou protégé).`,
                                        cfg,
                                    );
                                } else {
                                    const text = pages.map((p) => `[Page ${p.pageNum}]\n${p.text}`).join("\n\n");
                                    await sendPrompt(
                                        `[Contenu PDF : ${parsedTool.read_pdf}] (${pages.length} page(s))\n\n${text}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── read_pdf_brief — 1ère page uniquement, max 2000 car ────
                        if (parsedTool.read_pdf_brief) {
                            try {
                                const base64 = await invokeWithTimeout<string>(
                                    "read_pdf_bytes",
                                    { path: parsedTool.read_pdf_brief },
                                    30000,
                                );
                                const pages = await extractPdfPagesFromBase64(base64);
                                if (pages.length === 0) {
                                    await sendPrompt(
                                        `[read_pdf_brief] ${parsedTool.read_pdf_brief} : aucun texte extractible.`,
                                        cfg,
                                    );
                                } else {
                                    const text = pages[0].text.slice(0, 2000);
                                    await sendPrompt(`[PDF page 1 : ${parsedTool.read_pdf_brief}]\n${text}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf_brief]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── read_pdf_batch — lit N PDFs (1ère page) en un seul appel IPC ──
                        if (parsedTool.read_pdf_batch) {
                            try {
                                let paths: string[];
                                if (Array.isArray(parsedTool.read_pdf_batch)) {
                                    // L'IA a généré un tableau natif JSON
                                    paths = parsedTool.read_pdf_batch as string[];
                                } else {
                                    try {
                                        paths = JSON.parse(parsedTool.read_pdf_batch);
                                    } catch {
                                        lastToolWasErrorRef.current = true;
                                        await sendPrompt(
                                            `[Erreur read_pdf_batch] JSON invalide. Format attendu : ["chemin1.pdf", "chemin2.pdf", ...]\nLes guillemets internes doivent être échappés avec \\\\.`,
                                            cfg,
                                        );
                                        return;
                                    }
                                }
                                type PdfBatchItem = {
                                    path: string;
                                    base64: string | null;
                                    error: string | null;
                                };
                                const items = await invokeWithTimeout<PdfBatchItem[]>(
                                    "read_pdf_batch",
                                    { paths },
                                    60000,
                                );
                                const parts: string[] = [];
                                for (const item of items) {
                                    const name = item.path.split(/[\\/]/).pop() ?? item.path;
                                    if (item.error || !item.base64) {
                                        parts.push(`[${name}] Erreur: ${item.error ?? "base64 vide"}`);
                                        continue;
                                    }
                                    try {
                                        const pages = await extractPdfPagesFromBase64(item.base64);
                                        const text = pages.length > 0 ? pages[0].text.slice(0, 2000) : "(aucun texte)";
                                        parts.push(`[PDF: ${name}]\n${text}`);
                                    } catch (e) {
                                        parts.push(`[${name}] Erreur extraction: ${e}`);
                                    }
                                }
                                await sendPrompt(
                                    `[read_pdf_batch] ${items.length} fichier(s) analysés :\n\n${parts.join("\n\n---\n\n")}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf_batch]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── batch_rename — renommer plusieurs fichiers en un appel ──
                        if (parsedTool.batch_rename) {
                            try {
                                let entries: Array<{ from: string; to: string }>;
                                if (Array.isArray(parsedTool.batch_rename)) {
                                    // L'IA a généré un tableau natif JSON
                                    entries = parsedTool.batch_rename as Array<{ from: string; to: string }>;
                                } else {
                                    try {
                                        entries = JSON.parse(parsedTool.batch_rename);
                                    } catch {
                                        lastToolWasErrorRef.current = true;
                                        await sendPrompt(
                                            `[Erreur batch_rename] JSON invalide. Format attendu : [{"from": "chemin/ancien.pdf", "to": "nouveau.pdf"}, ...]\nLes guillemets internes doivent être échappés avec \\\\.`,
                                            cfg,
                                        );
                                        return;
                                    }
                                }
                                type RenameResult = {
                                    from: string;
                                    to: string;
                                    success: boolean;
                                    error: string | null;
                                };
                                const results = await invokeWithTimeout<RenameResult[]>(
                                    "batch_rename_files",
                                    { renames: entries },
                                    30000,
                                );
                                const successCount = results.filter((r) => r.success).length;
                                const lines = results.map((r) =>
                                    r.success
                                        ? `  ✓ ${r.from.split("/").pop()} → ${r.to.split("/").pop()}`
                                        : `  ✗ ${r.from.split("/").pop()} : ${r.error}`,
                                );
                                await sendPrompt(
                                    `[batch_rename] ${successCount}/${results.length} fichiers renommés avec succès.\n${lines.join("\n")}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur batch_rename]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── Garde de mode : outils d'action bloqués hors mode agent ──
                        const isActionTool = !!(
                            parsedTool.create_skill ||
                            parsedTool.run_skill ||
                            parsedTool.cmd ||
                            parsedTool.command ||
                            parsedTool.http_request ||
                            parsedTool.write_file ||
                            parsedTool.create_mcp_server ||
                            parsedTool.start_mcp_server ||
                            parsedTool.call_mcp_tool ||
                            parsedTool.open_browser !== undefined ||
                            parsedTool.start_dev_server !== undefined ||
                            parsedTool.stop_dev_server !== undefined ||
                            parsedTool.get_browser_errors !== undefined ||
                            parsedTool.save_image !== undefined ||
                            parsedTool.download_image !== undefined ||
                            parsedTool.scrape_url !== undefined ||
                            parsedTool.search_web !== undefined ||
                            parsedTool["context7-search"] !== undefined ||
                            parsedTool["context7-docs"] !== undefined ||
                            parsedTool.save_plan !== undefined ||
                            parsedTool.create_terminal !== undefined ||
                            parsedTool.terminal_exec !== undefined ||
                            parsedTool.terminal_start_interactive !== undefined ||
                            parsedTool.terminal_send_stdin !== undefined ||
                            parsedTool.close_terminal !== undefined
                        );
                        if (!forceExecute && isActionTool && chatModeRef.current === "ask") {
                            const toolDesc =
                                parsedTool.cmd ??
                                parsedTool.command ??
                                parsedTool.create_skill ??
                                parsedTool.run_skill ??
                                parsedTool.http_request ??
                                parsedTool.read_file ??
                                parsedTool.write_file ??
                                parsedTool.create_mcp_server ??
                                parsedTool.start_mcp_server ??
                                parsedTool.call_mcp_tool ??
                                parsedTool.open_browser ??
                                parsedTool.start_dev_server ??
                                "action";
                            setPendingAgentPermission({
                                reason: `Je veux exécuter : **${toolDesc}**\nAutoriser en passant en mode Agent ?`,
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }
                        if (!forceExecute && isActionTool && chatModeRef.current === "plan") {
                            const toolDesc =
                                parsedTool.cmd ??
                                parsedTool.command ??
                                parsedTool.create_skill ??
                                parsedTool.run_skill ??
                                parsedTool.http_request ??
                                parsedTool.write_file ??
                                parsedTool.create_mcp_server ??
                                parsedTool.start_mcp_server ??
                                parsedTool.call_mcp_tool ??
                                parsedTool.open_browser ??
                                parsedTool.start_dev_server ??
                                "action";
                            setPendingPlanConfirm({
                                description: `**Plan** : je vais exécuter l'action suivante :\n\`${toolDesc}\`\n\nConfirmer l'exécution ?`,
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }

                        // ── create_skill ─────────────────────────────────────
                        if (parsedTool.create_skill) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "create_skill",
                                    {
                                        name: parsedTool.create_skill,
                                        description: parsedTool.description ?? "",
                                        content: parsedTool.content ?? "",
                                        skillType: parsedTool.skill_type ?? null,
                                        method: parsedTool.method ?? null,
                                        url: parsedTool.url ?? null,
                                        headersTemplate: parsedTool.headers ?? null,
                                        defaultBody: parsedTool.default_body ?? null,
                                        baseUrl: parsedTool.base_url ?? null,
                                        routes: parsedTool.routes ?? null,
                                    },
                                    20000,
                                );
                                await buildMachineContext();
                                const skillTypeLabel =
                                    parsedTool.skill_type === "http"
                                        ? "HTTP"
                                        : parsedTool.skill_type === "python"
                                          ? "Python"
                                          : parsedTool.skill_type === "nodejs"
                                            ? "Node.js"
                                            : parsedTool.skill_type === "composite"
                                              ? "Composite"
                                              : "PS1";
                                await sendPrompt(
                                    `[Skill ${skillTypeLabel} créé avec succès] "${parsedTool.create_skill}" est sauvegardé et prêt.\n${result}\n\n` +
                                        `✅ Tu peux maintenant :\n` +
                                        `  - Le tester avec \`run_skill\`\n` +
                                        `  - Ou répondre à l'utilisateur que le skill est disponible\n` +
                                        `⚠️ NE crée PAS ce skill à nouveau (il est déjà sauvegardé dans le fichier).`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur création skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── run_skill ─────────────────────────────────────────
                        if (parsedTool.run_skill) {
                            try {
                                const output = await invokeWithTimeout<string>(
                                    "run_skill",
                                    { name: parsedTool.run_skill, args: parsedTool.args ?? null },
                                    60000,
                                );
                                await sendPrompt(
                                    `[Résultat du skill \`${parsedTool.run_skill}\`]\n\`\`\`\n${withAutoCritique(output, `run_skill:${parsedTool.run_skill}`)}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur d'exécution du skill \`${parsedTool.run_skill}\`]\n\`\`\`\n${err}\n\`\`\`\n\n` +
                                        `Pour corriger le skill, utilise create_skill avec le même nom et le contenu corrigé.`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ── search_conversation ───────────────────────────────
                        if (parsedTool.search_conversation !== undefined) {
                            try {
                                const results = await invokeWithTimeout<
                                    { conversation_id: number; day_label: string; role: string; content: string }[]
                                >("search_conversation_messages", { query: parsedTool.search_conversation }, 20000);
                                if (results.length === 0) {
                                    await sendPrompt(
                                        `[Mémoire] Aucun message trouvé pour : "${parsedTool.search_conversation}"`,
                                        cfg,
                                    );
                                } else {
                                    const groups = new Map<
                                        number,
                                        { day_label: string; msgs: { role: string; content: string }[] }
                                    >();
                                    for (const m of results) {
                                        if (!groups.has(m.conversation_id))
                                            groups.set(m.conversation_id, { day_label: m.day_label, msgs: [] });
                                        groups.get(m.conversation_id)!.msgs.push({ role: m.role, content: m.content });
                                    }
                                    const parts: string[] = [];
                                    for (const [id, g] of groups) {
                                        parts.push(`\n── Conv #${id} — ${g.day_label} ──`);
                                        for (const msg of g.msgs) {
                                            parts.push(`${msg.role === "user" ? "👤" : "🤖"} ${msg.content}`);
                                        }
                                    }
                                    await sendPrompt(
                                        `[Mémoire — "${parsedTool.search_conversation}"]${parts.join("\n")}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur mémoire]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── save_plan (checkpoint / mise à jour du plan) ──────
                        if (parsedTool.save_plan !== undefined) {
                            try {
                                const content = String(parsedTool.save_plan);
                                if (conversationId) {
                                    await invokeWithTimeout<string>(
                                        "save_conversation_plan",
                                        { conversationId, content },
                                        5000,
                                    );
                                    setPlanContent(content);
                                    await sendPrompt(`[PLAN.md] Plan sauvegardé pour cette conversation.`, cfg);
                                } else {
                                    await sendPrompt(`[Erreur save_plan] Aucune conversation active.`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur save_plan]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── create_terminal ───────────────────────────────────
                        if (parsedTool.create_terminal !== undefined) {
                            onOpenTerminal?.();
                            try {
                                const info = await invokeWithTimeout<{ id: string; name: string; cwd: string }>(
                                    "create_terminal",
                                    { name: parsedTool.create_terminal || null, cwd: parsedTool.cwd ?? null },
                                    10000,
                                );
                                await sendPrompt(
                                    `[Terminal créé]\n` +
                                        `⚠️ ID RÉEL (obligatoire pour toutes les commandes suivantes) : "${info.id}"\n` +
                                        `Nom : "${info.name}" | Répertoire : ${info.cwd}\n` +
                                        `\n` +
                                        `Tu DOIS utiliser l'ID "${info.id}" (pas le nom) dans tous les appels suivants.\n` +
                                        `Commandes disponibles :\n` +
                                        `  • terminal_exec         → commandes ponctuelles non-interactives\n` +
                                        `  • terminal_start_interactive → SSH, REPL et tout processus interactif\n` +
                                        `Exemple SSH :\n` +
                                        `  <tool>{"terminal_start_interactive": "ssh user@host", "terminal_id": "${info.id}"}</tool>`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur create_terminal]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── terminal_exec ─────────────────────────────────────
                        if (parsedTool.terminal_exec !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_exec] Paramètre terminal_id manquant. Utilise list_terminals pour voir les IDs disponibles.",
                                    cfg,
                                );
                                return;
                            }
                            try {
                                const _cmd = String(parsedTool.terminal_exec);
                                const isLongRunning =
                                    /^(npx\s+create-|yarn\s+create\s+|pnpm\s+create\s+|cargo\s+new\s+|dotnet\s+new\s+|ng\s+new\s+)/i.test(
                                        _cmd.trim(),
                                    );
                                const execTimeout = isLongRunning ? 300000 : 60000;
                                const result = await invokeWithTimeout<{
                                    terminal_id: string;
                                    output: string;
                                    new_cwd: string;
                                }>("terminal_exec", { terminalId: tid, command: _cmd }, execTimeout);
                                const feedback = withAutoCritique(result.output, `terminal_exec:${tid}`);
                                await sendPrompt(
                                    `[Terminal "${tid}" | cwd: ${result.new_cwd}]\n\`\`\`\n${feedback}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_exec "${tid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── close_terminal ────────────────────────────────────
                        if (parsedTool.close_terminal !== undefined) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "close_terminal",
                                    { terminalId: String(parsedTool.close_terminal) },
                                    5000,
                                );
                                await sendPrompt(`[Terminal] ${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur close_terminal]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── terminal_start_interactive ────────────────────────
                        if (parsedTool.terminal_start_interactive !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_start_interactive] Paramètre terminal_id manquant.\n" +
                                        "Flux correct :\n" +
                                        "  1. create_terminal pour obtenir un terminal_id (format: term-XXXXXXXXXX)\n" +
                                        "  2. terminal_start_interactive avec cet ID EXACT (ex: term-1776174852395)",
                                    cfg,
                                );
                                return;
                            }
                            // Détecter si l'IA a passé un nom (sans "term-") au lieu d'un ID
                            if (!tid.startsWith("term-")) {
                                // Tenter de résoudre via list_terminals
                                try {
                                    const tlist = await invokeWithTimeout<{ id: string; name: string }[]>(
                                        "list_terminals",
                                        {},
                                        5000,
                                    );
                                    const match = tlist.find((t) => t.name === tid || t.id === tid);
                                    if (!match) {
                                        await sendPrompt(
                                            `[Erreur terminal_start_interactive] "${tid}" est un NOM, pas un ID.\n` +
                                                `L'ID doit commencer par "term-" (ex: term-1776174852395).\n` +
                                                `Terminaux disponibles :\n` +
                                                tlist.map((t) => `  • "${t.id}" (nom: ${t.name})`).join("\n"),
                                            cfg,
                                        );
                                        return;
                                    }
                                    // Corriger silencieusement et continuer avec le bon ID
                                    parsedTool.terminal_id = match.id;
                                } catch {
                                    await sendPrompt(
                                        `[Erreur terminal_start_interactive] "${tid}" n'est pas un ID valide (doit commencer par "term-").\n` +
                                            `Utilise create_terminal pour créer un terminal et récupère son ID.`,
                                        cfg,
                                    );
                                    return;
                                }
                            }
                            const realTid = String(parsedTool.terminal_id);
                            // Réinitialiser le curseur de lecture pour cette nouvelle session
                            terminalReadCursors.delete(realTid);
                            try {
                                await invokeWithTimeout<void>(
                                    "terminal_start_interactive",
                                    { terminalId: realTid, command: String(parsedTool.terminal_start_interactive) },
                                    8000,
                                );
                                await sendPrompt(
                                    `[Processus interactif démarré dans le terminal "${realTid}"]\n` +
                                        `Commande : ${parsedTool.terminal_start_interactive}\n` +
                                        `⏳ L'utilisateur entre son mot de passe directement dans le terminal xterm.js.\n` +
                                        `✅ Dès que l'utilisateur confirme être connecté (ou que tu vois un prompt distant), envoie les commandes avec terminal_send_stdin.\n` +
                                        `   La sortie de chaque commande te sera AUTOMATIQUEMENT retournée après ~2.5 s.\n` +
                                        `   Exemple : <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "${realTid}"}</tool>\n` +
                                        `⚠️ Ne pas envoyer de commandes AVANT que l'utilisateur soit connecté (mot de passe saisi).`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_start_interactive "${realTid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── terminal_send_stdin ───────────────────────────────
                        if (parsedTool.terminal_send_stdin !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_send_stdin] Paramètre terminal_id manquant.\n" +
                                        "Utilise list_terminals pour obtenir l'ID du terminal actif.",
                                    cfg,
                                );
                                return;
                            }
                            const input = String(parsedTool.terminal_send_stdin);

                            // Lire la taille du buffer AVANT d'envoyer la commande
                            let cursorBefore = terminalReadCursors.get(tid) ?? 0;
                            try {
                                const histBefore = await invokeWithTimeout<{ output: string }[]>(
                                    "get_terminal_history",
                                    { terminalId: tid },
                                    5000,
                                );
                                const liveBefore = histBefore[histBefore.length - 1]?.output ?? "";
                                // Supprimer les ANSI pour calculer la longueur texte réelle
                                cursorBefore = stripAnsi(liveBefore).length;
                            } catch {
                                /* si ça échoue, on prend le curseur mémorisé */
                            }

                            try {
                                // Envoyer la commande au PTY
                                await invokeWithTimeout<void>("terminal_send_stdin", { terminalId: tid, input }, 5000);

                                // Attendre la réponse (2.5 s max pour les commandes rapides)
                                await new Promise((r) => setTimeout(r, 2500));

                                // Lire la sortie accumulée depuis le curseur
                                const histAfter = await invokeWithTimeout<{ command: string; output: string }[]>(
                                    "get_terminal_history",
                                    { terminalId: tid },
                                    5000,
                                );
                                const rawOutput = histAfter[histAfter.length - 1]?.output ?? "";
                                const cleanOutput = stripAnsi(rawOutput);
                                const newOutput = cleanOutput.slice(cursorBefore).trimStart();

                                // Mettre à jour le curseur pour la prochaine commande
                                terminalReadCursors.set(tid, cleanOutput.length);

                                const snippet =
                                    newOutput.length > 6000
                                        ? newOutput.slice(0, 6000) + `\n…[tronqué — ${newOutput.length} chars au total]`
                                        : newOutput;

                                if (snippet.trim()) {
                                    await sendPrompt(
                                        `[Sortie du terminal "${tid}" — commande: ${JSON.stringify(input.trim())}]\n` +
                                            `\`\`\`\n${snippet}\n\`\`\``,
                                        cfg,
                                    );
                                } else {
                                    await sendPrompt(
                                        `[Terminal "${tid}"] Commande envoyée (${JSON.stringify(input.trim())}), aucune sortie reçue en 2.5 s.\n` +
                                            `La commande est peut-être encore en cours — tu peux réenvoyer terminal_send_stdin avec une commande vide ("\\n") pour rafraîchir.`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_send_stdin "${tid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── context7-search ───────────────────────────────────
                        if (parsedTool["context7-search"] !== undefined) {
                            try {
                                const result = await searchLibrary(
                                    String(parsedTool["context7-search"]),
                                    parsedTool.query ?? "",
                                );
                                await sendPrompt(`[Context7 — Bibliothèques trouvées]\n${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur context7-search]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── context7-docs ─────────────────────────────────────
                        if (parsedTool["context7-docs"] !== undefined) {
                            try {
                                const result = await queryDocs(
                                    String(parsedTool["context7-docs"]),
                                    parsedTool.query ?? "",
                                    Number(parsedTool.tokens ?? 4000),
                                );
                                await sendPrompt(`[Context7 — Documentation]\n${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur context7-docs]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── http_request ──────────────────────────────────────
                        if (parsedTool.http_request) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "http_request",
                                    {
                                        method: parsedTool.http_request,
                                        url: parsedTool.url ?? "",
                                        headers: parsedTool.headers ?? null,
                                        body: parsedTool.body ?? null,
                                    },
                                    30000,
                                );
                                await sendPrompt(
                                    `[Réponse HTTP]\n\`\`\`\n${withAutoCritique(result, "http_request")}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur HTTP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── create_mcp_server ─────────────────────────────────
                        if (parsedTool.create_mcp_server) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "create_mcp_server",
                                    {
                                        name: parsedTool.create_mcp_server,
                                        description: parsedTool.description ?? "",
                                        content: parsedTool.content ?? "",
                                    },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Serveur MCP créé] "${parsedTool.create_mcp_server}" sauvegardé.\n${result}\n\n` +
                                        `Démarre-le maintenant avec start_mcp_server pour voir ses outils.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur création serveur MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── start_mcp_server ──────────────────────────────────
                        if (parsedTool.start_mcp_server) {
                            try {
                                const tools = await invokeWithTimeout<{ name: string; description: string }[]>(
                                    "start_mcp_server",
                                    { name: parsedTool.start_mcp_server },
                                    20000,
                                );
                                const toolList = tools.map((t) => `  - ${t.name}: ${t.description}`).join("\n");
                                await sendPrompt(
                                    `[Serveur MCP "${parsedTool.start_mcp_server}" démarré]\nOutils disponibles :\n${toolList || "  (aucun outil)"}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur démarrage serveur MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── call_mcp_tool ─────────────────────────────────────
                        if (parsedTool.call_mcp_tool) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "call_mcp_tool",
                                    {
                                        serverName: parsedTool.call_mcp_tool,
                                        toolName: parsedTool.tool ?? "",
                                        argsJson: parsedTool.args ?? null,
                                    },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Résultat MCP tool "${parsedTool.tool}"]\n${withAutoCritique(result, `mcp:${parsedTool.tool}`)}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur appel outil MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── list_mcp_servers ──────────────────────────────────
                        if (parsedTool.list_mcp_servers !== undefined) {
                            try {
                                const servers = await invokeWithTimeout<
                                    { name: string; description: string; running: boolean; tools: { name: string }[] }[]
                                >("list_mcp_servers", {}, 20000);
                                if (servers.length === 0) {
                                    await sendPrompt(
                                        `[MCP] Aucun serveur MCP disponible. Crée-en un avec create_mcp_server.`,
                                        cfg,
                                    );
                                } else {
                                    const list = servers
                                        .map(
                                            (s) =>
                                                `  - ${s.name} ${s.running ? "(en cours)" : "(arrêté)"}: ${s.description}\n    Outils: ${s.tools.map((t) => t.name).join(", ") || "démarrer pour voir"}`,
                                        )
                                        .join("\n");
                                    await sendPrompt(`[Serveurs MCP disponibles]\n${list}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur liste MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── read_skill ────────────────────────────────────────
                        if (parsedTool.read_skill !== undefined) {
                            try {
                                const content = await invokeWithTimeout<string>(
                                    "read_skill",
                                    { name: String(parsedTool.read_skill) },
                                    10000,
                                );
                                await sendPrompt(
                                    `[Contenu du skill \`${parsedTool.read_skill}\`]\n\`\`\`\n${content}\n\`\`\`\n\nAnalyse ce contenu et applique les corrections nécessaires avec create_skill.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── patch_skill ───────────────────────────────────────
                        if (parsedTool.patch_skill !== undefined) {
                            try {
                                const msg = await invokeWithTimeout<string>(
                                    "patch_skill",
                                    {
                                        name: String(parsedTool.patch_skill),
                                        search: String(parsedTool.search ?? ""),
                                        replace: String(parsedTool.replace ?? ""),
                                    },
                                    10000,
                                );
                                await sendPrompt(`[patch_skill OK] ${msg}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur patch_skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── write_file ────────────────────────────────────────
                        if (parsedTool.write_file) {
                            try {
                                const rawContent = parsedTool.content ?? "";
                                const content = rawContent
                                    .replace(/\\n/g, "\n")
                                    .replace(/\\t/g, "\t")
                                    .replace(/\\r/g, "\r");
                                const result = await invokeWithTimeout<string>(
                                    "write_file",
                                    { path: parsedTool.write_file, content },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Fichier écrit] ${result}\n` +
                                        `PROCHAINE ACTION OBLIGATOIRE : si d'autres fichiers restent à écrire, appelle write_file immédiatement. Sinon (tous les fichiers sont prêts), appelle start_dev_server sur le dossier du projet. Ne génère PAS de texte d'explication entre deux outils.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur écriture fichier]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── open_browser (ouvrir une URL dans le navigateur intégré) ──
                        if (parsedTool.open_browser !== undefined) {
                            try {
                                const targetUrl = parsedTool.open_browser as string;
                                onOpenBrowserUrl?.(targetUrl);
                                await new Promise((r) => setTimeout(r, 1500));
                                const errs = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
                                const errReport =
                                    errs.length > 0
                                        ? `\nErreurs JS capturées :\n${errs.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
                                        : "\nAucune erreur JS capturée.";
                                await sendPrompt(`[Navigateur] Page ouverte : ${targetUrl}${errReport}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur open_browser]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── get_browser_errors (lire les erreurs JS capturées) ──
                        if (parsedTool.get_browser_errors !== undefined) {
                            try {
                                const errs = await invokeWithTimeout<string[]>("get_browser_errors", {}, 5000);
                                const report =
                                    errs.length === 0
                                        ? "Aucune erreur capturées."
                                        : errs.map((e, i) => `${i + 1}. ${e}`).join("\n");

                                // Détecter les erreurs pointant vers des fichiers EXTERNES (pas index.html)
                                let externalFilesNote = "";
                                if (errs.length > 0) {
                                    const externalPaths = new Set<string>();
                                    for (const e of errs) {
                                        const m = e.match(/\(https?:\/\/[^/]+\/([^:)]+):\d+:\d+\)/);
                                        if (m && !m[1].endsWith("index.html")) {
                                            externalPaths.add(m[1]); // ex: "src/index.js"
                                        }
                                    }
                                    if (externalPaths.size > 0) {
                                        const paths = [...externalPaths];
                                        externalFilesNote =
                                            `\n\n⚠️ ATTENTION — FICHIERS EXTERNES DÉTECTÉS :\n` +
                                            `Ces erreurs NE viennent PAS de ton index.html, elles pointent vers :\n` +
                                            paths.map((p) => `  - ${p}`).join("\n") +
                                            `\nDIAGNOSTIC OBLIGATOIRE AVANT TOUT PATCH :\n` +
                                            `  1. As-tu créé ces fichiers toi-même ? Si oui → lis-les avec read_file.\n` +
                                            `  2. Si non → le serveur de dev charge un template par défaut. Dans ce cas :\n` +
                                            `     → Utilise cmd pour lister le dossier du projet et identifier les fichiers parasites.\n` +
                                            `     → Supprime ou ignore ces fichiers (ils ne font pas partie de ton projet).\n` +
                                            `  3. NE JAMAIS patcher ton index.html pour corriger une erreur provenant d'un autre fichier.`;
                                    }
                                }

                                const base = errs.length > 0 ? withAutoCritique(report, "get_browser_errors") : report;
                                await sendPrompt(`[Erreurs navigateur]\n${base}${externalFilesNote}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_browser_errors]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── stop_dev_server ───────────────────────────────────
                        if (parsedTool.stop_dev_server !== undefined) {
                            try {
                                await invokeWithTimeout<void>("stop_dev_server", {}, 5000);
                                await sendPrompt(`[Serveur dev arrêté] Le serveur local a été stoppé.`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur stop_dev_server]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── start_dev_server (démarrer le serveur local) ──────
                        if (parsedTool.start_dev_server !== undefined) {
                            try {
                                const dir = parsedTool.start_dev_server as string;
                                const port = await invokeWithTimeout<number>(
                                    "start_dev_server",
                                    { baseDir: dir, port: 7820 },
                                    8000,
                                );
                                const devUrl = `http://127.0.0.1:${port}/`;
                                onOpenBrowserUrl?.(devUrl);
                                shellOpen(devUrl).catch(() => {});
                                await new Promise((r) => setTimeout(r, 1500));
                                const errs = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
                                let errReport = "\nAucune erreur JS capturée au démarrage.";
                                if (errs.length > 0) {
                                    const lines = errs.map((e, i) => `${i + 1}. ${e}`).join("\n");
                                    const externalPaths = new Set<string>();
                                    for (const e of errs) {
                                        const m = e.match(/\(https?:\/\/[^/]+\/([^:)]+):\d+:\d+\)/);
                                        if (m && !m[1].endsWith("index.html")) externalPaths.add(m[1]);
                                    }
                                    errReport = `\nErreurs JS capturées :\n${lines}`;
                                    if (externalPaths.size > 0) {
                                        errReport +=
                                            `\n\n⚠️ Ces erreurs pointent vers des fichiers EXTERNES (${[...externalPaths].join(", ")}) — ` +
                                            `probablement un template du serveur. Utilise cmd pour lister le dossier et identifier les fichiers parasites.`;
                                    }
                                }
                                await sendPrompt(
                                    `[Serveur dev démarré] ${devUrl} — dossier : ${dir}${errReport}\nProchaine action OBLIGATOIRE : appelle get_browser_errors pour valider le rendu, puis open_browser pour ouvrir la page.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur start_dev_server]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── save_image (sauvegarder une image base64 sur disque) ──
                        if (parsedTool.save_image !== undefined) {
                            try {
                                const result = await invokeWithTimeout<{
                                    path: string;
                                    dataUrl: string;
                                    filename: string;
                                }>(
                                    "save_image",
                                    { dataUrl: parsedTool.save_image, filename: parsedTool.filename ?? null },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Image sauvegardée] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur save_image]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── download_image (télécharger une image depuis une URL) ──
                        if (parsedTool.download_image !== undefined) {
                            try {
                                const result = await invokeWithTimeout<{
                                    path: string;
                                    dataUrl: string;
                                    filename: string;
                                }>(
                                    "download_image",
                                    { url: parsedTool.download_image, filename: parsedTool.filename ?? null },
                                    30000,
                                );
                                await sendPrompt(
                                    `[Image téléchargée] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur download_image]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── search_web (recherche web réelle) ────────────────
                        if (parsedTool.search_web !== undefined) {
                            const swQuery = parsedTool.search_web as string;
                            const swSource = (parsedTool.source as string) || "duckduckgo";
                            const swLocale = (parsedTool.locale as string) || "fr";
                            if (!swQuery || typeof swQuery !== "string") {
                                await sendPrompt(`[Erreur search_web]: paramètre query requis`, cfg);
                                return;
                            }
                            let swApiKey: string | null = null;
                            if (swSource === "brave") swApiKey = localStorage.getItem("search_brave_api_key") || null;
                            if (swSource === "serper") swApiKey = localStorage.getItem("search_serper_api_key") || null;
                            if (swSource === "tavily") swApiKey = localStorage.getItem("search_tavily_api_key") || null;
                            try {
                                interface SWResult {
                                    title: string;
                                    snippet: string;
                                    url: string;
                                    source: string;
                                }
                                const results = await invokeWithTimeout<SWResult[]>(
                                    "search_web",
                                    { query: swQuery, source: swSource, apiKey: swApiKey, locale: swLocale },
                                    20000,
                                );
                                const lines = results
                                    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   → ${r.url}`)
                                    .join("\n\n");
                                await sendPrompt(
                                    `[Résultats de recherche — source: ${swSource}]\nRequête: "${swQuery}"\n\n${lines}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur search_web]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── scrape_url (extraire le contenu d'une page web) ──
                        if (parsedTool.scrape_url !== undefined) {
                            const scrapeTarget = parsedTool.scrape_url as string;
                            const scrapeMode = (parsedTool.mode as string) || "static";
                            if (!scrapeTarget || typeof scrapeTarget !== "string") {
                                await sendPrompt(`[Erreur scrape_url]: paramètre url requis`, cfg);
                                return;
                            }
                            try {
                                interface ScrapedPage {
                                    url: string;
                                    title: string;
                                    description: string;
                                    text: string;
                                    headings: { level: string; text: string }[];
                                    links: { text: string; href: string }[];
                                    mode: string;
                                }
                                const page = await invokeWithTimeout<ScrapedPage>(
                                    "scrape_url",
                                    { url: scrapeTarget, mode: scrapeMode },
                                    scrapeMode === "js" ? 20000 : 35000,
                                );
                                const headingsMd =
                                    page.headings.length > 0
                                        ? "\n**Titres :**\n" +
                                          page.headings.map((h) => `- [${h.level}] ${h.text}`).join("\n")
                                        : "";
                                const linksMd =
                                    page.links.length > 0
                                        ? "\n**Liens (top 10) :**\n" +
                                          page.links
                                              .slice(0, 10)
                                              .map((l) => `- [${l.text || l.href}](${l.href})`)
                                              .join("\n")
                                        : "";
                                await sendPrompt(
                                    `[Page scrapée — mode:${page.mode}]\n**URL :** ${page.url}\n**Titre :** ${page.title}\n**Description :** ${page.description}\n\n**Contenu :**\n${page.text}${headingsMd}${linksMd}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur scrape_url]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ── save_fact JSON ─────────────────────────────────────
                        if (parsedTool.save_fact !== undefined) {
                            try {
                                const key = String(parsedTool.save_fact);
                                const val = String(parsedTool.value ?? "");
                                if (key && val) {
                                    await invokeWithTimeout<void>("save_user_fact", { key, value: val }, 5000).catch(
                                        () => {},
                                    );
                                }
                            } catch {
                                /* silencieux */
                            }
                            await sendPrompt(
                                `[Fait mémorisé] Poursuis ta réponse là où tu t'es arrêté — ne répète pas ce que tu as déjà dit.`,
                                cfg,
                            );
                            return;
                        }

                        // ── patch_file JSON (format alternatif — SEARCH/REPLACE comme clés) ──
                        if (parsedTool.patch_file !== undefined) {
                            const filePath = String(parsedTool.patch_file);
                            const searchStr = String(parsedTool.SEARCH ?? parsedTool.search ?? "");
                            const replaceStr = String(parsedTool.REPLACE ?? parsedTool.replace ?? "");
                            if (!searchStr) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur patch_file] Paramètre SEARCH manquant.\n` +
                                        `RAPPEL : utilise le format TAG <patch_file> — JAMAIS le format JSON pour patch_file :\n` +
                                        `<patch_file path="${filePath}">SEARCH:\n` +
                                        `<texte exact à trouver>\n` +
                                        `REPLACE:\n` +
                                        `<nouveau texte>\n` +
                                        `</patch_file>`,
                                    cfg,
                                );
                                return;
                            }
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "patch_file",
                                    { path: filePath, search: searchStr, replace: replaceStr },
                                    20000,
                                );
                                await sendPrompt(
                                    `[patch_file] ${result}\n` +
                                        `⚠️ RAPPEL : utilise le format TAG <patch_file path="..."> à l'avenir — pas le format JSON.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur patch_file sur "${filePath}"]: ${err}\n` +
                                        `RAPPEL : le format correct est le TAG <patch_file path="${filePath}">SEARCH:\n...\nREPLACE:\n...</patch_file>`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ── cmd (commande ponctuelle) ─────────────────────────
                        const cmd = parsedTool.cmd ?? parsedTool.command ?? "";
                        if (cmd.trim()) {
                            try {
                                const output = await invokeWithTimeout<string>(
                                    "run_shell_command",
                                    { command: cmd },
                                    60000,
                                );
                                await sendPrompt(
                                    `[Résultat de la commande \`${cmd}\`]\n\`\`\`\n${withAutoCritique(output, `cmd:${cmd}`)}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur commande \`${cmd}\`]: ${err}`, cfg);
                            }
                        } else {
                            // Aucun outil reconnu dans le JSON parsé → forcer une réponse pour éviter le silence
                            const knownKeys = Object.keys(parsedTool).join(", ");
                            await sendPrompt(
                                `[Système] Outil inconnu ou clé non reconnue : { ${knownKeys} }.\n` +
                                    `Vérifie le nom de l'outil avec get_tool_doc ou consulte la liste des outils disponibles.`,
                                cfg,
                            );
                        }
                    };
                    // Exposer dispatch pour les boutons de confirmation
                    dispatchToolRef.current = dispatch;

                    // Si plusieurs <tool> dans le même message, exécuter UNIQUEMENT le premier ici.
                    // Exception : si ce sont tous des write_file consécutifs, les exécuter tous d'un coup.
                    const remainingWriteFiles = allToolMatches.slice(1).reduce<Record<string, string>[]>((acc, m) => {
                        try {
                            const p = JSON.parse(sanitizeLlmJson(m[1]));
                            if (p.write_file) acc.push(p);
                        } catch {
                            /* ignore */
                        }
                        return acc;
                    }, []);

                    if (parsed.write_file && remainingWriteFiles.length > 0) {
                        // Mode batch : exécute tous les write_file du message en une fois
                        (async () => {
                            const results: string[] = [];
                            const allFiles = [parsed, ...remainingWriteFiles];
                            for (const fileTool of allFiles) {
                                try {
                                    const rawContent = fileTool.content ?? "";
                                    const content = rawContent
                                        .replace(/\\n/g, "\n")
                                        .replace(/\\t/g, "\t")
                                        .replace(/\\r/g, "\r");
                                    const r = await invokeWithTimeout<string>(
                                        "write_file",
                                        { path: fileTool.write_file, content },
                                        20000,
                                    );
                                    results.push(`✓ ${r}`);
                                } catch (err) {
                                    results.push(`✗ ${fileTool.write_file} : ${err}`);
                                }
                            }
                            await sendPrompt(
                                `[Fichiers écrits en batch]\n${results.join("\n")}\n` +
                                    `PROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`,
                                config,
                            );
                        })().finally(() => setToolRunning(false));
                    } else {
                        dispatch(parsed, config).finally(() => setToolRunning(false));
                    }
                }
            }
        }
        // Sauvegarder la réponse assistant une fois le streaming terminé
        if (prevStreamingRef.current && !streaming) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content && conversationId) {
                let content = lastMsg.content;

                // Extraction du titre généré par le LLM (<conv_title>...</conv_title>)
                if (!convTitleSetRef.current) {
                    const titleMatch = content.match(/<conv_title>([\s\S]*?)<\/conv_title>/i);
                    if (titleMatch) {
                        const title = titleMatch[1].trim().slice(0, 80);
                        const stripped = content.replace(/<conv_title>[\s\S]*?<\/conv_title>\s*/i, "").trim();
                        convTitleSetRef.current = true;
                        invoke("rename_conversation", { conversationId, title })
                            .then(() => onConversationTitleChanged?.())
                            .catch(() => {});
                        if (stripped) {
                            content = stripped;
                            updateLastAssistantContent(content);
                        }
                        if (!stripped) return;
                    }
                }

                // Extraction et sauvegarde des faits utilisateur (<save_fact key="..." value="..."/>)
                const factRegex = /<save_fact\s+key="([^"]+)"\s+value="([^"]+)"\s*\/?>/gi;
                let factMatch: RegExpExecArray | null;
                let hasFacts = false;
                while ((factMatch = factRegex.exec(content)) !== null) {
                    hasFacts = true;
                    invoke("set_user_fact", { key: factMatch[1], value: factMatch[2] }).catch(() => {});
                }
                if (hasFacts) {
                    content = content.replace(/<save_fact\s+key="[^"]+"\s+value="[^"]+"\s*\/?>\s*/gi, "").trim();
                    updateLastAssistantContent(content);
                }

                if (!/<tool>/.test(normalizeToolTags(content))) {
                    invoke("save_message", { conversationId, role: "assistant", content }).catch(() => {});
                }

                // Détection et application automatique des blocs patch (FILE/SEARCH/REPLACE)
                if (hasPatchBlocks(content)) {
                    setPatchResults(null);
                    applyAllPatches(content).then((results) => {
                        setPatchResults(results);
                    });
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming]);

    // Lecture automatique TTS quand le streaming se termine
    useEffect(() => {
        if (prevStreamingRef.current && !streaming && ttsEnabled) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const plain = lastMsg.content
                    .replace(/```[\s\S]*?```/g, "")
                    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
                    .replace(/[#*_~>]/g, "")
                    .trim();
                if (plain) speakText(plain);
            }
        }
        prevStreamingRef.current = streaming;
        // speakText est stable (défini dans le même scope), ttsEnabled intentionnellement exclu pour éviter double-lecture
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming, messages]);
}
