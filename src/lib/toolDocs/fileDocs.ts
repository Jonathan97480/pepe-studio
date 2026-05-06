import type { ToolDocsMap } from "../toolDocsTypes";

export const TOOL_DOCS_FILE: ToolDocsMap = {
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

};

