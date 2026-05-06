import React from "react";
import type { AutoMode } from "@/lib/hardwareConfig";

type ModelAutoDetectSectionProps = {
    autoDetectNotes: string[];
    autoDetecting: boolean;
    onAutoDetect: (mode: AutoMode) => void;
};

export default function ModelAutoDetectSection({
    autoDetectNotes,
    autoDetecting,
    onAutoDetect,
}: ModelAutoDetectSectionProps) {
    return (
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-violet-300">🔍 Configuration automatique</p>
            {autoDetectNotes.length > 0 ? (
                <ul className="mt-1.5 space-y-0.5">
                    {autoDetectNotes.map((note, index) => (
                        <li key={index} className="text-[0.65rem] text-slate-400">
                            • {note}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-0.5 text-[0.65rem] text-slate-500">
                    Détecte RAM, CPU et GPU pour remplir les champs optimaux.
                </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    onClick={() => onAutoDetect("gpu_only")}
                    disabled={autoDetecting}
                    className="rounded-2xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                    title="Tout en VRAM — vitesse max, contexte limité par la carte graphique"
                >
                    {autoDetecting ? "…" : "🎮 GPU seul"}
                </button>
                <button
                    onClick={() => onAutoDetect("balanced")}
                    disabled={autoDetecting}
                    className="rounded-2xl bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                    title="Équilibre entre vitesse et contexte — recommandé"
                >
                    {autoDetecting ? "…" : "⚖️ Équilibré"}
                </button>
                <button
                    onClick={() => onAutoDetect("max_context")}
                    disabled={autoDetecting}
                    className="rounded-2xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                    title="Utilise GPU + RAM pour maximiser le contexte — plus lent"
                >
                    {autoDetecting ? "…" : "📐 Max contexte"}
                </button>
            </div>
        </div>
    );
}
