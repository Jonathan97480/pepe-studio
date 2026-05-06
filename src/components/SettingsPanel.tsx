"use client";

import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { CONTEXT7_STORAGE_KEY } from "../tools/Context7Client";
import { BRAVE_SEARCH_KEY, SERPER_SEARCH_KEY, TAVILY_SEARCH_KEY, SEARXNG_URL_KEY, searchWeb } from "../tools/SearchWeb";
import { useErrorToast } from "../hooks/useErrorToast";
import { ErrorToast } from "./chat/ErrorToast";
import ApiServerSection from "./settings/ApiServerSection";
import Context7Section from "./settings/Context7Section";
import InferenceModeSection from "./settings/InferenceModeSection";
import ModelSettingsSection from "./settings/ModelSettingsSection";
import WebSearchSection from "./settings/WebSearchSection";

export default function SettingsPanel() {
    const {
        modelPath,
        temperature,
        contextWindow,
        flashAttention,
        systemPrompt,
        turboQuant,
        setModelPath,
        setTemperature,
        setContextWindow,
        setFlashAttention,
        setSystemPrompt,
        setTurboQuant,
    } = useModelSettings();

    const { toasts, showError, dismiss } = useErrorToast();

    const [context7Key, setContext7Key] = useState(() => localStorage.getItem(CONTEXT7_STORAGE_KEY) ?? "");
    const [context7Saved, setContext7Saved] = useState(false);

    const [braveKey, setBraveKey] = useState(() => localStorage.getItem(BRAVE_SEARCH_KEY) ?? "");
    const [serperKey, setSerperKey] = useState(() => localStorage.getItem(SERPER_SEARCH_KEY) ?? "");
    const [tavilyKey, setTavilyKey] = useState(() => localStorage.getItem(TAVILY_SEARCH_KEY) ?? "");
    const [searxngUrl, setSearxngUrl] = useState(() => localStorage.getItem(SEARXNG_URL_KEY) ?? "");
    const [searchSaved, setSearchSaved] = useState(false);
    const [searchTesting, setSearchTesting] = useState(false);
    const [searchTestResult, setSearchTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const [turboQuantEnabled, setTurboQuantEnabled] = useState(() => {
        return localStorage.getItem("llama_turboquant_enabled") === "true";
    });

    // ── État serveur API ──────────────────────────────────────────────────────
    const [apiPort, setApiPort] = useState<number>(() => {
        const saved = localStorage.getItem("api_server_port");
        return saved ? Number(saved) : 8766;
    });
    const [apiRunning, setApiRunning] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    useEffect(() => {
        invoke<{ running: boolean; port: number }>("get_api_server_info")
            .then((info) => {
                setApiRunning(info.running);
                if (info.running) setApiPort(info.port);
            })
            .catch(() => {});
    }, []);

    const toggleApiServer = async () => {
        setApiError(null);
        if (apiRunning) {
            await invoke("stop_api_server").catch((e) =>
                showError(`Impossible d'arrêter le serveur API : ${(e as Error)?.message ?? String(e)}`),
            );
            setApiRunning(false);
        } else {
            try {
                await invoke("start_api_server", { port: apiPort });
                localStorage.setItem("api_server_port", String(apiPort));
                setApiRunning(true);
            } catch (e) {
                setApiError(String(e));
            }
        }
    };

    const saveSearchKeys = () => {
        localStorage.setItem(BRAVE_SEARCH_KEY, braveKey.trim());
        localStorage.setItem(SERPER_SEARCH_KEY, serperKey.trim());
        localStorage.setItem(TAVILY_SEARCH_KEY, tavilyKey.trim());
        localStorage.setItem(SEARXNG_URL_KEY, searxngUrl.trim());
        setSearchSaved(true);
        setTimeout(() => setSearchSaved(false), 2000);
    };

    const testWebSearch = async () => {
        setSearchTesting(true);
        setSearchTestResult(null);
        try {
            const results = await searchWeb({
                query: "test",
                source: "duckduckgo",
                apiKey: undefined,
                searxngUrl: undefined,
            });
            if (results.length > 0) {
                setSearchTestResult({
                    success: true,
                    message: `✓ Succès ! ${results.length} résultats trouvés.`,
                });
            } else {
                setSearchTestResult({
                    success: false,
                    message: "Aucun résultat trouvé.",
                });
            }
        } catch (error) {
            setSearchTestResult({
                success: false,
                message: `Erreur : ${(error as Error)?.message ?? String(error)}`,
            });
        } finally {
            setSearchTesting(false);
        }
    };

    const toggleTurboQuant = () => {
        const newValue = !turboQuantEnabled;
        setTurboQuantEnabled(newValue);
        localStorage.setItem("llama_turboquant_enabled", String(newValue));
        if (newValue) {
            showError("TurboQuant activé — redémarrez llama.cpp pour appliquer les modifications");
        }
    };

    const saveContext7Key = () => {
        localStorage.setItem(CONTEXT7_STORAGE_KEY, context7Key.trim());
        setContext7Saved(true);
        setTimeout(() => setContext7Saved(false), 2000);
    };

    return (
        <div className="flex flex-col gap-6 px-6 pt-6 pb-12 text-white">
            <ModelSettingsSection
                modelPath={modelPath}
                setModelPath={setModelPath}
                temperature={temperature}
                setTemperature={setTemperature}
                contextWindow={contextWindow}
                setContextWindow={setContextWindow}
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
                turboQuant={turboQuant}
                setTurboQuant={setTurboQuant}
                flashAttention={flashAttention}
                setFlashAttention={setFlashAttention}
            />

            <Context7Section
                context7Key={context7Key}
                setContext7Key={setContext7Key}
                context7Saved={context7Saved}
                onSave={saveContext7Key}
            />

            <WebSearchSection
                braveKey={braveKey}
                setBraveKey={setBraveKey}
                serperKey={serperKey}
                setSerperKey={setSerperKey}
                tavilyKey={tavilyKey}
                setTavilyKey={setTavilyKey}
                searxngUrl={searxngUrl}
                setSearxngUrl={setSearxngUrl}
                searchSaved={searchSaved}
                searchTesting={searchTesting}
                searchTestResult={searchTestResult}
                onSave={saveSearchKeys}
                onTest={testWebSearch}
            />

            <InferenceModeSection turboQuantEnabled={turboQuantEnabled} onToggle={toggleTurboQuant} />

            <ApiServerSection
                apiPort={apiPort}
                setApiPort={setApiPort}
                apiRunning={apiRunning}
                apiError={apiError}
                onToggleServer={toggleApiServer}
            />
            <ErrorToast toasts={toasts} onDismiss={dismiss} />
        </div>
    );
}

