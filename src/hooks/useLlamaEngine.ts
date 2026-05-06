import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { buildLlamaArgs, LlamaLaunchConfig } from "../lib/llamaWrapper";
import { Attachment, devError, devLog, getErrorMessage, LlamaMessage, safeInvoke } from "./useLlamaShared";
import { useLlamaEventListeners } from "./useLlamaEventListeners";
import { useLlamaSendPrompt } from "./useLlamaSendPrompt";

export type { Attachment, LlamaMessage };

export function useLlama() {
    const [messages, setMessages] = useState<LlamaMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [tokenUsage, setTokenUsage] = useState<{ used: number; limit: number } | null>(null);
    const streamingRef = useRef(false);
    const [currentPromptId, setCurrentPromptId] = useState<string | null>(null);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const currentPromptIdRef = useRef<string | null>(null);
    const activePromptIdRef = useRef<string | null>(null);
    const lastPromptIdRef = useRef<string | null>(null);
    const messagesRef = useRef<LlamaMessage[]>([]);
    const contextWindowRef = useRef<number>(4096);
    // Détection de boucle de répétition
    const streamBufferRef = useRef<string>("");
    const repetitionAbortedRef = useRef<boolean>(false);
    const assistantVisibleBufferRef = useRef<string>("");

    useEffect(() => {
        currentPromptIdRef.current = currentPromptId;
    }, [currentPromptId]);

    useEffect(() => {
        streamingRef.current = streaming;
    }, [streaming]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const debugLog = useCallback((message: string) => {
        setDebugLogs((current) => [...current.slice(-24), message]);
        devLog("[useLlama-debug]", message);
    }, []);

    const unlistenRef = useRef<{ stream?: UnlistenFn; done?: UnlistenFn; error?: UnlistenFn; usage?: UnlistenFn }>({});

    useLlamaEventListeners({
        debugLog,
        setMessages,
        setTokenUsage,
        setStreaming,
        setCurrentPromptId,
        setError,
        setLoading,
        unlistenRef,
        activePromptIdRef,
        lastPromptIdRef,
        currentPromptIdRef,
        streamingRef,
        contextWindowRef,
        streamBufferRef,
        repetitionAbortedRef,
        assistantVisibleBufferRef,
    });

    const loadModel = useCallback(async (config: LlamaLaunchConfig) => {
        setError(null);
        setLoading(true);
        devLog("[useLlama] loadModel", config);
        try {
            const args = buildLlamaArgs(config);
            const useTurboquantBinary =
                typeof window !== "undefined" && localStorage.getItem("llama_turboquant_enabled") === "true";
            const result = await safeInvoke<string>("start_llama", {
                modelPath: config.modelPath,
                params: args,
                useTurboquantBinary,
            });
            devLog("[useLlama] loadModel result", result);
        } catch (e: unknown) {
            devError("[useLlama] loadModel error", e);
            setError(getErrorMessage(e, "Erreur lors du chargement du modèle"));
        } finally {
            setLoading(false);
        }
    }, []);

    const stopModel = useCallback(async () => {
        setError(null);
        setLoading(true);
        try {
            await safeInvoke<string>("stop_llama");
        } catch (e: unknown) {
            setError(getErrorMessage(e, "Erreur lors de l'arrêt du modèle"));
        } finally {
            setLoading(false);
        }
    }, []);

    const sendPrompt = useLlamaSendPrompt({
        debugLog,
        setError,
        setLoading,
        setStreaming,
        setCurrentPromptId,
        setMessages,
        setTokenUsage,
        streamingRef,
        currentPromptIdRef,
        activePromptIdRef,
        lastPromptIdRef,
        messagesRef,
        contextWindowRef,
        streamBufferRef,
        repetitionAbortedRef,
        assistantVisibleBufferRef,
    });

    const deleteMessage = useCallback((index: number) => {
        setMessages((current) => {
            const next = [...current];
            // If the next message is from the assistant, delete it too
            const deleteCount = next[index + 1]?.role === "assistant" ? 2 : 1;
            next.splice(index, deleteCount);
            return next;
        });
    }, []);

    const truncateMessagesFrom = useCallback((index: number) => {
        setMessages((current) => current.slice(0, index));
    }, []);

    /** Ajoute immédiatement le message utilisateur dans le chat (avant les opérations async).
     *  Le message est marqué displayOnly=true pour ne pas apparaître dans l'historique API.
     *  sendPrompt(... , true) enlèvera displayOnly et enverra le vrai contenu à l'IA. */
    const pushUserMessage = useCallback((prompt: string, attachments?: Attachment[]) => {
        const imageAttachments = attachments?.filter((a) => a.dataUrl && a.mimeType.startsWith("image/")) ?? [];
        const textAttachments = attachments?.filter((a) => a.text) ?? [];
        const attachmentLabel = [...imageAttachments, ...textAttachments].map((a) => a.name).join(", ");
        const displayContent = attachmentLabel ? `${prompt}${prompt ? "\n" : ""}📎 ${attachmentLabel}` : prompt;
        setMessages((current) => [
            ...current,
            { role: "user" as const, content: displayContent, displayOnly: true },
            { role: "assistant" as const, content: "" },
        ]);
    }, []);

    const editMessage = useCallback((index: number, newContent: string) => {
        setMessages((current) => current.map((msg, i) => (i === index ? { ...msg, content: newContent } : msg)));
    }, []);

    /** Annule la génération en cours sans décharger llama.cpp.
     *  Les chunks en transit sont ignorés car leurs promptIds ne correspondent plus. */
    const cancelGeneration = useCallback(() => {
        if (!streamingRef.current) return;
        activePromptIdRef.current = null;
        currentPromptIdRef.current = null;
        setCurrentPromptId(null);
        setStreaming(false);
        setLoading(false);
        streamingRef.current = false;
        setMessages((current) => {
            const next = [...current];
            const lastMsg = next[next.length - 1];
            if (lastMsg?.role === "assistant") {
                next[next.length - 1] = {
                    ...lastMsg,
                    content: (lastMsg.content || "").trimEnd() + "\n\n*[Génération arrêtée]*",
                };
            }
            return next;
        });
    }, []);

    /** Réinitialise le chat : vide la liste ou charge des messages existants.
     *  Utilisé pour charger / créer une conversation. */
    const resetMessages = useCallback((msgs?: LlamaMessage[]) => {
        setMessages(msgs ?? []);
    }, []);

    /** Met à jour le contenu du dernier message assistant (ex: retirer un tag généré). */
    const updateLastAssistantContent = useCallback((content: string) => {
        setMessages((current) => {
            const next = [...current];
            const lastIdx = next.length - 1;
            if (next[lastIdx]?.role === "assistant") {
                next[lastIdx] = { ...next[lastIdx], content };
            }
            return next;
        });
    }, []);

    /** Insère un message dans le chat sans déclencher de génération LLM.
     *  Utile pour afficher des résultats d'outils (images, fichiers…) visibles
     *  dans l'UI mais exclus de l'historique API si displayOnly=true. */
    const insertMessage = useCallback((msg: LlamaMessage) => {
        setMessages((current) => [...current, msg]);
    }, []);

    return {
        messages,
        loading,
        error,
        streaming,
        tokenUsage,
        debugLogs,
        loadModel,
        stopModel,
        cancelGeneration,
        sendPrompt,
        pushUserMessage,
        deleteMessage,
        editMessage,
        truncateMessagesFrom,
        resetMessages,
        updateLastAssistantContent,
        insertMessage,
    };
}
