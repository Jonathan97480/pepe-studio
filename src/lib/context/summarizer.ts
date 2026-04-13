// src/lib/context/summarizer.ts
// Summarizer basé sur la concaténation structurée des messages
import type { Message } from "./manager";

export const simpleSummarizer = async (messages: Message[]): Promise<string> => {
    const lines = messages.map((m) => {
        const role =
            m.role === "user" ? "Utilisateur"
            : m.role === "assistant" ? "Assistant"
            : "Système";
        const snippet = m.content.slice(0, 400).replace(/\n+/g, " ").trim();
        return `[${role}] ${snippet}${m.content.length > 400 ? "…" : ""}`;
    });
    return [
        "=== RÉSUMÉ AUTOMATIQUE DES ÉCHANGES PRÉCÉDENTS ===",
        ...lines,
        "=== FIN DU RÉSUMÉ — reprends à partir d'ici ===",
    ].join("\n");
};
