"use client";

import type { ChatMode } from "../../lib/chatUtils";

interface ChatHeaderProps {
    chatMode: ChatMode;
    onModeChange: (mode: ChatMode) => void;
    usedTokens?: number;
    tokenLimit: number;
    isModelLoaded: boolean;
    loadedModelName: string | null;
    onStopModel: () => void;
    ttsEnabled: boolean;
    isSpeaking: boolean;
    onToggleVoice: () => void;
}

export function ChatHeader({
    chatMode,
    onModeChange,
    usedTokens = 0,
    tokenLimit,
    isModelLoaded,
    loadedModelName,
    onStopModel,
    ttsEnabled,
    isSpeaking,
    onToggleVoice,
}: ChatHeaderProps) {
    const pct = tokenLimit > 0 ? Math.round((usedTokens / tokenLimit) * 100) : 0;
    const barColor = pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-blue-400";

    return (
        <div className="border-b border-white/10 px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="mr-2 text-2xl font-semibold tracking-tight text-white">Chat</h1>
                <div className="flex items-center gap-1 rounded-2xl bg-slate-950/70 p-1">
                    {(["ask", "plan", "agent"] as ChatMode[]).map((mode) => {
                        const labels: Record<ChatMode, string> = {
                            ask: "💬 Ask",
                            plan: "📋 Plan",
                            agent: "⚡ Agent",
                        };
                        const active = chatMode === mode;
                        return (
                            <button
                                key={mode}
                                onClick={() => onModeChange(mode)}
                                title={
                                    mode === "ask"
                                        ? "Mode Ask : l'IA répond et pose des questions, pas d'actions automatiques"
                                        : mode === "plan"
                                          ? "Mode Plan : l'IA explique avant d'agir et demande confirmation"
                                          : "Mode Agent : l'IA exécute toutes les actions librement"
                                }
                                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                    active
                                        ? mode === "agent"
                                            ? "bg-amber-500/30 text-amber-300"
                                            : mode === "plan"
                                              ? "bg-violet-500/30 text-violet-300"
                                              : "bg-blue-500/30 text-blue-300"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {labels[mode]}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-slate-950/70 px-4 py-2">
                    <div className="h-1.5 w-24 rounded-full bg-white/10">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                    </div>
                    <span className="text-xs text-slate-400">
                        {usedTokens > 0 ? (
                            <>
                                {usedTokens.toLocaleString()} / {tokenLimit.toLocaleString()} tok{" "}
                                <span
                                    className={
                                        pct >= 90
                                            ? "text-red-400"
                                            : pct >= 75
                                              ? "text-amber-400"
                                              : "text-slate-500"
                                    }
                                >
                                    ({pct}%)
                                </span>
                            </>
                        ) : (
                            <>{tokenLimit.toLocaleString()} tok ctx</>
                        )}
                    </span>
                </div>
                <span
                    className={`rounded-2xl px-4 py-2 text-sm ${
                        isModelLoaded ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/15 text-yellow-300"
                    }`}
                >
                    {isModelLoaded ? `● ${loadedModelName ?? "Chargé"}` : "Aucun modèle"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    {isModelLoaded && (
                        <button
                            onClick={onStopModel}
                            className="rounded-3xl bg-red-500/80 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-400"
                        >
                            Arrêter
                        </button>
                    )}
                    <button
                        onClick={onToggleVoice}
                        title={ttsEnabled ? "Désactiver la lecture vocale" : "Activer la lecture vocale"}
                        className={`rounded-3xl px-4 py-2 text-sm font-medium transition ${
                            isSpeaking
                                ? "bg-violet-500/30 text-violet-300 animate-pulse"
                                : ttsEnabled
                                  ? "bg-violet-500/80 text-white hover:bg-violet-400"
                                  : "bg-white/10 text-slate-400 hover:text-white"
                        }`}
                    >
                        {isSpeaking ? "⏹ Stop" : ttsEnabled ? "🔊 Voix" : "🔇 Voix"}
                    </button>
                </div>
            </div>
        </div>
    );
}
