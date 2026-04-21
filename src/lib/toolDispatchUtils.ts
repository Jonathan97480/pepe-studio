import { TOOL_DOCS } from "./toolDocs";

export type ParsedToolLike = Record<string, unknown>;
export type ToolCatalogEntry = {
    id: string;
    category: string;
    purpose: string;
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
    { id: "get_hardware_info", category: "machine", purpose: "obtenir la RAM, le CPU et le GPU détecté" },
    { id: "cmd", category: "terminal", purpose: "commande PowerShell ponctuelle" },
    { id: "create_terminal", category: "terminal", purpose: "ouvrir un terminal persistant avec cwd" },
    { id: "terminal_exec", category: "terminal", purpose: "exécuter une commande dans un terminal persistant" },
    { id: "terminal_start_interactive", category: "terminal", purpose: "démarrer une session interactive type ssh/repl" },
    { id: "terminal_send_stdin", category: "terminal", purpose: "envoyer du texte à une session interactive" },
    { id: "close_terminal", category: "terminal", purpose: "fermer un terminal persistant" },
    { id: "list_terminals", category: "terminal", purpose: "lister les terminaux ouverts" },
    { id: "get_terminal_history", category: "terminal", purpose: "relire l'historique d'un terminal" },
    { id: "read_file", category: "fichiers", purpose: "lire un fichier texte" },
    { id: "write_file", category: "fichiers", purpose: "créer un nouveau fichier" },
    { id: "patch_file", category: "fichiers", purpose: "modifier un fichier existant" },
    { id: "read_pdf", category: "pdf", purpose: "lire un PDF complet" },
    { id: "read_pdf_brief", category: "pdf", purpose: "lire rapidement le début d'un PDF" },
    { id: "read_pdf_batch", category: "pdf", purpose: "lire plusieurs PDFs en lot" },
    { id: "list_folder_pdfs", category: "pdf", purpose: "lister les PDFs d'un dossier" },
    { id: "batch_rename", category: "pdf", purpose: "renommer plusieurs fichiers en un appel" },
    { id: "create_skill", category: "skills", purpose: "créer un skill ps1/python/node/http/composite" },
    { id: "run_skill", category: "skills", purpose: "exécuter un skill" },
    { id: "read_skill", category: "skills", purpose: "lire le code d'un skill" },
    { id: "patch_skill", category: "skills", purpose: "modifier un skill existant" },
    { id: "delete_skill", category: "skills", purpose: "supprimer un skill" },
    { id: "http_request", category: "web", purpose: "appel REST direct" },
    { id: "search_web", category: "web", purpose: "recherche web récente" },
    { id: "scrape_url", category: "web", purpose: "extraire le contenu d'une page web" },
    { id: "open_browser", category: "browser", purpose: "ouvrir une URL dans le navigateur intégré" },
    { id: "start_dev_server", category: "browser", purpose: "servir un dossier local" },
    { id: "stop_dev_server", category: "browser", purpose: "arrêter le serveur local" },
    { id: "get_browser_errors", category: "browser", purpose: "lire les erreurs JS capturées" },
    { id: "get_dev_server_info", category: "browser", purpose: "voir l'état du serveur local" },
    { id: "save_image", category: "images", purpose: "sauvegarder une image base64" },
    { id: "download_image", category: "images", purpose: "télécharger une image depuis une URL" },
    { id: "ask_user", category: "orchestration", purpose: "poser une question interactive" },
    { id: "set_mode", category: "orchestration", purpose: "changer de mode ask/plan/agent" },
    { id: "request_agent_mode", category: "orchestration", purpose: "demander le passage en mode agent" },
    { id: "get_plan", category: "planning", purpose: "lire le plan courant" },
    { id: "save_plan", category: "planning", purpose: "sauvegarder le plan courant" },
    { id: "set_todo", category: "planning", purpose: "créer la todo list visible" },
    { id: "check_todo", category: "planning", purpose: "cocher une tâche de la todo" },
    { id: "search_conversation", category: "memory", purpose: "chercher dans les conversations passées" },
    { id: "save_project_structure", category: "memory", purpose: "mémoriser la structure du projet" },
    { id: "get_project_structure", category: "memory", purpose: "relire la structure mémorisée" },
    { id: "context7-search", category: "docs", purpose: "trouver l'id Context7 d'une bibliothèque" },
    { id: "context7-docs", category: "docs", purpose: "lire la documentation officielle d'une bibliothèque" },
    { id: "create_mcp_server", category: "mcp", purpose: "créer un serveur MCP Node.js" },
    { id: "start_mcp_server", category: "mcp", purpose: "démarrer un serveur MCP" },
    { id: "call_mcp_tool", category: "mcp", purpose: "appeler un outil exposé par un serveur MCP" },
    { id: "list_mcp_servers", category: "mcp", purpose: "lister les serveurs MCP" },
    { id: "save_fact", category: "profil", purpose: "balise inline pour mémoriser un fait utilisateur" },
    { id: "get_tool_doc", category: "docs", purpose: "obtenir la doc détaillée d'un outil" },
];

const ACTION_TOOL_KEYS = [
    "create_skill",
    "run_skill",
    "cmd",
    "command",
    "http_request",
    "write_file",
    "create_mcp_server",
    "start_mcp_server",
    "call_mcp_tool",
    "open_browser",
    "start_dev_server",
    "stop_dev_server",
    "get_browser_errors",
    "save_image",
    "download_image",
    "scrape_url",
    "search_web",
    "context7-search",
    "context7-docs",
    "save_plan",
    "create_terminal",
    "terminal_exec",
    "terminal_start_interactive",
    "terminal_send_stdin",
    "close_terminal",
];

export function isActionTool(parsedTool: ParsedToolLike): boolean {
    return ACTION_TOOL_KEYS.some((key) => parsedTool[key] !== undefined && parsedTool[key] !== null && parsedTool[key] !== "");
}

export function describeTool(parsedTool: ParsedToolLike): string {
    const orderedKeys = [
        "cmd",
        "command",
        "create_skill",
        "run_skill",
        "http_request",
        "read_file",
        "write_file",
        "create_mcp_server",
        "start_mcp_server",
        "call_mcp_tool",
        "open_browser",
        "start_dev_server",
    ];

    for (const key of orderedKeys) {
        const value = parsedTool[key];
        if (value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }

    return "action";
}

export function resolveToolDoc(queryValue: unknown):
    | { type: "exact"; title: string; body: string }
    | { type: "matches"; title: string; body: string }
    | { type: "missing"; title: string; body: string } {
    const rawQuery = String(queryValue ?? "");
    const query = rawQuery.toLowerCase().trim();
    const exactMatch = TOOL_DOCS[query];

    if (exactMatch) {
        return {
            type: "exact",
            title: `[Documentation : ${query}]`,
            body: exactMatch,
        };
    }

    const matches = Object.entries(TOOL_DOCS).filter(([key]) => key.toLowerCase().includes(query));
    if (matches.length === 1) {
        return {
            type: "matches",
            title: `[Documentation : ${matches[0][0]}]`,
            body: matches[0][1],
        };
    }

    if (matches.length > 1) {
        return {
            type: "matches",
            title: `[Documentation — ${matches.length} outils trouvés pour "${rawQuery}"]`,
            body: matches.map(([, doc]) => doc).join("\n\n" + "—".repeat(60) + "\n\n"),
        };
    }

    return {
        type: "missing",
        title: `[get_tool_doc] Aucun outil trouvé pour "${rawQuery}".`,
        body: `Outils documentés :\n${Object.keys(TOOL_DOCS).join(", ")}`,
    };
}

export function buildCompactToolCatalog(enabledIds?: Set<string>): string {
    const groups = new Map<string, ToolCatalogEntry[]>();
    for (const entry of TOOL_CATALOG) {
        if (enabledIds && entry.id !== "get_tool_doc" && entry.id !== "ask_user" && !enabledIds.has(entry.id)) {
            continue;
        }
        if (!groups.has(entry.category)) groups.set(entry.category, []);
        groups.get(entry.category)?.push(entry);
    }

    return [...groups.entries()]
        .map(([category, entries]) => {
            const items = entries
                .map((entry) => `- ${entry.id}: ${entry.purpose}`)
                .join("\n");
            return `[${category}]\n${items}`;
        })
        .join("\n\n");
}
