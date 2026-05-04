import { sanitizeLlmJson, extractSimpleTool, extractWriteFileTool } from "./chatUtils";

export interface ParseResult {
    parsed: Record<string, string> | null;
    error: unknown | null;
}

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
export function parseToolBlock(rawJson: string): ParseResult {
    let parsed: Record<string, string> | null = null;
    let error: unknown | null = null;

    try {
        parsed = JSON.parse(sanitizeLlmJson(rawJson));
        return { parsed, error: null };
    } catch (jsonErr) {
        error = jsonErr;
    }

    // Tentative de récupération selon le type d'outil détecté
    if (rawJson.includes('"write_file"')) {
        const extracted = extractWriteFileTool(rawJson);
        if (extracted) {
            return { parsed: extracted as unknown as Record<string, string>, error: null };
        }
    } else {
        const extracted = extractSimpleTool(rawJson);
        if (extracted) {
            return { parsed: extracted as unknown as Record<string, string>, error: null };
        }
    }

    return { parsed: null, error };
}
