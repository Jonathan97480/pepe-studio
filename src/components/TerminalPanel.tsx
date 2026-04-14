"use client";

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import React, { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TerminalInfo = {
    id: string;
    name: string;
    cwd: string;
    entry_count: number;
    is_running: boolean;
};

type ActiveXterm = {
    term: Terminal;
    fit: FitAddon;
    ro: ResizeObserver;
    disposeOnData: () => void;
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function TerminalPanel() {
    const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [closing, setClosing] = useState<string | null>(null);

    // Ref miroir de `selected` utilisable dans les closures des event listeners
    const selectedRef = useRef<string | null>(null);
    useEffect(() => {
        selectedRef.current = selected;
    }, [selected]);

    // Buffer de sortie brute par terminal_id (replay lors du changement d'onglet)
    const outputBuffers = useRef<Map<string, string[]>>(new Map());

    // Instance xterm.js active
    const xtermRef = useRef<ActiveXterm | null>(null);
    const xtermContainerRef = useRef<HTMLDivElement>(null);

    // ── Détruire l'instance xterm active ─────────────────────────────────────
    const disposeXterm = useCallback(() => {
        if (xtermRef.current) {
            xtermRef.current.disposeOnData();
            xtermRef.current.ro.disconnect();
            xtermRef.current.term.dispose();
            xtermRef.current = null;
        }
    }, []);

    // ── Initialiser xterm pour un terminal donné ──────────────────────────────
    const initXterm = useCallback(
        async (terminalId: string) => {
            const container = xtermContainerRef.current;
            if (!container) return;

            disposeXterm();

            // Import dynamique — évite les erreurs SSR Next.js
            const [{ Terminal }, { FitAddon }] = await Promise.all([
                import("@xterm/xterm"),
                import("@xterm/addon-fit"),
            ]);

            const term = new Terminal({
                theme: {
                    background: "#0f172a",
                    foreground: "#e2e8f0",
                    cursor: "#f8fafc",
                    selectionBackground: "#1e293b",
                },
                fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.4,
                cursorBlink: true,
                scrollback: 5000,
                convertEol: false,
            });

            const fit = new FitAddon();
            term.loadAddon(fit);

            container.innerHTML = "";
            term.open(container);
            fit.fit();

            // Rejouer le buffer accumulé
            const chunks = outputBuffers.current.get(terminalId) ?? [];
            for (const chunk of chunks) term.write(chunk);

            // Saisie clavier → stdin (l'IA et l'utilisateur partagent le même canal)
            const subscription = term.onData((data: string) => {
                invoke("terminal_send_stdin", { terminalId, input: data }).catch(() => {});
            });

            // Redimensionnement automatique
            const ro = new ResizeObserver(() => {
                try {
                    fit.fit();
                    invoke("terminal_pty_resize", {
                        terminalId,
                        rows: term.rows,
                        cols: term.cols,
                    }).catch(() => {});
                } catch {
                    /* silencieux */
                }
            });
            ro.observe(container);

            xtermRef.current = {
                term,
                fit,
                ro,
                disposeOnData: () => subscription.dispose(),
            };

            term.focus();
        },
        [disposeXterm],
    );

    // ── Polling de la liste des terminaux ─────────────────────────────────────
    const refreshList = useCallback(async () => {
        try {
            const list = await invoke<TerminalInfo[]>("list_terminals");
            // Nettoyer les buffers des terminaux fermés
            const ids = new Set(list.map((t) => t.id));
            for (const k of [...outputBuffers.current.keys()]) {
                if (!ids.has(k)) outputBuffers.current.delete(k);
            }
            setTerminals(list);
            setSelected((prev) => {
                if (prev && !list.find((t) => t.id === prev)) return list[0]?.id ?? null;
                if (!prev && list.length > 0) return list[0].id;
                return prev;
            });
        } catch {
            /* silencieux */
        }
    }, []);

    useEffect(() => {
        refreshList();
        const iv = setInterval(refreshList, 2000);
        return () => clearInterval(iv);
    }, [refreshList]);

    // ── Init/destroy xterm quand l'onglet change ──────────────────────────────
    useEffect(() => {
        if (selected) {
            initXterm(selected);
        } else {
            disposeXterm();
        }
        return () => disposeXterm();
    }, [selected, initXterm, disposeXterm]);

    // ── Écoute des events Tauri ───────────────────────────────────────────────
    useEffect(() => {
        // Pattern "cancelled" : si le cleanup s'exécute AVANT que listen() soit résolu
        // (cas fréquent en React Strict Mode / Next.js dev), on dépublie immédiatement.
        let cancelled = false;
        let unOut: (() => void) | undefined;
        let unDone: (() => void) | undefined;

        const setup = async () => {
            const _unOut = await listen<{ terminal_id: string; text: string }>(
                "terminal-output",
                ({ payload: { terminal_id, text } }) => {
                    // Stocker dans le buffer
                    const buf = outputBuffers.current.get(terminal_id) ?? [];
                    buf.push(text);
                    if (buf.length > 10_000) buf.splice(0, buf.length - 8_000);
                    outputBuffers.current.set(terminal_id, buf);
                    // Écrire dans xterm si c'est le terminal actif
                    if (selectedRef.current === terminal_id && xtermRef.current) {
                        xtermRef.current.term.write(text);
                    }
                },
            );

            const _unDone = await listen<{ terminal_id: string; exit_code: number | null }>(
                "terminal-done",
                async ({ payload: { terminal_id, exit_code } }) => {
                    if (selectedRef.current === terminal_id && xtermRef.current) {
                        xtermRef.current.term.write(
                            `\r\n\x1b[90m[session terminée · code: ${exit_code ?? "?"}]\x1b[0m\r\n`,
                        );
                    }
                    await refreshList();
                },
            );

            if (cancelled) {
                // Cleanup déjà appelé avant la fin de setup() → désinscription immédiate
                _unOut();
                _unDone();
                return;
            }
            unOut = _unOut;
            unDone = _unDone;
        };

        setup();
        return () => {
            cancelled = true;
            unOut?.();
            unDone?.();
        };
    }, [refreshList]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleClose = async (id: string) => {
        setClosing(id);
        try {
            await invoke("close_terminal", { terminalId: id });
            if (selected === id) setSelected(null);
            await refreshList();
        } catch {
            /* silencieux */
        } finally {
            setClosing(null);
        }
    };

    const handleKill = async () => {
        if (!selectedRef.current) return;
        try {
            await invoke("terminal_kill_interactive", { terminalId: selectedRef.current });
        } catch {
            /* silencieux */
        }
    };

    const selectedInfo = terminals.find((t) => t.id === selected);
    const isRunning = selectedInfo?.is_running ?? false;

    // ── Rendu ─────────────────────────────────────────────────────────────────

    return (
        <div className="flex h-full overflow-hidden">
            {/* ── Sidebar : liste des terminaux ─────────────────────────────── */}
            <div className="w-64 shrink-0 border-r border-white/10 flex flex-col gap-2 p-4 overflow-y-auto">
                <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">Terminaux actifs</p>

                {terminals.length === 0 ? (
                    <div className="mt-4 text-sm text-slate-500 leading-relaxed">
                        <p>Aucun terminal ouvert.</p>
                        <p className="mt-2 text-xs">L&apos;IA créera des terminaux automatiquement lors des tâches.</p>
                    </div>
                ) : (
                    terminals.map((t) => (
                        <div
                            key={t.id}
                            onClick={() => setSelected(t.id)}
                            className={`group relative rounded-2xl border p-3 cursor-pointer transition ${
                                selected === t.id
                                    ? "border-blue-500/50 bg-blue-500/10"
                                    : "border-white/10 bg-white/5 hover:bg-white/10"
                            }`}
                        >
                            <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        {t.is_running && (
                                            <span
                                                className="h-2 w-2 rounded-full bg-orange-400 animate-pulse shrink-0"
                                                title="Processus en cours"
                                            />
                                        )}
                                        <p className="text-sm font-medium truncate">{t.name}</p>
                                    </div>
                                    <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{t.cwd}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {t.entry_count} cmd{t.entry_count !== 1 ? "s" : ""}
                                        {t.is_running && <span className="ml-1 text-orange-400">• actif</span>}
                                    </p>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleClose(t.id);
                                    }}
                                    disabled={closing === t.id}
                                    title="Fermer ce terminal"
                                    className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 text-red-400 hover:text-red-300 text-xs transition-opacity disabled:opacity-40"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── Zone principale : xterm.js ────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!selected ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                        <span className="text-3xl">⌨️</span>
                        <p>Sélectionne un terminal pour ouvrir une session.</p>
                    </div>
                ) : (
                    <>
                        {/* Barre d'état */}
                        <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center gap-3">
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    isRunning ? "bg-orange-400 animate-pulse" : "bg-emerald-400"
                                }`}
                            />
                            <span className="text-sm text-slate-300 font-mono truncate">
                                {selectedInfo?.cwd ?? "…"}
                            </span>
                            <span className="ml-auto text-xs text-slate-500 shrink-0">{selectedInfo?.name}</span>
                            {isRunning && (
                                <button
                                    onClick={handleKill}
                                    title="Envoyer Ctrl+C pour arrêter le processus"
                                    className="ml-1 shrink-0 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 transition"
                                >
                                    ⊘ Stopper
                                </button>
                            )}
                        </div>

                        {/* Conteneur xterm.js — reçoit le canvas du terminal */}
                        <div
                            ref={xtermContainerRef}
                            className="flex-1 overflow-hidden bg-[#0f172a] p-1"
                            style={{ minHeight: 0 }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
