import React from "react";

type TerminalListItem = {
    id: string;
    name: string;
    cwd: string;
    entry_count: number;
    is_running: boolean;
};

type TerminalListSidebarProps = {
    terminals: TerminalListItem[];
    selected: string | null;
    closing: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
};

export default function TerminalListSidebar({
    terminals,
    selected,
    closing,
    onSelect,
    onClose,
}: TerminalListSidebarProps) {
    return (
        <div className="w-64 shrink-0 border-r border-white/10 flex flex-col gap-2 p-4 overflow-y-auto">
            <p className="text-xs uppercase tracking-widest text-slate-400 mb-1">Terminaux actifs</p>

            {terminals.length === 0 ? (
                <div className="mt-4 text-sm text-slate-500 leading-relaxed">
                    <p>Aucun terminal ouvert.</p>
                    <p className="mt-2 text-xs">L&apos;IA créera des terminaux automatiquement lors des tâches.</p>
                </div>
            ) : (
                terminals.map((terminal) => (
                    <div
                        key={terminal.id}
                        onClick={() => onSelect(terminal.id)}
                        className={`group relative rounded-2xl border p-3 cursor-pointer transition ${
                            selected === terminal.id
                                ? "border-blue-500/50 bg-blue-500/10"
                                : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    {terminal.is_running && (
                                        <span
                                            className="h-2 w-2 rounded-full bg-orange-400 animate-pulse shrink-0"
                                            title="Processus en cours"
                                        />
                                    )}
                                    <p className="text-sm font-medium truncate">{terminal.name}</p>
                                </div>
                                <p className="text-xs text-slate-400 font-mono truncate mt-0.5">{terminal.cwd}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {terminal.entry_count} cmd{terminal.entry_count !== 1 ? "s" : ""}
                                    {terminal.is_running && <span className="ml-1 text-orange-400">• actif</span>}
                                </p>
                            </div>
                            <button
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onClose(terminal.id);
                                }}
                                disabled={closing === terminal.id}
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
    );
}
