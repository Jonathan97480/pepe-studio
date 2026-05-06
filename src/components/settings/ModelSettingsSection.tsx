import React from "react";
import type { TurboQuantType } from "@/context/ModelSettingsContext";

type ModelSettingsSectionProps = {
    modelPath: string;
    setModelPath: (value: string) => void;
    temperature: number;
    setTemperature: (value: number) => void;
    contextWindow: number;
    setContextWindow: (value: number) => void;
    systemPrompt: string;
    setSystemPrompt: (value: string) => void;
    turboQuant: TurboQuantType;
    setTurboQuant: (value: TurboQuantType) => void;
    flashAttention: boolean;
    setFlashAttention: (value: boolean) => void;
};

export default function ModelSettingsSection({
    modelPath,
    setModelPath,
    temperature,
    setTemperature,
    contextWindow,
    setContextWindow,
    systemPrompt,
    setSystemPrompt,
    turboQuant,
    setTurboQuant,
    flashAttention,
    setFlashAttention,
}: ModelSettingsSectionProps) {
    return (
        <>
            <h2 className="mb-2 text-lg font-bold">Paramètres du modèle</h2>

            <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1" title="Chemin vers le fichier .gguf du modèle.">
                    <span className="text-sm text-slate-300">Chemin du modèle</span>
                    <input
                        type="text"
                        value={modelPath}
                        onChange={(event) => setModelPath(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    />
                </label>

                <label
                    className="flex flex-col gap-1"
                    title="Contrôle le caractère aléatoire des réponses. 0 = greedy. Défaut llama.cpp : 0.8"
                >
                    <span className="text-sm text-slate-300">Température</span>
                    <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        value={temperature}
                        onChange={(event) => setTemperature(Number(event.target.value))}
                        className="w-full accent-blue-500"
                    />
                    <span className="text-xs text-slate-400">{temperature.toFixed(2)}</span>
                </label>

                <label className="flex flex-col gap-1" title="Taille maximale du contexte en tokens.">
                    <span className="text-sm text-slate-300">Context Window</span>
                    <input
                        type="number"
                        min={512}
                        max={131072}
                        value={contextWindow}
                        onChange={(event) => setContextWindow(Number(event.target.value))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    />
                </label>

                <label className="flex flex-col gap-1" title="Instructions initiales pour le modèle.">
                    <span className="text-sm text-slate-300">System Prompt</span>
                    <textarea
                        value={systemPrompt}
                        onChange={(event) => setSystemPrompt(event.target.value)}
                        className="min-h-[112px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    />
                </label>

                <label className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                        <p className="font-medium">Cache KV quantifié</p>
                        <p className="text-xs text-slate-400">
                            Compresse les clés et valeurs d'attention pour réduire l'usage mémoire.
                        </p>
                    </div>
                    <select
                        value={turboQuant}
                        onChange={(event) => setTurboQuant(event.target.value as TurboQuantType)}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    >
                        <option value="none">Aucun</option>
                        <option value="q8_0">q8_0 — recommandé (8 bits K+V)</option>
                        <option value="q4_0">q4_0 — agressif (4 bits K+V)</option>
                        <option value="q4_1">q4_1 — 4 bits avec offset</option>
                        <option value="q5_0">q5_0 — 5 bits K+V</option>
                        <option value="q5_1">q5_1 — 5 bits avec offset</option>
                    </select>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <input
                        type="checkbox"
                        checked={flashAttention}
                        onChange={(event) => setFlashAttention(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-cyan-500"
                    />
                    <div>
                        <p className="font-medium">Flash Attention</p>
                        <p className="text-xs text-slate-400">
                            Active l'option llama.cpp <span className="font-mono">-fa</span> au chargement du modèle.
                        </p>
                    </div>
                </label>
            </div>

            <p className="mt-2 text-xs italic text-slate-500">
                Les paramètres de sampling avancés sont configurables par modèle dans le panneau Modèles (⚙ Configurer).
            </p>
        </>
    );
}
