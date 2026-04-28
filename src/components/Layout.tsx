"use client";

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import ModelsPanel from "./ModelsPanel";
import SettingsPanel from "./SettingsPanel";
import SkillsPanel from "./SkillsPanel";
import { useModelSettings } from "../context/ModelSettingsContext";
import { SkillsProvider } from "../context/SkillsContext";
import McpPanel from "./McpPanel";
import WorkspaceWindows from "./WorkspaceWindows";

const navItems = [
    { label: "Chat", icon: "💬" },
    { label: "Modèles", icon: "📚" },
    { label: "Skills", icon: "🧩" },
    { label: "MCP", icon: "🔌" },
    { label: "Paramètres", icon: "⚙️" },
];

export default function Layout() {
    const [activeTab, setActiveTab] = useState(navItems[0].label);
    const { isModelLoaded, loadedModelPath } = useModelSettings();
    // On stocke {url, nav: compteur} pour forcer le refresh même si l'URL est identique
    const [browserNav, setBrowserNav] = useState<{ url: string; nav: number }>({ url: "", nav: 0 });
    const [browserOpen, setBrowserOpen] = useState(false);
    const [terminalOpen, setTerminalOpen] = useState(false);

    /** Appelée par ChatWindow pour ouvrir une URL dans le navigateur flottant */
    const openBrowserUrl = (newUrl: string) => {
        setBrowserNav((prev) => ({ url: newUrl, nav: prev.nav + 1 }));
        setBrowserOpen(true);
    };

    /** Appelée par ChatWindow quand l'IA utilise un terminal */
    const openTerminal = () => {
        setTerminalOpen(true);
    };

    // ── Gestion multi-conversations ──────────────────────────────────────────
    // convRequest.key change à chaque nouvelle demande → ChatWindow recharge
    const [convRequest, setConvRequest] = useState<{ key: number; id: number | null }>({ key: 0, id: null });
    const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
    const [conversationsRefreshTrigger, setConversationsRefreshTrigger] = useState(0);

    const handleNewConversation = () => {
        setConvRequest((prev) => ({ key: prev.key + 1, id: null }));
        setActiveTab("Chat");
    };

    const handleSelectConversation = (id: number) => {
        setConvRequest((prev) => ({ key: prev.key + 1, id }));
        setActiveTab("Chat");
    };

    const handleDeleteConversation = (id: number) => {
        // Si la conv supprimée est active, démarrer une nouvelle
        if (id === activeConversationId) {
            handleNewConversation();
        }
        setConversationsRefreshTrigger((t) => t + 1);
    };

    const handleDeleteAll = () => {
        invoke("delete_all_conversations")
            .then(() => {
                setActiveConversationId(null);
                setConvRequest((prev) => ({ key: prev.key + 1, id: null }));
                setConversationsRefreshTrigger((t) => t + 1);
            })
            .catch(() => {
                /* silencieux */
            });
    };

    const handleConversationReady = (id: number) => {
        setActiveConversationId(id);
        setConversationsRefreshTrigger((t) => t + 1);
    };

    const handleConversationTitleChanged = () => {
        setConversationsRefreshTrigger((t) => t + 1);
    };
    // ────────────────────────────────────────────────────────────────────────

    const items = navItems.map((item) => ({
        ...item,
        active: item.label === activeTab,
    }));

    return (
        <SkillsProvider>
            <div className="relative flex h-screen overflow-hidden bg-[#0f1115] text-white">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),_transparent_24%)]" />
                <aside className="relative z-10 w-[280px] border-r border-white/10 bg-white/10 backdrop-blur-3xl shadow-2xl shadow-slate-950/20">
                    <Sidebar
                        items={items}
                        onSelect={setActiveTab}
                        isModelLoaded={isModelLoaded}
                        loadedModelName={loadedModelPath?.split(/[/\\]/).pop() ?? null}
                        activeConversationId={activeConversationId}
                        conversationsRefreshTrigger={conversationsRefreshTrigger}
                        onNewConversation={handleNewConversation}
                        onSelectConversation={handleSelectConversation}
                        onDeleteConversation={handleDeleteConversation}
                        onDeleteAll={handleDeleteAll}
                    />
                </aside>
                <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
                    {activeTab !== "Chat" && (
                        <div className="border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur-2xl">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Pépé-Studio</p>
                                    <h1 className="text-2xl font-semibold tracking-tight text-white">{activeTab}</h1>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setTerminalOpen((v) => !v)}
                                        title="Ouvrir / fermer les terminaux"
                                        className={`rounded-2xl border px-3 py-1.5 text-sm transition ${terminalOpen ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400 hover:text-white"}`}
                                    >
                                        ⌨️ Terminaux
                                    </button>
                                    <button
                                        onClick={() => setBrowserOpen((v) => !v)}
                                        title="Ouvrir / fermer le navigateur"
                                        className={`rounded-2xl border px-3 py-1.5 text-sm transition ${browserOpen ? "border-blue-400/40 bg-blue-500/10 text-blue-300" : "border-white/10 bg-white/5 text-slate-400 hover:text-white"}`}
                                    >
                                        🌐 Navigateur
                                    </button>
                                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-2 text-sm text-slate-300">
                                        Modèle local · streaming
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="relative flex-1 overflow-hidden">
                        <div className="absolute inset-0 bg-white/5" />
                        <div className="relative z-10 h-full">
                            {/* Panels toujours montés, cachés par CSS pour préserver le state */}
                            <div
                                style={{ display: activeTab === "Chat" ? "flex" : "none" }}
                                className="h-full flex-col"
                            >
                                <ChatWindow
                                    convRequest={convRequest}
                                    onConversationReady={handleConversationReady}
                                    onConversationTitleChanged={handleConversationTitleChanged}
                                    onOpenBrowserUrl={openBrowserUrl}
                                    onOpenTerminal={openTerminal}
                                />
                            </div>
                            <div
                                style={{ display: activeTab === "Modèles" ? "flex" : "none" }}
                                className="h-full flex-col"
                            >
                                <ModelsPanel />
                            </div>
                            <div
                                style={{ display: activeTab === "Skills" ? "flex" : "none" }}
                                className="h-full flex-col"
                            >
                                <SkillsPanel />
                            </div>
                            <div style={{ display: activeTab === "MCP" ? "flex" : "none" }} className="h-full flex-col">
                                <McpPanel />
                            </div>
                            {activeTab === "Paramètres" && (
                                <div className="h-full overflow-y-auto p-8">
                                    <SettingsPanel />
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <WorkspaceWindows
                    browserOpen={browserOpen}
                    onToggleBrowser={() => setBrowserOpen((value) => !value)}
                    onCloseBrowser={() => setBrowserOpen(false)}
                    browserUrl={browserNav.url}
                    browserNavKey={browserNav.nav}
                    terminalOpen={terminalOpen}
                    onToggleTerminal={() => setTerminalOpen((value) => !value)}
                    onCloseTerminal={() => setTerminalOpen(false)}
                />
            </div>
        </SkillsProvider>
    );
}
