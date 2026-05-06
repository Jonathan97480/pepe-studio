import React from "react";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { LlamaMessage, Attachment } from "../hooks/useLlama";
import type { PatchResult } from "../lib/skillPatcher";
import { MessageBubble } from "./chat/MessageBubble";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatHeader } from "./chat/ChatHeader";
import { ConversationPanels } from "./chat/ConversationPanels";
import { ImageFormatPicker } from "./chat/ImageFormatPicker";
import { ErrorToast } from "./chat/ErrorToast";

export interface ChatWindowScreenLayoutProps {
    errorToasts: Array<{ id: number; message: string; type: "error" | "warning" }>;
    dismissToast: (id: number) => void;
    chatMode: "ask" | "plan" | "agent";
    applyMode: (mode: "ask" | "plan" | "agent") => void;
    tokenUsage: { used: number; limit: number } | null;
    contextWindow: number;
    isModelLoaded: boolean;
    loadedModelPath: string | null;
    handleStopModel: () => Promise<void>;
    ttsEnabled: boolean;
    isSpeaking: boolean;
    stopSpeaking: () => void;
    setTtsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
    updateAutoScrollState: () => void;
    isLoadingConv: boolean;
    assistantMessages: LlamaMessage[];
    expandedThinking: Record<number, boolean>;
    toggleThinking: (index: number) => void;
    expandedToolCalls: Record<string, boolean>;
    setExpandedToolCalls: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    editingIndex: number | null;
    setEditingIndex: React.Dispatch<React.SetStateAction<number | null>>;
    editDraft: string;
    setEditDraft: React.Dispatch<React.SetStateAction<string>>;
    editMessage: (index: number, newContent: string) => void;
    handleResendEdit: (index: number, newContent: string) => Promise<void>;
    deleteMessage: (index: number) => void;
    conversationId: number | null;
    isImageGenerating: boolean;
    bottomRef: React.RefObject<HTMLDivElement>;
    compactToast: boolean;
    pendingQuestion: {
        question: string;
        options: string[];
        config: Partial<LlamaLaunchConfig>;
    } | null;
    setPendingQuestion: React.Dispatch<
        React.SetStateAction<{
            question: string;
            options: string[];
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setToolRunning: React.Dispatch<React.SetStateAction<boolean>>;
    sendPrompt: (
        prompt: string,
        config: Partial<LlamaLaunchConfig>,
        attachments?: Attachment[],
        save?: boolean,
    ) => Promise<unknown>;
    pendingAgentPermission: {
        reason: string;
        parsed: Record<string, string>;
        config: Partial<LlamaLaunchConfig>;
    } | null;
    setPendingAgentPermission: React.Dispatch<
        React.SetStateAction<{
            reason: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    dispatchToolRef: React.MutableRefObject<
        | ((parsed: Record<string, string>, cfg: Partial<LlamaLaunchConfig>, forceExecute?: boolean) => Promise<void>)
        | null
    >;
    lastToolSignatureRef: React.MutableRefObject<string | null>;
    pendingPlanConfirm: {
        description: string;
        parsed: Record<string, string>;
        config: Partial<LlamaLaunchConfig>;
    } | null;
    setPendingPlanConfirm: React.Dispatch<
        React.SetStateAction<{
            description: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    patchResults: PatchResult[] | null;
    setPatchResults: React.Dispatch<React.SetStateAction<PatchResult[] | null>>;
    showSDFormatPicker: boolean;
    selectedSDFormat: string | null;
    setSelectedSDFormat: React.Dispatch<React.SetStateAction<string | null>>;
    setShowSDFormatPicker: React.Dispatch<React.SetStateAction<boolean>>;
    selectedBatchCount: number;
    setSelectedBatchCount: React.Dispatch<React.SetStateAction<number>>;
    liveImageProgress: number;
    liveImagePreview: string | null;
    todoItems: { text: string; done: boolean }[];
    todoCollapsed: boolean;
    setTodoCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setTodoItems: React.Dispatch<React.SetStateAction<{ text: string; done: boolean }[]>>;
    projectStructure: string;
    projectStructureCollapsed: boolean;
    setProjectStructureCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
    setProjectStructure: React.Dispatch<React.SetStateAction<string>>;
    isIndexing: boolean;
    attachments: Attachment[];
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    isDragging: boolean;
    handleDragOver: (event: React.DragEvent) => void;
    handleDragEnter: (event: React.DragEvent) => void;
    handleDragLeave: (event: React.DragEvent) => void;
    handleDrop: (event: React.DragEvent) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    handleSend: () => void;
    pendingQueueCount: number;
    isContextReady: boolean;
    handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isListening: boolean;
    handleMic: (onTranscript: (text: string) => void) => void;
    thinkingEnabled: boolean;
    handleToggleThinking: () => Promise<void>;
    deepThinkingEnabled: boolean;
    toggleDeepThinking: () => void;
    loading: boolean;
    streaming: boolean;
    cancelGeneration: () => void;
    error: string | null;
    autoLoadError: string | null;
}

export function ChatWindowScreenLayout(props: ChatWindowScreenLayoutProps) {
    const {
        errorToasts,
        dismissToast,
        chatMode,
        applyMode,
        tokenUsage,
        contextWindow,
        isModelLoaded,
        loadedModelPath,
        handleStopModel,
        ttsEnabled,
        isSpeaking,
        stopSpeaking,
        setTtsEnabled,
        scrollContainerRef,
        updateAutoScrollState,
        isLoadingConv,
        assistantMessages,
        expandedThinking,
        toggleThinking,
        expandedToolCalls,
        setExpandedToolCalls,
        editingIndex,
        setEditingIndex,
        editDraft,
        setEditDraft,
        editMessage,
        handleResendEdit,
        deleteMessage,
        conversationId,
        isImageGenerating,
        bottomRef,
        compactToast,
        pendingQuestion,
        setPendingQuestion,
        setToolRunning,
        sendPrompt,
        pendingAgentPermission,
        setPendingAgentPermission,
        dispatchToolRef,
        lastToolSignatureRef,
        pendingPlanConfirm,
        setPendingPlanConfirm,
        patchResults,
        setPatchResults,
        showSDFormatPicker,
        selectedSDFormat,
        setSelectedSDFormat,
        setShowSDFormatPicker,
        selectedBatchCount,
        setSelectedBatchCount,
        liveImageProgress,
        liveImagePreview,
        todoItems,
        todoCollapsed,
        setTodoCollapsed,
        setTodoItems,
        projectStructure,
        projectStructureCollapsed,
        setProjectStructureCollapsed,
        setProjectStructure,
        isIndexing,
        attachments,
        setAttachments,
        isDragging,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
        fileInputRef,
        textareaRef,
        prompt,
        setPrompt,
        handleSend,
        pendingQueueCount,
        isContextReady,
        handleFileSelect,
        isListening,
        handleMic,
        thinkingEnabled,
        handleToggleThinking,
        deepThinkingEnabled,
        toggleDeepThinking,
        loading,
        streaming,
        cancelGeneration,
        error,
        autoLoadError,
    } = props;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <ErrorToast toasts={errorToasts} onDismiss={dismissToast} />
            <ChatHeader
                chatMode={chatMode}
                onModeChange={applyMode}
                usedTokens={tokenUsage?.used}
                tokenLimit={tokenUsage?.limit ?? contextWindow}
                isModelLoaded={isModelLoaded}
                loadedModelName={loadedModelPath?.split(/[/\\]/).pop() ?? null}
                onStopModel={handleStopModel}
                ttsEnabled={ttsEnabled}
                isSpeaking={isSpeaking}
                onToggleVoice={() => {
                    if (isSpeaking) {
                        stopSpeaking();
                        return;
                    }
                    setTtsEnabled((value) => !value);
                }}
            />
            <div ref={scrollContainerRef} onScroll={updateAutoScrollState} className="flex-1 overflow-y-auto p-8">
                <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {isLoadingConv ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-blue-400" />
                            <span className="text-sm">Chargement de la conversation…</span>
                        </div>
                    ) : (
                        assistantMessages.map((message, index) => (
                            <MessageBubble
                                key={index}
                                message={message}
                                index={index}
                                expandedThinking={expandedThinking}
                                toggleThinking={toggleThinking}
                                expandedToolCalls={expandedToolCalls}
                                setExpandedToolCalls={setExpandedToolCalls}
                                editingIndex={editingIndex}
                                setEditingIndex={setEditingIndex}
                                editDraft={editDraft}
                                setEditDraft={setEditDraft}
                                editMessage={editMessage}
                                handleResendEdit={handleResendEdit}
                                deleteMessage={deleteMessage}
                                conversationId={conversationId}
                            />
                        ))
                    )}
                    {isImageGenerating && (
                        <div className="flex items-center gap-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 px-5 py-4">
                            <div className="relative h-10 w-10 flex-shrink-0">
                                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-r-pink-400 border-t-purple-400" />
                                <div
                                    className="absolute inset-1 animate-spin rounded-full border-2 border-transparent border-b-indigo-400 border-l-violet-400"
                                    style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-lg">🎨</div>
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="animate-pulse font-semibold text-purple-200">
                                    Génération d&apos;image en cours…
                                </span>
                                <span className="text-xs text-purple-400/70">
                                    Le LLM reste actif si la VRAM le permet
                                </span>
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                    <ConversationPanels
                        compactToast={!!compactToast}
                        pendingQuestion={
                            pendingQuestion
                                ? { question: pendingQuestion.question, options: pendingQuestion.options }
                                : null
                        }
                        onAnswerQuestion={(answer) => {
                            if (!pendingQuestion) return;
                            const cfg = pendingQuestion.config;
                            setPendingQuestion(null);
                            setToolRunning(false);
                            sendPrompt(`[Réponse utilisateur] ${answer}`, cfg);
                        }}
                        pendingAgentPermission={
                            pendingAgentPermission ? { reason: pendingAgentPermission.reason } : null
                        }
                        onApproveAgentMode={() => {
                            if (!pendingAgentPermission) return;
                            const { parsed: parsedTool, config } = pendingAgentPermission;
                            setPendingAgentPermission(null);
                            applyMode("agent");
                            lastToolSignatureRef.current = null;
                            setToolRunning(true);
                            dispatchToolRef.current!(parsedTool, config, true).finally(() => setToolRunning(false));
                        }}
                        onRejectAgentMode={() => {
                            if (!pendingAgentPermission) return;
                            const cfg = pendingAgentPermission.config;
                            setPendingAgentPermission(null);
                            setToolRunning(false);
                            sendPrompt(
                                `[Système] Refus. L'utilisateur ne veut pas passer en mode Agent. Réponds par du texte.`,
                                cfg,
                            );
                        }}
                        patchResults={patchResults}
                        onDismissPatchResults={() => setPatchResults(null)}
                        pendingPlanConfirm={pendingPlanConfirm ? { description: pendingPlanConfirm.description } : null}
                        onConfirmPlanAction={() => {
                            if (!pendingPlanConfirm) return;
                            const { parsed: parsedTool, config } = pendingPlanConfirm;
                            setPendingPlanConfirm(null);
                            lastToolSignatureRef.current = null;
                            setToolRunning(true);
                            dispatchToolRef.current!(parsedTool, config, true).finally(() => setToolRunning(false));
                        }}
                        onRejectPlanAction={() => {
                            if (!pendingPlanConfirm) return;
                            const cfg = pendingPlanConfirm.config;
                            setPendingPlanConfirm(null);
                            setToolRunning(false);
                            sendPrompt(`[Système] Annulé par l'utilisateur. Ne fait pas cette action.`, cfg);
                        }}
                    />
                </div>
            </div>
            <div className="border-t border-white/10">
                {showSDFormatPicker && (
                    <div className="bg-slate-950/80 px-6 pt-3 backdrop-blur-xl">
                        <div className="mx-auto max-w-3xl space-y-2">
                            <ImageFormatPicker selected={selectedSDFormat} onChange={setSelectedSDFormat} />
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="shrink-0 font-medium text-slate-300">Itérations :</span>
                                {[1, 2, 3, 4].map((n) => (
                                    <button
                                        key={n}
                                        onClick={() => setSelectedBatchCount(n)}
                                        className={`rounded-md px-3 py-1 font-mono transition-colors ${
                                            selectedBatchCount === n
                                                ? "bg-purple-600 text-white"
                                                : "bg-white/10 text-slate-300 hover:bg-white/20"
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                {isImageGenerating && (
                    <div className="bg-slate-950/80 px-6 pt-3 backdrop-blur-xl">
                        <div className="mx-auto max-w-3xl rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3">
                            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-cyan-300">
                                <span>Apercu SD en temps reel</span>
                                {liveImageProgress > 0 ? (
                                    <span className="font-mono text-cyan-400">{liveImageProgress}%</span>
                                ) : (
                                    <span className="font-mono text-cyan-400">…</span>
                                )}
                            </div>
                            {liveImagePreview ? (
                                <img
                                    src={liveImagePreview}
                                    alt="Apercu generation en cours"
                                    className="max-h-64 w-full rounded-lg border border-white/10 object-contain"
                                />
                            ) : (
                                <div className="h-3 w-full overflow-hidden rounded-full bg-cyan-950/60">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                                        style={{ width: `${Math.max(8, liveImageProgress)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <ChatComposer
                    todoItems={todoItems}
                    todoCollapsed={todoCollapsed}
                    onToggleTodoCollapsed={() => setTodoCollapsed((value) => !value)}
                    onClearTodoItems={() => setTodoItems([])}
                    projectStructure={projectStructure}
                    projectStructureCollapsed={projectStructureCollapsed}
                    onToggleProjectStructureCollapsed={() => setProjectStructureCollapsed((value) => !value)}
                    conversationId={conversationId}
                    onClearProjectStructure={() => setProjectStructure("")}
                    isIndexing={isIndexing}
                    attachments={attachments}
                    onRemoveAttachment={(index) => setAttachments((prev) => prev.filter((_, item) => item !== index))}
                    isDragging={isDragging}
                    handleDragOver={handleDragOver}
                    handleDragEnter={handleDragEnter}
                    handleDragLeave={handleDragLeave}
                    handleDrop={handleDrop}
                    fileInputRef={fileInputRef}
                    textareaRef={textareaRef}
                    prompt={prompt}
                    onPromptChange={setPrompt}
                    onSend={handleSend}
                    pendingQueueCount={pendingQueueCount}
                    isContextReady={isContextReady}
                    handleFileSelect={handleFileSelect}
                    isListening={isListening}
                    onToggleMic={() =>
                        handleMic((transcript) => setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript)))
                    }
                    thinkingEnabled={thinkingEnabled}
                    onToggleThinking={handleToggleThinking}
                    deepThinkingEnabled={deepThinkingEnabled}
                    onToggleDeepThinking={toggleDeepThinking}
                    loading={loading}
                    streaming={streaming}
                    onCancelGeneration={cancelGeneration}
                    error={error}
                    autoLoadError={autoLoadError}
                    showSDFormatPicker={showSDFormatPicker}
                    onToggleSDFormatPicker={() => setShowSDFormatPicker((v) => !v)}
                    selectedSDFormat={selectedSDFormat}
                />
            </div>
        </div>
    );
}
