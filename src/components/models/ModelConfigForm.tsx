"use client";

import type { ModelConfig } from "../../hooks/useModels";
import type { TurboQuantType } from "../../context/ModelSettingsContext";
import type { HardwareInfo, AutoMode } from "../../lib/hardwareConfig";
import type { ModelMetadata } from "../../lib/modelMetadata";
import { estimateMemoryUsage } from "../../lib/hardwareConfig";
import MemoryEstimationBar from "../MemoryEstimationBar";
import ModelAutoDetectSection from "./ModelAutoDetectSection";
import ModelCoreTuningSection from "./ModelCoreTuningSection";
import ModelIntegrationSection from "./ModelIntegrationSection";
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

    // Détection MoE : expert_count GGUF OU nom d'architecture / fichier contenant "moe"
    const MOE_RE = /moe|mixture.?of.?expert/i;
    const isMoE =
        (meta?.expert_count ?? 0) > 0 ||
        MOE_RE.test(meta?.architecture ?? "") ||
        MOE_RE.test(meta?.name ?? "") ||
        MOE_RE.test(filePath);
    const expertCount = meta?.expert_count ?? 0;

    const contextValue = Math.min(contextMax, Math.max(contextMin, draft.context_window || contextMin));
    const gpuLayersValue = Math.min(gpuLayersMax, Math.max(0, draft.n_gpu_layers || 0));
    const threadsValue = Math.min(cpuThreadsMax, Math.max(cpuThreadsMin, draft.threads));

    const estimate = hardwareInfo
        ? estimateMemoryUsage(
              hardwareInfo,
              meta,
              contextValue,
              gpuLayersValue,
              draft.turbo_quant as TurboQuantType,
              draft.n_cpu_moe || 0,
              expertCount,
          )
        : null;
    const turboquantBetaModeEnabled =
        typeof window !== "undefined" && localStorage.getItem("llama_turboquant_enabled") === "true";

    return (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4">
            <ModelAutoDetectSection
                autoDetectNotes={autoDetectNotes}
                autoDetecting={autoDetecting}
                onAutoDetect={onAutoDetect}
            />

            {/* Estimation mémoire */}
            <MemoryEstimationBar
                estimate={estimate}
                loading={!hardwareInfo}
                turboquantBetaModeEnabled={turboquantBetaModeEnabled}
            />

            <ModelCoreTuningSection
                draft={draft}
                contextMin={contextMin}
                contextMax={contextMax}
                contextValue={contextValue}
                gpuLayersMax={gpuLayersMax}
                gpuLayersValue={gpuLayersValue}
                cpuThreadsMin={cpuThreadsMin}
                cpuThreadsMax={cpuThreadsMax}
                threadsValue={threadsValue}
                isMoE={isMoE}
                expertCount={expertCount}
                onUpdate={onUpdate}
            />

            <ModelIntegrationSection
                filePath={filePath}
                mmprojFiles={mmprojFiles}
                mmprojPath={draft.mmproj_path ?? ""}
                chatTemplate={draft.chat_template ?? ""}
                onUpdate={(updates) => onUpdate(updates)}
            />

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
