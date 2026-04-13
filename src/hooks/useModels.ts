"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { SamplingSettings } from "../context/ModelSettingsContext";

export type ModelConfig = {
    path: string;
    name: string;
    temperature: number;
    context_window: number;
    system_prompt: string;
    turbo_quant: string;
    mmproj_path: string;
    n_gpu_layers: number;
    threads: number;
    is_default: boolean;
    /** JSON-encoded SamplingSettings (persisted in SQLite) */
    sampling_json: string;
    /** Chat template override ("" = auto-détection, "jinja" = --jinja, ou nom du template) */
    chat_template: string;
};

export const DEFAULT_SAMPLING: SamplingSettings = {
    topP: 0.95,
    topK: 40,
    penaltyLastN: 64,
    repeatPenalty: 1.0,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    mirostat: 0,
    mirostatTau: 5.0,
    mirostatEta: 0.1,
    minP: 0.05,
    typicalP: 1.0,
    dynaTempRange: 0.0,
    dynaTempExponent: 1.0,
    xtcProbability: 0.0,
    xtcThreshold: 0.1,
    topNSigma: -1,
    dryMultiplier: 0.0,
    dryBase: 1.75,
    dryAllowedLength: 2,
    dryPenaltyLastN: -1,
    drySequenceBreakers: '"\\n", ":", "\\""',
};

/** Parse sampling_json string to SamplingSettings, falling back to defaults */
export function parseSamplingJson(json: string): SamplingSettings {
    if (!json) return { ...DEFAULT_SAMPLING };
    try {
        return { ...DEFAULT_SAMPLING, ...JSON.parse(json) };
    } catch {
        return { ...DEFAULT_SAMPLING };
    }
}

const DEFAULT_CONFIG: Omit<ModelConfig, "path" | "name" | "is_default"> = {
    temperature: 0.9,
    context_window: 4096,
    system_prompt: "Tu es un assistant utile et pr\u00e9cis.",
    turbo_quant: "q8_0",
    mmproj_path: "",
    n_gpu_layers: 0,
    threads: -1,
    sampling_json: "",
    chat_template: "",
};

export function useModels() {
    const [modelFiles, setModelFiles] = useState<string[]>([]);
    const [mmprojFiles, setMmprojFiles] = useState<string[]>([]);
    const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (typeof window === "undefined") return;
        setLoading(true);
        setError(null);
        try {
            const [files, mmprojs, configs] = await Promise.all([
                invoke<string[]>("list_model_files"),
                invoke<string[]>("list_mmproj_files"),
                invoke<ModelConfig[]>("get_all_model_configs"),
            ]);
            setModelFiles(files);
            setMmprojFiles(mmprojs);
            setModelConfigs(configs);
        } catch (e: any) {
            console.error("[useModels] refresh failed", e);
            setError(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    }, []);

    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        refresh();
    }, [refresh]);

    /** Retourne la config sauvegardée ou une config par défaut, avec auto-détection mmproj */
    const getConfigForPath = useCallback(
        (path: string): ModelConfig => {
            const existing = modelConfigs.find((c) => c.path === path);
            if (existing) return existing;
            const name = path.split(/[/\\]/).pop() ?? path;
            // Auto-détection : chercher un mmproj dont le nom commence par le même préfixe
            const baseName = name.replace(/\.gguf$/i, "").toLowerCase();
            const autoMmproj = mmprojFiles.find((mp) => {
                const mpName = mp.split(/[/\\]/).pop()?.toLowerCase() ?? "";
                // Heuristique : le mmproj partage le début du nom du modèle avant -Q4 / -it etc.
                const modelPrefix = baseName.split(/[-_](q[0-9]|it|instruct|chat|mmproj)/i)[0];
                return mpName.startsWith(modelPrefix);
            }) ?? (mmprojFiles.length === 1 ? mmprojFiles[0] : "");
            return { path, name, ...DEFAULT_CONFIG, mmproj_path: autoMmproj, is_default: false };
        },
        [modelConfigs, mmprojFiles]
    );

    const saveConfig = useCallback(
        async (config: ModelConfig) => {
            await invoke("save_model_config", { config });
            await refresh();
        },
        [refresh]
    );

    const setDefault = useCallback(
        async (path: string) => {
            // S'assurer que la config existe avant de la définir par défaut
            const existing = modelConfigs.find((c) => c.path === path);
            if (!existing) {
                const name = path.split(/[/\\]/).pop() ?? path;
                await invoke("save_model_config", {
                    config: { path, name, ...DEFAULT_CONFIG, is_default: false },
                });
            }
            await invoke("set_default_model", { path });
            await refresh();
        },
        [modelConfigs, refresh]
    );

    const getDefault = useCallback(async (): Promise<ModelConfig | null> => {
        return invoke<ModelConfig | null>("get_default_model");
    }, []);

    const deleteConfig = useCallback(
        async (path: string) => {
            await invoke("delete_model_config", { path });
            await refresh();
        },
        [refresh]
    );

    return {
        modelFiles,
        mmprojFiles,
        modelConfigs,
        loading,
        error,
        refresh,
        getConfigForPath,
        saveConfig,
        setDefault,
        getDefault,
        deleteConfig,
    };
}
