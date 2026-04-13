"use client";

import React, { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";

type ConversationItem = {
    id: number;
    title: string;
    model_name: string;
    created_at: string; // libellé group : "Aujourd'hui", "Hier", "7 derniers jours", ou date
    message_count: number;
};

type Props = {
    activeConversationId: number | null;
    refreshTrigger: number;
    onNewConversation: () => void;
    onSelectConversation: (id: number) => void;
    onDeleteConversation: (id: number) => void;
    onDeleteAll: () => void;
};

export default function ConversationsList({
    activeConversationId,
    refreshTrigger,
    onNewConversation,
    onSelectConversation,
    onDeleteConversation,
    onDeleteAll,
}: Props) {
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

    const loadConversations = useCallback(() => {
        invoke<ConversationItem[]>("list_conversations")
            .then((list) => setConversations(list))
            .catch(() => { /* silencieux */ });
    }, []);

    useEffect(() => {
        loadConversations();
    }, [refreshTrigger, loadConversations]);

    const handleDelete = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        invoke("delete_conversation", { conversationId: id })
            .then(() => {
                setConversations((prev) => prev.filter((c) => c.id !== id));
                onDeleteConversation(id);
            })
            .catch(() => { /* silencieux */ });
    };

    // Grouper par label de date
    const groups = conversations.reduce<Record<string, ConversationItem[]>>((acc, conv) => {
        const key = conv.created_at;
        if (!acc[key]) acc[key] = [];
        acc[key].push(conv);
        return acc;
    }, {});

    const groupOrder = ["Aujourd'hui", "Hier", "7 derniers jours"];
    const sortedGroupKeys = [
        ...groupOrder.filter((k) => groups[k]),
        ...Object.keys(groups).filter((k) => !groupOrder.includes(k)).sort().reverse(),
    ];

    return (
        <div className="flex flex-col gap-1 overflow-y-auto">
            {/* Boutons de contrôle */}
            <div className="flex gap-1">
                <button
                    onClick={onNewConversation}
                    className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-blue-500/15 px-3 py-2 text-left text-sm text-blue-300 transition hover:bg-blue-500/25 hover:text-white"
                >
                    <span className="text-base">＋</span>
                    <span>Nouvelle</span>
                </button>
                {!confirmDeleteAll ? (
                    <button
                        onClick={() => setConfirmDeleteAll(true)}
                        title="Tout supprimer"
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 transition hover:bg-red-500/20 hover:text-red-400"
                    >
                        🗑
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            setConfirmDeleteAll(false);
                            setConversations([]);
                            onDeleteAll();
                        }}
                        className="rounded-2xl border border-red-500/40 bg-red-500/20 px-3 py-2 text-xs text-red-400 transition hover:bg-red-500/30"
                    >
                        Confirmer ?
                    </button>
                )}
            </div>

            {/* Liste groupée */}
            {sortedGroupKeys.map((groupKey) => (
                <div key={groupKey}>
                    <p className="mb-1 mt-2 px-2 text-[10px] uppercase tracking-widest text-slate-500">
                        {groupKey}
                    </p>
                    {groups[groupKey].map((conv) => {
                        const isActive = conv.id === activeConversationId;
                        return (
                            <button
                                key={conv.id}
                                onClick={() => onSelectConversation(conv.id)}
                                onMouseEnter={() => setHoveredId(conv.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                className={`group relative flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                                    isActive
                                        ? "bg-blue-500/20 text-white"
                                        : "text-slate-300 hover:bg-white/8 hover:text-white"
                                }`}
                            >
                                <span className="truncate pr-6 leading-snug">
                                    {conv.title.length > 42
                                        ? conv.title.slice(0, 42) + "…"
                                        : conv.title}
                                </span>
                                {hoveredId === conv.id && (
                                    <span
                                        role="button"
                                        onClick={(e) => handleDelete(e, conv.id)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-400"
                                        title="Supprimer"
                                    >
                                        🗑
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}

            {conversations.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-slate-500">
                    Aucune conversation sauvegardée
                </p>
            )}
        </div>
    );
}
