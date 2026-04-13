/**
 * Context7Client.ts
 * Client pour l'API REST Context7 v2 (https://context7.com/api/v2)
 *
 * Deux endpoints utilisés :
 *   GET /libs/search  — résoudre un nom de bibliothèque vers un ID Context7
 *   GET /context      — récupérer la documentation d'une bibliothèque
 */

const BASE_URL = "https://context7.com/api/v2";
/** Clé localStorage où l'utilisateur stocke sa clé API Context7 */
const STORAGE_KEY = "customapp_context7_apikey";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY) ?? null;
}

function buildHeaders(): Record<string, string> {
    const key = getApiKey();
    if (key?.trim()) {
        return { Authorization: `Bearer ${key.trim()}` };
    }
    return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Context7LibResult = {
    id: string;
    title: string;
    description?: string;
    stars?: number;
    trustScore?: number;
};

export type Context7SearchResponse = {
    results: Context7LibResult[];
};

export type Context7CodeSnippet = {
    codeTitle: string;
    codeList: { code: string; language?: string }[];
};

export type Context7InfoSnippet = {
    content: string;
};

export type Context7DocsResponse = {
    codeSnippets: Context7CodeSnippet[];
    infoSnippets: Context7InfoSnippet[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Requêtes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recherche une bibliothèque par nom et retourne les 5 premiers résultats
 * avec leurs IDs Context7 (ex: /vercel/next.js).
 */
export async function searchLibrary(
    libraryName: string,
    query: string,
): Promise<string> {
    const url = new URL(`${BASE_URL}/libs/search`);
    url.searchParams.set("libraryName", libraryName);
    if (query) url.searchParams.set("query", query);

    const res = await fetch(url.toString(), { headers: buildHeaders() });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Context7 search [${res.status}]: ${err.message ?? res.statusText}`);
    }

    const data: Context7SearchResponse = await res.json();
    if (!data.results?.length) {
        return `Aucune bibliothèque trouvée pour "${libraryName}".`;
    }

    const top5 = data.results.slice(0, 5);
    const lines = [
        `Résultats Context7 pour "${libraryName}" :`,
        ...top5.map(
            (r, i) =>
                `${i + 1}. ${r.title} — ID: ${r.id}` +
                (r.description ? `\n   ${r.description.slice(0, 120)}` : ""),
        ),
        "",
        `→ Utilise l'outil context7-docs avec l'ID de la bibliothèque pour obtenir la documentation.`,
    ];
    return lines.join("\n");
}

/**
 * Récupère la documentation d'une bibliothèque via son ID Context7.
 * Retourne un bloc texte compact (code + info) prêt à être injecté dans le prompt.
 *
 * @param libraryId  ID Context7 (ex: "/vercel/next.js", "/supabase/supabase")
 * @param query      Question ou sujet précis (ex: "authentication middleware")
 * @param tokens     Budget token de la réponse (défaut : 4000)
 */
export async function queryDocs(
    libraryId: string,
    query: string,
    tokens = 4000,
): Promise<string> {
    const url = new URL(`${BASE_URL}/context`);
    url.searchParams.set("libraryId", libraryId);
    url.searchParams.set("query", query);
    url.searchParams.set("tokens", String(tokens));
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString(), { headers: buildHeaders() });

    if (res.status === 301) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Bibliothèque déplacée. Nouvel ID : ${data.redirectUrl ?? "inconnu"}`);
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Context7 docs [${res.status}]: ${err.message ?? res.statusText}`);
    }

    const data: Context7DocsResponse = await res.json();

    const sections: string[] = [`[Documentation Context7 — ${libraryId}]\nSujet : ${query}\n`];

    // Info snippets
    if (data.infoSnippets?.length) {
        for (const info of data.infoSnippets.slice(0, 6)) {
            if (info.content?.trim()) {
                sections.push(info.content.trim());
            }
        }
    }

    // Code snippets
    if (data.codeSnippets?.length) {
        for (const snippet of data.codeSnippets.slice(0, 8)) {
            if (snippet.codeTitle) sections.push(`\n### ${snippet.codeTitle}`);
            for (const code of snippet.codeList.slice(0, 3)) {
                if (code.code?.trim()) {
                    const lang = code.language ?? "";
                    sections.push(`\`\`\`${lang}\n${code.code.trim()}\n\`\`\``);
                }
            }
        }
    }

    if (sections.length <= 1) {
        return `Aucune documentation trouvée pour "${libraryId}" sur le sujet "${query}".`;
    }

    return sections.join("\n");
}

/** Clé localStorage utilisée pour stocker la clé API Context7 */
export { STORAGE_KEY as CONTEXT7_STORAGE_KEY };
