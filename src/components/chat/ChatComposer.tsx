"use client";

import type React from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { Attachment } from "../../hooks/useLlama";

interface ChatComposerProps {
    todoItems: { text: string; done: boolean }[];
    todoCollapsed: boolean;
    onToggleTodoCollapsed: () => void;
    onClearTodoItems: () => void;
    projectStructure: string;
    projectStructureCollapsed: boolean;
    onToggleProjectStructureCollapsed: () => void;
    conversationId: number | null;
    onClearProjectStructure: () => void;
    isIndexing: boolean;
    attachments: Attachment[];
    onRemoveAttachment: (index: number) => void;
    isDragging: boolean;
    handleDragOver: React.DragEventHandler<HTMLDivElement>;
    handleDragEnter: React.DragEventHandler<HTMLDivElement>;
    handleDragLeave: React.DragEventHandler<HTMLDivElement>;
    handleDrop: React.DragEventHandler<HTMLDivElement>;
    fileInputRef: React.RefObject<HTMLInputElement>;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    prompt: string;
    onPromptChange: (value: string) => void;
    onSend: () => void;
    isContextReady: boolean;
    handleFileSelect: React.ChangeEventHandler<HTMLInputElement>;
    isListening: boolean;
    onToggleMic: () => void;
    thinkingEnabled: boolean;
    onToggleThinking: () => void;
    deepThinkingEnabled: boolean;
    onToggleDeepThinking: () => void;
    loading: boolean;
    streaming: boolean;
    onCancelGeneration: () => void;
    error: string | null;
    autoLoadError: string | null;
}

export function ChatComposer({
    todoItems,
    todoCollapsed,
    onToggleTodoCollapsed,
    onClearTodoItems,
    projectStructure,
    projectStructureCollapsed,
    onToggleProjectStructureCollapsed,
    conversationId,
    onClearProjectStructure,
    isIndexing,
    attachments,
    onRemoveAttachment,
    isDragging,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    fileInputRef,
    textareaRef,
    prompt,
    onPromptChange,
    onSend,
    isContextReady,
    handleFileSelect,
    isListening,
    onToggleMic,
    thinkingEnabled,
    onToggleThinking,
    deepThinkingEnabled,
    onToggleDeepThinking,
    loading,
    streaming,
    onCancelGeneration,
    error,
    autoLoadError,
}: ChatComposerProps) {
    return (
        <div className="border-t border-white/10 bg-slate-950/80 px-6 pb-6 pt-4 backdrop-blur-xl">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
                {todoItems.length > 0 && (
                    <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
                                ✅ Tâches en cours ({todoItems.filter((item) => item.done).length}/{todoItems.length})
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onToggleTodoCollapsed}
                                    className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                                >
                                    {todoCollapsed ? "▼ Afficher" : "▲ Réduire"}
                                </button>
                                <button
                                    onClick={onClearTodoItems}
                                    className="text-xs text-slate-600 transition-colors hover:text-red-400"
                                    title="Fermer la todo list"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        {!todoCollapsed && (
                            <ul className="flex flex-col gap-1.5">
                                {todoItems.map((item, index) => (
                                    <li key={index} className="flex items-start gap-2 text-sm">
                                        <span
                                            className={item.done ? "mt-0.5 text-emerald-400" : "mt-0.5 text-slate-500"}
                                        >
                                            {item.done ? "✓" : "○"}
                                        </span>
                                        <span className={item.done ? "line-through text-slate-500" : "text-slate-200"}>
                                            {item.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {projectStructure.trim() && (
                    <div className="rounded-2xl border border-blue-500/25 bg-blue-950/15 px-4 py-3">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                                🗂 Structure du projet
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={onToggleProjectStructureCollapsed}
                                    className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                                >
                                    {projectStructureCollapsed ? "▼ Afficher" : "▲ Réduire"}
                                </button>
                                <button
                                    onClick={() => {
                                        if (conversationId) {
                                            invoke("save_project_structure", {
                                                conversationId,
                                                structure: "",
                                            }).catch(() => {});
                                        }
                                        onClearProjectStructure();
                                    }}
                                    className="text-xs text-slate-600 transition-colors hover:text-red-400"
                                    title="Effacer la structure"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                        {!projectStructureCollapsed && (
                            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">
                                {projectStructure}
                            </pre>
                        )}
                    </div>
                )}

                {isIndexing && (
                    <div className="flex animate-pulse items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                        <span>⏳</span>
                        <span>Indexation du document en cours, veuillez patienter…</span>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {attachments.map((attachment, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5"
                            >
                                {attachment.dataUrl ? (
                                    <img
                                        src={attachment.dataUrl}
                                        alt={attachment.name}
                                        className="h-8 w-8 rounded-lg object-cover"
                                    />
                                ) : attachment.docId != null ? (
                                    <span className="text-base">📚</span>
                                ) : (
                                    <span className="text-base">📄</span>
                                )}
                                <span className="max-w-[160px] truncate text-xs text-slate-300">
                                    {attachment.name}
                                    {attachment.docId != null && (
                                        <span className="ml-1 text-emerald-400">
                                            ({attachment.totalPages}p · indexé)
                                        </span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onRemoveAttachment(index)}
                                    className="ml-1 text-slate-500 transition hover:text-red-400"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div
                    className={`rounded-3xl border px-4 py-3 transition focus-within:border-blue-400 ${
                        isDragging
                            ? "border-blue-400/70 bg-blue-500/10 ring-2 ring-blue-400/30"
                            : "border-white/10 bg-white/5"
                    }`}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {isDragging && (
                        <div className="pointer-events-none mb-2 text-center text-xs text-blue-300">
                            Déposer les fichiers ici
                        </div>
                    )}
                    <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={(e) => onPromptChange(e.target.value)}
                        onInput={(e) => {
                            const element = e.currentTarget;
                            element.style.height = "auto";
                            element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (!isContextReady) return;
                                onSend();
                            }
                        }}
                        rows={1}
                        placeholder="Écris ton message… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
                        className="w-full resize-none bg-transparent text-white outline-none placeholder:text-slate-500"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/*,text/*,.pdf,.json,.ts,.tsx,.js,.jsx,.py,.md,.csv,.xml,.yaml,.yml"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        title="Joindre un fichier ou une image"
                        className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-slate-400 transition hover:border-blue-400/40 hover:text-blue-300"
                    >
                        📎
                    </button>
                    <button
                        type="button"
                        onClick={onToggleMic}
                        title={isListening ? "Arrêter la dictée" : "Dicter un message"}
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition ${
                            isListening
                                ? "animate-pulse border-red-400/50 bg-red-500/10 text-red-400"
                                : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/40 hover:text-violet-300"
                        }`}
                    >
                        🎤
                    </button>
                    <button
                        type="button"
                        onClick={onToggleThinking}
                        title={thinkingEnabled ? "Désactiver le mode réflexion" : "Activer le mode réflexion"}
                        className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition ${
                            thinkingEnabled
                                ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                                : "border-white/10 bg-white/5 text-slate-400 hover:border-slate-400/40"
                        }`}
                    >
                        💭 {thinkingEnabled ? "Think" : "No Think"}
                    </button>
                    <button
                        type="button"
                        onClick={onToggleDeepThinking}
                        title={
                            deepThinkingEnabled
                                ? "Désactiver la réflexion profonde"
                                : "Activer la réflexion profonde"
                        }
                        className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition ${
                            deepThinkingEnabled
                                ? "border-purple-400/50 bg-purple-500/10 text-purple-300"
                                : "border-white/10 bg-white/5 text-slate-400 hover:border-slate-400/40"
                        }`}
                    >
                        🧠 {deepThinkingEnabled ? "Deep" : "No Deep"}
                    </button>
                    <div className="flex-1" />
                    {loading || streaming ? (
                        <button
                            onClick={onCancelGeneration}
                            className="animate-pulse rounded-3xl bg-red-600/80 px-6 py-2.5 font-medium text-white transition hover:bg-red-500"
                            title="Arrêter la génération"
                        >
                            ⏹ Stop
                        </button>
                    ) : (
                        <button
                            onClick={onSend}
                            disabled={isIndexing || !isContextReady}
                            className="rounded-3xl bg-blue-500 px-6 py-2.5 font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-400/70"
                        >
                            {isIndexing ? "⏳ Indexation…" : !isContextReady ? "⏳ Contexte…" : "Envoyer →"}
                        </button>
                    )}
                </div>

                {(error || autoLoadError) && (
                    <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap">
                        {error ?? autoLoadError}
                    </div>
                )}
            </div>
        </div>
    );
}
