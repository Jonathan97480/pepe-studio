"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseToolBlock = parseToolBlock;
const chatUtils_1 = require("./chatUtils");
/**
 * Tente de parser un bloc JSON extrait d'une balise <tool>.
 *
 * Stratégie en cascade :
 * 1. JSON.parse après sanitisation
 * 2. Fallback extractWriteFileTool si le JSON contient "write_file"
 * 3. Fallback extractSimpleTool pour les outils à valeur unique
 *
 * Retourne `{ parsed, error: null }` si un des chemins réussit,
 * `{ parsed: null, error }` si tous échouent.
 */
function parseToolBlock(rawJson) {
    let parsed = null;
    let error = null;
    try {
        parsed = JSON.parse((0, chatUtils_1.sanitizeLlmJson)(rawJson));
        return { parsed, error: null };
    }
    catch (jsonErr) {
        error = jsonErr;
    }
    // Tentative de récupération selon le type d'outil détecté
    if (rawJson.includes('"write_file"')) {
        const extracted = (0, chatUtils_1.extractWriteFileTool)(rawJson);
        if (extracted) {
            return { parsed: extracted, error: null };
        }
    }
    else {
        const extracted = (0, chatUtils_1.extractSimpleTool)(rawJson);
        if (extracted) {
            return { parsed: extracted, error: null };
        }
    }
    return { parsed: null, error };
}
