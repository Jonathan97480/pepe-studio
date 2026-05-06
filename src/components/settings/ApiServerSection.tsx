import React from "react";

type ApiServerSectionProps = {
    apiPort: number;
    setApiPort: (value: number) => void;
    apiRunning: boolean;
    apiError: string | null;
    onToggleServer: () => void;
};

export default function ApiServerSection({
    apiPort,
    setApiPort,
    apiRunning,
    apiError,
    onToggleServer,
}: ApiServerSectionProps) {
    return (
        <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-5">
            <div>
                <h3 className="text-sm font-semibold text-white">Serveur API OpenAI</h3>
                <p className="mt-1 text-xs text-slate-400">
                    Expose le LLM local via une API compatible OpenAI. Connecte Open WebUI ou n&apos;importe quel client
                    en pointant sur cette URL.
                </p>
            </div>

            <div className="flex items-end gap-2">
                <label className="flex flex-1 flex-col gap-1">
                    <span className="text-sm text-slate-300">Port</span>
                    <input
                        type="number"
                        min={1024}
                        max={65535}
                        value={apiPort}
                        onChange={(event) => setApiPort(Number(event.target.value))}
                        disabled={apiRunning}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400 disabled:opacity-50"
                    />
                </label>
                <button
                    onClick={onToggleServer}
                    className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                        apiRunning
                            ? "border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                            : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    }`}
                >
                    {apiRunning ? "Arrêter" : "Démarrer"}
                </button>
            </div>

            {apiRunning && (
                <div className="flex flex-col gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-300">Actif</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-white">http://localhost:{apiPort}/v1</p>
                    <p className="mt-1 text-xs text-slate-400">
                        Dans Open WebUI → Paramètres → Connexions → ajoute cette URL comme API OpenAI.
                    </p>
                </div>
            )}

            {apiError && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                    {apiError}
                </p>
            )}
        </div>
    );
}
