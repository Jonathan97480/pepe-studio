"use client";

import { ChatWindowScreenLayout } from "./ChatWindowScreenLayout";
import { useChatWindowScreenController } from "../hooks/useChatWindowScreenController";

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
    const layoutProps = useChatWindowScreenController({
        convRequest,
        onConversationReady,
        onConversationTitleChanged,
        onOpenBrowserUrl,
        onOpenTerminal,
    });

    return <ChatWindowScreenLayout {...layoutProps} />;
}
