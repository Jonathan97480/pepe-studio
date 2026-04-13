/**
 * skillPatcher.ts
 * Helper pour appliquer un patch Search & Replace sur un skill via Tauri.
 *
 * L'IA produit une réponse structurée :
 *   FILE: <nom_du_skill>
 *   SEARCH:
 *   <bloc exact à remplacer>
 *   REPLACE:
 *   <nouveau bloc>
 *
 * parsePatchBlocks() extrait tous les blocs de patch présents dans un texte.
 * applyPatch() appelle la commande Tauri `patch_skill` pour un bloc donné.
 * applyAllPatches() traite tous les blocs trouvés dans la réponse IA.
 */

import { invoke } from "@tauri-apps/api/tauri";

export interface PatchBlock {
    file: string;
    search: string;
    replace: string;
}

export interface PatchResult {
    file: string;
    success: boolean;
    message: string;
}

/**
 * Extrait tous les blocs FILE/SEARCH/REPLACE présents dans `text`.
 * Format attendu (insensible à la casse pour les mots-clés) :
 *
 *   FILE: mon_skill
 *   SEARCH:
 *   code existant
 *   REPLACE:
 *   nouveau code
 *
 * Les blocs peuvent se répéter dans le même message.
 */
export function parsePatchBlocks(text: string): PatchBlock[] {
    const blocks: PatchBlock[] = [];

    // Sépare le texte en segments débutant par FILE:
    const segments = text.split(/(?=^FILE:\s*\S)/im);

    for (const segment of segments) {
        const fileMatch = segment.match(/^FILE:\s*(.+)$/im);
        if (!fileMatch) continue;

        const file = fileMatch[1].trim();

        // Cherche SEARCH: ... REPLACE: ...
        const searchMatch = segment.match(/^SEARCH:\s*\n([\s\S]*?)(?=^REPLACE:\s*$)/im);
        const replaceMatch = segment.match(/^REPLACE:\s*\n([\s\S]*?)(?=^FILE:|\s*$)/im);

        if (!searchMatch || !replaceMatch) continue;

        const search = searchMatch[1].replace(/\r\n/g, "\n").trimEnd();
        const replace = replaceMatch[1].replace(/\r\n/g, "\n").trimEnd();

        if (search.length === 0) continue;

        blocks.push({ file, search, replace });
    }

    return blocks;
}

/**
 * Applique un seul bloc de patch via la commande Tauri `patch_skill`.
 */
export async function applyPatch(block: PatchBlock): Promise<PatchResult> {
    try {
        const message = await invoke<string>("patch_skill", {
            name: block.file,
            search: block.search,
            replace: block.replace,
        });
        return { file: block.file, success: true, message };
    } catch (err) {
        return {
            file: block.file,
            success: false,
            message: typeof err === "string" ? err : String(err),
        };
    }
}

/**
 * Parse et applique tous les blocs de patch trouvés dans la réponse IA.
 * Retourne un tableau de résultats (un par bloc).
 */
export async function applyAllPatches(aiResponse: string): Promise<PatchResult[]> {
    const blocks = parsePatchBlocks(aiResponse);
    if (blocks.length === 0) return [];
    return Promise.all(blocks.map(applyPatch));
}

/**
 * Retourne true si la réponse IA contient au moins un bloc patch.
 */
export function hasPatchBlocks(text: string): boolean {
    return /^FILE:\s*\S/im.test(text) &&
           /^SEARCH:\s*$/im.test(text) &&
           /^REPLACE:\s*$/im.test(text);
}
