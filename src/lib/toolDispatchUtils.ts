import { TOOL_DOCS } from "./toolDocs";

export type ParsedToolLike = Record<string, unknown>;

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
