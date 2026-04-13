"use client";

import { invoke } from "@tauri-apps/api/tauri";
import React, { useCallback, useEffect, useRef, useState } from "react";

type TerminalInfo = {
  id: string;
  name: string;
  cwd: string;
  entry_count: number;
};

type TerminalEntry = {
  command: string;
  output: string;
  timestamp: string;
};

export default function TerminalPanel() {
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [closing, setClosing] = useState<string | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // ── Polling des terminaux ──────────────────────────────────────────────────

  const refreshList = useCallback(async () => {
    try {
      const list = await invoke<TerminalInfo[]>("list_terminals");
      setTerminals(list);
      // Si le terminal sélectionné n'existe plus, basculer sur le premier
      setSelected((prev) => {
        if (prev && !list.find((t) => t.id === prev)) {
          return list[0]?.id ?? null;
        }
        if (!prev && list.length > 0) return list[0].id;
        return prev;
      });
    } catch {
      /* silencieux */
    }
  }, []);

  const loadHistory = useCallback(async (id: string) => {
    try {
      const entries = await invoke<TerminalEntry[]>("get_terminal_history", {
        terminalId: id,
      });
      setHistory(entries);
    } catch {
      /* silencieux */
    }
  }, []);

  // Poll liste toutes les 2 s
  useEffect(() => {
    refreshList();
    const iv = setInterval(refreshList, 2000);
    return () => clearInterval(iv);
  }, [refreshList]);

  // Poll historique du terminal sélectionné toutes les 1 s
  useEffect(() => {
    if (!selected) return;
    loadHistory(selected);
    const iv = setInterval(() => loadHistory(selected), 1000);
    return () => clearInterval(iv);
  }, [selected, loadHistory]);

  // Auto-scroll vers le bas quand l'historique change
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // ── Fermeture d'un terminal ────────────────────────────────────────────────

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

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const selectedInfo = terminals.find((t) => t.id === selected);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar : liste des terminaux ─────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-white/10 flex flex-col gap-2 p-4 overflow-y-auto">
        <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">
          Terminaux actifs
        </p>

        {terminals.length === 0 ? (
          <div className="mt-4 text-sm text-slate-500 leading-relaxed">
            <p>Aucun terminal ouvert.</p>
            <p className="mt-2 text-xs">
              L&apos;IA créera des terminaux automatiquement lors des tâches
              multi-commandes.
            </p>
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
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                    {t.cwd}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t.entry_count} cmd{t.entry_count !== 1 ? "s" : ""}
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

      {/* ── Zone principale : historique ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
            <span className="text-3xl">⌨️</span>
            <p>Sélectionne un terminal pour voir son historique.</p>
          </div>
        ) : (
          <>
            {/* Barre d'état du terminal sélectionné */}
            <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-slate-300 font-mono truncate">
                {selectedInfo?.cwd ?? "…"}
              </span>
              <span className="ml-auto text-xs text-slate-500 shrink-0">
                {selectedInfo?.name}
              </span>
            </div>

            {/* Historique des commandes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
              {history.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  Aucune commande exécutée dans ce terminal.
                </p>
              ) : (
                history.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-white/5 bg-slate-900/60 overflow-hidden"
                  >
                    {/* En-tête : commande + horodatage */}
                    <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2 bg-slate-800/50">
                      <span className="text-emerald-400 shrink-0">❯</span>
                      <span className="flex-1 text-white/90 break-all">
                        {entry.command}
                      </span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {entry.timestamp}
                      </span>
                    </div>
                    {/* Sortie */}
                    <pre className="px-4 py-3 text-slate-300 whitespace-pre-wrap break-all text-xs leading-relaxed">
                      {entry.output}
                    </pre>
                  </div>
                ))
              )}
              <div ref={historyEndRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
