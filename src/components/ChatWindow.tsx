"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useLlama, type LlamaMessage, type Attachment } from "../hooks/useLlama";
import { retrieveChunks } from "../lib/ragRetrieval";
import { type PatchResult } from "../lib/skillPatcher";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { useSkills } from "../context/SkillsContext";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import { detectChatTemplate, type DetectedTemplate } from "../lib/llamaWrapper";
import type { ModelConfig } from "../hooks/useModels";
import { parseSamplingJson } from "../hooks/useModels";
import { stripSystemTags, type ChatMode } from "../lib/chatUtils";
import { MessageBubble } from "./chat/MessageBubble";
import { ChatComposer } from "./chat/ChatComposer";
import { ChatHeader } from "./chat/ChatHeader";
import { ConversationPanels } from "./chat/ConversationPanels";
import { useAutoCompact } from "../hooks/useAutoCompact";
import { useBuildMachineContext } from "../hooks/useBuildMachineContext";
import { useToolCalling } from "../hooks/useToolCalling";
import { useFileAttachments } from "../hooks/useFileAttachments";
import { inspectModelMetadata } from "../lib/modelMetadata";
import { autoConfigureFromHardware, type HardwareInfo } from "../lib/hardwareConfig";

export default function ChatWindow({
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
} = {}) {
    const {
        messages,
        loading,
        error,
        streaming,
        tokenUsage,
        sendPrompt,
        pushUserMessage,
        loadModel,
        stopModel,
        deleteMessage,
        editMessage,
        truncateMessagesFrom,
        resetMessages,
        updateLastAssistantContent,
        cancelGeneration,
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
        isModelLoaded,
        setIsModelLoaded,
        loadedModelPath,
        setLoadedModelPath,
    } = useModelSettings();
    const { isEnabled, disabled } = useSkills();

    const [prompt, setPrompt] = useState("");
    const [isListening, setIsListening] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
    const [expandedThinking, setExpandedThinking] = useState<Record<number, boolean>>({});
    const [expandedToolCalls, setExpandedToolCalls] = useState<Record<string, boolean>>({});
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState("");
    const [isLoadingConv, setIsLoadingConv] = useState(false);
    const [isResumingConv, setIsResumingConv] = useState(false);
    const [toolRunning, setToolRunning] = useState(false);
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(true);
    const [chatMode, setChatMode] = useState<ChatMode>("plan");
    const chatModeRef = useRef<ChatMode>("plan");
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

    // ── Todo list géré par l'IA ───────────────────────────────────────────────
    const [todoItems, setTodoItems] = useState<{ text: string; done: boolean }[]>([]);
    const [todoCollapsed, setTodoCollapsed] = useState(false);

    // ── Structure de projet (persistée par conversation) ─────────────────────
    const [projectStructure, setProjectStructure] = useState("");
    const [projectStructureCollapsed, setProjectStructureCollapsed] = useState(false);
    const projectStructureRef = useRef("");
    projectStructureRef.current = projectStructure;

    // ── Plan de conversation (persisté par conversation) ──────────────────────
    const [planContent, setPlanContent] = useState("");
    const planRef = useRef("");
    planRef.current = planContent;

    const lastToolSignatureRef = useRef<string | null>(null);
    const lastToolWasErrorRef = useRef<boolean>(false);
    const jsonParseErrorCountRef = useRef(0);
    const convTitleSetRef = useRef<boolean>(false);
    const dispatchToolRef = useRef<
        | ((parsed: Record<string, string>, cfg: Partial<LlamaLaunchConfig>, forceExecute?: boolean) => Promise<void>)
        | null
    >(null);

    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<{ stop: () => void } | null>(null);
    const prevStreamingRef = useRef(false);
    const autoScrollEnabledRef = useRef(true);

    // ── Hooks extraits ────────────────────────────────────────────────────────
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
        modelPath,
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
        setDeepThinkingEnabled((v) => {
            const next = !v;
            localStorage.setItem("customapp_deep_thinking", String(next));
            return next;
        });

    const applyMode = (mode: ChatMode) => {
        setChatMode(mode);
        chatModeRef.current = mode;
    };

    // Garder chatModeRef synchronisé avec chatMode
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

    // Scroll automatique vers le bas tant que l'utilisateur reste près de la fin.
    useEffect(() => {
        if (!autoScrollEnabledRef.current) return;
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Démarrer ou charger une conversation selon convRequest
    useEffect(() => {
        resetMessages();
        setConversationId(null);
        lastToolSignatureRef.current = null;
        autoScrollEnabledRef.current = true;
        setTodoItems([]);
        setProjectStructure("");
        setPlanContent("");

        const requestedId = convRequest?.id ?? null;
        if (requestedId !== null) {
            setIsLoadingConv(true);
            Promise.all([
                invoke<{ role: string; content: string }[]>("load_conversation_messages", {
                    conversationId: requestedId,
                }),
                invoke<string>("get_project_structure", { conversationId: requestedId }).catch(() => ""),
                invoke<string>("get_conversation_plan", { conversationId: requestedId }).catch(() => ""),
            ])
                .then(([msgs, structure, plan]) => {
                    const llamaMsgs = msgs.map((m) => ({
                        role: m.role as "user" | "assistant",
                        content: m.content,
                    }));
                    resetMessages(llamaMsgs);
                    setConversationId(requestedId);
                    convTitleSetRef.current = true;
                    if (llamaMsgs.length > 0) setIsResumingConv(true);
                    if (structure) setProjectStructure(structure);
                    if (plan) setPlanContent(plan);
                    onConversationReady?.(requestedId);
                })
                .catch(() => {})
                .finally(() => setIsLoadingConv(false));
        } else {
            invoke<number>("start_conversation", { modelName: modelPath || "inconnu" })
                .then((id) => {
                    setConversationId(id);
                    convTitleSetRef.current = false;
                    onConversationReady?.(id);
                })
                .catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convRequest?.key]);

    // Reconstruire le contexte machine quand le mode, les skills ou la conv changent
    useEffect(() => {
        setIsContextReady(false);
        buildMachineContext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [disabled, chatMode, convRequest?.key, modelPath, deepThinkingEnabled]);

    // Hook de gestion des tool calls (dispatche outils + sauvegarde messages + TTS)
    const speakText = (text: string) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "fr-FR";
        const voices = window.speechSynthesis.getVoices();
        const frVoice = voices.find((v) => v.lang.startsWith("fr"));
        if (frVoice) utterance.voice = frVoice;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    };

    useToolCalling({
        streaming,
        toolRunning,
        setToolRunning,
        messages,
        modelPath,
        temperature,
        contextWindow,
        turboQuant,
        sampling,
        thinkingEnabled,
        machineContext,
        systemPrompt,
        sendPrompt,
        updateLastAssistantContent,
        buildMachineContext,
        chatModeRef,
        prevStreamingRef,
        lastToolSignatureRef,
        lastToolWasErrorRef,
        jsonParseErrorCountRef,
        convTitleSetRef,
        dispatchToolRef,
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
        projectStructureRef,
        setPlanContent,
        planRef,
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
        return messages.map((m) =>
            m.role === "assistant" && m.content ? { ...m, content: stripSystemTags(m.content) } : m,
        );
    }, [messages]);

    const toggleThinking = (index: number) => {
        setExpandedThinking((current) => ({
            ...current,
            [index]: !current[index],
        }));
    };

    const handleSend = async () => {
        if (!prompt.trim() || isIndexing) return;
        setAutoLoadError(null);
        pushUserMessage(prompt, attachments);

        let effectiveConfig: Partial<LlamaLaunchConfig> = {
            modelPath,
            temperature,
            contextWindow,
            evalBatchSize,
            flashAttention,
            sampling,
            reasoningBudget,
            thinkingEnabled,
            systemPrompt: machineContext ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "") : systemPrompt,
            turboQuant,
        };

        if (!isModelLoaded) {
            let defaultModel: ModelConfig | null = null;
            try {
                defaultModel = await invoke<ModelConfig | null>("get_default_model");
            } catch (e) {
                console.error("[ChatWindow] get_default_model failed", e);
            }
            if (!defaultModel) {
                setAutoLoadError('Aucun modèle chargé. Va dans "Modèles" pour en configurer un par défaut.');
                return;
            }
            try {
                const metadata = await inspectModelMetadata(defaultModel.path).catch(() => undefined);
                const savedSampling = parseSamplingJson(defaultModel.sampling_json);
                let runtimeConfig: ModelConfig = defaultModel;
                if (defaultModel.n_gpu_layers === 0 && defaultModel.threads <= 0) {
                    const hw = await invoke<HardwareInfo>("get_hardware_info");
                    const auto = autoConfigureFromHardware(hw, "balanced", metadata);
                    runtimeConfig = {
                        ...defaultModel,
                        context_window: auto.context_window,
                        turbo_quant: auto.turbo_quant,
                        n_gpu_layers: auto.n_gpu_layers,
                        threads: auto.threads,
                    };
                }
                await loadModel({
                    modelPath: runtimeConfig.path,
                    temperature: runtimeConfig.temperature,
                    contextWindow: runtimeConfig.context_window,
                    evalBatchSize: runtimeConfig.eval_batch_size,
                    flashAttention: runtimeConfig.flash_attention,
                    systemPrompt: runtimeConfig.system_prompt,
                    turboQuant: runtimeConfig.turbo_quant as TurboQuantType,
                    mmprojPath: runtimeConfig.mmproj_path || undefined,
                    nGpuLayers: runtimeConfig.n_gpu_layers > 0 ? runtimeConfig.n_gpu_layers : undefined,
                    threads: runtimeConfig.threads > 0 ? runtimeConfig.threads : undefined,
                    reasoningBudget: runtimeConfig.reasoning_budget,
                    sampling: savedSampling,
                    ...((): DetectedTemplate => {
                        if (runtimeConfig.chat_template === "jinja") return { useJinja: true };
                        if (runtimeConfig.chat_template !== "") return { chatTemplate: runtimeConfig.chat_template };
                        return detectChatTemplate(runtimeConfig.path, metadata);
                    })(),
                });
                setIsModelLoaded(true);
                setLoadedModelPath(runtimeConfig.path);
                setModelPath(runtimeConfig.path);
                setTemperature(runtimeConfig.temperature);
                setContextWindow(runtimeConfig.context_window);
                setEvalBatchSize(runtimeConfig.eval_batch_size);
                setFlashAttention(runtimeConfig.flash_attention);
                setSystemPrompt(runtimeConfig.system_prompt);
                setTurboQuant(runtimeConfig.turbo_quant as TurboQuantType);
                setReasoningBudget(runtimeConfig.reasoning_budget);
                setThinkingEnabled(thinkingEnabled);
                effectiveConfig = {
                    modelPath: runtimeConfig.path,
                    temperature: runtimeConfig.temperature,
                    contextWindow: runtimeConfig.context_window,
                    evalBatchSize: runtimeConfig.eval_batch_size,
                    flashAttention: runtimeConfig.flash_attention,
                    systemPrompt: machineContext
                        ? machineContext + (runtimeConfig.system_prompt ? "\n\n" + runtimeConfig.system_prompt : "")
                        : runtimeConfig.system_prompt,
                    turboQuant: runtimeConfig.turbo_quant as TurboQuantType,
                    mmprojPath: runtimeConfig.mmproj_path || undefined,
                    nGpuLayers: runtimeConfig.n_gpu_layers > 0 ? runtimeConfig.n_gpu_layers : undefined,
                    threads: runtimeConfig.threads > 0 ? runtimeConfig.threads : undefined,
                    reasoningBudget: runtimeConfig.reasoning_budget,
                    sampling: savedSampling,
                    thinkingEnabled,
                };
            } catch (e: unknown) {
                setAutoLoadError(`Impossible de charger le modèle par défaut : ${(e as Error)?.message ?? String(e)}`);
                return;
            }
        }

        try {
            const ragDocIds = attachments.filter((a) => a.docId != null).map((a) => a.docId as number);
            let finalAttachments: Attachment[] | undefined = attachments.length > 0 ? attachments : undefined;

            if (ragDocIds.length > 0 && prompt.trim()) {
                const chunkLimit = Math.max(3, Math.min(40, Math.floor((contextWindow - 1200) / 450)));
                const ragContext = await retrieveChunks(prompt, ragDocIds, chunkLimit);
                const nonRagAtts = attachments.filter((a) => a.docId == null);
                const ragAtts = attachments.filter((a) => a.docId != null);
                const ragNames = ragAtts.map((a) => a.name).join(", ");
                const contextText =
                    ragContext ||
                    `[Erreur RAG] Le contenu de "${ragNames}" n'a pas pu être extrait. Détache et re-joint le fichier.`;
                const ragAtt: Attachment = { name: ragNames, mimeType: "text/plain", text: contextText };
                finalAttachments = [...nonRagAtts, ragAtt];
            }

            lastToolSignatureRef.current = null;
            lastToolWasErrorRef.current = false;
            if (conversationId) {
                invoke("save_message", { conversationId, role: "user", content: prompt }).catch(() => {});
            }
            if (!convTitleSetRef.current) {
                const titleInstr =
                    "\n\n[TITRE CONVERSATION — instruction système, invisible pour l'utilisateur]\nSur ton PREMIER message uniquement, place cette balise AVANT ta réponse : <conv_title>Titre 4-6 mots</conv_title>\nIMPORTANT : la balise et ta réponse complète doivent être dans le MÊME message.\nFormat attendu : <conv_title>Aide rédaction article</conv_title>\nAprès la balise, réponds normalement à la demande actuelle.\nN'utilise plus jamais cette balise après ce premier message.";
                effectiveConfig = {
                    ...effectiveConfig,
                    systemPrompt: (effectiveConfig.systemPrompt ?? "") + titleInstr,
                };
            }
            const actionKeywords =
                /crée|créer|lance|lancer|installe|installer|exécute|exécuter|fais|faire|génère|générer|ouvre|ouvrir|copie|déplace|supprime|écris|écrire|démarre|démarrer|setup|init|configure|build|compile|run|make|create|start/i;
            let effectivePrompt = actionKeywords.test(prompt)
                ? `${prompt}\n\n[RAPPEL SYSTÈME: exécute IMMÉDIATEMENT avec <tool>{"cmd":"..."}</tool> ou <tool>{"write_file":"..."}</tool>. Première réponse = un <tool>, pas du texte.]`
                : prompt;
            if (projectStructureRef.current.trim()) {
                effectiveConfig = {
                    ...effectiveConfig,
                    systemPrompt:
                        (effectiveConfig.systemPrompt ?? "") +
                        `\n\n=== STRUCTURE DU PROJET (mémorisée) ===\n${projectStructureRef.current}\n=== FIN STRUCTURE ===`,
                };
            }
            if (isResumingConv) {
                effectivePrompt = `[REPRISE DE CONVERSATION — Lis attentivement l'historique ci-dessus avant de répondre. Tiens compte de tout ce qui a été dit, des fichiers créés, des décisions prises et du contexte du projet.]\n\n${effectivePrompt}`;
                setIsResumingConv(false);
            }
            await sendPrompt(effectivePrompt, effectiveConfig, finalAttachments, true);
            setPrompt("");
            setAttachments([]);
            if (textareaRef.current) textareaRef.current.style.height = "auto";
        } catch (error) {
            console.error(error);
        }
    };

    const handleToggleThinking = async () => {
        const nextThinkingEnabled = !thinkingEnabled;
        setThinkingEnabled(nextThinkingEnabled);

        if (!isModelLoaded || !loadedModelPath) {
            return;
        }

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
        } catch (error) {
            console.error("[ChatWindow] handleToggleThinking reload failed", error);
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
        } catch (e) {
            console.error(e);
        }
    };

    const handleMic = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.lang = "fr-FR";
        rec.continuous = false;
        rec.interimResults = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (e: any) => {
            const transcript = (e.results[0][0].transcript as string).trim();
            setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
            setIsListening(false);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        recognitionRef.current = rec;
        rec.start();
        setIsListening(true);
    };

    const handleStopModel = async () => {
        await stopModel();
        setIsModelLoaded(false);
        setLoadedModelPath(null);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden">
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
                        window.speechSynthesis?.cancel();
                        setIsSpeaking(false);
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
                            />
                        ))
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
                isContextReady={isContextReady}
                handleFileSelect={handleFileSelect}
                isListening={isListening}
                onToggleMic={handleMic}
                thinkingEnabled={thinkingEnabled}
                onToggleThinking={handleToggleThinking}
                deepThinkingEnabled={deepThinkingEnabled}
                onToggleDeepThinking={toggleDeepThinking}
                loading={loading}
                streaming={streaming}
                onCancelGeneration={cancelGeneration}
                error={error}
                autoLoadError={autoLoadError}
            />
        </div>
    );
}
