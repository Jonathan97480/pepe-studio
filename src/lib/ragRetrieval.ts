import { invoke } from "@tauri-apps/api/tauri";
import { sanitizeOutput } from "./outputCompressor";

export type ChunkResult = {
    doc_id: number;
    doc_name: string;
    page_num: number;
    chunk_text: string;
};

/** Formate une liste de chunks en bloc de contexte prêt à injecter */
function formatChunks(results: ChunkResult[]): string {
    const grouped = new Map<string, ChunkResult[]>();
    for (const r of results) {
        if (!grouped.has(r.doc_name)) grouped.set(r.doc_name, []);
        grouped.get(r.doc_name)!.push(r);
    }
    const lines: string[] = ["[Contenu du document]"];
    for (const [docName, chunks] of grouped.entries()) {
        for (const chunk of chunks) {
            if (chunk.chunk_text.trim()) {
                lines.push(`\n📄 "${docName}" — Page ${chunk.page_num} :\n${chunk.chunk_text}`);
            }
        }
    }
    return lines.length > 1 ? lines.join("\n") : "";
}

/**
 * Recherche les passages pertinents dans les documents indexés.
 * Stratégie hybride garantie :
 *   1. FTS5 en tête (passages les plus pertinents pour la requête)
 *   2. Chunks positionnels TOUJOURS inclus pour compléter jusqu'à limit
 * → Le LLM reçoit TOUJOURS du vrai contenu, même si FTS5 retourne rien.
 */
export async function retrieveChunks(
    query: string,
    docIds: number[],
    limit = 6,
): Promise<string> {
    if (docIds.length === 0) return "";

    const seen = new Set<string>();
    const key = (c: ChunkResult) => `${c.doc_id}:${c.page_num}`;
    const merged: ChunkResult[] = [];

    // ── Étape 1 : FTS5 (résultats pertinents en tête) ────────────────────────
    if (query.trim()) {
        const safeQuery = query.replace(/["*()\-:^]/g, " ").replace(/\s+/g, " ").trim();
        try {
            const ftsResults = await invoke<ChunkResult[]>("search_chunks", {
                query: safeQuery,
                docIds,
                limit,
            });
            for (const c of ftsResults) {
                const k = key(c);
                if (!seen.has(k)) { seen.add(k); merged.push(c); }
            }
        } catch (err) {
            console.warn("[RAG] search_chunks failed", err);
        }
    }

    // ── Étape 2 : chunks positionnels (toujours, pour garantir du contenu) ───
    for (const docId of docIds) {
        if (merged.length >= limit) break;
        try {
            const chunks = await invoke<ChunkResult[]>("get_document_chunks", {
                docId,
                limit,
            });
            for (const c of chunks) {
                if (merged.length >= limit) break;
                const k = key(c);
                if (!seen.has(k)) { seen.add(k); merged.push(c); }
            }
        } catch (err) {
            console.error("[RAG] get_document_chunks failed for docId", docId, err);
        }
    }

    return formatChunks(merged);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recherche sémantique dans les meta-tags de conversations (Pepe-Compressor)
// ─────────────────────────────────────────────────────────────────────────────

type MetaResult = {
    conversation_id: number;
    day_label: string;
    role: string;
    content: string;
};

/**
 * Recherche dans les meta-tags compressés des messages.
 * Retourne un bloc de contexte compact à injecter dans le prompt.
 *
 * Exemple : retrieveCompressedHistory("VM Linux SSH")
 * → "[Log|Erreur: connexion SSH Ubuntu refusée] ..."
 */
export async function retrieveCompressedHistory(
    query: string,
    limit = 8,
): Promise<string> {
    if (!query.trim()) return "";
    try {
        const results = await invoke<MetaResult[]>("search_meta_tags", {
            query,
            limit,
        });
        if (!results.length) return "";
        const lines = ["[Historique compressé — mémoire sémantique]"];
        for (const r of results) {
            const label = r.role === "user" ? "👤" : "🤖";
            lines.push(`${label} (Conv #${r.conversation_id} — ${r.day_label}) ${r.content}`);
        }
        // On compresse encore le bloc avant injection (évite les dérives)
        const { compressed } = sanitizeOutput(lines.join("\n"), { tokenBudget: 600 });
        return compressed;
    } catch (err) {
        console.warn("[RAG] search_meta_tags failed", err);
        return "";
    }
}
