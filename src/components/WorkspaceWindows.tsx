"use client";

import BrowserPanel from "./BrowserPanel";
import FloatingWindow from "./FloatingWindow";
import TerminalPanel from "./TerminalPanel";

interface WorkspaceWindowsProps {
    browserOpen: boolean;
    onToggleBrowser: () => void;
    onCloseBrowser: () => void;
    browserUrl: string;
    browserNavKey: number;
    terminalOpen: boolean;
    onToggleTerminal: () => void;
    onCloseTerminal: () => void;
}

export default function WorkspaceWindows({
    browserOpen,
    onToggleBrowser,
    onCloseBrowser,
    browserUrl,
    browserNavKey,
    terminalOpen,
    onToggleTerminal,
    onCloseTerminal,
}: WorkspaceWindowsProps) {
    return (
        <>
            <FloatingWindow
                title="Navigateur"
                icon="🌐"
                open={browserOpen}
                onClose={onCloseBrowser}
                defaultWidth={960}
                defaultHeight={620}
            >
                <BrowserPanel initialUrl={browserUrl} navKey={browserNavKey} />
            </FloatingWindow>

            <FloatingWindow
                title="Terminaux"
                icon="⌨️"
                open={terminalOpen}
                onClose={onCloseTerminal}
                defaultWidth={820}
                defaultHeight={500}
                defaultX={40}
            >
                <TerminalPanel />
            </FloatingWindow>

            <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
                <button
                    onClick={onToggleTerminal}
                    title="Ouvrir / fermer les terminaux"
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-xl transition ${
                        terminalOpen
                            ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                            : "border-white/10 bg-slate-950/80 text-slate-400 hover:border-emerald-400/30 hover:text-emerald-300"
                    }`}
                >
                    ⌨️ Terminaux
                </button>
                <button
                    onClick={onToggleBrowser}
                    title="Ouvrir / fermer le navigateur"
                    className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-xl transition ${
                        browserOpen
                            ? "border-blue-400/50 bg-blue-500/20 text-blue-300"
                            : "border-white/10 bg-slate-950/80 text-slate-400 hover:border-blue-400/30 hover:text-blue-300"
                    }`}
                >
                    🌐 Navigateur
                </button>
            </div>
        </>
    );
}
