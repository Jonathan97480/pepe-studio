"use client";

import React from "react";
import ConversationsList from "./ConversationsList";

type SidebarItem = {
    label: string;
    icon: string;
    active: boolean;
};

type SidebarProps = {
    items: SidebarItem[];
    onSelect: (label: string) => void;
    isModelLoaded: boolean;
    loadedModelName: string | null;
    // Multi-conversations (affiché uniquement quand l'onglet Chat est actif)
    activeConversationId?: number | null;
    conversationsRefreshTrigger?: number;
    onNewConversation?: () => void;
    onSelectConversation?: (id: number) => void;
    onDeleteConversation?: (id: number) => void;
    onDeleteAll?: () => void;
    isCollapsed?: boolean;
    onToggleSidebar?: () => void;
};

export default function Sidebar({
    items,
    onSelect,
    isModelLoaded,
    loadedModelName,
    activeConversationId,
    conversationsRefreshTrigger = 0,
    onNewConversation,
    onSelectConversation,
    onDeleteConversation,
    onDeleteAll,
    isCollapsed = false,
    onToggleSidebar,
}: SidebarProps) {
    const isChatActive = items.find((i) => i.label === "Chat")?.active ?? false;

    return (
        <nav
            className={`flex h-full flex-col justify-between transition-all duration-300 text-white ${
                isCollapsed ? "px-2 py-3 items-center" : "md:px-5 md:py-6 px-2 py-3"
            }`}
        >
            <div className="flex min-h-0 flex-1 flex-col w-full">
                {!isCollapsed && (
                    <div className="mb-8 rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-xl shadow-slate-950/30 hidden md:block">
                        <p className="text-xs md:text-sm uppercase tracking-[0.35em] text-slate-400">Pépé-Studio</p>
                        <h2 className="mt-3 text-lg md:text-3xl font-semibold">Gestion LLM</h2>
                    </div>
                )}
                {isCollapsed && <div className="mb-4 text-center text-2xl">🤖</div>}
                <div className={`space-y-2 w-full ${isCollapsed ? "flex flex-col items-center" : ""}`}>
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => onSelect(item.label)}
                            title={isCollapsed ? item.label : ""}
                            className={`flex items-center gap-3 rounded-3xl px-4 py-3 transition ${
                                isCollapsed ? "justify-center w-10 h-10 p-0" : "w-full text-left"
                            } ${item.active ? "bg-blue-500/20 text-white shadow-lg shadow-blue-500/10" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}
                        >
                            <span className="text-base md:text-lg">{item.icon}</span>
                            {!isCollapsed && <span className="text-xs md:text-sm">{item.label}</span>}
                        </button>
                    ))}
                </div>

                {/* Liste des conversations — visible uniquement sur l'onglet Chat et pas collapsed */}
                {!isCollapsed &&
                    isChatActive &&
                    onNewConversation &&
                    onSelectConversation &&
                    onDeleteConversation &&
                    onDeleteAll && (
                        <div className="mt-4 min-h-0 flex-1 overflow-y-auto hidden md:flex md:flex-col w-full">
                            <div className="mb-1 border-t border-white/10 pt-4">
                                <ConversationsList
                                    activeConversationId={activeConversationId ?? null}
                                    refreshTrigger={conversationsRefreshTrigger}
                                    onNewConversation={onNewConversation}
                                    onSelectConversation={onSelectConversation}
                                    onDeleteConversation={onDeleteConversation}
                                    onDeleteAll={onDeleteAll}
                                />
                            </div>
                        </div>
                    )}
            </div>

            <div className="flex flex-col gap-2 w-full">
                <button
                    onClick={onToggleSidebar}
                    title={isCollapsed ? "Ouvrir" : "Fermer"}
                    className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                    {isCollapsed ? "→" : "←"}
                </button>
                {!isCollapsed && (
                    <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-sm text-slate-300 shadow-xl shadow-slate-950/20 hidden md:block">
                        <p className="font-semibold text-white text-xs md:text-sm">Statut</p>
                        <div className="mt-2 flex items-center gap-2">
                            <span
                                className={`h-2 w-2 rounded-full ${isModelLoaded ? "bg-emerald-400" : "bg-slate-500"}`}
                            />
                            <span className={isModelLoaded ? "text-emerald-300" : "text-slate-400"}>
                                {isModelLoaded ? "Modèle chargé" : "Aucun modèle"}
                            </span>
                        </div>
                        {loadedModelName && (
                            <p className="mt-1 truncate text-xs text-slate-400" title={loadedModelName}>
                                {loadedModelName}
                            </p>
                        )}
                    </div>
                )}
                {isCollapsed && (
                    <div
                        title="Statut modèle"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10"
                    >
                        <span className={`h-2 w-2 rounded-full ${isModelLoaded ? "bg-emerald-400" : "bg-slate-500"}`} />
                    </div>
                )}
            </div>
        </nav>
    );
}
