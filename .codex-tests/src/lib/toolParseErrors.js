"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildToolParseError = buildToolParseError;
/**
 * Construit le message d'erreur à renvoyer au LLM lorsque le parsing JSON
 * d'un bloc <tool> échoue.
 *
 * @param rawJson   - Le contenu brut du bloc <tool> qui n'a pas pu être parsé
 * @param parseError - L'erreur de parsing originale
 * @param attempt   - Numéro de tentative (1 = premier échec, 2+ = échec persistant)
 */
function buildToolParseError(rawJson, parseError, attempt) {
    const isBatchRename = rawJson.includes('"batch_rename"');
    const isReadPdfBatch = rawJson.includes('"read_pdf_batch"');
    const isWriteFile = rawJson.includes('"write_file"');
    if (attempt <= 2) {
        if (isBatchRename) {
            return (`[Erreur batch_rename — JSON invalide ou trop long]\n` +
                `Le JSON de ton batch_rename est mal formé (${parseError}).\n` +
                `SOLUTION OBLIGATOIRE : Divise les renommages en 2 appels séparés de 15 fichiers max :\n` +
                `Appel 1 → <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ← 15 premiers\n` +
                `Appel 2 → <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ← 15 suivants\n` +
                `✅ ⚠️ Format TABLEAU NATIF obligatoire — PAS de guillemets supplémentaires autour du tableau.\n` +
                `✅ ⚠️ Aucun guillemet à échapper dans les chemins de fichiers.`);
        }
        if (isReadPdfBatch) {
            return (`[Erreur read_pdf_batch — JSON invalide]\n` +
                `Le JSON est mal formé (${parseError}).\n` +
                `SOLUTION : Utilise un tableau natif JSON (PAS une chaîne sérialisée) :\n` +
                `<tool>{"read_pdf_batch": ["E:/chemin/fichier1.pdf", "E:/chemin/fichier2.pdf", ...]}</tool>\n` +
                `✅ ⚠️ Maximum 30 chemins par appel. Si > 30 fichiers, fais 2 appels séparés.`);
        }
        if (isWriteFile) {
            return (`[Erreur write_file — FORMAT TAG OBLIGATOIRE]\n` +
                `ARRÊTE toute tentative JSON pour write_file. Utilise EXACTEMENT ce format (commence par < pas par {) :\n` +
                `\n` +
                `<write_file path="D:/projetavenire/index.html">\n` +
                `<!DOCTYPE html>\n` +
                `<html>...contenu complet ici...</html>\n` +
                `</write_file>\n` +
                `\n` +
                `✅ ⚠️ La balise DOIT commencer par le caractère < (chevron), PAS par { (accolade).\n` +
                `✅ ⚠️ NE pas envelopper dans <tool>...</tool> — le format TAG est DIRECT, sans wrapper.\n` +
                `Adapte le path avec le vrai chemin du fichier à créer.`);
        }
        return (`[Erreur JSON dans <tool>] Le JSON est invalide (${parseError}).\n` +
            `Cause : les guillemets dans le champ content ne sont PAS echappes.\n` +
            `Regles absolues :\n` +
            `  1. Remplace CHAQUE guillemet dans content par backslash+guillemet (\\")\n` +
            `  2. Remplace chaque saut de ligne par backslash+n (\\n)\n` +
            `  3. NE mets AUCUN vrai saut de ligne dans la valeur JSON\n` +
            `Exemple valide : {"create_skill":"x","content":"Write-Host \\"bonjour\\""}\n` +
            `Reemet le <tool> avec le JSON corrige.`);
    }
    // Tentatives multiples — stratégie plus agressive
    if (isBatchRename) {
        return (`[Erreur batch_rename persistante — SPLIT OBLIGATOIRE]\n` +
            `Impossible de parser le JSON. RÈGLE : max 10 fichiers par appel batch_rename.\n` +
            `Génère autant d'appels <tool>{"batch_rename": [...]}</tool> que nécessaire (10 par appel).`);
    }
    if (isReadPdfBatch) {
        return (`[Erreur read_pdf_batch persistante — SPLIT OBLIGATOIRE]\n` +
            `Impossible de parser le JSON. Réduis à 10 chemins maximum par appel.\n` +
            `<tool>{"read_pdf_batch": ["chemin1.pdf", ..., "chemin10.pdf"]}</tool>`);
    }
    if (isWriteFile) {
        return (`[ECHEC REPEATED write_file — FALLBACK CMD OBLIGATOIRE]\n` +
            `Le format TAG n'a pas fonctionné. Ecris le fichier via PowerShell cmd à la place :\n` +
            `\n` +
            `<tool>{"cmd": "New-Item -ItemType Directory -Force 'D:/projetavenire'; Set-Content -Path 'D:/projetavenire/index.html' -Encoding UTF8 -Value '<!DOCTYPE html><html><head><title>Page</title></head><body><h1>Pepe-Studio</h1></body></html>'"}</tool>\n` +
            `\n` +
            `Adapte le -Path et le -Value avec le vrai contenu. NE retente PAS write_file.`);
    }
    return (`[Erreur JSON persistante apres plusieurs tentatives] Nouvelle strategie OBLIGATOIRE :\n` +
        `Remplace TOUS les guillemets doubles dans ton script PowerShell par des apostrophes simples (').\n` +
        `PowerShell accepte les deux. Exemple : Write-Host 'Bonjour' au lieu de Write-Host "Bonjour".\n` +
        `Reemet le <tool> create_skill avec uniquement des apostrophes simples dans content.`);
}
