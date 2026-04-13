import { ApiClientRequest, apiClient } from "./ApiClient";
import { SearchWebQuery, searchWeb } from "./SearchWeb";
import { searchLibrary, queryDocs } from "./Context7Client";

export type McpTool = {
    id: string;
    name: string;
    description: string;
    schema: Record<string, any>;
    execute: (payload: any) => Promise<any>;
};

export class McpManager {
    private tools: Record<string, McpTool> = {};

    register(tool: McpTool) {
        this.tools[tool.id] = tool;
    }

    list() {
        return Object.values(this.tools);
    }

    async execute(id: string, payload: any) {
        const tool = this.tools[id];
        if (!tool) {
            throw new Error(`Outil MCP inconnu : ${id}`);
        }
        return tool.execute(payload);
    }
}

export const defaultMcpManager = new McpManager();

defaultMcpManager.register({
    id: "search-web",
    name: "Recherche Web",
    description: "Interroge un moteur de recherche externe pour récupérer des informations en temps réel.",
    schema: {
        type: "object",
        properties: {
            query: { type: "string" },
            locale: { type: "string" },
            source: { type: "string", enum: ["brave", "serper", "tavily"] },
        },
        required: ["query"],
    },
    execute: async (payload: SearchWebQuery) => {
        return searchWeb(payload);
    },
});

defaultMcpManager.register({
    id: "api-client",
    name: "Client API Universel",
    description: "Appelle dynamiquement un endpoint REST JSON avec méthode, en-têtes et charge utile.",
    schema: {
        type: "object",
        properties: {
            url: { type: "string" },
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
            headers: { type: "object" },
            body: { type: "object" },
        },
        required: ["url"],
    },
    execute: async (payload: ApiClientRequest) => {
        return apiClient(payload);
    },
});

defaultMcpManager.register({
    id: "context7-search",
    name: "Context7 — Rechercher une bibliothèque",
    description: "Recherche une bibliothèque dans l'index Context7 et retourne son ID. À utiliser avant context7-docs pour trouver l'identifiant exact.",
    schema: {
        type: "object",
        properties: {
            libraryName: { type: "string", description: "Nom de la bibliothèque (ex: react, next.js, tauri)" },
            query: { type: "string", description: "Contexte ou question pour affiner le classement" },
        },
        required: ["libraryName"],
    },
    execute: async (payload: { libraryName: string; query?: string }) => {
        return searchLibrary(payload.libraryName, payload.query ?? "");
    },
});

defaultMcpManager.register({
    id: "context7-docs",
    name: "Context7 — Documentation à jour",
    description: "Récupère la documentation officielle et à jour d'une bibliothèque via son ID Context7. Utilise context7-search pour trouver l'ID si nécessaire.",
    schema: {
        type: "object",
        properties: {
            libraryId: { type: "string", description: "ID Context7 (ex: /vercel/next.js, /supabase/supabase, /tauri-apps/tauri)" },
            query: { type: "string", description: "Question ou sujet précis (ex: 'authentication middleware', 'file system API')" },
            tokens: { type: "number", description: "Budget token de la réponse (défaut: 4000, max: 10000)" },
        },
        required: ["libraryId", "query"],
    },
    execute: async (payload: { libraryId: string; query: string; tokens?: number }) => {
        return queryDocs(payload.libraryId, payload.query, payload.tokens);
    },
});
