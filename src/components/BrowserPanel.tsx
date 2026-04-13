"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open } from "@tauri-apps/api/dialog";

interface BrowserError {
    message: string;
    timestamp: string;
}

interface BrowserPanelProps {
    initialUrl?: string;
    navKey?: number;
}

export default function BrowserPanel({ initialUrl = "", navKey = 0 }: BrowserPanelProps) {
    const [url, setUrl] = useState(initialUrl);
    const [inputUrl, setInputUrl] = useState(initialUrl);
    const [iframeKey, setIframeKey] = useState(0);
    const [serverPort, setServerPort] = useState<number | null>(null);
    const [serverBaseDir, setServerBaseDir] = useState<string>("");
    const [serverRunning, setServerRunning] = useState(false);
    const [errors, setErrors] = useState<BrowserError[]>([]);
    const [showErrors, setShowErrors] = useState(true);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Ouvre un dossier pour le serveur dev ──────────────────────────────────
    const handleOpenFolder = async () => {
        try {
            const selected = await open({ directory: true, multiple: false, title: "Choisir le dossier à servir" });
            if (typeof selected === "string") {
                setServerBaseDir(selected);
                await startServer(selected);
            }
        } catch (e) {
            console.error("[BrowserPanel] Erreur dialog:", e);
        }
    };

    const startServer = async (dir: string) => {
        try {
            const port = await invoke<number>("start_dev_server", { baseDir: dir, port: 7820 });
            setServerPort(port);
            setServerRunning(true);
            const newUrl = `http://127.0.0.1:${port}/`;
            setUrl(newUrl);
            setInputUrl(newUrl);
            setIframeKey((k) => k + 1);
        } catch (e) {
            console.error("[BrowserPanel] Impossible de démarrer le serveur:", e);
        }
    };

    const handleStopServer = async () => {
        try {
            await invoke("stop_dev_server");
            setServerRunning(false);
            setUrl("");
            setInputUrl("");
        } catch (e) {
            console.error("[BrowserPanel] Erreur arrêt serveur:", e);
        }
    };

    // ── Navigation ────────────────────────────────────────────────────────────
    const navigate = (target: string) => {
        let normalized = target.trim();
        if (!normalized) return;
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
            // URL relative → pointer vers le serveur local si actif
            if (serverRunning && serverPort) {
                normalized = `http://127.0.0.1:${serverPort}/${normalized.replace(/^\//, "")}`;
            } else {
                normalized = "https://" + normalized;
            }
        }
        setUrl(normalized);
        setInputUrl(normalized);
        setIframeKey((k) => k + 1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") navigate(inputUrl);
    };

    const handleRefresh = () => {
        setIframeKey((k) => k + 1);
    };

    // ── Polling des erreurs ───────────────────────────────────────────────────
    const fetchErrors = useCallback(async () => {
        try {
            const raw = await invoke<string[]>("get_browser_errors");
            if (raw.length > 0) {
                const now = new Date().toLocaleTimeString("fr-FR");
                setErrors((prev) => [
                    ...prev,
                    ...raw.map((message) => ({ message, timestamp: now })),
                ]);
            }
        } catch {
            // silencieux si le serveur n'est pas démarré
        }
    }, []);

    useEffect(() => {
        if (serverRunning) {
            pollRef.current = setInterval(fetchErrors, 2000);
        } else {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [serverRunning, fetchErrors]);

    // ── Mise à jour si initialUrl ou navKey change (depuis ChatWindow) ──────────────────
    // navKey incrémenté à chaque appel openBrowserUrl → force reload même si l'URL est identique.
    const prevInitialUrlRef = useRef<string>("");
    const prevNavKeyRef = useRef<number>(0);
    useEffect(() => {
        const urlChanged = initialUrl && initialUrl !== prevInitialUrlRef.current;
        const keyChanged = navKey !== prevNavKeyRef.current;
        if (initialUrl && (urlChanged || keyChanged)) {
            prevInitialUrlRef.current = initialUrl;
            prevNavKeyRef.current = navKey;
            // setState guard par ref — anti-pattern contrôlé intentionnel
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setUrl(initialUrl);
            setInputUrl(initialUrl);
            setIframeKey((k) => k + 1);

            // Si l'URL pointe vers le serveur local (start_dev_server lancé depuis ChatWindow),
            // synchroniser l'état serverRunning pour activer le polling d'erreurs.
            const localMatch = initialUrl.match(/^http:\/\/127\.0\.0\.1:(\d+)\//);
            if (localMatch) {
                const p = parseInt(localMatch[1], 10);
                setServerPort(p);
                setServerRunning(true);
                // Récupérer le base_dir actuel depuis le serveur pour l'afficher
                invoke<Record<string, string>>("get_dev_server_info")
                    .then((info) => { if (info.base_dir) setServerBaseDir(info.base_dir); })
                    .catch(() => {});
            }
        }
    }, [initialUrl, navKey]);

    const clearErrors = () => setErrors([]);

    return (
        <div className="flex h-full flex-col overflow-hidden bg-[#0f1115] text-white">
            {/* Barre d'outils */}
            <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
                {/* Ligne 1 : serveur dev */}
                <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-widest text-slate-400">Serveur dev</span>
                    {serverRunning ? (
                        <>
                            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">
                                ● Port {serverPort}
                            </span>
                            <span className="max-w-[240px] truncate text-xs text-slate-400" title={serverBaseDir}>
                                {serverBaseDir}
                            </span>
                            <button
                                onClick={handleStopServer}
                                className="ml-auto rounded px-3 py-1 text-xs bg-red-900/40 hover:bg-red-800/60 border border-red-700/30 transition-colors"
                            >
                                Arrêter
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleOpenFolder}
                            className="rounded px-3 py-1 text-xs bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/30 transition-colors"
                        >
                            📂 Ouvrir dossier…
                        </button>
                    )}
                </div>

                {/* Ligne 2 : barre d'adresse */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleRefresh}
                        className="shrink-0 rounded px-2 py-1 text-sm hover:bg-white/10 transition-colors"
                        title="Actualiser"
                    >
                        ↻
                    </button>
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="http://127.0.0.1:7820/"
                        className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500/60 focus:outline-none"
                    />
                    <button
                        onClick={() => navigate(inputUrl)}
                        className="shrink-0 rounded px-3 py-1.5 text-sm bg-blue-800/40 hover:bg-blue-700/60 border border-blue-600/30 transition-colors"
                    >
                        Go
                    </button>
                </div>
            </div>

            {/* Zone principale : iframe + console */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Iframe */}
                <div className="flex-1 overflow-hidden bg-white">
                    {url ? (
                        <iframe
                            key={iframeKey}
                            ref={iframeRef}
                            src={url}
                            className="h-full w-full border-0"
                            title="Navigateur intégré"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center bg-[#0f1115]">
                            <div className="text-center text-slate-400">
                                <div className="mb-3 text-5xl">🌐</div>
                                <p className="text-sm">Ouvrez un dossier ou saisissez une URL pour commencer</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Console d'erreurs */}
                <div
                    className="shrink-0 border-t border-white/10 bg-slate-950"
                    style={{ maxHeight: showErrors ? "220px" : "36px", transition: "max-height 0.2s" }}
                >
                    {/* En-tête console */}
                    <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1.5">
                        <button
                            onClick={() => setShowErrors((v) => !v)}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            {showErrors ? "▼" : "▶"} Console
                            {errors.length > 0 && (
                                <span className="ml-2 rounded bg-red-700/50 px-1.5 py-0.5 text-xs text-red-300">
                                    {errors.length}
                                </span>
                            )}
                        </button>
                        {errors.length > 0 && (
                            <button
                                onClick={clearErrors}
                                className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                Effacer
                            </button>
                        )}
                    </div>

                    {/* Liste des erreurs */}
                    {showErrors && (
                        <div className="h-[180px] overflow-y-auto p-2 font-mono text-xs">
                            {errors.length === 0 ? (
                                <p className="text-slate-500 italic">Aucune erreur capturée.</p>
                            ) : (
                                [...errors].reverse().map((err, i) => (
                                    <div
                                        key={i}
                                        className={`mb-1 flex gap-2 rounded p-1 ${
                                            err.message.startsWith("[console.warn")
                                                ? "bg-yellow-900/20 text-yellow-300"
                                                : "bg-red-900/20 text-red-300"
                                        }`}
                                    >
                                        <span className="shrink-0 text-slate-500">{err.timestamp}</span>
                                        <span className="break-all">{err.message}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
