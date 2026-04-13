import { invoke } from "@tauri-apps/api/tauri";

export const BRAVE_SEARCH_KEY   = "search_brave_api_key";
export const SERPER_SEARCH_KEY  = "search_serper_api_key";
export const TAVILY_SEARCH_KEY  = "search_tavily_api_key";

export type SearchWebSource = "duckduckgo" | "brave" | "serper" | "tavily";

export type SearchWebQuery = {
    query: string;
    locale?: string;
    source?: SearchWebSource;
    apiKey?: string;
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
        default:       return "";
    }
}

export async function searchWeb(query: SearchWebQuery): Promise<SearchWebResult[]> {
    const source: SearchWebSource = query.source ?? "duckduckgo";
    const apiKey = query.apiKey ?? getStoredKey(source);
    return invoke<SearchWebResult[]>("search_web", {
        query: query.query,
        source,
        apiKey: apiKey || null,
        locale: query.locale ?? null,
    });
}

