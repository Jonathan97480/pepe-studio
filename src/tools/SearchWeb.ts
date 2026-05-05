import { invoke } from "@tauri-apps/api/tauri";

export const BRAVE_SEARCH_KEY   = "search_brave_api_key";
export const SERPER_SEARCH_KEY  = "search_serper_api_key";
export const TAVILY_SEARCH_KEY  = "search_tavily_api_key";
export const SEARXNG_URL_KEY    = "search_searxng_url";

export type SearchWebSource = "duckduckgo" | "brave" | "serper" | "tavily" | "searxng";

export type SearchWebQuery = {
    query: string;
    locale?: string;
    source?: SearchWebSource;
    apiKey?: string;
    searxngUrl?: string;
};

export type SearchWebResult = {
    title: string;
    snippet: string;
    url: string;
    source: string;
};

function getStoredKey(source: SearchWebSource): string {
    switch (source) {
        case "brave":  return localStorage.getItem(BRAVE_SEARCH_KEY)  ?? "";
        case "serper": return localStorage.getItem(SERPER_SEARCH_KEY) ?? "";
        case "tavily": return localStorage.getItem(TAVILY_SEARCH_KEY) ?? "";
        case "searxng": return localStorage.getItem(SEARXNG_URL_KEY) ?? "";
        default:       return "";
    }
}

export async function searchWeb(query: SearchWebQuery): Promise<SearchWebResult[]> {
    const source: SearchWebSource = query.source ?? "duckduckgo";
    const apiKey = query.apiKey ?? (source !== "searxng" ? getStoredKey(source) : null);
    const searxngUrl = query.searxngUrl ?? (source === "searxng" ? getStoredKey(source) : null);
    return invoke<SearchWebResult[]>("search_web", {
        query: query.query,
        source,
        apiKey: apiKey || null,
        locale: query.locale ?? null,
        searxngUrl: searxngUrl || null,
    });
}

