import React from "react";

type McpPanelHeaderProps = {
    loadingList: boolean;
    onRefresh: () => void;
    onToggleCreate: () => void;
};

export default function McpPanelHeader({ loadingList, onRefresh, onToggleCreate }: McpPanelHeaderProps) {
    return (
        <div className="flex flex-col items-start justify-between gap-3 border-b border-white/10 bg-white/5 px-3 py-3 md:flex-row md:items-center md:gap-0 md:px-6 md:py-4">
            <div className="flex-1">
                <h2 className="text-base font-bold md:text-lg">Serveurs MCP</h2>
                <p className="mt-0.5 hidden text-xs text-slate-400 md:block">
                    Créez et testez vos outils MCP (Model Context Protocol) — scripts Node.js JSON-RPC 2.0
                </p>
            </div>
            <div className="flex w-full gap-2 md:w-auto">
                <button
                    onClick={onRefresh}
                    disabled={loadingList}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50 md:flex-initial md:text-sm"
                >
                    <span className="hidden md:inline">{loadingList ? "…" : "🔄"} Rafraîchir</span>
                    <span className="md:hidden">{loadingList ? "…" : "🔄"}</span>
                </button>
                <button
                    onClick={onToggleCreate}
                    className="flex-1 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300 transition hover:bg-blue-500/20 md:flex-initial md:text-sm"
                >
                    <span className="hidden md:inline">＋ Nouveau serveur</span>
                    <span className="md:hidden">＋</span>
                </button>
            </div>
        </div>
    );
}
