import React from "react";

export default function EmptySkillsState() {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-4xl mb-4">🧩</p>
            <p className="text-slate-300 font-medium">Aucun skill créé</p>
            <p className="mt-2 text-sm text-slate-500">
                Demande à l&apos;IA de créer un skill. Elle peut sauvegarder des scripts PowerShell, Python et Node.js
                réutilisables automatiquement.
            </p>
            <div className="mt-4 flex flex-col gap-2">
                <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-xs text-slate-400 font-mono text-left">
                    🖥 &quot;Crée un skill PS1 pour lister les processus qui consomment le plus de CPU&quot;
                </p>
                <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-xs text-slate-400 font-mono text-left">
                    🐍 &quot;Crée un skill Python qui analyse un fichier CSV et retourne des stats&quot;
                </p>
                <p className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-xs text-slate-400 font-mono text-left">
                    ⬡ &quot;Crée un skill Node.js qui surveille un port réseau&quot;
                </p>
            </div>
        </div>
    );
}
