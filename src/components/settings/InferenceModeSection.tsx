import React from "react";

type InferenceModeSectionProps = {
    turboQuantEnabled: boolean;
    onToggle: () => void;
};

export default function InferenceModeSection({ turboQuantEnabled, onToggle }: InferenceModeSectionProps) {
    return (
        <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-5">
            <div>
                <h3 className="text-sm font-semibold text-white">llama.cpp — Mode inférence</h3>
                <p className="mt-1 text-xs text-slate-400">
                    Choisissez entre la version standard (stable) ou TurboQuant bêta (optimisé mémoire).
                </p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                <input
                    type="checkbox"
                    checked={turboQuantEnabled}
                    onChange={onToggle}
                    className="mt-0.5 h-4 w-4 accent-cyan-500"
                />
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <p className="font-medium">Activer TurboQuant (bêta)</p>
                        <span className="inline-block rounded-full border border-orange-500/30 bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                            Bêta
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                        Compression avancée du KV cache (2-bit) pour réduire la mémoire RAM utilisée. Peut améliorer les
                        performances sur hardware limité.
                    </p>
                </div>
            </label>

            {turboQuantEnabled && (
                <div className="flex flex-col gap-2 rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                            <p className="text-sm font-semibold text-orange-300">Mode bêta activé</p>
                            <ul className="mt-2 space-y-1 text-xs text-orange-200">
                                <li>• Cette fonctionnalité est encore en test</li>
                                <li>• La qualité des réponses peut varier</li>
                                <li>• Veuillez signaler les bugs ou anomalies</li>
                                <li>• Vous devez redémarrer llama.cpp pour appliquer les changements</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <p className="text-xs italic text-slate-500">
                <strong>Mode standard</strong> — Comportement habituel llama.cpp, stable et entièrement supporté. <br />
                <strong>TurboQuant</strong> — Basé sur llama-cpp-turboquant, optimisé pour l&apos;usage mémoire avec le
                KV cache quantifié.
            </p>
        </div>
    );
}
