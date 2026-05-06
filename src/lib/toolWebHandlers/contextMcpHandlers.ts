import { invokeWithTimeout } from "../chatUtils";
import { queryDocs, searchLibrary } from "../../tools/Context7Client";
import { markError, type CritiqueOutput, type SharedArgs } from "./types";

export async function handleContext7Search(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool["context7-search"] === undefined) return false;

    try {
        const result = await searchLibrary(String(parsedTool["context7-search"]), String(parsedTool.query ?? ""));
        await sendPrompt(`[Context7 - Bibliothèques trouvées]\n${result}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur context7-search]: ${error}`, cfg);
    }

    return true;
}

export async function handleContext7Docs(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool["context7-docs"] === undefined) return false;

    try {
        const result = await queryDocs(
            String(parsedTool["context7-docs"]),
            String(parsedTool.query ?? ""),
            Number(parsedTool.tokens ?? 4000),
        );
        await sendPrompt(`[Context7 - Documentation]\n${result}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur context7-docs]: ${error}`, cfg);
    }

    return true;
}

export async function handleHttpRequest(args: SharedArgs & { critiqueOutput: CritiqueOutput }): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (!parsedTool.http_request) return false;

    try {
        const result = await invokeWithTimeout<string>(
            "http_request",
            {
                method: parsedTool.http_request,
                url: parsedTool.url ?? "",
                headers: parsedTool.headers ?? null,
                body: parsedTool.body ?? null,
            },
            30000,
        );
        await sendPrompt(`[Réponse HTTP]\n\`\`\`\n${critiqueOutput(result, "http_request")}\n\`\`\``, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur HTTP]: ${error}`, cfg);
    }

    return true;
}

export async function handleCreateMcpServer(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.create_mcp_server) return false;

    try {
        const name = String(parsedTool.create_mcp_server);
        const result = await invokeWithTimeout<string>(
            "create_mcp_server",
            {
                name,
                description: parsedTool.description ?? "",
                content: parsedTool.content ?? "",
            },
            20000,
        );
        await sendPrompt(
            `[Serveur MCP créé] "${name}" sauvegardé.\n${result}\n\nDémarre-le maintenant avec start_mcp_server pour voir ses outils.`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur création serveur MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleStartMcpServer(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.start_mcp_server) return false;

    try {
        const name = String(parsedTool.start_mcp_server);
        const tools = await invokeWithTimeout<{ name: string; description: string }[]>(
            "start_mcp_server",
            { name },
            20000,
        );
        const toolList = tools.map((tool) => `  - ${tool.name}: ${tool.description}`).join("\n");
        await sendPrompt(
            `[Serveur MCP "${name}" démarré]\nOutils disponibles :\n${toolList || "  (aucun outil)"}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur démarrage serveur MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleCallMcpTool(args: SharedArgs & { critiqueOutput: CritiqueOutput }): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (!parsedTool.call_mcp_tool) return false;

    try {
        const result = await invokeWithTimeout<string>(
            "call_mcp_tool",
            {
                serverName: parsedTool.call_mcp_tool,
                toolName: parsedTool.tool ?? "",
                argsJson: parsedTool.args ?? null,
            },
            20000,
        );
        await sendPrompt(
            `[Résultat MCP tool "${String(parsedTool.tool ?? "")}"]\n${critiqueOutput(
                result,
                `mcp:${String(parsedTool.tool ?? "")}`,
            )}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur appel outil MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleListMcpServers(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.list_mcp_servers === undefined) return false;

    try {
        const servers = await invokeWithTimeout<
            { name: string; description: string; running: boolean; tools: { name: string }[] }[]
        >("list_mcp_servers", {}, 20000);
        if (servers.length === 0) {
            await sendPrompt(`[MCP] Aucun serveur MCP disponible. Crée-en un avec create_mcp_server.`, cfg);
        } else {
            const list = servers
                .map(
                    (server) =>
                        `  - ${server.name} ${server.running ? "(en cours)" : "(arrêté)"}: ${server.description}\n    Outils: ${server.tools.map((tool) => tool.name).join(", ") || "démarrer pour voir"}`,
                )
                .join("\n");
            await sendPrompt(`[Serveurs MCP disponibles]\n${list}`, cfg);
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur liste MCP]: ${error}`, cfg);
    }

    return true;
}
