"use client";

import React, { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useModels, type ModelConfig, parseSamplingJson } from "../hooks/useModels";
import { useModelSettings, type TurboQuantType, type SamplingSettings } from "../context/ModelSettingsContext";
import { buildLlamaArgs, detectChatTemplate, type DetectedTemplate } from "../lib/llamaWrapper";
import { autoConfigureFromHardware, type HardwareInfo, type AutoMode } from "../lib/hardwareConfig";
import PersonalityPicker from "./PersonalityPicker";

/* ── Composants helpers pour les sliders/inputs de sampling ── */

function SliderParam({ label, tooltip, value, onChange, min, max, step, decimals = 2 }: {
    label: string; tooltip?: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step: number; decimals?: number;
}) {
    return (
        <div className="flex flex-col gap-1" title={tooltip}>
            <span className="text-xs text-slate-400">{label}</span>
            <div className="flex items-center gap-3">
                <input type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-blue-500" />
                <span className="w-10 text-right text-xs font-mono text-white">{value.toFixed(decimals)}</span>
            </div>
        </div>
    );
}

function NumberParam({ label, tooltip, value, onChange, min, max, step }: {
    label: string; tooltip?: string; value: number; onChange: (v: number) => void;
    min: number; max: number; step?: number;
}) {
    return (
        <div className="flex flex-col gap-1" title={tooltip}>
            <span className="text-xs text-slate-400">{label}</span>
            <input type="number" min={min} max={max} step={step ?? 1} value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400" />
        </div>
    );
}

function SectionHeader({ title, open, toggle }: { title: string; open: boolean; toggle: () => void }) {
    return (
        <button type="button" onClick={toggle}
            className="flex items-center gap-2 w-full text-left text-xs font-semibold text-blue-400 py-1.5 hover:text-blue-300 transition">
            <span className={`transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
            {title}
        </button>
    );
}

export default function ModelsPanel() {
    const {
        modelFiles,
        mmprojFiles,
        modelConfigs,
        loading,
        error: listError,
        refresh,
        getConfigForPath,
        saveConfig,
        setDefault,
    } = useModels();

    const {
        isModelLoaded,
        setIsModelLoaded,
        loadedModelPath,
        setLoadedModelPath,
        setModelPath,
        setTemperature,
        setContextWindow,
        setSystemPrompt,
        setTurboQuant,
        setNGpuLayers,
        setThreads,
        setSampling,
    } = useModelSettings();

    const [expandedPath, setExpandedPath] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, ModelConfig>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pickingPersonalityFor, setPickingPersonalityFor] = useState<string | null>(null);
    const [autoDetecting, setAutoDetecting] = useState<string | null>(null);
    const [autoDetectNotes, setAutoDetectNotes] = useState<Record<string, string[]>>({});
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const toggleSection = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));

    const getOrCreateDraft = useCallback(
        (path: string): ModelConfig => drafts[path] ?? getConfigForPath(path),
        [drafts, getConfigForPath]
    );

    const updateDraft = (path: string, updates: Partial<ModelConfig>) => {
        setDrafts((prev) => ({ ...prev, [path]: { ...getOrCreateDraft(path), ...updates } }));
    };

    const clearDraft = (path: string) =>
        setDrafts((prev) => { const n = { ...prev }; delete n[path]; return n; });

    const handleSaveConfig = async (path: string) => {
        const draft = getOrCreateDraft(path);
        await saveConfig({ ...draft, path });
        clearDraft(path);
    };

    const handleSetDefault = async (path: string) => {
        setActionError(null);
        try {
            const draft = getOrCreateDraft(path);
            await saveConfig({ ...draft, path }); // sauvegarder d'abord
            await setDefault(path);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        }
    };

    const applyConfigToContext = (config: ModelConfig) => {
        setModelPath(config.path);
        setTemperature(config.temperature);
        setContextWindow(config.context_window);
        setSystemPrompt(config.system_prompt);
        setTurboQuant(config.turbo_quant as TurboQuantType);
        setNGpuLayers(config.n_gpu_layers);
        setThreads(config.threads);
        setSampling(parseSamplingJson(config.sampling_json));
    };

    const handleLoad = async (path: string, systemPromptOverride?: string) => {
        setPickingPersonalityFor(null);
        setActionLoading(path);
        setActionError(null);
        try {
            let config = getOrCreateDraft(path);

            // Si n_gpu_layers n'a jamais été configuré (= 0), auto-détecter le hardware
            if (config.n_gpu_layers === 0 && config.threads <= 0) {
                try {
                    const hw = await invoke<HardwareInfo>("get_hardware_info");
                    const auto = autoConfigureFromHardware(hw, "balanced");
                    config = { ...config, ...auto };
                    updateDraft(path, auto);
                    setAutoDetectNotes((prev) => ({ ...prev, [path]: ["⚡ Auto-détecté au premier lancement", ...auto.notes] }));
                    console.log("[ModelsPanel] Auto-détection au premier lancement:", auto);
                } catch (hwErr) {
                    console.warn("[ModelsPanel] Auto-détection échouée, lancement avec valeurs par défaut:", hwErr);
                }
            }

            const args = buildLlamaArgs({
                contextWindow: config.context_window,
                turboQuant: config.turbo_quant as TurboQuantType,
                mmprojPath: config.mmproj_path,
                nGpuLayers: config.n_gpu_layers > 0 ? config.n_gpu_layers : undefined,
                threads: config.threads > 0 ? config.threads : undefined,
                ...((): DetectedTemplate => {
                    if (config.chat_template === "jinja") return { useJinja: true };
                    if (config.chat_template !== "") return { chatTemplate: config.chat_template };
                    return detectChatTemplate(path);
                })(),
            });
            console.log("[ModelsPanel] Lancement llama-server avec args:", args.join(" "));
            await invoke<string>("start_llama", { modelPath: path, params: args });
            setIsModelLoaded(true);
            setLoadedModelPath(path);
            applyConfigToContext(config);
            // Appliquer la personnalité (override du system prompt)
            if (systemPromptOverride !== undefined) {
                setSystemPrompt(systemPromptOverride);
            }
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        } finally {
            setActionLoading(null);
        }
    };

    const handleAutoDetect = async (path: string, mode: AutoMode = "balanced") => {
        setAutoDetecting(path);
        setActionError(null);
        try {
            const hw = await invoke<HardwareInfo>("get_hardware_info");
            const cfg = autoConfigureFromHardware(hw, mode);
            updateDraft(path, {
                context_window: cfg.context_window,
                turbo_quant: cfg.turbo_quant,
                n_gpu_layers: cfg.n_gpu_layers,
                threads: cfg.threads,
            });
            setAutoDetectNotes((prev) => ({ ...prev, [path]: cfg.notes }));
        } catch (e: unknown) {
            setActionError(`Détection matériel échouée : ${getErrorMessage(e)}`);
        } finally {
            setAutoDetecting(null);
        }
    };

    const handleStop = async () => {
        setActionLoading("__stop__");
        setActionError(null);
        try {
            await invoke("stop_llama");
            setIsModelLoaded(false);
            setLoadedModelPath(null);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-slate-400">
                Chargement des modèles...
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            {/* Sélecteur de personnalité */}
            {pickingPersonalityFor && (
                <PersonalityPicker
                    modelName={pickingPersonalityFor.split(/[/\\]/).pop() ?? pickingPersonalityFor}
                    defaultSystemPrompt={getOrCreateDraft(pickingPersonalityFor).system_prompt}
                    onConfirm={(systemPrompt) => handleLoad(pickingPersonalityFor, systemPrompt)}
                    onCancel={() => setPickingPersonalityFor(null)}
                />
            )}

            {/* En-tête */}
            <div className="border-b border-white/10 px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Bibliothèque</p>
                        <h2 className="text-2xl font-semibold text-white">Modèles locaux</h2>
                    </div>
                    <button
                        onClick={refresh}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                    >
                        🔄 Actualiser
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {(listError || actionError) && (
                    <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {listError ?? actionError}
                    </div>
                )}

                {modelFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center text-slate-400">
                        <span className="text-5xl">📂</span>
                        <p className="text-lg font-medium text-white">Aucun modèle trouvé</p>
                        <p className="text-sm">
                            Place tes fichiers{" "}
                            <code className="rounded bg-white/10 px-2 py-0.5">.gguf</code> dans le
                            dossier{" "}
                            <code className="rounded bg-white/10 px-2 py-0.5">models/</code>
                        </p>
                        <button
                            onClick={refresh}
                            className="mt-2 rounded-2xl bg-blue-500 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
                        >
                            Rafraîchir
                        </button>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-3xl flex-col gap-4">
                        {modelFiles.map((filePath) => {
                            const config = modelConfigs.find((c) => c.path === filePath);
                            const draft = getOrCreateDraft(filePath);
                            const isExpanded = expandedPath === filePath;
                            const isLoaded = loadedModelPath === filePath;
                            const isDefault = config?.is_default ?? false;
                            const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
                            const isLoadingThis = actionLoading === filePath;

                            return (
                                <div
                                    key={filePath}
                                    className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/10"
                                >
                                    {/* Ligne principale */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className="min-w-0 flex-1 truncate font-medium text-white"
                                            title={filePath}
                                        >
                                            📦 {fileName}
                                        </span>
                                        {isDefault && (
                                            <span className="rounded-xl bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                                                Par défaut
                                            </span>
                                        )}
                                        {isLoaded && (
                                            <span className="rounded-xl bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                                                ● Chargé
                                            </span>
                                        )}

                                        {/* Bouton configurer */}
                                        <button
                                            onClick={() =>
                                                setExpandedPath(isExpanded ? null : filePath)
                                            }
                                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                                        >
                                            {isExpanded ? "Fermer" : "⚙ Configurer"}
                                        </button>

                                        {/* Bouton par défaut */}
                                        {!isDefault && (
                                            <button
                                                onClick={() => handleSetDefault(filePath)}
                                                className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
                                            >
                                                ★ Par défaut
                                            </button>
                                        )}

                                        {/* Bouton charger / arrêter */}
                                        {isLoaded ? (
                                            <button
                                                onClick={handleStop}
                                                disabled={actionLoading === "__stop__"}
                                                className="rounded-2xl bg-red-500/80 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
                                            >
                                                {actionLoading === "__stop__" ? "Arrêt…" : "Arrêter"}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setPickingPersonalityFor(filePath)}
                                                disabled={isModelLoaded || !!actionLoading}
                                                className="rounded-2xl bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                {isLoadingThis ? "Chargement…" : "▶ Charger"}
                                            </button>
                                        )}
                                    </div>

                                    {/* Formulaire de configuration */}
                                    {isExpanded && (
                                        <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">

                                            {/* ── Auto-détection avec modes ── */}
                                            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                                                <p className="text-xs font-semibold text-violet-300">🔍 Configuration automatique</p>
                                                {autoDetectNotes[filePath] ? (
                                                    <ul className="mt-1.5 space-y-0.5">
                                                        {autoDetectNotes[filePath].map((note, i) => (
                                                            <li key={i} className="text-[0.65rem] text-slate-400">• {note}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="mt-0.5 text-[0.65rem] text-slate-500">
                                                        Détecte RAM, CPU et GPU pour remplir les champs optimaux.
                                                    </p>
                                                )}
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => handleAutoDetect(filePath, "gpu_only")}
                                                        disabled={autoDetecting === filePath}
                                                        className="rounded-2xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                                                        title="Tout en VRAM — vitesse max, contexte limité par la carte graphique"
                                                    >
                                                        {autoDetecting === filePath ? "…" : "🎮 GPU seul"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAutoDetect(filePath, "balanced")}
                                                        disabled={autoDetecting === filePath}
                                                        className="rounded-2xl bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                                                        title="Équilibre entre vitesse et contexte — recommandé"
                                                    >
                                                        {autoDetecting === filePath ? "…" : "⚖️ Équilibré"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleAutoDetect(filePath, "max_context")}
                                                        disabled={autoDetecting === filePath}
                                                        className="rounded-2xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                                                        title="Utilise GPU + RAM pour maximiser le contexte — plus lent"
                                                    >
                                                        {autoDetecting === filePath ? "…" : "📐 Max contexte"}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Température */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">Température</span>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={2}
                                                        step={0.01}
                                                        value={draft.temperature}
                                                        onChange={(e) =>
                                                            updateDraft(filePath, {
                                                                temperature: Number(e.target.value),
                                                            })
                                                        }
                                                        className="flex-1 accent-blue-500"
                                                    />
                                                    <span className="w-10 text-right text-xs font-mono text-white">
                                                        {draft.temperature.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Context Window */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">
                                                    Context Window (tokens)
                                                </span>
                                                <input
                                                    type="number"
                                                    min={512}
                                                    max={131072}
                                                    value={draft.context_window}
                                                    onChange={(e) =>
                                                        updateDraft(filePath, {
                                                            context_window: Number(e.target.value),
                                                        })
                                                    }
                                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                                />
                                            </div>

                                            {/* Couches GPU + Threads (grid 2 col) */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-slate-400">
                                                        Couches GPU <span className="text-slate-600">(-ngl)</span>
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={999}
                                                        value={draft.n_gpu_layers}
                                                        onChange={(e) =>
                                                            updateDraft(filePath, { n_gpu_layers: Number(e.target.value) })
                                                        }
                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                    />
                                                    <p className="text-[0.6rem] text-slate-600">0 = CPU · 999 = tout GPU</p>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-slate-400">
                                                        Threads CPU <span className="text-slate-600">(-t)</span>
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={-1}
                                                        max={256}
                                                        value={draft.threads}
                                                        onChange={(e) =>
                                                            updateDraft(filePath, { threads: Number(e.target.value) })
                                                        }
                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                                                    />
                                                    <p className="text-[0.6rem] text-slate-600">-1 = auto</p>
                                                </div>
                                            </div>

                                            {/* System Prompt */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">System Prompt</span>
                                                <textarea
                                                    rows={3}
                                                    value={draft.system_prompt}
                                                    onChange={(e) =>
                                                        updateDraft(filePath, {
                                                            system_prompt: e.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                                />
                                            </div>

                                            {/* Cache KV quantifié */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">Cache KV quantifié</span>
                                                <select
                                                    value={draft.turbo_quant}
                                                    onChange={(e) =>
                                                        updateDraft(filePath, {
                                                            turbo_quant: e.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                                >
                                                    <option value="none">Aucun</option>
                                                    <option value="q8_0">q8_0 — recommandé (8 bits K+V)</option>
                                                    <option value="q4_0">q4_0 — agressif (4 bits K+V)</option>
                                                    <option value="q4_1">q4_1 — 4 bits avec offset</option>
                                                    <option value="q5_0">q5_0 — 5 bits K+V</option>
                                                    <option value="q5_1">q5_1 — 5 bits avec offset</option>
                                                </select>
                                            </div>

                                            {/* Fichier mmproj (vision multimodale) */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">
                                                    Fichier mmproj <span className="text-slate-500">(vision — optionnel)</span>
                                                </span>
                                                {mmprojFiles.length > 0 ? (
                                                    <select
                                                        value={draft.mmproj_path ?? ""}
                                                        onChange={(e) =>
                                                            updateDraft(filePath, { mmproj_path: e.target.value })
                                                        }
                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                                                    >
                                                        <option value="">Aucun (texte uniquement)</option>
                                                        {mmprojFiles.map((mp) => (
                                                            <option key={mp} value={mp}>
                                                                {mp.split(/[/\\]/).pop()}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={draft.mmproj_path ?? ""}
                                                        onChange={(e) =>
                                                            updateDraft(filePath, { mmproj_path: e.target.value })
                                                        }
                                                        placeholder="models/gemma-4-E4B-it-Q4_K_M-mmproj-f16.gguf"
                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400 placeholder:text-slate-600"
                                                    />
                                                )}
                                                <p className="text-[0.65rem] text-slate-500">
                                                    {mmprojFiles.length > 0
                                                        ? `${mmprojFiles.length} fichier(s) mmproj détecté(s) dans models/`
                                                        : <>Place le fichier <code className="rounded bg-white/10 px-1">-mmproj-f16.gguf</code> dans <code className="rounded bg-white/10 px-1">models/</code> et actualise.</>}
                                                </p>
                                            </div>

                                            {/* Chat template */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs text-slate-400">
                                                    Chat template <span className="text-slate-500">(format de conversation)</span>
                                                </span>
                                                <select
                                                    value={draft.chat_template ?? ""}
                                                    onChange={(e) => updateDraft(filePath, { chat_template: e.target.value })}
                                                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                                                >
                                                    <option value="">🔍 Auto-détect (recommandé)</option>
                                                    <option value="jinja">⚡ jinja — Jinja2 embarqué (Gemma 4 uncensored)</option>
                                                    <option value="gemma">gemma — Gemma 1/2</option>
                                                    <option value="llama3">llama3 — Llama 3.x</option>
                                                    <option value="llama2">llama2 — Llama 2</option>
                                                    <option value="mistral">mistral</option>
                                                    <option value="phi3">phi3</option>
                                                    <option value="chatml">chatml — Qwen / ChatML</option>
                                                    <option value="deepseek">deepseek</option>
                                                </select>
                                                <p className="text-[0.65rem] text-slate-500">
                                                    Laisse sur Auto pour les modèles officiels. Utilise <code className="rounded bg-white/10 px-1">jinja</code> pour Gemma 4 uncensored/abliterated.
                                                </p>
                                            </div>

                                            {/* ── Paramètres de sampling avancés ── */}
                                            {(() => {
                                                const s = parseSamplingJson(draft.sampling_json);
                                                const updS = (key: keyof SamplingSettings, val: number | string) =>
                                                    updateDraft(filePath, { sampling_json: JSON.stringify({ ...s, [key]: val }) });
                                                return (
                                                    <>
                                                        {/* Sampling */}
                                                        <SectionHeader title="Sampling" open={!!openSections[`${filePath}_sampling`]} toggle={() => toggleSection(`${filePath}_sampling`)} />
                                                        {openSections[`${filePath}_sampling`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <SliderParam label="Top P" tooltip="Nucleus sampling : ne garde que les tokens dont la probabilité cumulée atteint ce seuil. 1.0 = désactivé. Défaut : 0.95" value={s.topP} onChange={(v) => updS("topP", v)} min={0} max={1} step={0.01} />
                                                                <NumberParam label="Top K" tooltip="Limite aux K tokens les plus probables. 0 = désactivé. Défaut : 40" value={s.topK} onChange={(v) => updS("topK", v)} min={0} max={500} />
                                                                <SliderParam label="Min P" tooltip="Filtre les tokens en dessous de min_p × prob du meilleur token. 0.0 = désactivé. Défaut : 0.05" value={s.minP} onChange={(v) => updS("minP", v)} min={0} max={1} step={0.01} />
                                                                <SliderParam label="Typical P" tooltip="Sélectionne les tokens proches de l'entropie attendue. 1.0 = désactivé. Défaut : 1.0" value={s.typicalP} onChange={(v) => updS("typicalP", v)} min={0} max={1} step={0.01} />
                                                                <NumberParam label="Top N Sigma" tooltip="Ne garde que les tokens à N sigmas au-dessus de la moyenne des logits. -1 = désactivé. Défaut : -1" value={s.topNSigma} onChange={(v) => updS("topNSigma", v)} min={-1} max={10} step={0.1} />
                                                            </div>
                                                        )}

                                                        {/* Pénalités */}
                                                        <SectionHeader title="Pénalités" open={!!openSections[`${filePath}_penalties`]} toggle={() => toggleSection(`${filePath}_penalties`)} />
                                                        {openSections[`${filePath}_penalties`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <SliderParam label="Repeat Penalty" tooltip="Pénalise la répétition de tokens. 1.0 = désactivé. Défaut : 1.0" value={s.repeatPenalty} onChange={(v) => updS("repeatPenalty", v)} min={1} max={2} step={0.01} />
                                                                <SliderParam label="Frequency Penalty" tooltip="Pénalité proportionnelle au nombre d'occurrences. 0.0 = désactivé. Défaut : 0.0" value={s.frequencyPenalty} onChange={(v) => updS("frequencyPenalty", v)} min={0} max={2} step={0.01} />
                                                                <SliderParam label="Presence Penalty" tooltip="Pénalité fixe pour tout token déjà apparu. 0.0 = désactivé. Défaut : 0.0" value={s.presencePenalty} onChange={(v) => updS("presencePenalty", v)} min={0} max={2} step={0.01} />
                                                                <NumberParam label="Penalty Last N" tooltip="Fenêtre de tokens pour les pénalités. 0 = désactivé, -1 = contexte entier. Défaut : 64" value={s.penaltyLastN} onChange={(v) => updS("penaltyLastN", v)} min={-1} max={2048} />
                                                            </div>
                                                        )}

                                                        {/* Mirostat */}
                                                        <SectionHeader title="Mirostat" open={!!openSections[`${filePath}_mirostat`]} toggle={() => toggleSection(`${filePath}_mirostat`)} />
                                                        {openSections[`${filePath}_mirostat`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <div className="flex flex-col gap-1" title="Sampling adaptatif. 0 = désactivé, 1 = v1, 2 = v2. Défaut : 0">
                                                                    <span className="text-xs text-slate-400">Mirostat Mode</span>
                                                                    <select value={s.mirostat}
                                                                        onChange={(e) => updS("mirostat", Number(e.target.value))}
                                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400">
                                                                        <option value={0}>0 — Désactivé</option>
                                                                        <option value={1}>1 — Mirostat v1</option>
                                                                        <option value={2}>2 — Mirostat v2</option>
                                                                    </select>
                                                                </div>
                                                                <SliderParam label="Mirostat Tau" tooltip="Entropie cible. Bas = focalisé, haut = créatif. Défaut : 5.0" value={s.mirostatTau} onChange={(v) => updS("mirostatTau", v)} min={0} max={10} step={0.1} decimals={1} />
                                                                <SliderParam label="Mirostat Eta" tooltip="Taux d'apprentissage. Défaut : 0.1" value={s.mirostatEta} onChange={(v) => updS("mirostatEta", v)} min={0} max={1} step={0.01} />
                                                            </div>
                                                        )}

                                                        {/* Température Dynamique */}
                                                        <SectionHeader title="Température Dynamique" open={!!openSections[`${filePath}_dynatemp`]} toggle={() => toggleSection(`${filePath}_dynatemp`)} />
                                                        {openSections[`${filePath}_dynatemp`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <SliderParam label="DynaTemp Range" tooltip="Plage de variation de température. 0.0 = désactivé. Défaut : 0.0" value={s.dynaTempRange} onChange={(v) => updS("dynaTempRange", v)} min={0} max={2} step={0.01} />
                                                                <SliderParam label="DynaTemp Exponent" tooltip="Exposant de la courbe entropie vers température. 1.0 = linéaire. Défaut : 1.0" value={s.dynaTempExponent} onChange={(v) => updS("dynaTempExponent", v)} min={0.1} max={5} step={0.1} decimals={1} />
                                                            </div>
                                                        )}

                                                        {/* XTC */}
                                                        <SectionHeader title="XTC (eXtreme Token Culling)" open={!!openSections[`${filePath}_xtc`]} toggle={() => toggleSection(`${filePath}_xtc`)} />
                                                        {openSections[`${filePath}_xtc`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <SliderParam label="XTC Probability" tooltip="Probabilité d'activer le culling XTC. 0.0 = désactivé. Défaut : 0.0" value={s.xtcProbability} onChange={(v) => updS("xtcProbability", v)} min={0} max={1} step={0.01} />
                                                                <SliderParam label="XTC Threshold" tooltip="Seuil au-dessus duquel un token peut être retiré par XTC. Défaut : 0.1" value={s.xtcThreshold} onChange={(v) => updS("xtcThreshold", v)} min={0} max={1} step={0.01} />
                                                            </div>
                                                        )}

                                                        {/* DRY */}
                                                        <SectionHeader title="DRY (Don't Repeat Yourself)" open={!!openSections[`${filePath}_dry`]} toggle={() => toggleSection(`${filePath}_dry`)} />
                                                        {openSections[`${filePath}_dry`] && (
                                                            <div className="flex flex-col gap-3 pl-2 border-l border-white/10">
                                                                <SliderParam label="DRY Multiplier" tooltip="Multiplicateur de pénalité DRY. 0.0 = désactivé. Défaut : 0.0" value={s.dryMultiplier} onChange={(v) => updS("dryMultiplier", v)} min={0} max={5} step={0.1} decimals={1} />
                                                                <SliderParam label="DRY Base" tooltip="Base de la fonction exponentielle de pénalité. Défaut : 1.75" value={s.dryBase} onChange={(v) => updS("dryBase", v)} min={1} max={4} step={0.05} />
                                                                <NumberParam label="DRY Allowed Length" tooltip="Longueur max de séquence autorisée avant pénalité. Défaut : 2" value={s.dryAllowedLength} onChange={(v) => updS("dryAllowedLength", v)} min={0} max={100} />
                                                                <NumberParam label="DRY Penalty Last N" tooltip="Fenêtre de recherche des séquences. -1 = contexte entier. Défaut : -1" value={s.dryPenaltyLastN} onChange={(v) => updS("dryPenaltyLastN", v)} min={-1} max={2048} />
                                                                <div className="flex flex-col gap-1" title="Tokens qui interrompent la détection DRY.">
                                                                    <span className="text-xs text-slate-400">DRY Sequence Breakers</span>
                                                                    <input type="text" value={s.drySequenceBreakers}
                                                                        onChange={(e) => updS("drySequenceBreakers", e.target.value)}
                                                                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                                                                        placeholder={'"\\n", ":", "\\""'} />
                                                                    <span className="text-[0.6rem] text-slate-500">Séparés par des virgules</span>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}

                                            {/* Actions cfg */}
                                            <div className="flex justify-end gap-2 pt-1">
                                                <button
                                                    onClick={() => clearDraft(filePath)}
                                                    className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                                                >
                                                    Annuler
                                                </button>
                                                <button
                                                    onClick={() => handleSaveConfig(filePath)}
                                                    className="rounded-2xl bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400"
                                                >
                                                    Sauvegarder
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
    const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
