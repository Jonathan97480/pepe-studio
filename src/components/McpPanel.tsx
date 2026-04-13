"use client";

import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";

type McpToolInfo = {
    name: string;
    description: string;
    inputSchema: Record<string, any>;
};

type McpServerInfo = {
    name: string;
    description: string;
    running: boolean;
    tools: McpToolInfo[];
};

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

    useEffect(() => { refresh(); }, [refresh]);

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
        } catch (e: any) {
            setCreateError(typeof e === "string" ? e : e?.message ?? String(e));
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

    const handleOpenTest = (serverName: string, toolName: string, schema: Record<string, any>) => {
        setTestServer(serverName);
        setTestTool(toolName);
        // Pré-remplir les args avec les propriétés requises
        const props = schema?.properties ?? {};
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
        } catch (e: any) {
            setTestResult(`[Erreur] ${typeof e === "string" ? e : e?.message ?? String(e)}`);
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden text-white">
            {/* ── Header ── */}
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
                <div>
                    <h2 className="font-bold text-lg">Serveurs MCP</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Créez et testez vos outils MCP (Model Context Protocol) — scripts Node.js JSON-RPC 2.0
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={refresh}
                        disabled={loadingList}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
                    >
                        {loadingList ? "…" : "🔄"} Rafraîchir
                    </button>
                    <button
                        onClick={() => setShowCreate((v) => !v)}
                        className="rounded-2xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 transition hover:bg-blue-500/20"
                    >
                        ＋ Nouveau serveur
                    </button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 gap-0">
                {/* ── Liste des serveurs ── */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

                    {/* Formulaire de création */}
                    {showCreate && (
                        <div className="rounded-2xl border border-blue-400/30 bg-blue-500/5 p-5 flex flex-col gap-4">
                            <h3 className="font-semibold text-blue-300">Nouveau serveur MCP</h3>
                            <div className="flex gap-3">
                                <div className="flex flex-1 flex-col gap-1">
                                    <label className="text-xs text-slate-400">Nom (sans espaces)</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="mon-serveur"
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                    />
                                </div>
                                <div className="flex flex-1 flex-col gap-1">
                                    <label className="text-xs text-slate-400">Description</label>
                                    <input
                                        type="text"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        placeholder="Ce que fait ce serveur"
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-400">Script Node.js (JSON-RPC 2.0 over stdio)</label>
                                <textarea
                                    value={newScript}
                                    onChange={(e) => setNewScript(e.target.value)}
                                    rows={18}
                                    spellCheck={false}
                                    className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-400 resize-y"
                                />
                            </div>
                            {createError && (
                                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                    {createError}
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newName.trim()}
                                    className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:opacity-50"
                                >
                                    {creating ? "Sauvegarde…" : "💾 Sauvegarder"}
                                </button>
                                <button
                                    onClick={() => { setShowCreate(false); setCreateError(null); }}
                                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                                >
                                    Annuler
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Liste */}
                    {servers.length === 0 && !loadingList && (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                            <span className="text-4xl">🔌</span>
                            <p className="text-sm">Aucun serveur MCP créé</p>
                            <p className="text-xs">Cliquez sur « Nouveau serveur » pour créer votre premier outil.</p>
                        </div>
                    )}

                    {servers.map((srv) => (
                        <div key={srv.name} className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                            {/* Header serveur */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <span className={`h-2 w-2 rounded-full ${srv.running ? "bg-emerald-400" : "bg-slate-500"}`} />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-white truncate">{srv.name}</p>
                                    <p className="text-xs text-slate-400 truncate">{srv.description}</p>
                                </div>
                                <span className={`rounded-xl px-2 py-0.5 text-xs font-medium ${srv.running ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"}`}>
                                    {srv.running ? "Actif" : "Arrêté"}
                                </span>
                                {srv.running
                                    ? <button
                                        onClick={() => handleStop(srv.name)}
                                        disabled={actioning === srv.name}
                                        className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                        {actioning === srv.name ? "…" : "⏹ Arrêter"}
                                    </button>
                                    : <button
                                        onClick={() => handleStart(srv.name)}
                                        disabled={actioning === srv.name}
                                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                    >
                                        {actioning === srv.name ? "…" : "▶ Démarrer"}
                                    </button>
                                }
                                <button
                                    onClick={() => setExpandedServer(expandedServer === srv.name ? null : srv.name)}
                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                                >
                                    {expandedServer === srv.name ? "▲ Masquer" : "▼ Outils"}
                                </button>
                            </div>

                            {/* Liste des outils */}
                            {expandedServer === srv.name && (
                                <div className="border-t border-white/10 px-4 py-3 flex flex-col gap-2">
                                    {srv.tools.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic">
                                            {srv.running
                                                ? "Aucun outil exposé par ce serveur."
                                                : "Démarrez le serveur pour voir les outils disponibles."}
                                        </p>
                                    ) : (
                                        srv.tools.map((tool) => (
                                            <div key={tool.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-slate-200">{tool.name}</p>
                                                    <p className="text-xs text-slate-500 truncate">{tool.description}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleOpenTest(srv.name, tool.name, tool.inputSchema)}
                                                    className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-300 transition hover:bg-violet-500/20"
                                                >
                                                    🧪 Tester
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* ── Panneau de test ── */}
                {testServer && testTool && (
                    <div className="w-[360px] border-l border-white/10 bg-white/[0.02] flex flex-col p-5 gap-4 overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wider">Test</p>
                                <p className="font-semibold text-sm text-white">{testServer} / {testTool}</p>
                            </div>
                            <button
                                onClick={() => { setTestServer(null); setTestTool(null); setTestResult(null); }}
                                className="text-slate-500 hover:text-white transition text-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-slate-400">Arguments (JSON)</label>
                            <textarea
                                value={testArgs}
                                onChange={(e) => setTestArgs(e.target.value)}
                                rows={6}
                                spellCheck={false}
                                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-violet-400 resize-y"
                            />
                        </div>

                        <button
                            onClick={handleTest}
                            disabled={testing}
                            className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
                        >
                            {testing ? "Exécution…" : "▶ Exécuter"}
                        </button>

                        {testResult !== null && (
                            <div className="flex flex-col gap-1">
                                <p className="text-xs text-slate-400">Résultat</p>
                                <pre className={`rounded-xl border px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words ${testResult.startsWith("[Erreur]")
                                    ? "border-red-400/30 bg-red-500/10 text-red-300"
                                    : "border-emerald-400/20 bg-emerald-500/5 text-emerald-200"
                                    }`}>
                                    {testResult}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
