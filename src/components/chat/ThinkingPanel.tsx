import React from "react";
import MessageMarkdown from "./MessageMarkdown";

type ThinkingPanelProps = {
    expanded: boolean;
    onToggle: () => void;
    thinking: string;
    className?: string;
};

export default function ThinkingPanel({ expanded, onToggle, thinking, className }: ThinkingPanelProps) {
    return (
        <div className={`mt-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3 ${className ?? ""}`}>
            <button
                type="button"
                onClick={onToggle}
                className="text-xs font-medium uppercase tracking-[0.15em] text-slate-300 underline"
            >
                {expanded ? "Masquer la réflexion" : "Afficher la réflexion"}
            </button>
            {expanded ? (
                <div className="mt-2 max-h-56 overflow-auto text-xs leading-5 text-slate-300 prose prose-invert max-w-none prose-p:my-0.5 prose-li:my-0">
                    <MessageMarkdown
                        content={thinking}
                        className="mt-0 text-xs leading-5 prose-p:my-0.5 prose-li:my-0"
                    />
                </div>
            ) : null}
        </div>
    );
}
