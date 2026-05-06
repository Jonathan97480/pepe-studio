import React from "react";
import type { ModelConfig } from "@/hooks/useModels";
import type { HardwareInfo } from "@/lib/hardwareConfig";
import type { ModelMetadata } from "@/lib/modelMetadata";
import { ModelCard } from "./ModelCard";

type ModelsPanelCardsListProps = {
    modelFiles: string[];
    modelConfigs: ModelConfig[];
    expandedPath: string | null;
    getOrCreateDraft: (path: string) => ModelConfig;
    loadedModelPath: string | null;
    actionLoading: string | null;
    isModelLoaded: boolean;
    mmprojFiles: string[];
    hardwareInfo: HardwareInfo | null;
    modelMetadataMap: Record<string, ModelMetadata>;
    autoDetectNotes: Record<string, string[]>;
    autoDetecting: string | null;
    openSections: Record<string, boolean>;
    toggleSection: (key: string) => void;
    onExpandPath: (path: string | null) => void;
    onUpdateDraft: (path: string, updates: Partial<ModelConfig>) => void;
    onAutoDetect: (path: string, mode: "gpu_only" | "balanced" | "max_context") => void;
    onPickPersonality: (path: string) => void;
    onStop: () => void;
    onSetDefault: (path: string) => void;
    onSaveConfig: (path: string) => void;
    onCancelDraft: (path: string) => void;
};

export default function ModelsPanelCardsList({
    modelFiles,
    modelConfigs,
    expandedPath,
    getOrCreateDraft,
    loadedModelPath,
    actionLoading,
    isModelLoaded,
    mmprojFiles,
    hardwareInfo,
    modelMetadataMap,
    autoDetectNotes,
    autoDetecting,
    openSections,
    toggleSection,
    onExpandPath,
    onUpdateDraft,
    onAutoDetect,
    onPickPersonality,
    onStop,
    onSetDefault,
    onSaveConfig,
    onCancelDraft,
}: ModelsPanelCardsListProps) {
    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {modelFiles.map((filePath) => {
                const config = modelConfigs.find((item) => item.path === filePath);
                const draft = getOrCreateDraft(filePath);
                const isExpanded = expandedPath === filePath;

                return (
                    <ModelCard
                        key={filePath}
                        filePath={filePath}
                        draft={draft}
                        isExpanded={isExpanded}
                        isLoaded={loadedModelPath === filePath}
                        isDefault={config?.is_default ?? false}
                        isLoading={actionLoading === filePath}
                        isStopLoading={actionLoading === "__stop__"}
                        isAnyModelLoaded={isModelLoaded}
                        isAnyActionLoading={!!actionLoading}
                        mmprojFiles={mmprojFiles}
                        hardwareInfo={hardwareInfo}
                        meta={modelMetadataMap[filePath]}
                        autoDetectNotes={autoDetectNotes[filePath] ?? []}
                        autoDetecting={autoDetecting === filePath}
                        openSections={openSections}
                        toggleSection={toggleSection}
                        onExpand={() => onExpandPath(isExpanded ? null : filePath)}
                        onUpdate={(updates) => onUpdateDraft(filePath, updates)}
                        onAutoDetect={(mode) => onAutoDetect(filePath, mode)}
                        onPickPersonality={() => onPickPersonality(filePath)}
                        onStop={onStop}
                        onSetDefault={() => onSetDefault(filePath)}
                        onSave={() => onSaveConfig(filePath)}
                        onCancel={() => onCancelDraft(filePath)}
                    />
                );
            })}
        </div>
    );
}
