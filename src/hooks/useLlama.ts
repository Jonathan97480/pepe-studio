import { useCallback, useEffect, useRef, useState } from "react";
import { invoke as apiInvoke } from "@tauri-apps/api/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { buildLlamaArgs, LlamaLaunchConfig } from "../lib/llamaWrapper";

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type TauriWindowShape = {
    __TAURI__?: {
        invoke?: TauriInvoke;
        core?: { invoke?: TauriInvoke };
        tauri?: { invoke?: TauriInvoke };
    };
};
type LlamaApiImagePart = { type: "image_url"; image_url: { url: string } };
type LlamaApiTextPart = { type: "text"; text: string };
type LlamaApiContent = string | Array<LlamaApiTextPart | LlamaApiImagePart>;

const safeInvoke = async <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (typeof window === "undefined") {
        throw new Error(
            "Tauri invoke unavailable. Assure-toi de lancer l'application depuis le runtime Tauri, pas depuis le navigateur web.",
        );
    }

    const tauri = (window as TauriWindowShape).__TAURI__;
    console.log("[useLlama] safeInvoke", {
        cmd,
        args,
        hasWindow: true,
        hasTauri: !!tauri,
        hasTauriInvoke: typeof tauri?.invoke === "function",
        hasCoreInvoke: typeof tauri?.core?.invoke === "function",
        hasTauriTauriInvoke: typeof tauri?.tauri?.invoke === "function",
        tauriKeys: tauri ? Object.keys(tauri) : undefined,
        apiInvokeAvailable: typeof apiInvoke === "function",
    });

    if (typeof apiInvoke === "function") {
        try {
            return await apiInvoke(cmd, args);
        } catch (error) {
            console.error("[useLlama] apiInvoke failed", error);
            throw error;
        }
    }

    const tauriInvoke = tauri?.invoke ?? tauri?.core?.invoke ?? tauri?.tauri?.invoke;
    if (typeof tauriInvoke === "function") {
        try {
            return await tauriInvoke(cmd, args);
        } catch (error) {
            console.error("[useLlama] tauriInvoke failed", error);
            throw error;
        }
    }

    throw new Error(
        "Tauri invoke unavailable. Assure-toi de lancer l'application depuis le runtime Tauri, pas depuis le navigateur web.",
    );
};

export type LlamaMessage = {
    role: "user" | "assistant" | "system";
    content: string; // contenu d'affichage (peut contenir 📎 nom de fichier)
    apiContent?: LlamaApiContent; // contenu réel envoyé à l'API (inclut le texte des documents joints)
    thinking?: string;
    thinkingDone?: boolean;
    thinkingCollapsed?: boolean;
    thinkingFromTag?: boolean; // true si le bloc thinking vient de balises <think>...</think> (pas de is_thinking:true)
    meta?: string;
    displayOnly?: boolean; // true = affiché dans le chat mais exclu de l'historique API (message en attente)
    imageDataUrl?: string; // data URL base64 pour affichage direct d'une image générée
    imagePath?: string; // chemin disque de l'image générée pour rechargement/suppression
};

export type Attachment = {
    name: string;
    mimeType: string;
    dataUrl?: string; // data URL base64 pour les images (redimensionnées)
    text?: string; // contenu texte pour les fichiers non-image
    docId?: number; // id SQLite du document RAG indexé (PDF)
    totalPages?: number; // nombre de pages du document
};

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
        console.log("[useLlama-debug]", message);
    }, []);

    const normalizeVisibleAssistantText = useCallback((text: string): string => {
        return text
            .replace(/<tool>[\s\S]*?<\/tool>/gi, " ")
            .replace(/<patch_file[\s\S]*?<\/patch_file>/gi, " ")
            .replace(/<write_file[\s\S]*?<\/write_file>/gi, " ")
            .replace(/<think>[\s\S]*?<\/think>/gi, " ")
            .replace(/\[start thinking\]|\[end thinking\]/gi, " ")
            .replace(/<unused\d+>/g, " ")
            .replace(/[{}[\]<>`"\\/_|=:~]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }, []);

    const isCorruptedThinkingChunk = useCallback((text: string): boolean => {
        const trimmed = text.trim();
        if (!trimmed) return false;

        const visibleChars = Array.from(trimmed).filter((ch) => !/\s/.test(ch));
        if (visibleChars.length < 12) return false;

        const questionLikeCount = visibleChars.filter((ch) => ch === "?" || ch === "�" || ch === "\uFFFD").length;
        const alphaNumCount = visibleChars.filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
        const punctuationOnly = alphaNumCount === 0;
        const questionRatio = questionLikeCount / visibleChars.length;

        return punctuationOnly || (questionLikeCount >= 16 && questionRatio >= 0.55);
    }, []);

    /** Détecte si le texte assistant visible contient une vraie séquence répétée en boucle */
    const detectRepetitionLoop = useCallback(
        (buffer: string): boolean => {
            const normalized = normalizeVisibleAssistantText(buffer);
            if (normalized.length < 260) return false;
            const alphaChars = (normalized.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
            if (alphaChars < 180) return false;

            const tail = normalized.slice(-700);
            for (let len = 30; len <= 120; len++) {
                const pattern = tail.slice(-len).trim();
                if (pattern.length < 24) continue;
                const wordCount = pattern.split(/\s+/).filter(Boolean).length;
                if (wordCount < 4) continue;

                let count = 0;
                let pos = tail.length - len;
                while (pos >= 0) {
                    const segment = tail.slice(pos, pos + len).trim();
                    if (segment === pattern) {
                        count++;
                        pos -= len;
                    } else {
                        break;
                    }
                }
                if (count >= 4) return true;
            }
            return false;
        },
        [normalizeVisibleAssistantText],
    );

    const unlistenRef = useRef<{ stream?: UnlistenFn; done?: UnlistenFn; error?: UnlistenFn; usage?: UnlistenFn }>({});

    useEffect(() => {
        let cancelled = false;
        let unlistenStream: UnlistenFn | null = null;
        let unlistenDone: UnlistenFn | null = null;
        let unlistenError: UnlistenFn | null = null;
        let unlistenUsage: UnlistenFn | null = null;

        const initListeners = async () => {
            if (typeof window === "undefined") {
                debugLog("initListeners skipped: no window");
                return;
            }
            debugLog("initListeners start");
            try {
                unlistenStream = await listen("llama-stream", (event) => {
                    const payload = event.payload as { prompt_id: string; chunk: string; is_thinking?: boolean };
                    const activePromptId = activePromptIdRef.current;
                    const lastPromptId = lastPromptIdRef.current;
                    const activeStreaming = streamingRef.current;
                    debugLog(
                        `llama-stream event prompt_id=${payload.prompt_id} chunk=${payload.chunk} is_thinking=${payload.is_thinking} activePromptId=${activePromptId} lastPromptId=${lastPromptId} activeStreaming=${activeStreaming}`,
                    );
                    console.log("[useLlama] llama-stream event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-stream ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        console.log("[useLlama] llama-stream ignored due to prompt id mismatch", {
                            payloadPromptId: payload.prompt_id,
                            currentPromptId: activePromptId,
                            lastPromptId: lastPromptId,
                        });
                        return;
                    }

                    // ── Détection de boucle de répétition ────────────────────────
                    streamBufferRef.current += payload.chunk;
                    if (streamBufferRef.current.length > 2000) {
                        streamBufferRef.current = streamBufferRef.current.slice(-1600);
                    }

                    const visibleChunk = normalizeVisibleAssistantText(payload.chunk);
                    if (visibleChunk) {
                        assistantVisibleBufferRef.current += ` ${visibleChunk}`;
                        if (assistantVisibleBufferRef.current.length > 2000) {
                            assistantVisibleBufferRef.current = assistantVisibleBufferRef.current.slice(-1600);
                        }
                    }

                    if (
                        !repetitionAbortedRef.current &&
                        !/<tool>|<patch_file|<write_file/i.test(payload.chunk) &&
                        detectRepetitionLoop(assistantVisibleBufferRef.current)
                    ) {
                        console.warn("[useLlama] Boucle de répétition détectée — arrêt du stream");
                        debugLog("⚠ Boucle de répétition détectée — arrêt du stream");
                        repetitionAbortedRef.current = true;
                        // Tronquer le contenu répétitif du dernier message
                        setMessages((current) => {
                            const next = [...current];
                            const lastMsg = next[next.length - 1];
                            if (lastMsg?.role === "assistant") {
                                next[next.length - 1] = {
                                    ...lastMsg,
                                    content:
                                        lastMsg.content +
                                        "\n\n⚠️ *Génération interrompue — boucle de répétition détectée.*",
                                };
                            }
                            return next;
                        });
                        setStreaming(false);
                        setCurrentPromptId(null);
                        return;
                    }
                    // Si déjà aborté, ignorer les chunks restants
                    if (repetitionAbortedRef.current) return;

                    setMessages((current) => {
                        const next = [...current];
                        const last = next[next.length - 1] as LlamaMessage | undefined;
                        const rawChunkText = payload.chunk;
                        const isThinking = payload.is_thinking === true;
                        if (isThinking && isCorruptedThinkingChunk(rawChunkText)) {
                            debugLog(`thinking chunk ignored as corrupted: ${rawChunkText.slice(0, 80)}`);
                            return next;
                        }
                        const chunkText = rawChunkText;

                        // Fallback : détecter les marqueurs anciens dans content (ex: modèles sans reasoning_content)
                        const markerRegex = /\[end thinking\]/i;
                        const markerMatch = !isThinking ? markerRegex.exec(chunkText) : null;
                        const startMarkerRegex = /\[start thinking\]/i;
                        const startMarkerMatch = !isThinking ? startMarkerRegex.exec(chunkText) : null;

                        // Détecter les balises <think>...</think> (DeepSeek R1, Qwen3, et petits modèles qui génèrent leur réflexion en clair)
                        const thinkOpenRegex = /<think>/i;
                        const thinkCloseRegex = /<\/think>/i;
                        const thinkOpenMatch = !isThinking ? thinkOpenRegex.exec(chunkText) : null;
                        const thinkCloseMatch = !isThinking ? thinkCloseRegex.exec(chunkText) : null;

                        const stripThinkingMarkers = (text: string) =>
                            text
                                .replace(/\[end thinking\]/gi, "")
                                .replace(/\[start thinking\]/gi, "")
                                .trim();
                        const cleanChunk = (text: string) => {
                            return (
                                text
                                    .replace(/\[end thinking\]/gi, "")
                                    .replace(/\[start thinking\]/gi, "")
                                    .replace(/<think>/gi, "")
                                    .replace(/<\/think>/gi, "")
                                    .replace(/<unused\d+>/g, "")
                                    // Normaliser les variantes de tool call (Gemma 4: <|tool_call>tool>, etc.)
                                    .replace(/<\|tool_call\|?>(?:\w*>)?/gi, "<tool>")
                                    .replace(/<\|?\/?tool_call\|?>/gi, "</tool>")
                            );
                        };

                        const mergeStreamingChunks = (existing: string, incoming: string) => {
                            return existing + incoming;
                        };

                        const appendToContent = (message: LlamaMessage, text: string) => {
                            const cleanText = cleanChunk(text);
                            return {
                                ...message,
                                content: mergeStreamingChunks(message.content, cleanText),
                            };
                        };

                        const appendToThinking = (message: LlamaMessage, text: string) => ({
                            ...message,
                            thinking:
                                message.thinking !== undefined ? message.thinking + text : stripThinkingMarkers(text),
                        });

                        if (last && last.role === "assistant") {
                            let updatedLast: LlamaMessage = { ...last };

                            if (isThinking) {
                                // Chunk de réflexion provenant de reasoning_content
                                // Si la réflexion n'a pas encore commencé, on l'ouvre
                                if (!updatedLast.thinkingDone) {
                                    updatedLast = appendToThinking(updatedLast, chunkText);
                                }
                                // Si thinkingDone=true (ne devrait pas arriver), on ignore
                            } else if (
                                thinkCloseMatch &&
                                updatedLast.thinking !== undefined &&
                                !updatedLast.thinkingDone
                            ) {
                                // </think> : fin du bloc de réflexion
                                const before = chunkText.slice(0, thinkCloseMatch.index ?? 0);
                                const after = chunkText.slice((thinkCloseMatch.index ?? 0) + thinkCloseMatch[0].length);
                                if (before) updatedLast = appendToThinking(updatedLast, before);
                                updatedLast = {
                                    ...updatedLast,
                                    thinkingDone: true,
                                    thinkingCollapsed: true,
                                };
                                if (after.trim()) updatedLast = appendToContent(updatedLast, after);
                            } else if (
                                thinkOpenMatch &&
                                !updatedLast.thinkingDone &&
                                updatedLast.thinking === undefined
                            ) {
                                // <think> : début du bloc de réflexion
                                const before = cleanChunk(chunkText.slice(0, thinkOpenMatch.index ?? 0));
                                const after = chunkText.slice((thinkOpenMatch.index ?? 0) + thinkOpenMatch[0].length);
                                if (before.trim()) updatedLast = appendToContent(updatedLast, before);
                                updatedLast = { ...updatedLast, thinking: after, thinkingFromTag: true };
                            } else if (
                                updatedLast.thinking !== undefined &&
                                !updatedLast.thinkingDone &&
                                updatedLast.thinkingFromTag
                            ) {
                                // Chunk intermédiaire à l'intérieur d'un bloc <think>...</think> explicite
                                // NOTE: ne pas utiliser ce chemin pour is_thinking:true → la transition vers is_thinking:false
                                // doit passer par le else ci-dessous pour fermer le bloc
                                updatedLast = appendToThinking(updatedLast, chunkText);
                            } else if (markerMatch) {
                                // Fallback: [end thinking] dans content
                                const markerStart = markerMatch.index ?? 0;
                                const before = chunkText.slice(0, markerStart);
                                const after = cleanChunk(chunkText.slice(markerStart + markerMatch[0].length));
                                updatedLast = appendToThinking(updatedLast, before);
                                updatedLast = {
                                    ...updatedLast,
                                    thinkingDone: true,
                                    thinkingCollapsed: true,
                                };
                                updatedLast = appendToContent(updatedLast, after);
                            } else if (startMarkerMatch && !last.thinkingDone && last.thinking === undefined) {
                                // Fallback: [Start thinking] dans content
                                const before = cleanChunk(chunkText.slice(0, startMarkerMatch.index ?? 0));
                                const after = chunkText
                                    .slice((startMarkerMatch.index ?? 0) + startMarkerMatch[0].length)
                                    .trimStart();
                                if (before) updatedLast = appendToContent(updatedLast, before);
                                updatedLast = { ...updatedLast, thinking: after };
                            } else {
                                // Contenu normal
                                // Si on avait du thinking via is_thinking:true et qu'on reçoit is_thinking:false → clore le thinking
                                if (updatedLast.thinking !== undefined && !updatedLast.thinkingDone) {
                                    updatedLast = {
                                        ...updatedLast,
                                        thinkingDone: true,
                                        thinkingCollapsed: true,
                                    };
                                }
                                updatedLast = appendToContent(updatedLast, chunkText);
                            }
                            next[next.length - 1] = updatedLast;
                            return next;
                        }

                        // Nouveau message assistant
                        const newMessage: LlamaMessage = {
                            role: "assistant",
                            content: isThinking
                                ? ""
                                : thinkOpenMatch
                                  ? cleanChunk(chunkText.slice(0, thinkOpenMatch.index ?? 0))
                                  : markerMatch
                                    ? cleanChunk(chunkText.slice((markerMatch.index ?? 0) + markerMatch[0].length))
                                    : chunkText,
                            thinking: isThinking
                                ? chunkText
                                : thinkOpenMatch
                                  ? chunkText.slice((thinkOpenMatch.index ?? 0) + thinkOpenMatch[0].length)
                                  : markerMatch
                                    ? stripThinkingMarkers(chunkText.slice(0, markerMatch.index ?? 0))
                                    : undefined,
                            thinkingDone: !isThinking && (!!markerMatch || !!thinkCloseMatch),
                            thinkingCollapsed: !isThinking && (!!markerMatch || !!thinkCloseMatch),
                            thinkingFromTag: !!thinkOpenMatch,
                        };

                        const newMessages: LlamaMessage[] = [...current, newMessage];
                        console.log("[useLlama] appended new assistant chunk", newMessages);
                        return newMessages;
                    });
                });
                debugLog("llama-stream listener registered");

                unlistenDone = await listen("llama-done", (event) => {
                    const payload = event.payload as {
                        prompt_id: string;
                        done: boolean;
                        meta?: string | null;
                        prompt_tokens?: number | null;
                    };
                    const activePromptId = activePromptIdRef.current;
                    const lastPromptId = lastPromptIdRef.current;
                    const activeStreaming = streamingRef.current;
                    debugLog(
                        `llama-done event prompt_id=${payload.prompt_id} done=${payload.done} meta=${payload.meta} activePromptId=${activePromptId} lastPromptId=${lastPromptId} activeStreaming=${activeStreaming}`,
                    );
                    console.log("[useLlama] llama-done event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-done ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        console.log("[useLlama] llama-done ignored due to prompt id mismatch", {
                            payloadPromptId: payload.prompt_id,
                            currentPromptId: activePromptId,
                            lastPromptId: lastPromptId,
                        });
                        return;
                    }
                    // Appliquer les timings sur le dernier message assistant
                    if (payload.meta) {
                        setMessages((current) => {
                            const next = [...current];
                            const last = next[next.length - 1];
                            if (last?.role === "assistant") {
                                next[next.length - 1] = { ...last, meta: payload.meta as string };
                            }
                            return next;
                        });
                    }
                    // Mettre à jour l'usage tokens si disponible (raffinement avec vraie valeur)
                    if (payload.prompt_tokens != null && payload.prompt_tokens > 0) {
                        setTokenUsage((prev) => ({
                            used: payload.prompt_tokens as number,
                            limit: prev?.limit ?? contextWindowRef.current ?? 4096,
                        }));
                    }
                    setStreaming(false);
                    streamingRef.current = false;
                    setCurrentPromptId(null);
                    currentPromptIdRef.current = null;
                    activePromptIdRef.current = null;
                    debugLog(`llama-done cleared active prompt, lastPromptId remains=${lastPromptIdRef.current}`);
                    setLoading(false);
                });
                console.log("[useLlama] llama-done listener registered");

                unlistenError = await listen("llama-error", (event) => {
                    const payload = event.payload as { prompt_id: string; error: string };
                    const activePromptId = activePromptIdRef.current;
                    const lastPromptId = lastPromptIdRef.current;
                    const activeStreaming = streamingRef.current;
                    debugLog(
                        `llama-error event prompt_id=${payload.prompt_id} error=${payload.error} activePromptId=${activePromptId} lastPromptId=${lastPromptId} activeStreaming=${activeStreaming}`,
                    );
                    console.log("[useLlama] llama-error event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-error ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        console.log("[useLlama] llama-error ignored due to prompt id mismatch", {
                            payloadPromptId: payload.prompt_id,
                            currentPromptId: activePromptId,
                            lastPromptId: lastPromptId,
                        });
                        return;
                    }
                    setError(payload.error);
                    setStreaming(false);
                    streamingRef.current = false;
                    setCurrentPromptId(null);
                    currentPromptIdRef.current = null;
                    activePromptIdRef.current = null;
                    debugLog(`llama-error cleared active prompt, lastPromptId remains=${lastPromptIdRef.current}`);
                    setLoading(false);
                });
                console.log("[useLlama] llama-error listener registered");

                unlistenUsage = await listen("llama-usage", (event) => {
                    const payload = event.payload as { prompt_id: string; prompt_tokens?: number | null };
                    if (payload.prompt_tokens != null && payload.prompt_tokens > 0) {
                        setTokenUsage((prev) => ({
                            used: payload.prompt_tokens as number,
                            limit: prev?.limit ?? contextWindowRef.current ?? 4096,
                        }));
                    }
                });

                // Si la cleanup a déjà été appelée pendant l'attente async, on unlisten immédiatement
                if (cancelled) {
                    unlistenStream?.();
                    unlistenDone?.();
                    unlistenError?.();
                    unlistenUsage?.();
                    return;
                }
                unlistenRef.current = {
                    stream: unlistenStream ?? undefined,
                    done: unlistenDone ?? undefined,
                    error: unlistenError ?? undefined,
                    usage: unlistenUsage ?? undefined,
                };
            } catch (err) {
                console.error("[useLlama] initListeners failed", err);
                debugLog(`initListeners failed: ${err}`);
            }
        };

        initListeners();

        return () => {
            cancelled = true;
            unlistenRef.current.stream?.();
            unlistenRef.current.done?.();
            unlistenRef.current.error?.();
            unlistenRef.current.usage?.();
            unlistenRef.current = {};
            unlistenStream?.();
            unlistenDone?.();
            unlistenError?.();
            unlistenUsage?.();
        };
    }, [debugLog, detectRepetitionLoop, isCorruptedThinkingChunk, normalizeVisibleAssistantText]);

    const loadModel = useCallback(async (config: LlamaLaunchConfig) => {
        setError(null);
        setLoading(true);
        console.log("[useLlama] loadModel", config);
        try {
            const args = buildLlamaArgs(config);
            const result = await safeInvoke<string>("start_llama", { modelPath: config.modelPath, params: args });
            console.log("[useLlama] loadModel result", result);
        } catch (e: unknown) {
            console.error("[useLlama] loadModel error", e);
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

    const sendPrompt = useCallback(
        async (
            prompt: string,
            params?: Partial<LlamaLaunchConfig>,
            attachments?: Attachment[],
            skipUserMessage?: boolean,
        ) => {
            setError(null);
            setLoading(true);
            setStreaming(true);
            streamingRef.current = true;
            // Réinitialiser la détection de boucle
            streamBufferRef.current = "";
            repetitionAbortedRef.current = false;
            assistantVisibleBufferRef.current = "";
            const promptId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            console.log("[useLlama] sendPrompt", { promptId, prompt, params });
            currentPromptIdRef.current = promptId;
            activePromptIdRef.current = promptId;
            lastPromptIdRef.current = promptId;
            debugLog(
                `sendPrompt assigned promptId=${promptId} activePromptId=${activePromptIdRef.current} lastPromptId=${lastPromptIdRef.current}`,
            );
            setCurrentPromptId(promptId);

            // Construire le contenu d'affichage (avec noms des pièces jointes)
            const imageAttachments = attachments?.filter((a) => a.dataUrl && a.mimeType.startsWith("image/")) ?? [];
            const textAttachments = attachments?.filter((a) => a.text) ?? [];
            const attachmentLabel = [...imageAttachments, ...textAttachments].map((a) => a.name).join(", ");
            const displayPrompt = attachmentLabel ? `${prompt}${prompt ? "\n" : ""}📎 ${attachmentLabel}` : prompt;

            if (!skipUserMessage) {
                setMessages((current) => {
                    const next: LlamaMessage[] = [
                        ...current,
                        { role: "user", content: displayPrompt },
                        { role: "assistant", content: "" },
                    ];
                    console.log("[useLlama] messages after sendPrompt", next);
                    return next;
                });
            } else {
                // Marquer le message utilisateur comme définitif (supprimer displayOnly)
                setMessages((current) => {
                    const next = [...current];
                    const userMsg = next[next.length - 2];
                    if (userMsg?.role === "user" && userMsg.displayOnly) {
                        next[next.length - 2] = { ...userMsg, displayOnly: undefined };
                    }
                    return next;
                });
            }

            // Pré-calculer le contenu API du message courant pour le stocker dans l'historique
            // (fait ici pour être disponible avant la construction de textParts ci-dessous)
            let pendingApiContent: LlamaApiContent | null = null; // sera assigné après la construction de newUserMsg

            try {
                const contextWindow = params?.contextWindow ?? 4096;
                contextWindowRef.current = contextWindow;
                // Mettre à jour la limite de tokens avec le contextWindow courant (toujours initialiser)
                setTokenUsage((prev) => ({ used: prev?.used ?? 0, limit: contextWindow }));

                // Construire l'historique complet des messages pour l'API
                // Utiliser apiContent si disponible (contient le texte des documents joints)
                const history = messagesRef.current
                    .filter((m) => !m.displayOnly && (m.content.trim() !== "" || m.role === "user")) // exclure assistants vides et messages displayOnly
                    .map((m) => ({ role: m.role, content: m.apiContent ?? m.content }));

                // Ajouter le system prompt si présent
                let systemMessage = params?.systemPrompt ? [{ role: "system", content: params.systemPrompt }] : [];

                // Contenu texte pour l'API : fichiers texte avec séparateurs texte neutres
                // (évite backticks qui cassent les .md, et balises XML qui bloquent certains modèles)
                const textParts: string[] = [];
                for (const ta of textAttachments) {
                    textParts.push(`===== FICHIER : ${ta.name} =====\n${ta.text}\n===== FIN DU FICHIER =====`);
                }
                textParts.push(prompt);
                const apiText = textParts.join("\n\n");

                // Contenu du nouveau message utilisateur (multimodal si images présentes)
                const newUserMsgContent: LlamaApiContent =
                    imageAttachments.length > 0
                        ? [
                              { type: "text", text: apiText },
                              ...imageAttachments.map(
                                  (a): LlamaApiImagePart => ({
                                      type: "image_url",
                                      image_url: { url: a.dataUrl as string },
                                  }),
                              ),
                          ]
                        : apiText;

                const newUserMsg = { role: "user", content: newUserMsgContent };
                pendingApiContent = newUserMsgContent;

                // --- Troncature automatique du contexte (C) ---
                // Estimation multimodale : compte les images (base64) en plus du texte
                const estimateTokens = (msgs: { role: string; content: LlamaApiContent }[]) =>
                    msgs.reduce((acc, m) => {
                        if (typeof m.content === "string") {
                            return acc + Math.ceil(m.content.length / 4) + 4;
                        }
                        if (Array.isArray(m.content)) {
                            let t = 4;
                            for (const part of m.content) {
                                if (part.type === "text") t += Math.ceil((part.text?.length ?? 0) / 4);
                                // base64 image_url : ~6 chars base64 = ~1 token (vision encoder),
                                // + 256 tokens de base pour les embeddings patch
                                if (part.type === "image_url")
                                    t += 256 + Math.ceil((part.image_url?.url?.length ?? 0) / 6);
                            }
                            return acc + t;
                        }
                        return acc + 4;
                    }, 0);

                const TRUNCATION_THRESHOLD = 0.75; // 75% pour laisser de la marge aux images
                const maxTokens = Math.floor(contextWindow * TRUNCATION_THRESHOLD);

                // Construire la liste complète et tronquer si nécessaire
                let trimmedHistory = [...history];
                // Tronquer par paires user/assistant depuis le début (on garde les plus récents)
                while (
                    estimateTokens([...systemMessage, ...trimmedHistory, newUserMsg]) > maxTokens &&
                    trimmedHistory.length > 0
                ) {
                    // Retirer la paire la plus ancienne (user + assistant) depuis le début
                    const firstUserIdx = trimmedHistory.findIndex((m) => m.role === "user");
                    if (firstUserIdx === -1) {
                        trimmedHistory.shift();
                        continue;
                    }
                    // Retirer user + éventuel assistant suivant
                    const removeCount = trimmedHistory[firstUserIdx + 1]?.role === "assistant" ? 2 : 1;
                    trimmedHistory.splice(firstUserIdx, removeCount);
                }
                // Fallback : si même avec historique vide on dépasse (system prompt trop grand),
                // tronquer le system prompt pour garder une marge de sécurité.
                const hardLimit = Math.floor(contextWindow * 0.9);
                if (systemMessage.length > 0) {
                    const baseTokens = estimateTokens([...systemMessage, newUserMsg]);
                    if (baseTokens > hardLimit) {
                        const allowedSysChars = Math.max(500, (hardLimit - estimateTokens([newUserMsg]) - 8) * 4);
                        const truncatedSys =
                            systemMessage[0].content.slice(0, allowedSysChars) + "\n[contexte tronqué]";
                        systemMessage[0] = { role: "system", content: truncatedSys };
                    }
                }
                // -------------------------------------------------

                const apiMessages = [...systemMessage, ...trimmedHistory, newUserMsg];

                // Estimer les tokens envoyés et mettre à jour le badge immédiatement
                const estimatedUsed = estimateTokens([...systemMessage, ...trimmedHistory, newUserMsg]);
                setTokenUsage({ used: estimatedUsed, limit: contextWindow });

                // Stocker apiContent sur le message user pour que les échanges suivants
                // puissent relire le contenu du document dans l'historique
                if (pendingApiContent !== null) {
                    const apiContent = pendingApiContent;
                    setMessages((current) => {
                        const next = [...current];
                        // Le message user ajouté est à l'avant-dernière position (avant l'assistant vide)
                        const userIdx = next.length - 2;
                        if (userIdx >= 0 && next[userIdx]?.role === "user") {
                            next[userIdx] = { ...next[userIdx], apiContent };
                        }
                        return next;
                    });
                }

                const temperature = params?.temperature ?? 0.9;

                // Limiter la génération : laisser de la place pour la réponse
                // (contextWindow - tokens du prompt estimés), plafond à 8192 par défaut
                const availableForResponse = Math.max(256, contextWindow - estimatedUsed);
                const maxResponseTokens = Math.min(availableForResponse, contextWindow > 32768 ? 16384 : 8192);

                const sampling = params?.sampling ?? {};

                const response = await safeInvoke<{ done: boolean }>("send_llama_prompt", {
                    messages: apiMessages,
                    promptId,
                    temperature,
                    maxTokens: maxResponseTokens,
                    sampling,
                    thinkingEnabled: params?.thinkingEnabled ?? true,
                });
                console.log("[useLlama] sendPrompt response", response);
                return response;
            } catch (e: unknown) {
                console.error("[useLlama] sendPrompt error", e);
                setError(getErrorMessage(e, "Erreur lors de l'envoi du prompt"));
                setStreaming(false);
                setCurrentPromptId(null);
                throw e;
            }
        },
        [debugLog],
    );

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
const getErrorMessage = (error: unknown, fallback: string) =>
    typeof error === "string" ? error : error instanceof Error ? error.message : (JSON.stringify(error) ?? fallback);
