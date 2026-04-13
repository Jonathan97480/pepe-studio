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
}: SidebarProps) {
    const isChatActive = items.find((i) => i.label === "Chat")?.active ?? false;

    return (
        <nav className="flex h-full flex-col justify-between px-5 py-6 text-white">
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-8 rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-xl shadow-slate-950/30">
                    <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Pépé-Studio</p>
                    <h2 className="mt-3 text-3xl font-semibold">Gestion LLM</h2>
                </div>
                <div className="space-y-2">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => onSelect(item.label)}
                            className={`flex w-full items-center gap-3 rounded-3xl px-4 py-3 text-left transition ${item.active ? "bg-blue-500/20 text-white shadow-lg shadow-blue-500/10" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>

                {/* Liste des conversations — visible uniquement sur l'onglet Chat */}
                {isChatActive && onNewConversation && onSelectConversation && onDeleteConversation && onDeleteAll && (
                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
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

            <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-sm text-slate-300 shadow-xl shadow-slate-950/20">
                <p className="font-semibold text-white">Statut</p>
                <div className="mt-2 flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${isModelLoaded ? "bg-emerald-400" : "bg-slate-500"}`} />
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
        </nav>
    );
}

