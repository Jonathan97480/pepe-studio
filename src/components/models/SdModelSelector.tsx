"use client";

interface SdModelSelectorProps {
    sdModelFiles: string[];
    sdModelPath: string | null;
    setSdModelPath: (path: string | null) => void;
    onRefresh: () => void;
}

export function SdModelSelector({ sdModelFiles, sdModelPath, setSdModelPath, onRefresh }: SdModelSelectorProps) {
    return (
        <div className="mx-auto mb-4 max-w-3xl rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5 shadow-xl shadow-slate-950/10">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Générateur d&apos;image</p>
                    <h3 className="text-base font-semibold text-white">Stable Diffusion</h3>
                </div>
                <button
                    onClick={onRefresh}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10"
                >
                    Rafraîchir SD
                </button>
            </div>
            <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-300">Modèle SD utilisé pour generate_image</label>
                <select
                    value={sdModelPath ?? ""}
                    onChange={(e) => setSdModelPath(e.target.value || null)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                >
                    <option value="">Auto (détection automatique)</option>
                    {sdModelFiles.map((path) => (
                        <option key={path} value={path}>
                            {path.split(/[/\\]/).pop()}
                        </option>
                    ))}
                </select>
                <p className="text-[0.65rem] text-slate-500">
                    {sdModelFiles.length > 0
                        ? `${sdModelFiles.length} modèle(s) SD détecté(s). Si un seul est présent, il est utilisé par défaut.`
                        : "Aucun modèle SD détecté. Place un .safetensors ou .ckpt dans models/sd/ puis clique sur Rafraîchir SD."}
                </p>
            </div>
        </div>
    );
}
