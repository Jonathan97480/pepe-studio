"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLlama, type Attachment, type LlamaMessage } from "./useLlama";
import { type PatchResult } from "../lib/skillPatcher";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { useSkills } from "../context/SkillsContext";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import { stripSystemTags, type ChatMode } from "../lib/chatUtils";
import { useConversationLoader } from "./useConversationLoader";
import { useVoice } from "./useVoice";
import { useBuildMachineContext } from "./useBuildMachineContext";
import { useToolCalling, type UseModelConfig, type UseSDConfig, type UseToolCallingRefs } from "./useToolCalling";
import { useFileAttachments } from "./useFileAttachments";
import { useAutoCompact } from "./useAutoCompact";
import { useErrorToast } from "./useErrorToast";
import { useChatWindowQueue } from "./useChatWindowQueue";
import type { ChatWindowScreenLayoutProps } from "../components/ChatWindowScreenLayout";

type QueuedPrompt = {
    prompt: string;
    attachments: Attachment[];
};

export function useChatWindowScreenController({
    convRequest,
    onConversationReady,
    onConversationTitleChanged,
    onOpenBrowserUrl,
    onOpenTerminal,
}: {
    convRequest?: { key: number; id: number | null };
    onConversationReady?: (id: number) => void;
    onConversationTitleChanged?: () => void;
    onOpenBrowserUrl?: (url: string) => void;
    onOpenTerminal?: () => void;
}): ChatWindowScreenLayoutProps {
    const {
        messages,
        loading,
        error,
        streaming,
        tokenUsage,
        sendPrompt,
        loadModel,
        stopModel,
        deleteMessage,
        editMessage,
        truncateMessagesFrom,
        resetMessages,
        updateLastAssistantContent,
        cancelGeneration,
        insertMessage,
    } = useLlama();

    const {
        modelPath,
        temperature,
        contextWindow,
        evalBatchSize,
        flashAttention,
        systemPrompt,
        turboQuant,
        sampling,
        nGpuLayers,
        threads,
        reasoningBudget,
        thinkingEnabled,
        setModelPath,
        setTemperature,
        setContextWindow,
        setEvalBatchSize,
        setFlashAttention,
        setSystemPrompt,
        setTurboQuant,
        setReasoningBudget,
        setThinkingEnabled,
        sdModelPath,
        isModelLoaded,
        setIsModelLoaded,
        loadedModelPath,
        setLoadedModelPath,
    } = useModelSettings();

    const { isEnabled, disabled } = useSkills();
    const { isListening, isSpeaking, ttsEnabled, setTtsEnabled, speakText, handleMic, stopSpeaking } = useVoice();
    const { toasts: errorToasts, showError, dismiss: dismissToast } = useErrorToast();

    const [prompt, setPrompt] = useState("");
    const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
    const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
    const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [toolRunning, setToolRunning] = useState(false);
    const [isImageGenerating, setIsImageGenerating] = useState(false);
    const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(true);
    const [chatMode, setChatMode] = useState<ChatMode>("plan");
    const [selectedSDFormat, setSelectedSDFormat] = useState<string | null>(null);
    const [selectedBatchCount, setSelectedBatchCount] = useState<number>(1);
    const [showSDFormatPicker, setShowSDFormatPicker] = useState(false);
    const [liveImagePreview, setLiveImagePreview] = useState<string | null>(null);
    const [liveImageProgress, setLiveImageProgress] = useState<number>(0);
    const [pendingQueue, setPendingQueue] = useState<QueuedPrompt[]>([]);
    const [pendingQuestion, setPendingQuestion] = useState<{
        question: string;
        options: string[];
        config: Partial<LlamaLaunchConfig>;
    } | null>(null);
    const [pendingAgentPermission, setPendingAgentPermission] = useState<{
        reason: string;
        parsed: Record<string, string>;
        config: Partial<LlamaLaunchConfig>;
    } | null>(null);
    const [pendingPlanConfirm, setPendingPlanConfirm] = useState<{
        description: string;
        parsed: Record<string, string>;
        config: Partial<LlamaLaunchConfig>;
    } | null>(null);
    const [patchResults, setPatchResults] = useState<PatchResult[] | null>(null);
    const [todoCollapsed, setTodoCollapsed] = useState(false);
    const [projectStructureCollapsed, setProjectStructureCollapsed] = useState(false);

    const isQueueProcessingRef = useRef(false);
    const chatModeRef = useRef<ChatMode>("plan");
    const lastToolSignatureRef = useRef<string | null>(null);
    const lastToolWasErrorRef = useRef<boolean>(false);
    const jsonParseErrorCountRef = useRef(0);
    const dispatchToolRef = useRef<
        | ((parsed: Record<string, string>, cfg: Partial<LlamaLaunchConfig>, forceExecute?: boolean) => Promise<void>)
        | null
    >(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const prevStreamingRef = useRef(false);
    const autoScrollEnabledRef = useRef(true);

    const {
        conversationId,
        isLoadingConv,
        isResumingConv,
        setIsResumingConv,
        convTitleSetRef,
        todoItems,
        setTodoItems,
        projectStructure,
        setProjectStructure,
        projectStructureRef,
        setPlanContent,
        planRef,
    } = useConversationLoader({
        convRequest,
        resetMessages,
        modelPath,
        onConversationReady,
        onError: showError,
    });

    const {
        attachments,
        setAttachments,
        isIndexing,
        isDragging,
        handleFileSelect,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
    } = useFileAttachments();

    const { machineContext, isContextReady, setIsContextReady, buildMachineContext } = useBuildMachineContext({
        deepThinkingEnabled,
        isEnabled,
        chatModeRef,
    });

    const { compactToast } = useAutoCompact({
        messages,
        resetMessages,
        streaming,
        loading,
        tokenUsage,
        contextWindow,
    });

    const toggleDeepThinking = () =>
        setDeepThinkingEnabled((value) => {
            const next = !value;
            localStorage.setItem("customapp_deep_thinking", String(next));
            return next;
        });

    const applyMode = (mode: ChatMode) => {
        setChatMode(mode);
        chatModeRef.current = mode;
    };

    useEffect(() => {
        chatModeRef.current = chatMode;
    }, [chatMode]);

    useEffect(() => {
        const stored = localStorage.getItem("customapp_deep_thinking");
        if (stored != null) {
            setDeepThinkingEnabled(stored !== "false");
        }
    }, []);

    const updateAutoScrollState = () => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        autoScrollEnabledRef.current = distanceFromBottom <= 48;
    };

    useEffect(() => {
        if (!autoScrollEnabledRef.current) return;
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        setIsContextReady(false);
        buildMachineContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled, chatMode, convRequest?.key, modelPath, deepThinkingEnabled]);

    useChatWindowQueue({
        modelPath,
        temperature,
        contextWindow,
        evalBatchSize,
        flashAttention,
        sampling,
        reasoningBudget,
        thinkingEnabled,
        machineContext,
        systemPrompt,
        turboQuant,
        isModelLoaded,
        loadModel,
        setContextWindow,
        setEvalBatchSize,
        setFlashAttention,
        setIsModelLoaded,
        setLoadedModelPath,
        setModelPath,
        setReasoningBudget,
        setSystemPrompt,
        setTemperature,
        setThinkingEnabled,
        setTurboQuant,
        conversationId,
        convTitleSetRef,
        isResumingConv,
        setIsResumingConv,
        projectStructureRef,
        lastToolSignatureRef,
        lastToolWasErrorRef,
        sendPrompt,
        showError,
        setAutoLoadError,
        pendingQueue,
        setPendingQueue,
        isQueueProcessingRef,
        loading,
        streaming,
        toolRunning,
    });

    useToolCalling({
        streaming,
        toolRunning,
        setToolRunning,
        messages,
        modelConfig: {
            modelPath,
            temperature,
            contextWindow,
            turboQuant,
            sampling,
            thinkingEnabled,
            machineContext,
            systemPrompt,
        } satisfies UseModelConfig,
        refs: {
            chatModeRef,
            prevStreamingRef,
            lastToolSignatureRef,
            lastToolWasErrorRef,
            jsonParseErrorCountRef,
            convTitleSetRef,
            dispatchToolRef,
            projectStructureRef,
            planRef,
        } satisfies UseToolCallingRefs,
        sdConfig: {
            selectedSDFormat,
            selectedBatchCount,
            selectedSDModel: sdModelPath,
        } satisfies UseSDConfig,
        sendPrompt,
        updateLastAssistantContent,
        buildMachineContext,
        setPendingQuestion,
        setPendingAgentPermission,
        setPendingPlanConfirm,
        setPatchResults,
        applyMode,
        onOpenBrowserUrl,
        onOpenTerminal,
        onConversationTitleChanged,
        conversationId,
        ttsEnabled,
        speakText,
        setTodoItems,
        setProjectStructure,
        setPlanContent,
        setImageGenerating: setIsImageGenerating,
        setLiveImagePreview,
        setLiveImageProgress,
        insertMessage,
    });

    const assistantMessages = useMemo<LlamaMessage[]>(() => {
        if (messages.length === 0) {
            return [
                {
                    role: "assistant",
                    content:
                        "Bonjour, je suis prêt à charger votre modèle GGUF. Configurez le modèle dans l'onglet \"Modèles\" avant d'envoyer un message.",
                    thinking: undefined,
                    thinkingDone: false,
                    thinkingCollapsed: false,
                },
            ];
        }
        return messages.map((message) =>
            message.role === "assistant" && message.content
                ? { ...message, content: stripSystemTags(message.content) }
                : message,
        );
    }, [messages]);

    const toggleThinking = (index: number) => {
        setExpandedThinking((current) => ({ ...current, [index]: !current[index] }));
    };

    const handleSend = () => {
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt || isIndexing) return;
        setPendingQueue((current) => [...current, { prompt: trimmedPrompt, attachments: [...attachments] }]);
        setPrompt("");
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    };

    const handleToggleThinking = async () => {
        const nextThinkingEnabled = !thinkingEnabled;
        setThinkingEnabled(nextThinkingEnabled);
        if (!isModelLoaded || !loadedModelPath) return;

        try {
            await loadModel({
                modelPath: loadedModelPath,
                temperature,
                contextWindow,
                evalBatchSize,
                flashAttention,
                systemPrompt,
                turboQuant,
                nGpuLayers: nGpuLayers > 0 ? nGpuLayers : undefined,
                threads: threads > 0 ? threads : undefined,
                reasoningBudget,
                sampling,
                thinkingEnabled: nextThinkingEnabled,
            });
            setIsModelLoaded(true);
            setLoadedModelPath(loadedModelPath);
        } catch (err) {
            showError(`Impossible de changer le mode de réflexion : ${(err as Error)?.message ?? String(err)}`);
        }
    };

    const handleResendEdit = async (index: number, newContent: string) => {
        truncateMessagesFrom(index);
        setEditingIndex(null);
        try {
            await sendPrompt(newContent, {
                modelPath,
                temperature,
                contextWindow,
                evalBatchSize,
                flashAttention,
                systemPrompt: machineContext
                    ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                    : systemPrompt,
                turboQuant,
                reasoningBudget,
                sampling,
                thinkingEnabled,
            });
        } catch (err) {
            showError(`Erreur lors du renvoi du message : ${(err as Error)?.message ?? String(err)}`);
        }
    };

    const handleStopModel = useCallback(async () => {
        await stopModel();
        setIsModelLoaded(false);
        setLoadedModelPath(null);
    }, [stopModel, setIsModelLoaded, setLoadedModelPath]);

    return {
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
        compactToast: !!compactToast,
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
        pendingQueueCount: pendingQueue.length,
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
    };
}
