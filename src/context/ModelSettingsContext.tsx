"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type TurboQuantType = "none" | "q8_0" | "q4_0" | "q4_1" | "q5_0" | "q5_1";

export type SamplingSettings = {
    topP: number;
    topK: number;
    penaltyLastN: number;
    repeatPenalty: number;
    frequencyPenalty: number;
    presencePenalty: number;
    mirostat: 0 | 1 | 2;
    mirostatTau: number;
    mirostatEta: number;
    minP: number;
    typicalP: number;
    dynaTempRange: number;
    dynaTempExponent: number;
    xtcProbability: number;
    xtcThreshold: number;
    topNSigma: number;
    dryMultiplier: number;
    dryBase: number;
    dryAllowedLength: number;
    dryPenaltyLastN: number;
    drySequenceBreakers: string;
};

export type ModelSettings = {
    modelPath: string;
    temperature: number;
    contextWindow: number;
    systemPrompt: string;
    turboQuant: TurboQuantType;
    nGpuLayers: number;
    threads: number;
    sampling: SamplingSettings;
    thinkingEnabled: boolean;
};

export type ModelSettingsContextValue = ModelSettings & {
    setModelPath: (value: string) => void;
    setTemperature: (value: number) => void;
    setContextWindow: (value: number) => void;
    setSystemPrompt: (value: string) => void;
    setTurboQuant: (value: TurboQuantType) => void;
    setNGpuLayers: (value: number) => void;
    setThreads: (value: number) => void;
    setSampling: (value: SamplingSettings | ((prev: SamplingSettings) => SamplingSettings)) => void;
    setThinkingEnabled: (value: boolean) => void;
    // État de chargement (partagé entre ChatWindow et ModelsPanel)
    isModelLoaded: boolean;
    setIsModelLoaded: (value: boolean) => void;
    loadedModelPath: string | null;
    setLoadedModelPath: (value: string | null) => void;
};

const defaultSampling: SamplingSettings = {
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
    drySequenceBreakers: '"\n", ":", "\\"", "*"',
};

const defaultSettings: ModelSettings = {
    modelPath: "./models/gemma-4-E4B-it-Q4_K_M.gguf",
    temperature: 0.8,
    contextWindow: 4096,
    systemPrompt: "Tu es un assistant utile et précis.",
    turboQuant: "q4_1",
    nGpuLayers: 0,
    threads: -1,
    sampling: defaultSampling,
    thinkingEnabled: true,
};

const ModelSettingsContext = createContext<ModelSettingsContextValue | null>(null);

export function ModelSettingsProvider({ children }: { children: ReactNode }) {
    const [modelPath, setModelPath] = useState(defaultSettings.modelPath);
    const [temperature, setTemperature] = useState(defaultSettings.temperature);
    const [contextWindow, setContextWindow] = useState(defaultSettings.contextWindow);
    const [systemPrompt, setSystemPrompt] = useState(defaultSettings.systemPrompt);
    const [turboQuant, setTurboQuant] = useState<TurboQuantType>(defaultSettings.turboQuant);
    const [nGpuLayers, setNGpuLayers] = useState(defaultSettings.nGpuLayers);
    const [threads, setThreads] = useState(defaultSettings.threads);
    const [sampling, setSampling] = useState<SamplingSettings>(defaultSettings.sampling);
    const [thinkingEnabled, setThinkingEnabled] = useState(defaultSettings.thinkingEnabled);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [loadedModelPath, setLoadedModelPath] = useState<string | null>(null);

    const value = useMemo(
        () => ({
            modelPath,
            temperature,
            contextWindow,
            systemPrompt,
            turboQuant,
            nGpuLayers,
            threads,
            sampling,
            thinkingEnabled,
            setModelPath,
            setTemperature,
            setContextWindow,
            setSystemPrompt,
            setTurboQuant,
            setNGpuLayers,
            setThreads,
            setSampling,
            setThinkingEnabled,
            isModelLoaded,
            setIsModelLoaded,
            loadedModelPath,
            setLoadedModelPath,
        }),
        [modelPath, temperature, contextWindow, systemPrompt, turboQuant, nGpuLayers, threads, sampling, thinkingEnabled, isModelLoaded, loadedModelPath]
    );

    return <ModelSettingsContext.Provider value={value}>{children}</ModelSettingsContext.Provider>;
}

export function useModelSettings() {
    const context = useContext(ModelSettingsContext);
    if (!context) {
        throw new Error("useModelSettings must be used within a ModelSettingsProvider");
    }
    return context;
}
