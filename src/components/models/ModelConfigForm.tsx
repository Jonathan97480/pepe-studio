"use client";

import type { ModelConfig } from "../../hooks/useModels";
import type { TurboQuantType } from "../../context/ModelSettingsContext";
import type { HardwareInfo, AutoMode } from "../../lib/hardwareConfig";
import type { ModelMetadata } from "../../lib/modelMetadata";
import { estimateMemoryUsage } from "../../lib/hardwareConfig";
import MemoryEstimationBar from "../MemoryEstimationBar";
import { SamplingAdvanced } from "./SamplingAdvanced";

interface ModelConfigFormProps {
    filePath: string;
    draft: ModelConfig;
    mmprojFiles: string[];
    hardwareInfo: HardwareInfo | null;
    meta: ModelMetadata | undefined;
    autoDetectNotes: string[];
    autoDetecting: boolean;
    openSections: Record<string, boolean>;
    toggleSection: (key: string) => void;
    onUpdate: (updates: Partial<ModelConfig>) => void;
    onAutoDetect: (mode: AutoMode) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function ModelConfigForm({
    filePath,
    draft,
    mmprojFiles,
    hardwareInfo,
    meta,
    autoDetectNotes,
    autoDetecting,
    openSections,
    toggleSection,
    onUpdate,
    onAutoDetect,
    onSave,
    onCancel,
}: ModelConfigFormProps) {
    const modelContextMax = meta?.context_length && meta.context_length > 0 ? Number(meta.context_length) : 131072;
    const contextMin = 1000;
    const contextMax = Math.max(contextMin, modelContextMax);
    const gpuLayersMax = meta?.block_count && meta.block_count > 0 ? Number(meta.block_count) : 999;
    const cpuThreadsMin = -1;
    const cpuThreadsMax = Math.max(1, hardwareInfo?.cpu_threads ?? 128);

    const contextValue = Math.min(contextMax, Math.max(contextMin, draft.context_window || contextMin));
    const gpuLayersValue = Math.min(gpuLayersMax, Math.max(0, draft.n_gpu_layers || 0));
    const threadsValue = Math.min(cpuThreadsMax, Math.max(cpuThreadsMin, draft.threads));

    const estimate = hardwareInfo
        ? estimateMemoryUsage(hardwareInfo, meta, contextValue, gpuLayersValue, draft.turbo_quant as TurboQuantType)
        : null;

    return (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
            {/* Auto-détection */}
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                <p className="text-xs font-semibold text-violet-300">🔍 Configuration automatique</p>
                {autoDetectNotes.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                        {autoDetectNotes.map((note, i) => (
                            <li key={i} className="text-[0.65rem] text-slate-400">
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

            {/* Estimation mémoire */}
            <MemoryEstimationBar estimate={estimate} loading={!hardwareInfo} />

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
                        onChange={(e) => onUpdate({ temperature: Number(e.target.value) })}
                        className="flex-1 accent-blue-500"
                    />
                    <span className="w-10 text-right text-xs font-mono text-white">{draft.temperature.toFixed(2)}</span>
                </div>
            </div>

            {/* Context Window */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Context Window (tokens)</span>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={contextMin}
                        max={contextMax}
                        step={1}
                        value={contextValue}
                        onChange={(e) => onUpdate({ context_window: Number(e.target.value) })}
                        className="flex-1 accent-blue-500"
                    />
                    <span className="w-20 text-right text-xs font-mono text-white">
                        {contextValue.toLocaleString()}
                    </span>
                </div>
                <p className="text-[0.6rem] text-slate-600">
                    min {contextMin.toLocaleString()} · max modèle {contextMax.toLocaleString()}
                </p>
            </div>

            {/* Lot d'évaluation */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Lot d&apos;evaluation <span className="text-slate-600">(-b)</span>
                </span>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={1}
                        max={contextValue}
                        step={1}
                        value={Math.min(contextValue, Math.max(1, draft.eval_batch_size || 1))}
                        onChange={(e) => onUpdate({ eval_batch_size: Number(e.target.value) })}
                        className="flex-1 accent-cyan-500"
                    />
                    <span className="w-20 text-right text-xs font-mono text-white">
                        {Math.min(contextValue, Math.max(1, draft.eval_batch_size || 1)).toLocaleString()}
                    </span>
                </div>
                <p className="text-[0.6rem] text-slate-600">Tokens d&apos;entree traites a la fois (1 .. contexte)</p>
            </div>

            {/* Couches GPU + Threads */}
            <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-400">
                        Couches GPU <span className="text-slate-600">(-ngl)</span>
                    </span>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={0}
                            max={gpuLayersMax}
                            step={1}
                            value={gpuLayersValue}
                            onChange={(e) => onUpdate({ n_gpu_layers: Number(e.target.value) })}
                            className="flex-1 accent-emerald-500"
                        />
                        <span className="w-12 text-right text-xs font-mono text-white">{gpuLayersValue}</span>
                    </div>
                    <p className="text-[0.6rem] text-slate-600">0 = CPU · max {gpuLayersMax}</p>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-400">
                        Threads CPU <span className="text-slate-600">(-t)</span>
                    </span>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={cpuThreadsMin}
                            max={cpuThreadsMax}
                            step={1}
                            value={threadsValue}
                            onChange={(e) => onUpdate({ threads: Number(e.target.value) })}
                            className="flex-1 accent-emerald-500"
                        />
                        <span className="w-12 text-right text-xs font-mono text-white">{threadsValue}</span>
                    </div>
                    <p className="text-[0.6rem] text-slate-600">-1 = auto · max {cpuThreadsMax}</p>
                </div>
            </div>

            {/* Reasoning Budget */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Budget reasoning <span className="text-slate-600">(--reasoning-budget)</span>
                </span>
                <input
                    type="number"
                    min={-1}
                    max={4096}
                    value={draft.reasoning_budget}
                    onChange={(e) => onUpdate({ reasoning_budget: Number(e.target.value) })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
                <p className="text-[0.6rem] text-slate-600">
                    -1 = illimité · 0 = stop immédiat · 64 = recommandé pour Qwen3.6
                </p>
            </div>

            {/* System Prompt */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">System Prompt</span>
                <textarea
                    rows={3}
                    value={draft.system_prompt}
                    onChange={(e) => onUpdate({ system_prompt: e.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                />
            </div>

            {/* Cache KV quantifié */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Cache KV quantifié</span>
                <select
                    value={draft.turbo_quant}
                    onChange={(e) => onUpdate({ turbo_quant: e.target.value })}
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

            {/* Flash Attention */}
            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <input
                    type="checkbox"
                    checked={!!draft.flash_attention}
                    onChange={(e) => onUpdate({ flash_attention: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-cyan-500"
                />
                <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">
                        Flash Attention <span className="text-slate-500">(-fa)</span>
                    </p>
                    <p className="text-[0.65rem] text-slate-500">Accélère l&apos;attention sur matériel compatible.</p>
                </div>
            </label>

            {/* Fichier mmproj */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Fichier mmproj <span className="text-slate-500">(vision — optionnel)</span>
                </span>
                {mmprojFiles.length > 0 ? (
                    <select
                        value={draft.mmproj_path ?? ""}
                        onChange={(e) => onUpdate({ mmproj_path: e.target.value })}
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
                        onChange={(e) => onUpdate({ mmproj_path: e.target.value })}
                        placeholder="models/gemma-4-E4B-it-Q4_K_M-mmproj-f16.gguf"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400 placeholder:text-slate-600"
                    />
                )}
                <p className="text-[0.65rem] text-slate-500">
                    {mmprojFiles.length > 0 ? (
                        `${mmprojFiles.length} fichier(s) mmproj détecté(s) dans models/`
                    ) : (
                        <>
                            Place le fichier <code className="rounded bg-white/10 px-1">-mmproj-f16.gguf</code> dans{" "}
                            <code className="rounded bg-white/10 px-1">models/</code> et actualise.
                        </>
                    )}
                </p>
            </div>

            {/* Chat template */}
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Chat template <span className="text-slate-500">(format de conversation)</span>
                </span>
                <select
                    value={draft.chat_template ?? ""}
                    onChange={(e) => onUpdate({ chat_template: e.target.value })}
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
                    Laisse sur Auto pour les modèles officiels. Utilise{" "}
                    <code className="rounded bg-white/10 px-1">jinja</code> pour Gemma 4 uncensored/abliterated.
                </p>
            </div>

            {/* Sampling avancé */}
            <SamplingAdvanced
                filePath={filePath}
                samplingJson={draft.sampling_json}
                openSections={openSections}
                toggleSection={toggleSection}
                onUpdate={(json) => onUpdate({ sampling_json: json })}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
                <button
                    onClick={onCancel}
                    className="rounded-2xl border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:text-white"
                >
                    Annuler
                </button>
                <button
                    onClick={onSave}
                    className="rounded-2xl bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400"
                >
                    Sauvegarder
                </button>
            </div>
        </div>
    );
}
