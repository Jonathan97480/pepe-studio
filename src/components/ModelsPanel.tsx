"use client";

import React from "react";
import { useModelSettings } from "../context/ModelSettingsContext";
import { useModels } from "../hooks/useModels";
import { useModelsPanelRuntime } from "../hooks/useModelsPanelRuntime";
import PersonalityPicker from "./PersonalityPicker";
import ModelsPanelCardsList from "./models/ModelsPanelCardsList";
import ModelsPanelEmptyState from "./models/ModelsPanelEmptyState";
import ModelsPanelErrorBlock from "./models/ModelsPanelErrorBlock";
import ModelsPanelHeader from "./models/ModelsPanelHeader";
import { SdModelSelector } from "./models/SdModelSelector";

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
        sdModelPath,
        setSdModelPath,
        setModelPath,
        setTemperature,
        setContextWindow,
        setEvalBatchSize,
        setFlashAttention,
        setSystemPrompt,
        setTurboQuant,
        setNGpuLayers,
        setThreads,
        setReasoningBudget,
        setSampling,
    } = useModelSettings();

    const {
        expandedPath,
        actionLoading,
        actionError,
        llamaLogs,
        pickingPersonalityFor,
        setPickingPersonalityFor,
        autoDetecting,
        autoDetectNotes,
        openSections,
        toggleSection,
        hardwareInfo,
        modelMetadataMap,
        sdModelFiles,
        refreshSdModels,
        handleRefreshAll,
        getOrCreateDraft,
        updateDraft,
        clearDraft,
        handleSaveConfig,
        handleSetDefault,
        handleLoad,
        handleAutoDetect,
        handleStop,
        setExpandedPath,
    } = useModelsPanelRuntime({
        sdModelPath,
        setSdModelPath,
        refresh,
        getConfigForPath,
        saveConfig,
        setDefault,
        setIsModelLoaded,
        setLoadedModelPath,
        setModelPath,
        setTemperature,
        setContextWindow,
        setEvalBatchSize,
        setFlashAttention,
        setSystemPrompt,
        setTurboQuant,
        setNGpuLayers,
        setThreads,
        setReasoningBudget,
        setSampling,
    });

    if (loading) {
        return <div className="flex h-full items-center justify-center text-slate-400">Chargement des modèles...</div>;
    }

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            {pickingPersonalityFor && (
                <PersonalityPicker
                    modelName={pickingPersonalityFor.split(/[/\\]/).pop() ?? pickingPersonalityFor}
                    defaultSystemPrompt={getOrCreateDraft(pickingPersonalityFor).system_prompt}
                    onConfirm={(systemPrompt) => handleLoad(pickingPersonalityFor, systemPrompt)}
                    onCancel={() => setPickingPersonalityFor(null)}
                />
            )}

            <ModelsPanelHeader onRefresh={handleRefreshAll} />

            <div className="flex-1 overflow-y-auto p-8">
                <ModelsPanelErrorBlock listError={listError} actionError={actionError} llamaLogs={llamaLogs} />

                <SdModelSelector
                    sdModelFiles={sdModelFiles}
                    sdModelPath={sdModelPath}
                    setSdModelPath={setSdModelPath}
                    onRefresh={refreshSdModels}
                />

                {modelFiles.length === 0 ? (
                    <ModelsPanelEmptyState onRefresh={handleRefreshAll} />
                ) : (
                    <ModelsPanelCardsList
                        modelFiles={modelFiles}
                        modelConfigs={modelConfigs}
                        expandedPath={expandedPath}
                        getOrCreateDraft={getOrCreateDraft}
                        loadedModelPath={loadedModelPath}
                        actionLoading={actionLoading}
                        isModelLoaded={isModelLoaded}
                        mmprojFiles={mmprojFiles}
                        hardwareInfo={hardwareInfo}
                        modelMetadataMap={modelMetadataMap}
                        autoDetectNotes={autoDetectNotes}
                        autoDetecting={autoDetecting}
                        openSections={openSections}
                        toggleSection={toggleSection}
                        onExpandPath={setExpandedPath}
                        onUpdateDraft={updateDraft}
                        onAutoDetect={handleAutoDetect}
                        onPickPersonality={setPickingPersonalityFor}
                        onStop={handleStop}
                        onSetDefault={handleSetDefault}
                        onSaveConfig={handleSaveConfig}
                        onCancelDraft={clearDraft}
                    />
                )}
            </div>
        </div>
    );
}
