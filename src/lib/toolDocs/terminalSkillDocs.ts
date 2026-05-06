import type { ToolDocsMap } from "../toolDocsTypes";

export const TOOL_DOCS_TERMINAL_SKILLS: ToolDocsMap = {
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

};

