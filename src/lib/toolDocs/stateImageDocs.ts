import type { ToolDocsMap } from "../toolDocsTypes";

export const TOOL_DOCS_STATE_IMAGE: ToolDocsMap = {
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
⚠️ RÈGLE ABSOLUE : le prompt DOIT être en anglais.
• Si l'utilisateur écrit en français, traduis d'abord en mots-clés anglais avant d'appeler generate_image.
Usage : <tool>{"generate_image": "a ginger cat sitting on a rooftop at sunset, photorealistic"}</tool>
Usage avancé : <tool>{"generate_image": "portrait of an elven warrior", "preset": "portrait", "aspect_ratio": "16/9", "negative_prompt": "blurry, low quality", "steps": 40, "upscale": true, "seed": 42}</tool>

Paramètres optionnels :
• aspect_ratio : ratio souhaité (ex: "16/9", "9:16", "1:1", "landscape", "portrait", "square")
    - Si width/height sont absents, ils sont calculés automatiquement depuis ce ratio
• preset : profil de génération. Valeurs: "portrait", "wide_scene", "product", "illustration", "cinematic", "architecture", "food", "fantasy_art", "logo_flat", "default"
    - Si absent, le preset est choisi automatiquement selon le prompt
    - Règle de sélection recommandée:
      • portrait: visage/personnage principal (gros plan, headshot, selfie)
      • wide_scene: personnage dans grand décor, plan large, paysage cinématique
      • product: objet isolé, packshot, e-commerce
      • illustration: anime, dessin, concept art, rendu stylisé
    • cinematic: scène dramatique type film, ambiance cinéma, éclairage contrasté
    • architecture: intérieur/extérieur bâtiment, immobilier, rendu d'espace
    • food: plat culinaire, photo de restaurant, packshot alimentaire
    • fantasy_art: univers fantasy, créatures, magie, armures épiques
    • logo_flat: logo/icône en style vectoriel simple et propre
        - Priorité auto: si le prompt contient un humain/personnage + un grand décor, utiliser wide_scene
• negative_prompt : ce que tu NE veux PAS dans l'image (ex: "flou, texte, marque")
    - Alias tolérés : negativePrompt, negativeprompt
    - Si absent, un negative_prompt par défaut est appliqué automatiquement
• steps : nombre d'étapes (défaut conseillé: 35 à 40 selon preset, max: 50)
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
