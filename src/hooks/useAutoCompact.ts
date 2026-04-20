import { useCallback, useEffect, useRef, useState } from "react";
import { simpleSummarizer } from "../lib/context/summarizer";
import type { LlamaMessage } from "./useLlama";

interface UseAutoCompactOptions {
    messages: LlamaMessage[];
    resetMessages: (msgs?: LlamaMessage[]) => void;
    streaming: boolean;
    loading: boolean;
    tokenUsage: { used: number; limit: number } | null;
    contextWindow: number;
}

export function useAutoCompact({
    messages,
    resetMessages,
    streaming,
    loading,
    tokenUsage,
    contextWindow,
}: UseAutoCompactOptions): { compactToast: boolean } {
    const [compactToast, setCompactToast] = useState(false);
    const hasAutoCompactedRef = useRef(false);

    const compactContext = useCallback(async () => {
        const realMsgs = messages.filter((m) => !m.displayOnly && m.content.trim() !== "");
        if (realMsgs.length < 6) return;
        const keepCount = Math.min(6, Math.floor(realMsgs.length / 2));
        const toSummarize = realMsgs.slice(0, realMsgs.length - keepCount);
        const toKeep = realMsgs.slice(realMsgs.length - keepCount);
        const summaryText = await simpleSummarizer(
            toSummarize.map((m) => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
                tokens: Math.ceil(m.content.length / 4),
            })),
        );
        const summaryMsg: LlamaMessage = { role: "system", content: summaryText };
        resetMessages([summaryMsg, ...toKeep]);
        hasAutoCompactedRef.current = true;
        setCompactToast(true);
        setTimeout(() => setCompactToast(false), 4000);
    }, [messages, resetMessages]);

    useEffect(() => {
        if (streaming || loading) {
            hasAutoCompactedRef.current = false; // reset au prochain message
            return;
        }
        if (!tokenUsage || tokenUsage.used === 0) return;
        const pct = tokenUsage.used / (tokenUsage.limit || contextWindow);
        if (pct >= 0.7 && !hasAutoCompactedRef.current) {
            hasAutoCompactedRef.current = true; // éviter double-déclenchement
            setTimeout(() => {
                void compactContext();
            }, 0);
        }
    }, [streaming, loading, tokenUsage, contextWindow, compactContext]);

    return { compactToast };
}
