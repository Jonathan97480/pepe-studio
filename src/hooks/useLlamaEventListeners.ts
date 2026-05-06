import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { detectRepetitionLoop, isCorruptedThinkingChunk, normalizeVisibleAssistantText } from "../lib/streamUtils";
import { devError, devLog, devWarn, type LlamaMessage } from "./useLlamaShared";

type UseLlamaEventListenersOptions = {
    debugLog: (message: string) => void;
    setMessages: Dispatch<SetStateAction<LlamaMessage[]>>;
    setTokenUsage: Dispatch<SetStateAction<{ used: number; limit: number } | null>>;
    setStreaming: Dispatch<SetStateAction<boolean>>;
    setCurrentPromptId: Dispatch<SetStateAction<string | null>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    unlistenRef: MutableRefObject<{ stream?: UnlistenFn; done?: UnlistenFn; error?: UnlistenFn; usage?: UnlistenFn }>;
    activePromptIdRef: MutableRefObject<string | null>;
    lastPromptIdRef: MutableRefObject<string | null>;
    currentPromptIdRef: MutableRefObject<string | null>;
    streamingRef: MutableRefObject<boolean>;
    contextWindowRef: MutableRefObject<number>;
    streamBufferRef: MutableRefObject<string>;
    repetitionAbortedRef: MutableRefObject<boolean>;
    assistantVisibleBufferRef: MutableRefObject<string>;
};

export function useLlamaEventListeners({
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
}: UseLlamaEventListenersOptions): void {
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
                    devLog("[useLlama] llama-stream event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-stream ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        devLog("[useLlama] llama-stream ignored due to prompt id mismatch", {
                            payloadPromptId: payload.prompt_id,
                            currentPromptId: activePromptId,
                            lastPromptId: lastPromptId,
                        });
                        return;
                    }

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
                        devWarn("[useLlama] Boucle de répétition détectée — arrêt du stream");
                        debugLog("⚠ Boucle de répétition détectée — arrêt du stream");
                        repetitionAbortedRef.current = true;
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

                        const markerRegex = /\[end thinking\]/i;
                        const markerMatch = !isThinking ? markerRegex.exec(chunkText) : null;
                        const startMarkerRegex = /\[start thinking\]/i;
                        const startMarkerMatch = !isThinking ? startMarkerRegex.exec(chunkText) : null;

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
                            return text
                                .replace(/\[end thinking\]/gi, "")
                                .replace(/\[start thinking\]/gi, "")
                                .replace(/<think>/gi, "")
                                .replace(/<\/think>/gi, "")
                                .replace(/<unused\d+>/g, "")
                                .replace(/<\|tool_call\|?>(?:\w*>)?/gi, "<tool>")
                                .replace(/<\|?\/?tool_call\|?>/gi, "</tool>");
                        };

                        const appendToContent = (message: LlamaMessage, text: string): LlamaMessage => ({
                            ...message,
                            content: message.content + cleanChunk(text),
                        });

                        const appendToThinking = (message: LlamaMessage, text: string): LlamaMessage => ({
                            ...message,
                            thinking:
                                message.thinking !== undefined ? message.thinking + text : stripThinkingMarkers(text),
                        });

                        if (last && last.role === "assistant") {
                            let updatedLast: LlamaMessage = { ...last };

                            if (isThinking) {
                                if (!updatedLast.thinkingDone) {
                                    updatedLast = appendToThinking(updatedLast, chunkText);
                                }
                            } else if (
                                thinkCloseMatch &&
                                updatedLast.thinking !== undefined &&
                                !updatedLast.thinkingDone
                            ) {
                                const before = chunkText.slice(0, thinkCloseMatch.index ?? 0);
                                const after = chunkText.slice((thinkCloseMatch.index ?? 0) + thinkCloseMatch[0].length);
                                if (before) updatedLast = appendToThinking(updatedLast, before);
                                updatedLast = { ...updatedLast, thinkingDone: true, thinkingCollapsed: true };
                                if (after.trim()) updatedLast = appendToContent(updatedLast, after);
                            } else if (
                                thinkOpenMatch &&
                                !updatedLast.thinkingDone &&
                                updatedLast.thinking === undefined
                            ) {
                                const before = cleanChunk(chunkText.slice(0, thinkOpenMatch.index ?? 0));
                                const after = chunkText.slice((thinkOpenMatch.index ?? 0) + thinkOpenMatch[0].length);
                                if (before.trim()) updatedLast = appendToContent(updatedLast, before);
                                updatedLast = { ...updatedLast, thinking: after, thinkingFromTag: true };
                            } else if (
                                updatedLast.thinking !== undefined &&
                                !updatedLast.thinkingDone &&
                                updatedLast.thinkingFromTag
                            ) {
                                updatedLast = appendToThinking(updatedLast, chunkText);
                            } else if (markerMatch) {
                                const markerStart = markerMatch.index ?? 0;
                                const before = chunkText.slice(0, markerStart);
                                const after = cleanChunk(chunkText.slice(markerStart + markerMatch[0].length));
                                updatedLast = appendToThinking(updatedLast, before);
                                updatedLast = { ...updatedLast, thinkingDone: true, thinkingCollapsed: true };
                                updatedLast = appendToContent(updatedLast, after);
                            } else if (startMarkerMatch && !last.thinkingDone && last.thinking === undefined) {
                                const before = cleanChunk(chunkText.slice(0, startMarkerMatch.index ?? 0));
                                const after = chunkText
                                    .slice((startMarkerMatch.index ?? 0) + startMarkerMatch[0].length)
                                    .trimStart();
                                if (before) updatedLast = appendToContent(updatedLast, before);
                                updatedLast = { ...updatedLast, thinking: after };
                            } else {
                                if (updatedLast.thinking !== undefined && !updatedLast.thinkingDone) {
                                    updatedLast = { ...updatedLast, thinkingDone: true, thinkingCollapsed: true };
                                }
                                updatedLast = appendToContent(updatedLast, chunkText);
                            }
                            next[next.length - 1] = updatedLast;
                            return next;
                        }

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

                        return [...current, newMessage];
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
                    devLog("[useLlama] llama-done event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-done ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        devLog("[useLlama] llama-done ignored due to prompt id mismatch", {
                            payloadPromptId: payload.prompt_id,
                            currentPromptId: activePromptId,
                            lastPromptId: lastPromptId,
                        });
                        return;
                    }
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
                devLog("[useLlama] llama-done listener registered");

                unlistenError = await listen("llama-error", (event) => {
                    const payload = event.payload as { prompt_id: string; error: string };
                    const activePromptId = activePromptIdRef.current;
                    const lastPromptId = lastPromptIdRef.current;
                    const activeStreaming = streamingRef.current;
                    debugLog(
                        `llama-error event prompt_id=${payload.prompt_id} error=${payload.error} activePromptId=${activePromptId} lastPromptId=${lastPromptId} activeStreaming=${activeStreaming}`,
                    );
                    devLog("[useLlama] llama-error event", payload, {
                        activePromptId,
                        lastPromptId,
                        activeStreaming,
                    });
                    const validPrompt = payload.prompt_id === activePromptId || payload.prompt_id === lastPromptId;
                    if (!validPrompt && !activeStreaming) {
                        debugLog(
                            `llama-error ignored due to prompt id mismatch payload=${payload.prompt_id} current=${activePromptId} last=${lastPromptId}`,
                        );
                        devLog("[useLlama] llama-error ignored due to prompt id mismatch", {
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
                devLog("[useLlama] llama-error listener registered");

                unlistenUsage = await listen("llama-usage", (event) => {
                    const payload = event.payload as { prompt_id: string; prompt_tokens?: number | null };
                    if (payload.prompt_tokens != null && payload.prompt_tokens > 0) {
                        setTokenUsage((prev) => ({
                            used: payload.prompt_tokens as number,
                            limit: prev?.limit ?? contextWindowRef.current ?? 4096,
                        }));
                    }
                });

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
                devError("[useLlama] initListeners failed", err);
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
    }, [
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
    ]);
}
