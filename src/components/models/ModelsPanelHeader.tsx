import React from "react";

type ModelsPanelHeaderProps = {
    onRefresh: () => void;
};

export default function ModelsPanelHeader({ onRefresh }: ModelsPanelHeaderProps) {
    return (
        <div className="border-b border-white/10 px-8 py-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Bibliothèque</p>
                    <h2 className="text-2xl font-semibold text-white">Modèles locaux</h2>
                </div>
                <button
                    onClick={onRefresh}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                >
                    🔄 Actualiser
                </button>
            </div>
        </div>
    );
}
