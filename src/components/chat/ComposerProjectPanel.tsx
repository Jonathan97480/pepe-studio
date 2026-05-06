import React from "react";

type ComposerProjectPanelProps = {
    projectStructure: string;
    projectStructureCollapsed: boolean;
    onToggleProjectStructureCollapsed: () => void;
    onClearProjectStructure: () => void;
};

export default function ComposerProjectPanel({
    projectStructure,
    projectStructureCollapsed,
    onToggleProjectStructureCollapsed,
    onClearProjectStructure,
}: ComposerProjectPanelProps) {
    if (!projectStructure.trim()) return null;

    return (
        <div className="rounded-2xl border border-blue-500/25 bg-blue-950/15 px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                    🗂 Structure du projet
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleProjectStructureCollapsed}
                        className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                    >
                        {projectStructureCollapsed ? "▼ Afficher" : "▲ Réduire"}
                    </button>
                    <button
                        onClick={onClearProjectStructure}
                        className="text-xs text-slate-600 transition-colors hover:text-red-400"
                        title="Effacer la structure"
                    >
                        ✕
                    </button>
                </div>
            </div>
            {!projectStructureCollapsed && (
                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                    {projectStructure}
                </pre>
            )}
        </div>
    );
}
