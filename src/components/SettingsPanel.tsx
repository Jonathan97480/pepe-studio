"use client";

import React, { useState } from "react";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { CONTEXT7_STORAGE_KEY } from "../tools/Context7Client";
import { BRAVE_SEARCH_KEY, SERPER_SEARCH_KEY, TAVILY_SEARCH_KEY } from "../tools/SearchWeb";

export default function SettingsPanel() {
    const {
        modelPath,
        temperature,
        contextWindow,
        flashAttention,
        systemPrompt,
        turboQuant,
        setModelPath,
        setTemperature,
        setContextWindow,
        setFlashAttention,
        setSystemPrompt,
        setTurboQuant,
    } = useModelSettings();

    const [context7Key, setContext7Key] = useState(() => localStorage.getItem(CONTEXT7_STORAGE_KEY) ?? "");
    const [context7Saved, setContext7Saved] = useState(false);

    const [braveKey, setBraveKey] = useState(() => localStorage.getItem(BRAVE_SEARCH_KEY) ?? "");
    const [serperKey, setSerperKey] = useState(() => localStorage.getItem(SERPER_SEARCH_KEY) ?? "");
    const [tavilyKey, setTavilyKey] = useState(() => localStorage.getItem(TAVILY_SEARCH_KEY) ?? "");
    const [searchSaved, setSearchSaved] = useState(false);

    const saveSearchKeys = () => {
        localStorage.setItem(BRAVE_SEARCH_KEY, braveKey.trim());
        localStorage.setItem(SERPER_SEARCH_KEY, serperKey.trim());
        localStorage.setItem(TAVILY_SEARCH_KEY, tavilyKey.trim());
        setSearchSaved(true);
        setTimeout(() => setSearchSaved(false), 2000);
    };

    const saveContext7Key = () => {
        localStorage.setItem(CONTEXT7_STORAGE_KEY, context7Key.trim());
        setContext7Saved(true);
        setTimeout(() => setContext7Saved(false), 2000);
    };

    return (
        <div className="flex flex-col gap-6 p-6 text-white overflow-y-auto max-h-[calc(100vh-4rem)]">
            <h2 className="font-bold text-lg mb-2">Paramètres du modèle</h2>

            <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1" title="Chemin vers le fichier .gguf du modèle.">
                    <span className="text-sm text-slate-300">Chemin du modèle</span>
                    <input
                        type="text"
                        value={modelPath}
                        onChange={(e) => setModelPath(e.target.value)}
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
                        onChange={(e) => setTemperature(Number(e.target.value))}
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
                        onChange={(e) => setContextWindow(Number(e.target.value))}
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    />
                </label>

                <label className="flex flex-col gap-1" title="Instructions initiales pour le modèle.">
                    <span className="text-sm text-slate-300">System Prompt</span>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="min-h-[112px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400"
                    />
                </label>

                <label className="flex flex-col gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                    <div>
                        <p className="font-medium">Cache KV quantifié</p>
                        <p className="text-xs text-slate-400">
                            Compresse les clés et valeurs d'attention pour réduire l'usage mémoire.
                        </p>
                    </div>
                    <select
                        value={turboQuant}
                        onChange={(e) => setTurboQuant(e.target.value as TurboQuantType)}
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

                <label className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                    <input
                        type="checkbox"
                        checked={flashAttention}
                        onChange={(e) => setFlashAttention(e.target.checked)}
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

            <p className="text-xs text-slate-500 italic mt-2">
                Les paramètres de sampling avancés sont configurables par modèle dans le panneau Modèles (⚙ Configurer).
            </p>

            {/* ── Section Context7 ── */}
            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 mt-2">
                <div>
                    <h3 className="font-semibold text-sm text-white">Context7</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        Documentation officielle et à jour injectée automatiquement dans le contexte de l&apos;IA.{" "}
                        <a
                            href="https://context7.com/dashboard"
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            Obtenir une clé gratuite →
                        </a>
                    </p>
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-300">Clé API Context7</span>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={context7Key}
                            onChange={(e) => setContext7Key(e.target.value)}
                            placeholder="ctx7sk-…  (optionnel, rate-limit élevé avec clé)"
                            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400 font-mono text-sm"
                        />
                        <button
                            onClick={saveContext7Key}
                            className={`rounded-2xl border px-4 py-2 text-sm transition ${
                                context7Saved
                                    ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                                    : "border-white/10 bg-white/5 text-slate-300 hover:border-blue-400/40 hover:text-blue-300"
                            }`}
                        >
                            {context7Saved ? "✓ Sauvegardé" : "Sauvegarder"}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500">
                        Sans clé : fonctionne avec des limites basses. Avec clé : accès illimité aux 86 000+
                        bibliothèques indexées.
                    </p>
                </label>
            </div>

            {/* ── Section Recherche Web ── */}
            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 mt-2">
                <div>
                    <h3 className="font-semibold text-sm text-white">Recherche Web</h3>
                    <p className="text-xs text-slate-400 mt-1">
                        DuckDuckGo est gratuit et ne nécessite pas de clé. Les autres moteurs offrent de meilleurs
                        résultats avec une clé API.
                    </p>
                </div>
                <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-300">
                        Brave Search —{" "}
                        <a
                            href="https://brave.com/search/api/"
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            brave.com/search/api
                        </a>
                    </span>
                    <input
                        type="password"
                        value={braveKey}
                        onChange={(e) => setBraveKey(e.target.value)}
                        placeholder="BSAb…"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400 font-mono text-sm"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-300">
                        Serper (Google) —{" "}
                        <a
                            href="https://serper.dev"
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            serper.dev
                        </a>
                    </span>
                    <input
                        type="password"
                        value={serperKey}
                        onChange={(e) => setSerperKey(e.target.value)}
                        placeholder="…"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400 font-mono text-sm"
                    />
                </label>
                <label className="flex flex-col gap-1">
                    <span className="text-sm text-slate-300">
                        Tavily —{" "}
                        <a
                            href="https://app.tavily.com"
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline"
                        >
                            app.tavily.com
                        </a>
                    </span>
                    <input
                        type="password"
                        value={tavilyKey}
                        onChange={(e) => setTavilyKey(e.target.value)}
                        placeholder="tvly-…"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-blue-400 font-mono text-sm"
                    />
                </label>
                <button
                    onClick={saveSearchKeys}
                    className={`self-start rounded-2xl border px-4 py-2 text-sm transition ${
                        searchSaved
                            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                            : "border-white/10 bg-white/5 text-slate-300 hover:border-blue-400/40 hover:text-blue-300"
                    }`}
                >
                    {searchSaved ? "✓ Sauvegardé" : "Sauvegarder les clés"}
                </button>
            </div>
        </div>
    );
}

