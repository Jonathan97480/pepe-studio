import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import {
    devError,
    devLog,
    getErrorMessage,
    type Attachment,
    type LlamaApiContent,
    type LlamaApiImagePart,
    type LlamaMessage,
    safeInvoke,
} from "./useLlamaShared";

type UseLlamaSendPromptOptions = {
    debugLog: (message: string) => void;
    setError: Dispatch<SetStateAction<string | null>>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setStreaming: Dispatch<SetStateAction<boolean>>;
    setCurrentPromptId: Dispatch<SetStateAction<string | null>>;
    setMessages: Dispatch<SetStateAction<LlamaMessage[]>>;
    setTokenUsage: Dispatch<SetStateAction<{ used: number; limit: number } | null>>;
    streamingRef: MutableRefObject<boolean>;
    currentPromptIdRef: MutableRefObject<string | null>;
    activePromptIdRef: MutableRefObject<string | null>;
    lastPromptIdRef: MutableRefObject<string | null>;
    messagesRef: MutableRefObject<LlamaMessage[]>;
    contextWindowRef: MutableRefObject<number>;
    streamBufferRef: MutableRefObject<string>;
    repetitionAbortedRef: MutableRefObject<boolean>;
    assistantVisibleBufferRef: MutableRefObject<string>;
};

export function useLlamaSendPrompt({
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
}: UseLlamaSendPromptOptions) {
    return useCallback(
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
            streamBufferRef.current = "";
            repetitionAbortedRef.current = false;
            assistantVisibleBufferRef.current = "";
            const promptId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            devLog("[useLlama] sendPrompt", { promptId, prompt, params });
            currentPromptIdRef.current = promptId;
            activePromptIdRef.current = promptId;
            lastPromptIdRef.current = promptId;
            debugLog(
                `sendPrompt assigned promptId=${promptId} activePromptId=${activePromptIdRef.current} lastPromptId=${lastPromptIdRef.current}`,
            );
            setCurrentPromptId(promptId);

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
                    devLog("[useLlama] messages after sendPrompt", next);
                    return next;
                });
            } else {
                setMessages((current) => {
                    const next = [...current];
                    const userMsg = next[next.length - 2];
                    if (userMsg?.role === "user" && userMsg.displayOnly) {
                        next[next.length - 2] = { ...userMsg, displayOnly: undefined };
                    }
                    return next;
                });
            }

            let pendingApiContent: LlamaApiContent | null = null;

            try {
                const contextWindow = params?.contextWindow ?? 4096;
                contextWindowRef.current = contextWindow;
                setTokenUsage((prev) => ({ used: prev?.used ?? 0, limit: contextWindow }));

                const history = messagesRef.current
                    .filter((m) => !m.displayOnly && (m.content.trim() !== "" || m.role === "user"))
                    .map((m) => ({ role: m.role, content: m.apiContent ?? m.content }));

                let systemMessage = params?.systemPrompt ? [{ role: "system", content: params.systemPrompt }] : [];

                const textParts: string[] = [];
                for (const ta of textAttachments) {
                    textParts.push(`===== FICHIER : ${ta.name} =====\n${ta.text}\n===== FIN DU FICHIER =====`);
                }
                textParts.push(prompt);
                const apiText = textParts.join("\n\n");

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

                const estimateTokens = (msgs: { role: string; content: LlamaApiContent }[]) =>
                    msgs.reduce((acc, m) => {
                        if (typeof m.content === "string") {
                            return acc + Math.ceil(m.content.length / 4) + 4;
                        }
                        if (Array.isArray(m.content)) {
                            let t = 4;
                            for (const part of m.content) {
                                if (part.type === "text") t += Math.ceil((part.text?.length ?? 0) / 4);
                                if (part.type === "image_url") {
                                    t += 256 + Math.ceil((part.image_url?.url?.length ?? 0) / 6);
                                }
                            }
                            return acc + t;
                        }
                        return acc + 4;
                    }, 0);

                const maxTokens = Math.floor(contextWindow * 0.75);
                let trimmedHistory = [...history];
                while (
                    estimateTokens([...systemMessage, ...trimmedHistory, newUserMsg]) > maxTokens &&
                    trimmedHistory.length > 0
                ) {
                    const firstUserIdx = trimmedHistory.findIndex((m) => m.role === "user");
                    if (firstUserIdx === -1) {
                        trimmedHistory.shift();
                        continue;
                    }
                    const removeCount = trimmedHistory[firstUserIdx + 1]?.role === "assistant" ? 2 : 1;
                    trimmedHistory.splice(firstUserIdx, removeCount);
                }

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

                const apiMessages = [...systemMessage, ...trimmedHistory, newUserMsg];
                const estimatedUsed = estimateTokens([...systemMessage, ...trimmedHistory, newUserMsg]);
                setTokenUsage({ used: estimatedUsed, limit: contextWindow });

                if (pendingApiContent !== null) {
                    const apiContent = pendingApiContent;
                    setMessages((current) => {
                        const next = [...current];
                        const userIdx = next.length - 2;
                        if (userIdx >= 0 && next[userIdx]?.role === "user") {
                            next[userIdx] = { ...next[userIdx], apiContent };
                        }
                        return next;
                    });
                }

                const temperature = params?.temperature ?? 0.9;
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
                devLog("[useLlama] sendPrompt response", response);
                return response;
            } catch (e: unknown) {
                devError("[useLlama] sendPrompt error", e);
                setError(getErrorMessage(e, "Erreur lors de l'envoi du prompt"));
                setStreaming(false);
                setCurrentPromptId(null);
                throw e;
            }
        },
        [
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
        ],
    );
}
