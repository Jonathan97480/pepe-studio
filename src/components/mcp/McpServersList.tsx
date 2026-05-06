import React from "react";
import type { McpServerInfo } from "./types";

type McpServersListProps = {
    servers: McpServerInfo[];
    loadingList: boolean;
    expandedServer: string | null;
    actioning: string | null;
    onToggleExpand: (name: string) => void;
    onStart: (name: string) => void;
    onStop: (name: string) => void;
    onOpenTest: (serverName: string, toolName: string, schema: Record<string, unknown>) => void;
};

export default function McpServersList({
    servers,
    loadingList,
    expandedServer,
    actioning,
    onToggleExpand,
    onStart,
    onStop,
    onOpenTest,
}: McpServersListProps) {
    return (
        <>
            {servers.length === 0 && !loadingList && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                    <span className="text-4xl">🔌</span>
                    <p className="text-sm">Aucun serveur MCP créé</p>
                    <p className="text-xs">Cliquez sur « Nouveau serveur » pour créer votre premier outil.</p>
                </div>
            )}

            {servers.map((srv) => (
                <div key={srv.name} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    <div className="flex items-center gap-3 px-4 py-3">
                        <span className={`h-2 w-2 rounded-full ${srv.running ? "bg-emerald-400" : "bg-slate-500"}`} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{srv.name}</p>
                            <p className="truncate text-xs text-slate-400">{srv.description}</p>
                        </div>
                        <span
                            className={`rounded-xl px-2 py-0.5 text-xs font-medium ${
                                srv.running ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-500/15 text-slate-400"
                            }`}
                        >
                            {srv.running ? "Actif" : "Arrêté"}
                        </span>
                        {srv.running ? (
                            <button
                                onClick={() => onStop(srv.name)}
                                disabled={actioning === srv.name}
                                className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                                {actioning === srv.name ? "…" : "⏹ Arrêter"}
                            </button>
                        ) : (
                            <button
                                onClick={() => onStart(srv.name)}
                                disabled={actioning === srv.name}
                                className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                                {actioning === srv.name ? "…" : "▶ Démarrer"}
                            </button>
                        )}
                        <button
                            onClick={() => onToggleExpand(srv.name)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                        >
                            {expandedServer === srv.name ? "▲ Masquer" : "▼ Outils"}
                        </button>
                    </div>

                    {expandedServer === srv.name && (
                        <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3">
                            {srv.tools.length === 0 ? (
                                <p className="text-xs italic text-slate-500">
                                    {srv.running
                                        ? "Aucun outil exposé par ce serveur."
                                        : "Démarrez le serveur pour voir les outils disponibles."}
                                </p>
                            ) : (
                                srv.tools.map((tool) => (
                                    <div
                                        key={tool.name}
                                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-slate-200">{tool.name}</p>
                                            <p className="truncate text-xs text-slate-500">{tool.description}</p>
                                        </div>
                                        <button
                                            onClick={() => onOpenTest(srv.name, tool.name, tool.inputSchema)}
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
        </>
    );
}
