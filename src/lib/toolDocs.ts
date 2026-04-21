export const TOOL_DOCS: Record<string, string> = {
    get_hardware_info: `=== get_hardware_info — Informations matérielles locales ===
Usage : <tool>{"get_hardware_info": true}</tool>
• Retourne la RAM totale, le nombre de threads CPU et le GPU détecté avec sa VRAM.
• À utiliser pour les questions comme : "liste mes cartes graphiques", "combien j'ai de RAM ?", "quelle config machine ?"
• Plus fiable que cmd pour les infos matériel de base.`,

    cmd: `=== cmd ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Commande PowerShell ponctuelle ===
Usage : <tool>{"cmd": "Get-Date"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ExÃƒÆ’Ã‚Â©cute une commande dans un processus isolÃƒÆ’Ã‚Â© (le cwd ne persiste PAS).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ EnchaÃƒÆ’Ã‚Â®ne plusieurs commandes avec ; (JAMAIS &&).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise des chemins absolus ou Set-Location ; avant ta commande.
ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â RÃƒÆ’Ã‹â€ GLE JSON ABSOLUE : utilise TOUJOURS des guillemets SIMPLES (') pour les chemins et chaÃƒÆ’Ã‚Â®nes dans la valeur cmd.
   Les guillemets doubles (\") ÃƒÆ’Ã‚Â  l'intÃƒÆ’Ã‚Â©rieur du JSON brisent le parseur ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â erreur garantie.
   ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ JAMAIS  : {"cmd": "Rename-Item -Path \\"E:/Mon Dossier/f.pdf\\" -NewName \\"n.pdf\\""}
   ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ CORRECT : {"cmd": "Rename-Item -Path 'E:/Mon Dossier/f.pdf' -NewName 'n.pdf'"}
Exemples :
  <tool>{"cmd": "node --version"}</tool>
  <tool>{"cmd": "New-Item -ItemType Directory -Force 'E:/projet'; Set-Location 'E:/projet'; git init"}</tool>
  <tool>{"cmd": "Get-ChildItem -Recurse -Name 'E:/mon-projet'"}</tool>
  <tool>{"cmd": "Rename-Item -Path 'E:/Mon Dossier/ancien.pdf' -NewName 'nouveau.pdf'"}</tool>
Quand utiliser cmd (et non terminal persistant) :
  ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Commande unique sans besoin de rester dans le mÃƒÆ’Ã‚Âªme dossier
  ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Info systÃƒÆ’Ã‚Â¨me, lecture chemin absolu, action ponctuelle
  ÃƒÂ¢Ã‚ÂÃ…â€™ SÃƒÆ’Ã‚Â©quence ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 2 commandes dans le mÃƒÆ’Ã‚Âªme dossier ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ utilise create_terminal`,

    write_file: `=== write_file ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CrÃƒÆ’Ã‚Â©er un fichier ===
UNIQUEMENT pour les NOUVEAUX fichiers. Pour modifier un existant : utilise patch_file.

Format TAG (OBLIGATOIRE pour HTML/CSS/JS/TS ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â guillemets libres, pas d'escaping) :
  <write_file path="E:/projet/index.html">
  <!DOCTYPE html>
  <html lang="fr">
  ...contenu brut complet...
  </html>
  </write_file>

Format JSON (uniquement pour .txt/.json SIMPLES, contenu < 200 caractÃƒÆ’Ã‚Â¨res sans guillemets doubles) :
  <tool>{"write_file": "E:/projet/config.txt", "content": "valeur simple"}</tool>

RÃƒÆ’Ã‚Â¨gles :
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Chemin absolu obligatoire (ex: E:/tetris/index.html)
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Les dossiers parents sont crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©s automatiquement
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â N'utilise JAMAIS le format JSON pour du HTML/CSS/JS ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ erreurs inÃƒÆ’Ã‚Â©vitables`,

    patch_file: `=== patch_file ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Modifier un fichier existant ===
Utilise patch_file pour toute modification dans un fichier qui EXISTE DÃƒÆ’Ã¢â‚¬Â°JÃƒÆ’Ã¢â€šÂ¬ (< 30 lignes changÃƒÆ’Ã‚Â©es).
NE RÃƒÆ’Ã¢â‚¬Â°ÃƒÆ’Ã¢â‚¬Â°CRIS JAMAIS tout un fichier pour changer quelques lignes.

Format (SEARCH: et REPLACE: sont obligatoires, sur leur propre ligne) :
  <patch_file path="E:/projet/index.html">SEARCH:
  <h2>Titre ancien</h2>
  REPLACE:
  <h2>Titre nouveau</h2>
  </patch_file>

RÃƒÆ’Ã‚Â¨gles CRITIQUES :
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ SEARCH doit correspondre EXACTEMENT au texte du fichier (espaces, sauts de ligne inclus)
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Si doute sur le texte exact ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ lis d'abord avec read_file
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ SEARCH doit ÃƒÆ’Ã‚Âªtre unique dans le fichier (ajoute du contexte si nÃƒÆ’Ã‚Â©cessaire)
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Si le rÃƒÆ’Ã‚Â©sultat contient ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ STOP. Lis le fichier, corrige SEARCH, relance.
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Tu peux enchaÃƒÆ’Ã‚Â®ner plusieurs blocs patch_file dans la mÃƒÆ’Ã‚Âªme rÃƒÆ’Ã‚Â©ponse`,

    read_file: `=== read_file ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire un fichier ===
Usage : <tool>{"read_file": "E:/projet/index.html"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne le contenu complet du fichier dans le contexte.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Chemin absolu recommandÃƒÆ’Ã‚Â©.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Limite : 512 Ko.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Ne fonctionne PAS pour les PDF (binaire) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ utilise read_pdf ÃƒÆ’Ã‚Â  la place.
Toujours lire un fichier avant de le modifier (RÃƒÆ’Ã‹â€ GLE 0).`,

    read_pdf: `=== read_pdf ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire un fichier PDF complet (toutes les pages) ===
Usage : <tool>{"read_pdf": "E:/documents/rapport.pdf"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne le texte de TOUTES les pages ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utile pour analyse dÃƒÆ’Ã‚Â©taillÃƒÆ’Ã‚Â©e ou rÃƒÆ’Ã‚Â©sumÃƒÆ’Ã‚Â© d'un seul document.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Retourne beaucoup de contexte ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â rÃƒÆ’Ã‚Â©servÃƒÆ’Ã‚Â© ÃƒÆ’Ã‚Â  l'analyse approfondie d'UN seul PDF.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Pour traiter plusieurs PDFs ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ utilise read_pdf_batch.`,

    read_pdf_brief: `=== read_pdf_brief ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire la 1ÃƒÆ’Ã‚Â¨re page d'un seul PDF ===
Usage : <tool>{"read_pdf_brief": "E:/documents/facture.pdf"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ 1ÃƒÆ’Ã‚Â¨re page uniquement, max 2000 caractÃƒÆ’Ã‚Â¨res.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Pour traiter PLUSIEURS PDFs en une seule opÃƒÆ’Ã‚Â©ration ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ utilise read_pdf_batch (plus efficace).`,

    read_pdf_batch: `=== read_pdf_batch ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire la 1ÃƒÆ’Ã‚Â¨re page de PLUSIEURS PDFs en un seul appel ===
Usage : <tool>{"read_pdf_batch": "[\\"E:/Test IA PDF/fichier1.pdf\\", \\"E:/Test IA PDF/fichier2.pdf\\", ...]"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ OUTIL PRINCIPAL pour tout traitement en lot de PDFs.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la 1ÃƒÆ’Ã‚Â¨re page de chaque PDF (max 2000 caractÃƒÆ’Ã‚Â¨res par fichier) en UN SEUL appel.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â INTERDIT d'appeler read_pdf_brief fichier par fichier quand on traite un lot ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilise read_pdf_batch.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Recommandation : envoyer 30 chemins max par appel pour ÃƒÆ’Ã‚Â©viter les timeouts.
Workflow batch PDF OBLIGATOIRE (ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 2 fichiers ÃƒÆ’Ã‚Â  renommer/analyser) :
  ÃƒÆ’Ã¢â‚¬Â°TAPE 1 : list_folder_pdfs ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ liste complÃƒÆ’Ã‚Â¨te
  ÃƒÆ’Ã¢â‚¬Â°TAPE 2 : read_pdf_batch sur les 30 premiers chemins ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ extraire ÃƒÆ’Ã‚Â©metteur + numÃƒÆ’Ã‚Â©ro de chaque
  ÃƒÆ’Ã¢â‚¬Â°TAPE 3 : Si > 30 fichiers, read_pdf_batch sur le lot suivant, etc.
  ÃƒÆ’Ã¢â‚¬Â°TAPE FINALE : batch_rename avec toutes les entrÃƒÆ’Ã‚Â©es [{from, to}] en un seul appel`,

    list_folder_pdfs: `=== list_folder_pdfs ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lister les PDFs d'un dossier ===
Usage : <tool>{"list_folder_pdfs": "E:/documents"}</tool>
Usage rÃƒÆ’Ã‚Â©cursif : <tool>{"list_folder_pdfs": "E:/documents", "recursive": "true"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Liste tous les fichiers .pdf dans le dossier indiquÃƒÆ’Ã‚Â©.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Puis utilise read_pdf_batch pour lire les mÃƒÆ’Ã‚Â©tadonnÃƒÆ’Ã‚Â©es de tous les fichiers.`,

    batch_rename: `=== batch_rename ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Renommer plusieurs fichiers en une seule opÃƒÆ’Ã‚Â©ration ===
Usage : <tool>{"batch_rename": [{"from": "E:/dossier/ancien.pdf", "to": "nouveau.pdf"}, ...]}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Format TABLEAU NATIF JSON ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PAS de guillemets extra autour du tableau.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Renomme une liste de fichiers en un seul appel ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â parfait pour le traitement en lot.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ "to" peut ÃƒÆ’Ã‚Âªtre un nom simple (reste dans le mÃƒÆ’Ã‚Âªme dossier) ou un chemin absolu.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne le dÃƒÆ’Ã‚Â©tail de chaque renommage (succÃƒÆ’Ã‚Â¨s/ÃƒÆ’Ã‚Â©chec).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Maximum 15 fichiers par appel. Si > 15, fais 2 appels sÃƒÆ’Ã‚Â©parÃƒÆ’Ã‚Â©s.
ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â RÃƒÆ’Ã‹â€ GLE : ne jamais utiliser Rename-Item (cmd) quand on veut renommer plusieurs fichiers ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilise batch_rename.`,

    create_terminal: `=== create_terminal ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ouvrir un terminal persistant ===
Usage : <tool>{"create_terminal": "nom-projet", "cwd": "E:/MesProjets/mon-projet"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ cwd est OBLIGATOIRE ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ne jamais l'omettre.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â INTERDIT : cwd pointant sur E:/CustomApp ou le dossier de l'application.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Si le dossier n'existe pas, il est crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â© automatiquement.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne un terminal_id (ex: "term-1744456789") ÃƒÆ’Ã‚Â  rÃƒÆ’Ã‚Â©utiliser dans terminal_exec.
Quand utiliser :
  ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ SÃƒÆ’Ã‚Â©quence ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 2 commandes dans le mÃƒÆ’Ã‚Âªme dossier (git + npm + buildÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦)
  ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Initialisation scaffold (npx create-*, cargo newÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦)`,

    terminal_exec: `=== terminal_exec ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ExÃƒÆ’Ã‚Â©cuter dans un terminal persistant ===
Usage : <tool>{"terminal_exec": "git status", "terminal_id": "term-1744456789"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Le rÃƒÆ’Ã‚Â©pertoire courant est conservÃƒÆ’Ã‚Â© entre les appels.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ cd dans terminal_exec change le cwd pour les commandes suivantes.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Si l'ID est inconnu ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ appelle list_terminals d'abord.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ OBLIGATOIRE : fermer avec close_terminal en fin de tÃƒÆ’Ã‚Â¢che.`,

    close_terminal: `=== close_terminal ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Fermer un terminal persistant ===
Usage : <tool>{"close_terminal": "term-1744456789"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ OBLIGATOIRE en fin de tÃƒÆ’Ã‚Â¢che pour libÃƒÆ’Ã‚Â©rer les ressources.`,

    list_terminals: `=== list_terminals ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lister les terminaux ouverts ===
Usage : <tool>{"list_terminals": ""}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la liste des terminaux avec leur id, nom, cwd et nombre de commandes exÃƒÆ’Ã‚Â©cutÃƒÆ’Ã‚Â©es.`,

    get_terminal_history: `=== get_terminal_history ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Historique d'un terminal ===
Usage : <tool>{"get_terminal_history": "term-1744456789"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la liste des commandes exÃƒÆ’Ã‚Â©cutÃƒÆ’Ã‚Â©es avec leurs sorties.`,

    terminal_start_interactive: `=== terminal_start_interactive ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Processus interactif (SSH, REPLÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦) ===
Usage : <tool>{"terminal_start_interactive": "ssh user@host", "terminal_id": "term-1744456789"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise pour TOUTE commande qui nÃƒÆ’Ã‚Â©cessite une saisie utilisateur : ssh, telnet, python REPL, node REPLÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ La sortie s'affiche EN TEMPS RÃƒÆ’Ã¢â‚¬Â°EL dans le panneau Terminal (xterm.js).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â OBLIGATOIRE pour SSH ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â jamais cmd ni terminal_exec pour des connexions SSH.
Exemples :
  <tool>{"terminal_start_interactive": "ssh beroute@192.168.1.28", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_start_interactive": "ssh -o StrictHostKeyChecking=no beroute@192.168.1.28", "terminal_id": "term-xxx"}</tool>
Flux SSH recommandÃƒÆ’Ã‚Â© :
  1. create_terminal (cwd = dossier quelconque)
  2. terminal_start_interactive avec la commande ssh
  3. Attendre que l'utilisateur entre son mot de passe (session en cours)
  4. Envoyer les commandes distantes via terminal_send_stdin`,

    terminal_send_stdin: `=== terminal_send_stdin ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Envoyer une commande dans un terminal interactif actif ===
Usage : <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "term-xxx"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Envoie du texte brut au processus interactif en cours (SSH, REPL, etc.).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ LA SORTIE EST AUTOMATIQUEMENT RETOURNÃƒÆ’Ã¢â‚¬Â°E aprÃƒÆ’Ã‚Â¨s ~2.5 s ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tu n'as pas besoin de lire l'historique manuellement.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â TOUJOURS ajouter \\n ÃƒÆ’Ã‚Â  la fin pour exÃƒÆ’Ã‚Â©cuter la commande (EntrÃƒÆ’Ã‚Â©e).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Ctrl+C : envoyer "\\x03" pour interrompre.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ N'utilise JAMAIS terminal_exec quand un processus interactif est actif.
Exemples (SSH connectÃƒÆ’Ã‚Â© sur machine distante) :
  <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "cat /etc/hostname\\n", "terminal_id": "term-xxx"}</tool>
  <tool>{"terminal_send_stdin": "iptables -L -n -v\\n", "terminal_id": "term-xxx"}</tool>`,

    create_skill: `=== create_skill ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CrÃƒÆ’Ã‚Â©er un skill ===
Types disponibles : ps1 (dÃƒÆ’Ã‚Â©faut), python, nodejs, http (single), http (multi-routes), composite.

PS1 :
  <tool>{"create_skill": "nom", "description": "desc", "content": "# PS1\\nGet-Date"}</tool>
Python :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "python", "content": "print('hello')"}</tool>
Node.js :
  <tool>{"create_skill": "nom", "description": "desc", "skill_type": "nodejs", "content": "console.log('hello')"}</tool>
HTTP single :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "method": "GET", "url": "https://api.example.com/v1/endpoint", "headers": "Authorization: Bearer sk-xxx"}</tool>
HTTP multi-routes (recommandÃƒÆ’Ã‚Â© pour plusieurs endpoints) :
  <tool>{"create_skill": "nom-api", "description": "desc", "skill_type": "http", "base_url": "https://api.example.com/v1", "headers": "x-api-key: sk-xxx", "routes": "{\\"list\\":{\\"method\\":\\"GET\\",\\"url\\":\\"/items\\"},\\"create\\":{\\"method\\":\\"POST\\",\\"url\\":\\"/items\\"}}"}</tool>
Composite (pipeline de skills) :
  <tool>{"create_skill": "pipeline", "description": "desc", "skill_type": "composite", "content": "[{\\"skill\\":\\"step1\\"},{\\"skill\\":\\"step2\\",\\"chain\\":true}]"}</tool>

RÃƒÆ’Ã‚Â¨gles JSON content :
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ guillemet ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ \\"  |  saut de ligne ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ \\n  |  pas de vrai saut de ligne dans la valeur JSON
  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ AprÃƒÆ’Ã‚Â¨s "[Skill crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©]" : NE recrÃƒÆ’Ã‚Â©e PAS le skill, rÃƒÆ’Ã‚Â©ponds ou teste-le.`,

    run_skill: `=== run_skill ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ExÃƒÆ’Ã‚Â©cuter un skill ===
Sans args  : <tool>{"run_skill": "nom-du-skill"}</tool>
Avec args  : <tool>{"run_skill": "nom-du-skill", "args": "-Param valeur"}</tool>
HTTP multi : <tool>{"run_skill": "nom-api", "args": "{\\"action\\": \\"list\\"}"}</tool>
HTTP body  : <tool>{"run_skill": "nom-api", "args": "{\\"action\\": \\"create\\", \\"body\\": \\"{...}\\"}"}</tool>`,

    read_skill: `=== read_skill ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire le contenu d'un skill ===
Usage : <tool>{"read_skill": "nom-du-skill"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne le code source du skill pour inspection avant modification.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ TOUJOURS lire avant patch_skill.`,

    patch_skill: `=== patch_skill ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Modifier un skill existant ===
Usage : <tool>{"patch_skill": "nom-du-skill", "search": "texte exact", "replace": "nouveau texte"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ MÃƒÆ’Ã‚Âªme logique que patch_file : SEARCH doit ÃƒÆ’Ã‚Âªtre exactement dans le contenu.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Lis d'abord avec read_skill si tu n'es pas sÃƒÆ’Ã‚Â»r du contenu.`,

    delete_skill: `=== delete_skill ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Supprimer un skill ===
Usage : <tool>{"delete_skill": "nom-du-skill"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Action irrÃƒÆ’Ã‚Â©versible. Demande confirmation avec ask_user avant.`,

    http_request: `=== http_request ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Appel API REST direct ===
GET  : <tool>{"http_request": "GET", "url": "https://api.example.com/endpoint"}</tool>
POST : <tool>{"http_request": "POST", "url": "https://api.example.com/endpoint", "headers": "Authorization: Bearer sk-xxx\\nContent-Type: application/json", "body": "{\\"key\\": \\"value\\"}"}</tool>
MÃƒÆ’Ã‚Â©thodes : GET POST PUT DELETE PATCH
Headers   : format "ClÃƒÆ’Ã‚Â©: Valeur" sÃƒÆ’Ã‚Â©parÃƒÆ’Ã‚Â©s par \\n
RÃƒÆ’Ã‚Â©ponse   : HTTP <status>\\n<body>
Dans un skill PS1 : utilise Invoke-WebRequest / Invoke-RestMethod (http_request n'est pas disponible dans un script).`,

    search_web: `=== search_web ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Recherche web ===
Usage : <tool>{"search_web": "requÃƒÆ’Ã‚Âªte", "source": "duckduckgo", "locale": "fr"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ source : "duckduckgo" (dÃƒÆ’Ã‚Â©faut, gratuit) | "brave" | "serper" | "tavily"
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ locale : code langue (dÃƒÆ’Ã‚Â©faut "fr")
Exemples :
  <tool>{"search_web": "mÃƒÆ’Ã‚Â©tÃƒÆ’Ã‚Â©o Paris demain"}</tool>
  <tool>{"search_web": "prix GPU RTX 5090", "source": "brave"}</tool>
Utilise search_web pour des infos rÃƒÆ’Ã‚Â©centes, scrape_url pour lire une page prÃƒÆ’Ã‚Â©cise.`,

    scrape_url: `=== scrape_url ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire une page web ===
Usage : <tool>{"scrape_url": "https://fr.wikipedia.org/wiki/Rust", "mode": "static"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ mode "static" : pages HTML classiques (rapide < 5s)
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ mode "js"     : SPA React/Vue/Angular, contenu chargÃƒÆ’Ã‚Â© par JS (lent ~10s)
Retourne : titre, description, texte, titres, liens.
Utilise scrape_url pour lire une page, http_request pour appeler une API REST.`,

    open_browser: `=== open_browser ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Ouvrir une URL dans le navigateur intÃƒÆ’Ã‚Â©grÃƒÆ’Ã‚Â© ===
Usage : <tool>{"open_browser": "http://127.0.0.1:7820/index.html"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Ouvre le navigateur intÃƒÆ’Ã‚Â©grÃƒÆ’Ã‚Â© ÃƒÆ’Ã‚Â  l'URL spÃƒÆ’Ã‚Â©cifiÃƒÆ’Ã‚Â©e.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Lance d'abord start_dev_server si c'est un projet local.`,

    start_dev_server: `=== start_dev_server ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â DÃƒÆ’Ã‚Â©marrer le serveur de dÃƒÆ’Ã‚Â©veloppement local ===
Usage : <tool>{"start_dev_server": "E:/mon-projet"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ DÃƒÆ’Ã‚Â©marre un serveur HTTP local sur le dossier spÃƒÆ’Ã‚Â©cifiÃƒÆ’Ã‚Â©.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne l'URL (ex: http://127.0.0.1:7820/index.html).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Workflow : write_file ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ start_dev_server ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ get_browser_errors ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ open_browser.`,

    stop_dev_server: `=== stop_dev_server ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ArrÃƒÆ’Ã‚Âªter le serveur de dÃƒÆ’Ã‚Â©veloppement ===
Usage : <tool>{"stop_dev_server": true}</tool>`,

    get_browser_errors: `=== get_browser_errors ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire les erreurs JS du navigateur ===
Usage : <tool>{"get_browser_errors": true}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne les erreurs console.error, window.onerror et promesses rejetÃƒÆ’Ã‚Â©es capturÃƒÆ’Ã‚Â©es.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Appelle aprÃƒÆ’Ã‚Â¨s open_browser pour dÃƒÆ’Ã‚Â©tecter les bugs JS avant de confirmer ÃƒÆ’Ã‚Â  l'utilisateur.`,

    get_dev_server_info: `=== get_dev_server_info ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Statut du serveur dev ===
Usage : <tool>{"get_dev_server_info": true}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne : statut (actif/arrÃƒÆ’Ã‚ÂªtÃƒÆ’Ã‚Â©), port, dossier servi.`,

    save_image: `=== save_image ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Sauvegarder une image base64 ===
Usage : <tool>{"save_image": "data:image/png;base64,...", "filename": "mon-image.png"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ filename est optionnel (auto-gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©rÃƒÆ’Ã‚Â© si absent).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne : path, dataUrl, filename.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Pour afficher l'image dans le chat : ![description](dataUrl)`,

    download_image: `=== download_image ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â TÃƒÆ’Ã‚Â©lÃƒÆ’Ã‚Â©charger une image depuis une URL ===
Usage : <tool>{"download_image": "https://example.com/photo.jpg", "filename": "photo.jpg"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ filename est optionnel.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne : path, dataUrl, filename.`,

    ask_user: `=== ask_user ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Poser une question interactive ===
Usage : <tool>{"ask_user": "Ta question ?", "options": ["Option A", "Option B"]}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ options est optionnel ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â omets-le pour une rÃƒÆ’Ã‚Â©ponse libre.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise dans TOUS les modes (ask, plan, agent).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise AVANT d'exÃƒÆ’Ã‚Â©cuter une action irrÃƒÆ’Ã‚Â©versible.`,

    set_mode: `=== set_mode ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Changer de mode ===
Usage : <tool>{"set_mode": "ask"}</tool>  |  "plan"  |  "agent"
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ask   : rÃƒÆ’Ã‚Â©ponses texte uniquement, pas d'actions
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ plan  : explique avant chaque action, confirme les actions risquÃƒÆ’Ã‚Â©es
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ agent : exÃƒÆ’Ã‚Â©cute librement tous les outils
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ set_mode: "ask" sert ÃƒÆ’Ã‚Â  revenir en mode conversation aprÃƒÆ’Ã‚Â¨s une tÃƒÆ’Ã‚Â¢che.
ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â NE PAS combiner set_mode + ask_user dans la mÃƒÆ’Ã‚Âªme rÃƒÆ’Ã‚Â©ponse ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilise ask_user directement.`,

    request_agent_mode: `=== request_agent_mode ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Demander le passage en mode Agent ===
Usage : <tool>{"request_agent_mode": "Besoin d'exÃƒÆ’Ã‚Â©cuter X pour Y."}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ DÃƒÆ’Ã‚Â©clenche une demande de permission ÃƒÆ’Ã‚Â  l'utilisateur.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ N'exÃƒÆ’Ã‚Â©cute aucune action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â attend la confirmation.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise uniquement en mode ask/plan si une action est nÃƒÆ’Ã‚Â©cessaire.`,

    get_plan: `=== get_plan ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire le plan PLAN.md ===
Usage : <tool>{"get_plan": ""}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne le contenu du fichier PLAN.md s'il existe.`,

    save_plan: `=== save_plan ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Sauvegarder / mettre ÃƒÆ’Ã‚Â  jour le plan ===
Usage : <tool>{"save_plan": "# TÃƒÆ’Ã‚Â¢che : Mon projet\\n\\n## ÃƒÆ’Ã¢â‚¬Â°tat : EN COURS\\n\\n## ÃƒÆ’Ã¢â‚¬Â°tapes\\n- [x] ÃƒÆ’Ã¢â‚¬Â°tape 1\\n- [ ] ÃƒÆ’Ã¢â‚¬Â°tape 2"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Remplace le contenu de PLAN.md.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Mets ÃƒÆ’Ã‚Â  jour [x] et le Checkpoint ÃƒÆ’Ã‚Â  chaque ÃƒÆ’Ã‚Â©tape complÃƒÆ’Ã‚Â©tÃƒÆ’Ã‚Â©e.`,

    search_conversation: `=== search_conversation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Chercher dans les conversations passÃƒÆ’Ã‚Â©es ===
Usage : <tool>{"search_conversation": "python"}</tool>
  Tout parcourir : <tool>{"search_conversation": "*"}</tool>
  Par id         : <tool>{"search_conversation": "#3"}</tool>`,

    "context7-search": `=== context7-search ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Trouver une bibliothÃƒÆ’Ã‚Â¨que dans Context7 ===
Usage : <tool>{"context7-search": "react", "query": "hooks state management"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne les IDs Context7 (ex: /facebook/react).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ÃƒÆ’Ã¢â‚¬Â°tape 1 avant context7-docs si l'ID est inconnu.`,

    "context7-docs": `=== context7-docs ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Obtenir la documentation officielle ===
Usage : <tool>{"context7-docs": "/vercel/next.js", "query": "authentication middleware", "tokens": 4000}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ context7-docs : ID Context7 exact (ex: /vercel/next.js, /tauri-apps/tauri)
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ query         : question prÃƒÆ’Ã‚Â©cise en anglais
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ tokens        : budget optionnel (dÃƒÆ’Ã‚Â©faut 4000, max 10000)
IDs courants : /facebook/react | /vercel/next.js | /tauri-apps/tauri | /supabase/supabase | /tailwindlabs/tailwindcss.com`,

    create_mcp_server: `=== create_mcp_server ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CrÃƒÆ’Ã‚Â©er un serveur MCP Node.js ===
Usage : <tool>{"create_mcp_server": "nom-serveur", "description": "Ce que fait ce serveur", "content": "...code JS..."}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ content = code Node.js COMPLET implÃƒÆ’Ã‚Â©mentant le protocole MCP (stdio JSON-RPC 2.0).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ RÃƒÆ’Ã‹â€ GLE : utilise UNIQUEMENT des guillemets simples (') dans le code JS du content.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ AprÃƒÆ’Ã‚Â¨s crÃƒÆ’Ã‚Â©ation : dÃƒÆ’Ã‚Â©marre avec start_mcp_server.`,

    start_mcp_server: `=== start_mcp_server ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â DÃƒÆ’Ã‚Â©marrer un serveur MCP ===
Usage : <tool>{"start_mcp_server": "nom-serveur"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la liste des outils exposÃƒÆ’Ã‚Â©s par le serveur.`,

    call_mcp_tool: `=== call_mcp_tool ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Appeler un outil d'un serveur MCP ===
Usage : <tool>{"call_mcp_tool": "nom-serveur", "tool": "nom-outil", "args": "{\\"param\\": \\"valeur\\"}"}</tool>`,

    list_mcp_servers: `=== list_mcp_servers ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lister les serveurs MCP ===
Usage : <tool>{"list_mcp_servers": ""}</tool>`,

    save_fact: `=== save_fact ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MÃƒÆ’Ã‚Â©moriser un fait utilisateur ===
ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Ce n'est PAS un outil JSON. C'est une balise inline dans le texte de ta rÃƒÆ’Ã‚Â©ponse.
Format : <save_fact key="prÃƒÆ’Ã‚Â©nom" value="Jean"/>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ InsÃƒÆ’Ã‚Â¨re discrÃƒÆ’Ã‚Â¨tement dans ta rÃƒÆ’Ã‚Â©ponse quand l'utilisateur mentionne une info personnelle.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ INTERDIT : <tool>{"save_fact": ...}</tool> ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilise TOUJOURS la balise inline.`,

    get_tool_doc: `=== get_tool_doc ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Obtenir la documentation d'un outil ===
Usage : <tool>{"get_tool_doc": "write_file"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la documentation complÃƒÆ’Ã‚Â¨te de l'outil demandÃƒÆ’Ã‚Â©.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Supporte la recherche partielle (ex: "terminal" retourne tous les outils terminal).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise quand tu veux vÃƒÆ’Ã‚Â©rifier le format exact d'un outil avant de l'utiliser.`,

    set_todo: `=== set_todo ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CrÃƒÆ’Ã‚Â©er/remplacer la todo list ===
Usage : <tool>{"set_todo": ["ÃƒÆ’Ã¢â‚¬Â°tape 1 : crÃƒÆ’Ã‚Â©er index.html", "ÃƒÆ’Ã¢â‚¬Â°tape 2 : ajouter CSS", "ÃƒÆ’Ã¢â‚¬Â°tape 3 : tester"]}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ CrÃƒÆ’Ã‚Â©e une liste de tÃƒÆ’Ã‚Â¢ches visible au-dessus de la zone de saisie de l'utilisateur.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ La liste ne s'affiche QUE si tu en crÃƒÆ’Ã‚Â©es une ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â n'en crÃƒÆ’Ã‚Â©e pas pour de simples rÃƒÆ’Ã‚Â©ponses.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Utilise UNIQUEMENT pour les tÃƒÆ’Ã‚Â¢ches multi-ÃƒÆ’Ã‚Â©tapes (ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 3 ÃƒÆ’Ã‚Â©tapes) en mode agent.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Marque chaque tÃƒÆ’Ã‚Â¢che terminÃƒÆ’Ã‚Â©e avec check_todo au fur et ÃƒÆ’Ã‚Â  mesure.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Quand toutes sont cochÃƒÆ’Ã‚Â©es, la liste disparaÃƒÆ’Ã‚Â®t automatiquement.`,

    check_todo: `=== check_todo ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Marquer une tÃƒÆ’Ã‚Â¢che comme terminÃƒÆ’Ã‚Â©e ===
Usage : <tool>{"check_todo": 0}</tool>   ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ marque la tÃƒÆ’Ã‚Â¢che nÃƒâ€šÃ‚Â°0 (premiÃƒÆ’Ã‚Â¨re)
         <tool>{"check_todo": "all"}</tool> ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ marque TOUTES les tÃƒÆ’Ã‚Â¢ches
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ L'index est 0-basÃƒÆ’Ã‚Â© (premiÃƒÆ’Ã‚Â¨re tÃƒÆ’Ã‚Â¢che = 0, deuxiÃƒÆ’Ã‚Â¨me = 1ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦).
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Quand toutes les tÃƒÆ’Ã‚Â¢ches sont cochÃƒÆ’Ã‚Â©es, la liste disparaÃƒÆ’Ã‚Â®t automatiquement aprÃƒÆ’Ã‚Â¨s 1,5s.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Appelle check_todo IMMÃƒÆ’Ã¢â‚¬Â°DIATEMENT aprÃƒÆ’Ã‚Â¨s avoir accompli chaque ÃƒÆ’Ã‚Â©tape.`,

    save_project_structure: `=== save_project_structure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MÃƒÆ’Ã‚Â©moriser la structure du projet ===
Usage : <tool>{"save_project_structure": "E:/monprojet/\\nÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ index.html\\nÃƒÂ¢Ã¢â‚¬ÂÃ…â€œÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ style.css\\nÃƒÂ¢Ã¢â‚¬ÂÃ¢â‚¬ÂÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ script.js"}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Sauvegarde la structure dans la base de donnÃƒÆ’Ã‚Â©es, liÃƒÆ’Ã‚Â©e ÃƒÆ’Ã‚Â  la conversation.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Elle persiste : si l'utilisateur reprend la conversation plus tard, la structure est rechargÃƒÆ’Ã‚Â©e.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Elle est injectÃƒÆ’Ã‚Â©e AUTOMATIQUEMENT dans le contexte systÃƒÆ’Ã‚Â¨me ÃƒÆ’Ã‚Â  chaque message ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tu n'as pas besoin de la relire.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Mets ÃƒÆ’Ã‚Â  jour aprÃƒÆ’Ã‚Â¨s avoir crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©/modifiÃƒÆ’Ã‚Â© des fichiers ou des dossiers importants.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ IMPORTANT : appelle save_project_structure dÃƒÆ’Ã‚Â¨s que tu crÃƒÆ’Ã‚Â©es ou modifies la structure d'un projet.`,

    get_project_structure: `=== get_project_structure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Lire la structure mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©e ===
Usage : <tool>{"get_project_structure": ""}</tool>
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Retourne la structure de projet actuellement mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©e pour cette conversation.
ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Note : la structure est dÃƒÆ’Ã‚Â©jÃƒÆ’Ã‚Â  injectÃƒÆ’Ã‚Â©e dans le contexte ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilise get_project_structure seulement si tu veux la relire explicitement.`,
};
