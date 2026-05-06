import { invoke } from "@tauri-apps/api/tauri";
import { applyAllPatches, hasPatchBlocks, type PatchResult } from "../lib/skillPatcher";
import { buildFallbackConversationTitle, normalizeToolTags } from "../lib/chatUtils";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { LlamaMessage } from "./useLlama";

type HandlePostStreamArgs = {
    streaming: boolean;
    prevStreamingRef: MutableRefObject<boolean>;
    messages: LlamaMessage[];
    conversationId: number | null;
    convTitleSetRef: MutableRefObject<boolean>;
    onConversationTitleChanged?: () => void;
    updateLastAssistantContent: (content: string) => void;
    setPatchResults: Dispatch<SetStateAction<PatchResult[] | null>>;
};

export function handlePostStreamPersistence({
    streaming,
    prevStreamingRef,
    messages,
    conversationId,
    convTitleSetRef,
    onConversationTitleChanged,
    updateLastAssistantContent,
    setPatchResults,
}: HandlePostStreamArgs): void {
    if (!(prevStreamingRef.current && !streaming)) return;

    const lastMsg = messages[messages.length - 1];
    if (!(lastMsg?.role === "assistant" && lastMsg.content && conversationId)) return;

    let content = lastMsg.content;

    if (!convTitleSetRef.current) {
        const titleMatch = content.match(/<conv_title>([\s\S]*?)<\/conv_title>/i);
        if (titleMatch) {
            const title = titleMatch[1].trim().slice(0, 80);
            const stripped = content.replace(/<conv_title>[\s\S]*?<\/conv_title>\s*/i, "").trim();
            convTitleSetRef.current = true;
            invoke("rename_conversation", { conversationId, title })
                .then(() => onConversationTitleChanged?.())
                .catch(() => {});
            if (stripped) {
                content = stripped;
                updateLastAssistantContent(content);
            }
            if (!stripped) return;
        } else {
            convTitleSetRef.current = true;
            const fallbackTitle = buildFallbackConversationTitle(messages).slice(0, 80);
            invoke("rename_conversation", { conversationId, title: fallbackTitle })
                .then(() => onConversationTitleChanged?.())
                .catch(() => {});
        }
    }

    const factRegex = /<save_fact\s+key="([^"]+)"\s+value="([^"]+)"\s*\/?>/gi;
    let factMatch: RegExpExecArray | null;
    let hasFacts = false;
    while ((factMatch = factRegex.exec(content)) !== null) {
        hasFacts = true;
        invoke("set_user_fact", { key: factMatch[1], value: factMatch[2] }).catch(() => {});
    }
    if (hasFacts) {
        content = content.replace(/<save_fact\s+key="[^"]+"\s+value="[^"]+"\s*\/?>\s*/gi, "").trim();
        updateLastAssistantContent(content);
    }

    if (!/<tool>/.test(normalizeToolTags(content))) {
        invoke("save_message", { conversationId, role: "assistant", content }).catch(() => {});
    }

    if (hasPatchBlocks(content)) {
        setPatchResults(null);
        applyAllPatches(content).then((results) => {
            setPatchResults(results);
        });
    }
}
