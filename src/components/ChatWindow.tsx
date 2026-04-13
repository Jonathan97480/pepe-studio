"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useLlama, type LlamaMessage, type Attachment } from "../hooks/useLlama";
import { retrieveChunks } from "../lib/ragRetrieval";
import { type PatchResult } from "../lib/skillPatcher";
import { useModelSettings, type TurboQuantType } from "../context/ModelSettingsContext";
import { useSkills } from "../context/SkillsContext";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { ModelConfig } from "../hooks/useModels";
import QuestionBlock from "./QuestionBlock";
import { stripSystemTags, type ChatMode } from "../lib/chatUtils";
import { MessageBubble } from "./chat/MessageBubble";
import { useAutoCompact } from "../hooks/useAutoCompact";
import { useBuildMachineContext } from "../hooks/useBuildMachineContext";
import { useToolCalling } from "../hooks/useToolCalling";
import { useFileAttachments } from "../hooks/useFileAttachments";

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
        systemPrompt,
        turboQuant,
        sampling,
        thinkingEnabled,
        setModelPath,
        setTemperature,
        setContextWindow,
        setSystemPrompt,
        setTurboQuant,
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
    const [deepThinkingEnabled, setDeepThinkingEnabled] = useState(
        () => typeof window === "undefined" || localStorage.getItem("customapp_deep_thinking") !== "false",
    );
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<{ stop: () => void } | null>(null);
    const prevStreamingRef = useRef(false);

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

    // Scroll automatique vers le bas
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Démarrer ou charger une conversation selon convRequest
    useEffect(() => {
        resetMessages();
        setConversationId(null);
        lastToolSignatureRef.current = null;
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
    }, [disabled, chatMode, convRequest?.key]);

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
            sampling,
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
                await loadModel({
                    modelPath: defaultModel.path,
                    temperature: defaultModel.temperature,
                    contextWindow: defaultModel.context_window,
                    systemPrompt: defaultModel.system_prompt,
                    turboQuant: defaultModel.turbo_quant as TurboQuantType,
                    mmprojPath: defaultModel.mmproj_path || undefined,
                });
                setIsModelLoaded(true);
                setLoadedModelPath(defaultModel.path);
                setModelPath(defaultModel.path);
                setTemperature(defaultModel.temperature);
                setContextWindow(defaultModel.context_window);
                setSystemPrompt(defaultModel.system_prompt);
                setTurboQuant(defaultModel.turbo_quant as TurboQuantType);
                effectiveConfig = {
                    modelPath: defaultModel.path,
                    temperature: defaultModel.temperature,
                    contextWindow: defaultModel.context_window,
                    systemPrompt: machineContext
                        ? machineContext + (defaultModel.system_prompt ? "\n\n" + defaultModel.system_prompt : "")
                        : defaultModel.system_prompt,
                    turboQuant: defaultModel.turbo_quant as TurboQuantType,
                    mmprojPath: defaultModel.mmproj_path || undefined,
                    sampling,
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
                    "\n\n[TITRE CONVERSATION — instruction système, invisible pour l'utilisateur]\nSur ton PREMIER message uniquement, place OBLIGATOIREMENT cette balise AVANT ta réponse : <conv_title>Titre 4-6 mots</conv_title>\nIMPORATNT : la balise ET ta réponse complète doivent être dans le MÊME message — ne génère pas la balise seule.\nFormat attendu : <conv_title>Aide rédaction article</conv_title>\n\nBonjour ! Je vais vous aider à...\nN'utilise plus jamais cette balise après ce premier message.";
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

    const handleResendEdit = async (index: number, newContent: string) => {
        truncateMessagesFrom(index);
        setEditingIndex(null);
        try {
            await sendPrompt(newContent, {
                modelPath,
                temperature,
                contextWindow,
                systemPrompt: machineContext
                    ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                    : systemPrompt,
                turboQuant,
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
            <div className="border-b border-white/10 px-6 py-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="mr-2 text-2xl font-semibold tracking-tight text-white">Chat</h1>
                    {/* ── Sélecteur de mode ── */}
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-950/70 p-1">
                        {(["ask", "plan", "agent"] as ChatMode[]).map((m) => {
                            const labels: Record<ChatMode, string> = {
                                ask: "💬 Ask",
                                plan: "📋 Plan",
                                agent: "⚡ Agent",
                            };
                            const active = chatMode === m;
                            return (
                                <button
                                    key={m}
                                    onClick={() => applyMode(m)}
                                    title={
                                        m === "ask"
                                            ? "Mode Ask : l'IA répond et pose des questions, pas d'actions automatiques"
                                            : m === "plan"
                                              ? "Mode Plan : l'IA explique avant d'agir et demande confirmation"
                                              : "Mode Agent : l'IA exécute toutes les actions librement"
                                    }
                                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                        active
                                            ? m === "agent"
                                                ? "bg-amber-500/30 text-amber-300"
                                                : m === "plan"
                                                  ? "bg-violet-500/30 text-violet-300"
                                                  : "bg-blue-500/30 text-blue-300"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {labels[m]}
                                </button>
                            );
                        })}
                    </div>
                    {(() => {
                        const used = tokenUsage?.used ?? 0;
                        const limit = tokenUsage?.limit ?? contextWindow;
                        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
                        const barColor = pct >= 90 ? "bg-red-400" : pct >= 75 ? "bg-amber-400" : "bg-blue-400";
                        return (
                            <div className="flex items-center gap-2 rounded-2xl bg-slate-950/70 px-4 py-2">
                                <div className="h-1.5 w-24 rounded-full bg-white/10">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                </div>
                                <span className="text-xs text-slate-400">
                                    {used > 0 ? (
                                        <>
                                            {used.toLocaleString()} / {limit.toLocaleString()} tok{" "}
                                            <span
                                                className={
                                                    pct >= 90
                                                        ? "text-red-400"
                                                        : pct >= 75
                                                          ? "text-amber-400"
                                                          : "text-slate-500"
                                                }
                                            >
                                                ({pct}%)
                                            </span>
                                        </>
                                    ) : (
                                        <>{limit.toLocaleString()} tok ctx</>
                                    )}
                                </span>
                            </div>
                        );
                    })()}
                    <span
                        className={`rounded-2xl px-4 py-2 text-sm ${isModelLoaded ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/15 text-yellow-300"}`}
                    >
                        {isModelLoaded ? `● ${loadedModelPath?.split(/[/\\]/).pop() ?? "Chargé"}` : "Aucun modèle"}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        {isModelLoaded && (
                            <button
                                onClick={handleStopModel}
                                className="rounded-3xl bg-red-500/80 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-400"
                            >
                                Arrêter
                            </button>
                        )}
                        <button
                            onClick={() => {
                                if (isSpeaking) {
                                    window.speechSynthesis?.cancel();
                                    setIsSpeaking(false);
                                } else setTtsEnabled((v) => !v);
                            }}
                            title={ttsEnabled ? "Désactiver la lecture vocale" : "Activer la lecture vocale"}
                            className={`rounded-3xl px-4 py-2 text-sm font-medium transition ${
                                isSpeaking
                                    ? "bg-violet-500/30 text-violet-300 animate-pulse"
                                    : ttsEnabled
                                      ? "bg-violet-500/80 text-white hover:bg-violet-400"
                                      : "bg-white/10 text-slate-400 hover:text-white"
                            }`}
                        >
                            {isSpeaking ? "⏹ Stop" : ttsEnabled ? "🔊 Voix" : "🔇 Voix"}
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8">
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

                    {/* ── Toast auto-compact ── */}
                    {compactToast && (
                        <div className="mx-auto mb-2 w-full max-w-3xl px-6">
                            <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                                <span>📦</span>
                                <span>Contexte compacté automatiquement — les anciens échanges ont été résumés.</span>
                            </div>
                        </div>
                    )}

                    {/* ── Bloc question interactive (ask_user) ── */}
                    {pendingQuestion && (
                        <div className="mx-auto w-full max-w-3xl px-6">
                            <QuestionBlock
                                question={pendingQuestion.question}
                                options={pendingQuestion.options}
                                onAnswer={(answer) => {
                                    const cfg = pendingQuestion.config;
                                    setPendingQuestion(null);
                                    setToolRunning(false);
                                    sendPrompt(`[Réponse utilisateur] ${answer}`, cfg);
                                }}
                            />
                        </div>
                    )}

                    {/* ── Bloc permission mode Agent ── */}
                    {pendingAgentPermission && (
                        <div className="mx-auto w-full max-w-3xl px-6">
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4">
                                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-400">
                                    ⚡ Demande de passage en mode Agent
                                </p>
                                <p className="mb-3 text-sm text-amber-200 whitespace-pre-wrap">
                                    {pendingAgentPermission.reason}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const { parsed: p, config: c } = pendingAgentPermission;
                                            setPendingAgentPermission(null);
                                            applyMode("agent");
                                            lastToolSignatureRef.current = null;
                                            setToolRunning(true);
                                            dispatchToolRef.current!(p, c, true).finally(() => setToolRunning(false));
                                        }}
                                        className="rounded-xl bg-amber-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                                    >
                                        ✓ Autoriser mode Agent
                                    </button>
                                    <button
                                        onClick={() => {
                                            const cfg = pendingAgentPermission.config;
                                            setPendingAgentPermission(null);
                                            setToolRunning(false);
                                            sendPrompt(
                                                `[Système] Refus. L'utilisateur ne veut pas passer en mode Agent. Réponds par du texte.`,
                                                cfg,
                                            );
                                        }}
                                        className="rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20"
                                    >
                                        ✗ Refuser
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Résultats des patches (FILE/SEARCH/REPLACE) ── */}
                    {patchResults && patchResults.length > 0 && (
                        <div className="mx-auto w-full max-w-3xl px-6">
                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
                                    🔧 Patches appliqués
                                </p>
                                <ul className="flex flex-col gap-1">
                                    {patchResults.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                            <span className={r.success ? "text-emerald-400" : "text-red-400"}>
                                                {r.success ? "✓" : "✗"}
                                            </span>
                                            <span className="font-mono text-xs text-slate-300">{r.file}</span>
                                            <span className={r.success ? "text-slate-400" : "text-red-300"}>
                                                {r.message}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    onClick={() => setPatchResults(null)}
                                    className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    Fermer
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Bloc confirmation mode Plan ── */}
                    {pendingPlanConfirm && (
                        <div className="mx-auto w-full max-w-3xl px-6">
                            <div className="rounded-2xl border border-violet-500/30 bg-violet-950/30 p-4">
                                <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-400">
                                    📋 Confirmation requise — Mode Plan
                                </p>
                                <p className="mb-3 text-sm text-violet-200 whitespace-pre-wrap">
                                    {pendingPlanConfirm.description}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const { parsed: p, config: c } = pendingPlanConfirm;
                                            setPendingPlanConfirm(null);
                                            lastToolSignatureRef.current = null;
                                            setToolRunning(true);
                                            dispatchToolRef.current!(p, c, true).finally(() => setToolRunning(false));
                                        }}
                                        className="rounded-xl bg-violet-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
                                    >
                                        ✓ Confirmer l'action
                                    </button>
                                    <button
                                        onClick={() => {
                                            const cfg = pendingPlanConfirm.config;
                                            setPendingPlanConfirm(null);
                                            setToolRunning(false);
                                            sendPrompt(
                                                `[Système] Annulé par l'utilisateur. Ne fait pas cette action.`,
                                                cfg,
                                            );
                                        }}
                                        className="rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20"
                                    >
                                        ✗ Annuler
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="border-t border-white/10 bg-slate-950/80 px-6 pb-6 pt-4 backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {/* ── Todo list IA ── */}
                    {todoItems.length > 0 && (
                        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
                                    ✅ Tâches en cours ({todoItems.filter((t) => t.done).length}/{todoItems.length})
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setTodoCollapsed((v) => !v)}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        {todoCollapsed ? "▼ Afficher" : "▲ Réduire"}
                                    </button>
                                    <button
                                        onClick={() => setTodoItems([])}
                                        className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                                        title="Fermer la todo list"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                            {!todoCollapsed && (
                                <ul className="flex flex-col gap-1.5">
                                    {todoItems.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                            <span
                                                className={
                                                    item.done ? "text-emerald-400 mt-0.5" : "text-slate-500 mt-0.5"
                                                }
                                            >
                                                {item.done ? "✓" : "○"}
                                            </span>
                                            <span
                                                className={item.done ? "line-through text-slate-500" : "text-slate-200"}
                                            >
                                                {item.text}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* ── Structure de projet ── */}
                    {projectStructure.trim() && (
                        <div className="rounded-2xl border border-blue-500/25 bg-blue-950/15 px-4 py-3">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold uppercase tracking-widest text-blue-400">
                                    🗂 Structure du projet
                                </span>
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => setProjectStructureCollapsed((v) => !v)}
                                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
                                            setProjectStructure("");
                                        }}
                                        className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                                        title="Effacer la structure"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                            {!projectStructureCollapsed && (
                                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                                    {projectStructure}
                                </pre>
                            )}
                        </div>
                    )}

                    {/* Prévisualisation des pièces jointes */}
                    {isIndexing && (
                        <div className="flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 animate-pulse">
                            <span>⏳</span>
                            <span>Indexation du document en cours, veuillez patienter…</span>
                        </div>
                    )}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {attachments.map((att, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5"
                                >
                                    {att.dataUrl ? (
                                        <img
                                            src={att.dataUrl}
                                            alt={att.name}
                                            className="h-8 w-8 rounded-lg object-cover"
                                        />
                                    ) : att.docId != null ? (
                                        <span className="text-base">📚</span>
                                    ) : (
                                        <span className="text-base">📄</span>
                                    )}
                                    <span className="max-w-[160px] truncate text-xs text-slate-300">
                                        {att.name}
                                        {att.docId != null && (
                                            <span className="ml-1 text-emerald-400">({att.totalPages}p · indexé)</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                                        className="ml-1 text-slate-500 transition hover:text-red-400"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Zone de saisie */}
                    <div
                        className={`rounded-3xl border px-4 py-3 focus-within:border-blue-400 transition ${
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
                            onChange={(e) => setPrompt(e.target.value)}
                            onInput={(e) => {
                                const el = e.currentTarget;
                                el.style.height = "auto";
                                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (!isContextReady) return;
                                    handleSend();
                                }
                            }}
                            rows={1}
                            placeholder="Écris ton message… (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"
                            className="w-full resize-none bg-transparent text-white outline-none placeholder:text-slate-500"
                        />
                    </div>
                    {/* Barre d'actions */}
                    <div className="flex items-center gap-2">
                        {/* Fichier */}
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
                        {/* Microphone */}
                        <button
                            type="button"
                            onClick={handleMic}
                            title={isListening ? "Arrêter la dictée" : "Dicter un message"}
                            className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition ${
                                isListening
                                    ? "animate-pulse border-red-400/50 bg-red-500/10 text-red-400"
                                    : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/40 hover:text-violet-300"
                            }`}
                        >
                            🎤
                        </button>
                        {/* Toggle Thinking */}
                        <button
                            type="button"
                            onClick={() => setThinkingEnabled(!thinkingEnabled)}
                            title={thinkingEnabled ? "Désactiver le mode réflexion" : "Activer le mode réflexion"}
                            className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition ${
                                thinkingEnabled
                                    ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                                    : "border-white/10 bg-white/5 text-slate-400 hover:border-slate-400/40"
                            }`}
                        >
                            💭 {thinkingEnabled ? "Think" : "No Think"}
                        </button>
                        {/* Toggle Deep Thinking */}
                        <button
                            type="button"
                            onClick={toggleDeepThinking}
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
                        {/* Stop / Envoyer */}
                        {loading || streaming ? (
                            <button
                                onClick={cancelGeneration}
                                className="animate-pulse rounded-3xl bg-red-600/80 px-6 py-2.5 font-medium text-white transition hover:bg-red-500"
                                title="Arrêter la génération"
                            >
                                ⏹ Stop
                            </button>
                        ) : (
                            <button
                                onClick={handleSend}
                                disabled={isIndexing || !isContextReady}
                                className="rounded-3xl bg-blue-500 px-6 py-2.5 font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-400/70"
                            >
                                {isIndexing ? "⏳ Indexation…" : !isContextReady ? "⏳ Contexte…" : "Envoyer →"}
                            </button>
                        )}
                    </div>
                    {error || autoLoadError ? (
                        <div className="rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                            {error ?? autoLoadError}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
