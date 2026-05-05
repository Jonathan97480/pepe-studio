"use client";

import React, { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useModels, type ModelConfig, parseSamplingJson } from "../hooks/useModels";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { buildLlamaArgs, detectChatTemplate, type DetectedTemplate } from "../lib/llamaWrapper";
import { autoConfigureFromHardware, type HardwareInfo, type AutoMode } from "../lib/hardwareConfig";
import { inspectModelMetadata, type ModelMetadata } from "../lib/modelMetadata";
import PersonalityPicker from "./PersonalityPicker";
import { SdModelSelector } from "./models/SdModelSelector";
import { ModelCard } from "./models/ModelCard";

type LlamaLogs = {
    stdout_path: string;
    stderr_path: string;
    stdout: string;
    stderr: string;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

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

    const [expandedPath, setExpandedPath] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, ModelConfig>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [llamaLogs, setLlamaLogs] = useState<LlamaLogs | null>(null);
    const [pickingPersonalityFor, setPickingPersonalityFor] = useState<string | null>(null);
    const [autoDetecting, setAutoDetecting] = useState<string | null>(null);
    const [autoDetectNotes, setAutoDetectNotes] = useState<Record<string, string[]>>({});
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const toggleSection = (key: string) => setOpenSections((p) => ({ ...p, [key]: !p[key] }));

    const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
    const [modelMetadataMap, setModelMetadataMap] = useState<Record<string, ModelMetadata>>({});
    const [sdModelFiles, setSdModelFiles] = useState<string[]>([]);

    const refreshSdModels = useCallback(async () => {
        try {
            const models = await invoke<string[]>("list_sd_models");
            setSdModelFiles(models);
            if (sdModelPath && models.includes(sdModelPath)) return;
            if (models.length === 1) setSdModelPath(models[0]);
            else setSdModelPath(null);
        } catch {
            setSdModelFiles([]);
            setSdModelPath(null);
        }
    }, [sdModelPath, setSdModelPath]);

    const handleRefreshAll = useCallback(async () => {
        await Promise.all([refresh(), refreshSdModels()]);
    }, [refresh, refreshSdModels]);

    const getOrCreateDraft = useCallback(
        (path: string): ModelConfig => drafts[path] ?? getConfigForPath(path),
        [drafts, getConfigForPath],
    );

    const updateDraft = (path: string, updates: Partial<ModelConfig>) =>
        setDrafts((prev) => ({ ...prev, [path]: { ...getOrCreateDraft(path), ...updates } }));

    const clearDraft = (path: string) =>
        setDrafts((prev) => {
            const n = { ...prev };
            delete n[path];
            return n;
        });

    const handleSaveConfig = async (path: string) => {
        await saveConfig({ ...getOrCreateDraft(path), path });
        clearDraft(path);
    };

    const handleSetDefault = async (path: string) => {
        setActionError(null);
        setLlamaLogs(null);
        try {
            await saveConfig({ ...getOrCreateDraft(path), path });
            await setDefault(path);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        }
    };

    const applyConfigToContext = (config: ModelConfig) => {
        setModelPath(config.path);
        setTemperature(config.temperature);
        setContextWindow(config.context_window);
        setEvalBatchSize(config.eval_batch_size);
        setFlashAttention(config.flash_attention);
        setSystemPrompt(config.system_prompt);
        setTurboQuant(config.turbo_quant as TurboQuantType);
        setNGpuLayers(config.n_gpu_layers);
        setThreads(config.threads);
        setReasoningBudget(config.reasoning_budget);
        setSampling(parseSamplingJson(config.sampling_json));
    };

    const handleLoad = async (path: string, systemPromptOverride?: string) => {
        setPickingPersonalityFor(null);
        setActionLoading(path);
        setActionError(null);
        setLlamaLogs(null);
        try {
            let config = getOrCreateDraft(path);
            let metadata = modelMetadataMap[path];
            if (!metadata) {
                try {
                    metadata = await inspectModelMetadata(path);
                    if (metadata) setModelMetadataMap((prev) => ({ ...prev, [path]: metadata }));
                } catch (metaErr) {
                    console.warn("[ModelsPanel] Inspection GGUF échouée:", metaErr);
                }
            }
            if (config.n_gpu_layers === 0 && config.threads <= 0) {
                try {
                    const hw = hardwareInfo ?? (await invoke<HardwareInfo>("get_hardware_info"));
                    const auto = autoConfigureFromHardware(hw, "balanced", metadata);
                    config = { ...config, ...auto };
                    updateDraft(path, auto);
                    setAutoDetectNotes((prev) => ({
                        ...prev,
                        [path]: ["⚡ Auto-détecté au premier lancement", ...auto.notes],
                    }));
                } catch (hwErr) {
                    console.warn("[ModelsPanel] Auto-détection échouée:", hwErr);
                }
            }
            const args = buildLlamaArgs({
                contextWindow: config.context_window,
                evalBatchSize: config.eval_batch_size,
                flashAttention: config.flash_attention,
                turboQuant: config.turbo_quant as TurboQuantType,
                mmprojPath: config.mmproj_path,
                nGpuLayers: config.n_gpu_layers > 0 ? config.n_gpu_layers : undefined,
                threads: config.threads > 0 ? config.threads : undefined,
                reasoningBudget: config.reasoning_budget,
                ...((): DetectedTemplate => {
                    if (config.chat_template === "jinja") return { useJinja: true };
                    if (config.chat_template !== "") return { chatTemplate: config.chat_template };
                    return detectChatTemplate(path, metadata);
                })(),
            });
            await invoke<string>("start_llama", { modelPath: path, params: args });
            setIsModelLoaded(true);
            setLoadedModelPath(path);
            applyConfigToContext(config);
            if (systemPromptOverride !== undefined) setSystemPrompt(systemPromptOverride);
        } catch (e: unknown) {
            setActionError(getErrorMessage(e));
        } finally {
            setActionLoading(null);
        }
    };

    const handleAutoDetect = async (path: string, mode: AutoMode = "balanced") => {
        setAutoDetecting(path);
        setActionError(null);
        setLlamaLogs(null);
        try {
            const hw = hardwareInfo ?? (await invoke<HardwareInfo>("get_hardware_info"));
            let metadata = modelMetadataMap[path];
            if (!metadata) {
                metadata = await inspectModelMetadata(path);
                if (metadata) setModelMetadataMap((prev) => ({ ...prev, [path]: metadata }));
            }
            const cfg = autoConfigureFromHardware(hw, mode, metadata);
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
        setLlamaLogs(null);
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

    useEffect(() => {
        if (!actionError) {
            setLlamaLogs(null);
            return;
        }
        let cancelled = false;
        invoke<LlamaLogs>("get_llama_logs")
            .then((logs) => {
                if (!cancelled) setLlamaLogs(logs);
            })
            .catch(() => {
                if (!cancelled) setLlamaLogs(null);
            });
        return () => {
            cancelled = true;
        };
    }, [actionError]);

    useEffect(() => {
        invoke<HardwareInfo>("get_hardware_info")
            .then((hw) => setHardwareInfo(hw))
            .catch((err) => console.warn("[ModelsPanel] Hardware info fetch failed:", err));
    }, []);

    useEffect(() => {
        refreshSdModels();
    }, [refreshSdModels]);

    useEffect(() => {
        if (!expandedPath || modelMetadataMap[expandedPath]) return;
        let cancelled = false;
        inspectModelMetadata(expandedPath)
            .then((meta) => {
                if (!cancelled) setModelMetadataMap((prev) => ({ ...prev, [expandedPath]: meta }));
            })
            .catch((err) => console.warn("[ModelsPanel] Metadata fetch failed for", expandedPath, err));
        return () => {
            cancelled = true;
        };
    }, [expandedPath, modelMetadataMap]);

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

            <div className="border-b border-white/10 px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Bibliothèque</p>
                        <h2 className="text-2xl font-semibold text-white">Modèles locaux</h2>
                    </div>
                    <button
                        onClick={handleRefreshAll}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                    >
                        🔄 Actualiser
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
                {(listError || actionError) && (
                    <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap">
                        {listError ?? actionError}
                        {!listError && llamaLogs?.stderr && (
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-300">
                                    Logs llama-server
                                </p>
                                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-red-100">
                                    {llamaLogs.stderr}
                                </pre>
                            </div>
                        )}
                    </div>
                )}

                <SdModelSelector
                    sdModelFiles={sdModelFiles}
                    sdModelPath={sdModelPath}
                    setSdModelPath={setSdModelPath}
                    onRefresh={refreshSdModels}
                />

                {modelFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center text-slate-400">
                        <span className="text-5xl">📂</span>
                        <p className="text-lg font-medium text-white">Aucun modèle trouvé</p>
                        <p className="text-sm">
                            Place tes fichiers <code className="rounded bg-white/10 px-2 py-0.5">.gguf</code> dans le
                            dossier <code className="rounded bg-white/10 px-2 py-0.5">models/</code>
                        </p>
                        <button
                            onClick={handleRefreshAll}
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
                                    onExpand={() => setExpandedPath(isExpanded ? null : filePath)}
                                    onUpdate={(updates) => updateDraft(filePath, updates)}
                                    onAutoDetect={(mode) => handleAutoDetect(filePath, mode)}
                                    onPickPersonality={() => setPickingPersonalityFor(filePath)}
                                    onStop={handleStop}
                                    onSetDefault={() => handleSetDefault(filePath)}
                                    onSave={() => handleSaveConfig(filePath)}
                                    onCancel={() => clearDraft(filePath)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
