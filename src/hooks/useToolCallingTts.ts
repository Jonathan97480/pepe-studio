import { useEffect, type MutableRefObject } from "react";
import type { LlamaMessage } from "./useLlama";

type UseToolCallingTtsOptions = {
    streaming: boolean;
    prevStreamingRef: MutableRefObject<boolean>;
    ttsEnabled: boolean;
    messages: LlamaMessage[];
    speakText: (text: string) => void;
};

export function useToolCallingTts({
    streaming,
    prevStreamingRef,
    ttsEnabled,
    messages,
    speakText,
}: UseToolCallingTtsOptions): void {
    useEffect(() => {
        if (prevStreamingRef.current && !streaming && ttsEnabled) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const plain = lastMsg.content
                    .replace(/```[\s\S]*?```/g, "")
                    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
                    .replace(/[#*_~>]/g, "")
                    .trim();
                if (plain) speakText(plain);
            }
        }
        prevStreamingRef.current = streaming;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming, messages]);
}
