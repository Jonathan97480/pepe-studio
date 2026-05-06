import React from "react";

type TerminalStatusBarProps = {
    isRunning: boolean;
    cwd?: string;
    name?: string;
    onKill: () => void;
};

export default function TerminalStatusBar({ isRunning, cwd, name, onKill }: TerminalStatusBarProps) {
    return (
        <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${isRunning ? "bg-orange-400 animate-pulse" : "bg-emerald-400"}`} />
            <span className="text-sm text-slate-300 font-mono truncate">{cwd ?? "…"}</span>
            <span className="ml-auto text-xs text-slate-500 shrink-0">{name}</span>
            {isRunning && (
                <button
                    onClick={onKill}
                    title="Envoyer Ctrl+C pour arrêter le processus"
                    className="ml-1 shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition"
                >
                    ⊘ Stopper
                </button>
            )}
        </div>
    );
}
