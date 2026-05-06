import React from "react";

type ToolCallPillProps = {
    expanded: boolean;
    onToggle: () => void;
    details: string;
};

export default function ToolCallPill({ expanded, onToggle, details }: ToolCallPillProps) {
    return (
        <div className="self-start max-w-[80%]">
            <button
                type="button"
                onClick={onToggle}
                className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-400/60 transition hover:border-amber-500/40 hover:text-amber-300"
            >
                <span className="text-base">🔧</span>
                <span className="text-xs font-medium tracking-widest">call tools</span>
                <span className="ml-1 text-[0.6rem] opacity-40">{expanded ? "▲" : "▼"}</span>
            </button>
            {expanded && (
                <div className="mt-1 max-h-64 overflow-auto rounded-2xl border border-amber-500/15 bg-slate-950/60 px-4 py-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-slate-400">{details}</pre>
                </div>
            )}
        </div>
    );
}
