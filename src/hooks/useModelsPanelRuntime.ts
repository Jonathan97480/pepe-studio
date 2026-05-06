import { invoke } from "@tauri-apps/api/tauri";
import { useCallback, useEffect, useState } from "react";
import type { SamplingSettings, TurboQuantType } from "@/context/ModelSettingsContext";
import { autoConfigureFromHardware, type AutoMode, type HardwareInfo } from "@/lib/hardwareConfig";
import { buildLlamaArgs, detectChatTemplate, type DetectedTemplate } from "@/lib/llamaWrapper";
import { inspectModelMetadata, type ModelMetadata } from "@/lib/modelMetadata";
import type { ModelConfig } from "./useModels";
import { parseSamplingJson } from "./useModels";

type LlamaLogs = {
    stdout_path: string;
    stderr_path: string;
    stdout: string;
    stderr: string;
};

type RuntimeDeps = {
    sdModelPath: string | null;
    setSdModelPath: (value: string | null) => void;
    refresh: () => Promise<void>;
    getConfigForPath: (path: string) => ModelConfig;
    saveConfig: (config: ModelConfig) => Promise<void>;
    setDefault: (path: string) => Promise<void>;
    setIsModelLoaded: (value: boolean) => void;
    setLoadedModelPath: (value: string | null) => void;
    setModelPath: (value: string) => void;
    setTemperature: (value: number) => void;
    setContextWindow: (value: number) => void;
    setEvalBatchSize: (value: number) => void;
    setFlashAttention: (value: boolean) => void;
    setSystemPrompt: (value: string) => void;
    setTurboQuant: (value: TurboQuantType) => void;
    setNGpuLayers: (value: number) => void;
    setThreads: (value: number) => void;
    setReasoningBudget: (value: number) => void;
    setSampling: (value: SamplingSettings | ((prev: SamplingSettings) => SamplingSettings)) => void;
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useModelsPanelRuntime({
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
}: RuntimeDeps) {
    const [expandedPath, setExpandedPath] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, ModelConfig>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [llamaLogs, setLlamaLogs] = useState<LlamaLogs | null>(null);
    const [pickingPersonalityFor, setPickingPersonalityFor] = useState<string | null>(null);
    const [autoDetecting, setAutoDetecting] = useState<string | null>(null);
    const [autoDetectNotes, setAutoDetectNotes] = useState<Record<string, string[]>>({});
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
    const [modelMetadataMap, setModelMetadataMap] = useState<Record<string, ModelMetadata>>({});
    const [sdModelFiles, setSdModelFiles] = useState<string[]>([]);

    const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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
            const next = { ...prev };
            delete next[path];
            return next;
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
        } catch (error) {
            setActionError(getErrorMessage(error));
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
                } catch (metaError) {
                    console.warn("[ModelsPanel] Inspection GGUF échouée:", metaError);
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
                } catch (hwError) {
                    console.warn("[ModelsPanel] Auto-détection échouée:", hwError);
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
                noMmap: config.no_mmap || false,
                mlock: config.mlock || false,
                nCpuMoe: config.n_cpu_moe > 0 ? config.n_cpu_moe : undefined,
                reasoningBudget: config.reasoning_budget,
                ...((): DetectedTemplate => {
                    if (config.chat_template === "jinja") return { useJinja: true };
                    if (config.chat_template !== "") return { chatTemplate: config.chat_template };
                    return detectChatTemplate(path, metadata);
                })(),
            });

            const useTurboquantBinary = localStorage.getItem("llama_turboquant_enabled") === "true";
            await invoke<string>("start_llama", { modelPath: path, params: args, useTurboquantBinary });
            setIsModelLoaded(true);
            setLoadedModelPath(path);
            applyConfigToContext(config);
            if (systemPromptOverride !== undefined) setSystemPrompt(systemPromptOverride);
        } catch (error) {
            setActionError(getErrorMessage(error));
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
        } catch (error) {
            setActionError(`Détection matériel échouée : ${getErrorMessage(error)}`);
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
        } catch (error) {
            setActionError(getErrorMessage(error));
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
            .catch((error) => console.warn("[ModelsPanel] Hardware info fetch failed:", error));
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
            .catch((error) => console.warn("[ModelsPanel] Metadata fetch failed for", expandedPath, error));
        return () => {
            cancelled = true;
        };
    }, [expandedPath, modelMetadataMap]);

    return {
        expandedPath,
        setExpandedPath,
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
    };
}
