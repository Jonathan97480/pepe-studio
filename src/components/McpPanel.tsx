"use client";

import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import McpCreateServerForm from "./mcp/McpCreateServerForm";
import McpPanelHeader from "./mcp/McpPanelHeader";
import McpServersList from "./mcp/McpServersList";
import McpToolTestPanel from "./mcp/McpToolTestPanel";
import type { McpServerInfo, McpToolInfo } from "./mcp/types";

const DEFAULT_TEMPLATE = `// Serveur MCP Node.js minimal — JSON-RPC 2.0 over stdio
// Modifiez ce template pour créer votre outil personnalisé.

const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });

const TOOLS = [
    {
        name: "mon_outil",
        description: "Description de ce que fait l'outil",
        inputSchema: {
            type: "object",
            properties: {
                texte: { type: "string", description: "Texte à traiter" }
            },
            required: ["texte"]
        }
    }
];

function respond(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
function respondError(id, message) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\\n");
}

rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line.trim()); } catch { return; }

    if (msg.method === "initialize") {
        respond(msg.id, {
            protocolVersion: "2024-11-05",
            capabilities: {},
            serverInfo: { name: "mon-serveur-mcp", version: "1.0" }
        });
    } else if (msg.method === "notifications/initialized") {
        // rien à faire
    } else if (msg.method === "tools/list") {
        respond(msg.id, { tools: TOOLS });
    } else if (msg.method === "tools/call") {
        const { name, arguments: args } = msg.params;
        if (name === "mon_outil") {
            // ── Logique ici ──────────────────────────────────────────────
            const resultat = "Traitement de : " + (args.texte ?? "");
            respond(msg.id, { content: [{ type: "text", text: resultat }] });
        } else {
            respondError(msg.id, "Outil inconnu : " + name);
        }
    }
});
`;

export default function McpPanel() {
    const [servers, setServers] = useState<McpServerInfo[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    // ── Créer un nouveau serveur ─────────────────────────────────────────────
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newScript, setNewScript] = useState(DEFAULT_TEMPLATE);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // ── Test ─────────────────────────────────────────────────────────────────
    const [testServer, setTestServer] = useState<string | null>(null);
    const [testTool, setTestTool] = useState<string | null>(null);
    const [testArgs, setTestArgs] = useState("{}");
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testing, setTesting] = useState(false);

    // ── Start/stop ───────────────────────────────────────────────────────────
    const [actioning, setActioning] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadingList(true);
        try {
            const list = await invoke<McpServerInfo[]>("list_mcp_servers");
            setServers(list);
        } catch (e) {
            console.error("[McpPanel] list_mcp_servers failed", e);
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true);
        setCreateError(null);
        try {
            await invoke("create_mcp_server", {
                name: newName.trim(),
                description: newDesc.trim() || newName.trim(),
                content: newScript,
            });
            setShowCreate(false);
            setNewName("");
            setNewDesc("");
            setNewScript(DEFAULT_TEMPLATE);
            await refresh();
        } catch (e: unknown) {
            setCreateError(getErrorMessage(e));
        } finally {
            setCreating(false);
        }
    };

    const handleStart = async (name: string) => {
        setActioning(name);
        try {
            await invoke("start_mcp_server", { name });
            await refresh();
        } catch (e) {
            console.error("[McpPanel] start_mcp_server failed", e);
        } finally {
            setActioning(null);
        }
    };

    const handleStop = async (name: string) => {
        setActioning(name);
        try {
            await invoke("stop_mcp_server", { name });
            await refresh();
        } catch (e) {
            console.error("[McpPanel] stop_mcp_server failed", e);
        } finally {
            setActioning(null);
        }
    };

    const handleOpenTest = (serverName: string, toolName: string, schema: Record<string, unknown>) => {
        setTestServer(serverName);
        setTestTool(toolName);
        // Pré-remplir les args avec les propriétés requises
        const props =
            typeof schema.properties === "object" && schema.properties !== null
                ? (schema.properties as Record<string, { description?: string }>)
                : {};
        const example: Record<string, string> = {};
        for (const key of Object.keys(props)) {
            example[key] = props[key]?.description ?? "";
        }
        setTestArgs(JSON.stringify(example, null, 2));
        setTestResult(null);
    };

    const handleTest = async () => {
        if (!testServer || !testTool) return;
        setTesting(true);
        setTestResult(null);
        try {
            const result = await invoke<string>("call_mcp_tool", {
                serverName: testServer,
                toolName: testTool,
                argsJson: testArgs,
            });
            setTestResult(result);
        } catch (e: unknown) {
            setTestResult(`[Erreur] ${getErrorMessage(e)}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden text-white">
            <McpPanelHeader
                loadingList={loadingList}
                onRefresh={refresh}
                onToggleCreate={() => setShowCreate((value) => !value)}
            />

            <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-0">
                <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6 flex flex-col gap-4 border-b lg:border-b-0 lg:border-r border-white/10">
                    {showCreate && (
                        <McpCreateServerForm
                            newName={newName}
                            setNewName={setNewName}
                            newDesc={newDesc}
                            setNewDesc={setNewDesc}
                            newScript={newScript}
                            setNewScript={setNewScript}
                            createError={createError}
                            creating={creating}
                            onCreate={handleCreate}
                            onCancel={() => {
                                setShowCreate(false);
                                setCreateError(null);
                            }}
                        />
                    )}

                    <McpServersList
                        servers={servers}
                        loadingList={loadingList}
                        expandedServer={expandedServer}
                        actioning={actioning}
                        onToggleExpand={(name) => setExpandedServer(expandedServer === name ? null : name)}
                        onStart={handleStart}
                        onStop={handleStop}
                        onOpenTest={handleOpenTest}
                    />
                </div>

                {testServer && testTool && (
                    <McpToolTestPanel
                        testServer={testServer}
                        testTool={testTool}
                        testArgs={testArgs}
                        setTestArgs={setTestArgs}
                        testing={testing}
                        testResult={testResult}
                        onClose={() => {
                            setTestServer(null);
                            setTestTool(null);
                            setTestResult(null);
                        }}
                        onTest={handleTest}
                    />
                )}
            </div>
        </div>
    );
}
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
