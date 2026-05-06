import React from "react";

type ModelsPanelEmptyStateProps = {
    onRefresh: () => void;
};

export default function ModelsPanelEmptyState({ onRefresh }: ModelsPanelEmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center text-slate-400">
            <span className="text-5xl">📂</span>
            <p className="text-lg font-medium text-white">Aucun modèle trouvé</p>
            <p className="text-sm">
                Place tes fichiers <code className="rounded bg-white/10 px-2 py-0.5">.gguf</code> dans le dossier
                <code className="rounded bg-white/10 px-2 py-0.5">models/</code>
            </p>
            <button
                onClick={onRefresh}
                className="mt-2 rounded-2xl bg-blue-500 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
            >
                Rafraîchir
            </button>
        </div>
    );
}
