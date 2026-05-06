"use client";

import type React from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { Attachment } from "../../hooks/useLlama";
import ComposerActionsBar from "./ComposerActionsBar";
import ComposerAttachments from "./ComposerAttachments";
import ComposerProjectPanel from "./ComposerProjectPanel";
import ComposerTodoPanel from "./ComposerTodoPanel";

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
    pendingQueueCount: number;
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
    showSDFormatPicker: boolean;
    onToggleSDFormatPicker: () => void;
    selectedSDFormat: string | null;
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
    pendingQueueCount,
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
    showSDFormatPicker,
    onToggleSDFormatPicker,
    selectedSDFormat,
}: ChatComposerProps) {
    return (
        <div className="border-t border-white/10 bg-slate-950/80 px-6 pb-6 pt-4 backdrop-blur-xl">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
                <ComposerTodoPanel
                    todoItems={todoItems}
                    todoCollapsed={todoCollapsed}
                    onToggleTodoCollapsed={onToggleTodoCollapsed}
                    onClearTodoItems={onClearTodoItems}
                />

                <ComposerProjectPanel
                    projectStructure={projectStructure}
                    projectStructureCollapsed={projectStructureCollapsed}
                    onToggleProjectStructureCollapsed={onToggleProjectStructureCollapsed}
                    onClearProjectStructure={() => {
                        if (conversationId) {
                            invoke("save_project_structure", {
                                conversationId,
                                structure: "",
                            }).catch(() => {});
                        }
                        onClearProjectStructure();
                    }}
                />

                {isIndexing && (
                    <div className="flex animate-pulse items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                        <span>⏳</span>
                        <span>Indexation du document en cours, veuillez patienter…</span>
                    </div>
                )}

                <ComposerAttachments attachments={attachments} onRemoveAttachment={onRemoveAttachment} />

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

                <ComposerActionsBar
                    fileInputRef={fileInputRef}
                    handleFileSelect={handleFileSelect}
                    onToggleSDFormatPicker={onToggleSDFormatPicker}
                    showSDFormatPicker={showSDFormatPicker}
                    selectedSDFormat={selectedSDFormat}
                    isListening={isListening}
                    onToggleMic={onToggleMic}
                    thinkingEnabled={thinkingEnabled}
                    onToggleThinking={onToggleThinking}
                    deepThinkingEnabled={deepThinkingEnabled}
                    onToggleDeepThinking={onToggleDeepThinking}
                    pendingQueueCount={pendingQueueCount}
                    loading={loading}
                    streaming={streaming}
                    onCancelGeneration={onCancelGeneration}
                    onSend={onSend}
                    isIndexing={isIndexing}
                    isContextReady={isContextReady}
                />

                {(error || autoLoadError) && (
                    <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap">
                        {error ?? autoLoadError}
                    </div>
                )}
            </div>
        </div>
    );
}

