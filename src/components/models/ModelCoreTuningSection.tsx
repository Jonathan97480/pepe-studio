import React from "react";
import type { ModelConfig } from "@/hooks/useModels";
import type { TurboQuantType } from "@/context/ModelSettingsContext";

type ModelCoreTuningSectionProps = {
    draft: ModelConfig;
    contextMin: number;
    contextMax: number;
    contextValue: number;
    gpuLayersMax: number;
    gpuLayersValue: number;
    cpuThreadsMax: number;
    cpuThreadsMin: number;
    threadsValue: number;
    isMoE: boolean;
    expertCount: number;
    onUpdate: (updates: Partial<ModelConfig>) => void;
};

export default function ModelCoreTuningSection({
    draft,
    contextMin,
    contextMax,
    contextValue,
    gpuLayersMax,
    gpuLayersValue,
    cpuThreadsMax,
    cpuThreadsMin,
    threadsValue,
    isMoE,
    expertCount,
    onUpdate,
}: ModelCoreTuningSectionProps) {
    return (
        <>
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Température</span>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.01}
                        value={draft.temperature}
                        onChange={(event) => onUpdate({ temperature: Number(event.target.value) })}
                        className="flex-1 accent-blue-500"
                    />
                    <span className="w-10 text-right text-xs font-mono text-white">{draft.temperature.toFixed(2)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Context Window (tokens)</span>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={contextMin}
                        max={contextMax}
                        step={1}
                        value={contextValue}
                        onChange={(event) => onUpdate({ context_window: Number(event.target.value) })}
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
                        onChange={(event) => onUpdate({ eval_batch_size: Number(event.target.value) })}
                        className="flex-1 accent-cyan-500"
                    />
                    <span className="w-20 text-right text-xs font-mono text-white">
                        {Math.min(contextValue, Math.max(1, draft.eval_batch_size || 1)).toLocaleString()}
                    </span>
                </div>
                <p className="text-[0.6rem] text-slate-600">Tokens d&apos;entree traites a la fois (1 .. contexte)</p>
            </div>

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
                            onChange={(event) => onUpdate({ n_gpu_layers: Number(event.target.value) })}
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
                            onChange={(event) => onUpdate({ threads: Number(event.target.value) })}
                            className="flex-1 accent-emerald-500"
                        />
                        <span className="w-12 text-right text-xs font-mono text-white">{threadsValue}</span>
                    </div>
                    <p className="text-[0.6rem] text-slate-600">-1 = auto · max {cpuThreadsMax}</p>
                </div>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Budget reasoning <span className="text-slate-600">(--reasoning-budget)</span>
                </span>
                <input
                    type="number"
                    min={-1}
                    max={4096}
                    value={draft.reasoning_budget}
                    onChange={(event) => onUpdate({ reasoning_budget: Number(event.target.value) })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
                <p className="text-[0.6rem] text-slate-600">
                    -1 = illimité · 0 = stop immédiat · 64 = recommandé pour Qwen3.6
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">System Prompt</span>
                <textarea
                    rows={3}
                    value={draft.system_prompt}
                    onChange={(event) => onUpdate({ system_prompt: event.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                />
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Cache KV quantifié</span>
                <select
                    value={draft.turbo_quant}
                    onChange={(event) => onUpdate({ turbo_quant: event.target.value as TurboQuantType })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                >
                    <option value="none">Aucun</option>
                    <option value="turbo3">turbo3 — TurboQuant 3.25 bits (bin. TurboQuant requis)</option>
                    <option value="turbo4">turbo4 — TurboQuant 4.25 bits (bin. TurboQuant requis)</option>
                    <option value="q8_0">q8_0 — recommandé (8 bits K+V)</option>
                    <option value="q4_0">q4_0 — agressif (4 bits K+V)</option>
                    <option value="q4_1">q4_1 — 4 bits avec offset</option>
                    <option value="q5_0">q5_0 — 5 bits K+V</option>
                    <option value="q5_1">q5_1 — 5 bits avec offset</option>
                </select>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <input
                    type="checkbox"
                    checked={!!draft.flash_attention}
                    onChange={(event) => onUpdate({ flash_attention: event.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-cyan-500"
                />
                <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">
                        Flash Attention <span className="text-slate-500">(-fa)</span>
                    </p>
                    <p className="text-[0.65rem] text-slate-500">Accélère l&apos;attention sur matériel compatible.</p>
                </div>
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={!!draft.no_mmap}
                        onChange={(event) => onUpdate({ no_mmap: event.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-amber-500"
                    />
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200">
                            No-mmap <span className="text-slate-500">(--no-mmap)</span>
                        </p>
                        <p className="text-[0.65rem] text-slate-500">Désactive le memory-mapping.</p>
                    </div>
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <input
                        type="checkbox"
                        checked={!!draft.mlock}
                        onChange={(event) => onUpdate({ mlock: event.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-amber-500"
                    />
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200">
                            Mlock <span className="text-slate-500">(--mlock)</span>
                        </p>
                        <p className="text-[0.65rem] text-slate-500">Verrouille en RAM, évite le swap.</p>
                    </div>
                </label>
            </div>

            {isMoE && (
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-400">
                        Couches MoE CPU <span className="text-slate-600">(--n-cpu-moe)</span>
                        {expertCount > 0 && (
                            <span className="ml-2 rounded bg-orange-500/15 px-1 py-0.5 text-[0.6rem] text-orange-400">
                                {expertCount} experts
                            </span>
                        )}
                    </span>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={0}
                            max={gpuLayersMax}
                            step={1}
                            value={Math.min(gpuLayersMax, Math.max(0, draft.n_cpu_moe || 0))}
                            onChange={(event) => onUpdate({ n_cpu_moe: Number(event.target.value) })}
                            className="flex-1 accent-orange-500"
                        />
                        <span className="w-12 text-right text-xs font-mono text-white">
                            {Math.min(gpuLayersMax, Math.max(0, draft.n_cpu_moe || 0))}
                        </span>
                    </div>
                    <p className="text-[0.6rem] text-slate-600">
                        0 = auto · force N couches MoE sur CPU · max {gpuLayersMax}
                    </p>
                </div>
            )}
        </>
    );
}
