"use client";

import React, { useState } from "react";
import { PERSONALITIES, type Personality } from "../lib/personalities";

type Props = {
    modelName: string;
    defaultSystemPrompt: string;
    onConfirm: (systemPrompt: string) => void;
    onCancel: () => void;
};

export default function PersonalityPicker({ modelName, defaultSystemPrompt, onConfirm, onCancel }: Props) {
    const [selected, setSelected] = useState<Personality>(PERSONALITIES[0]);
    const [customPrompt, setCustomPrompt] = useState<string>("");

    const handleSelect = (p: Personality) => {
        setSelected(p);
        setCustomPrompt(p.systemPrompt ?? defaultSystemPrompt);
    };

    // Initialiser customPrompt à la première sélection
    const effectivePrompt = selected.id === "none"
        ? (customPrompt || defaultSystemPrompt)
        : (customPrompt || selected.systemPrompt || defaultSystemPrompt);

    const handleConfirm = () => {
        onConfirm(effectivePrompt);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Panel */}
            <div className="relative z-10 flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-white/10 bg-slate-900/95 p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                {/* Header */}
                <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Chargement du modèle</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">
                        Choisir une personnalité
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        {modelName} · Le system prompt peut être ajusté ci-dessous.
                    </p>
                </div>

                {/* Grille des personnalités */}
                <div className="grid grid-cols-4 gap-3">
                    {PERSONALITIES.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => handleSelect(p)}
                            className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition ${selected.id === p.id
                                    ? "border-blue-500/60 bg-blue-500/15 text-white shadow-lg shadow-blue-500/10"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                                }`}
                        >
                            <span className="text-2xl">{p.emoji}</span>
                            <span className="text-xs font-medium leading-tight">{p.name}</span>
                        </button>
                    ))}
                </div>

                {/* Description de la sélection */}
                {selected.id !== "none" && (
                    <p className="text-sm text-slate-400">
                        <span className="font-medium text-slate-200">{selected.name} : </span>
                        {selected.description}
                    </p>
                )}

                {/* System prompt éditable */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-[0.25em] text-slate-400">
                        System prompt
                        {selected.id === "none" && (
                            <span className="ml-2 text-slate-500">(depuis la config du modèle)</span>
                        )}
                    </label>
                    <textarea
                        value={effectivePrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={4}
                        placeholder="Aucun system prompt…"
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400 placeholder:text-slate-600"
                    />
                    {(customPrompt && customPrompt !== (selected.systemPrompt ?? defaultSystemPrompt)) && (
                        <button
                            onClick={() => setCustomPrompt(selected.systemPrompt ?? defaultSystemPrompt)}
                            className="self-start text-xs text-slate-500 underline transition hover:text-slate-300"
                        >
                            Réinitialiser
                        </button>
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="rounded-2xl border border-white/10 px-5 py-2.5 text-sm text-slate-400 transition hover:text-white"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500"
                    >
                        Charger
                    </button>
                </div>
            </div>
        </div>
    );
}
