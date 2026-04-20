import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { searchLibrary, queryDocs } from "../tools/Context7Client";
import { hasPatchBlocks, applyAllPatches, type PatchResult } from "../lib/skillPatcher";
import { normalizeToolTags, sanitizeLlmJson, extractWriteFileTool, invokeWithTimeout } from "../lib/chatUtils";
import { extractPdfPagesFromBase64 } from "../lib/pdfExtract";
import { TOOL_DOCS } from "../lib/toolDocs";
import type { LlamaMessage, Attachment } from "./useLlama";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { TurboQuantType } from "../context/ModelSettingsContext";
import type { ChatMode } from "../lib/chatUtils";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

// Curseurs de lecture par terminal_id ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pour ne retourner que le NOUVEAU texte aprÃƒÆ’Ã‚Â¨s terminal_send_stdin
const terminalReadCursors: Map<string, number> = new Map();

/** Supprime les sÃƒÆ’Ã‚Â©quences d'ÃƒÆ’Ã‚Â©chappement ANSI/VT pour ne passer que du texte brut au LLM. */
function stripAnsi(s: string): string {
    return s
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "") // CSI sequences: ESC [ ... letter
        .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC sequences
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "") // DCS/SOS/PM/APC
        .replace(/\x1b[=>]/g, "") // VT52 mode switches
        .replace(/\r/g, "") // carriage returns
        .replace(/\x1b\[\d*[ABCDK]/g, ""); // cursor movement leftovers
}

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Documentation intÃƒÆ’Ã‚Â©grÃƒÆ’Ã‚Â©e de chaque outil ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â utilisÃƒÆ’Ã‚Â©e par get_tool_doc
// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
interface UseToolCallingOptions {
    streaming: boolean;
    toolRunning: boolean;
    setToolRunning: Dispatch<SetStateAction<boolean>>;
    messages: LlamaMessage[];
    modelPath: string;
    temperature: number;
    contextWindow: number;
    turboQuant: TurboQuantType;
    sampling: LlamaLaunchConfig["sampling"];
    thinkingEnabled: boolean;
    machineContext: string | null;
    systemPrompt: string;
    sendPrompt: (
        prompt: string,
        config: Partial<LlamaLaunchConfig>,
        attachments?: Attachment[],
        save?: boolean,
    ) => Promise<unknown>;
    updateLastAssistantContent: (content: string) => void;
    buildMachineContext: () => Promise<void>;
    chatModeRef: MutableRefObject<ChatMode>;
    prevStreamingRef: MutableRefObject<boolean>;
    lastToolSignatureRef: MutableRefObject<string | null>;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    jsonParseErrorCountRef: MutableRefObject<number>;
    convTitleSetRef: MutableRefObject<boolean>;
    dispatchToolRef: MutableRefObject<
        | ((parsed: Record<string, string>, cfg: Partial<LlamaLaunchConfig>, forceExecute?: boolean) => Promise<void>)
        | null
    >;
    setPendingQuestion: Dispatch<
        SetStateAction<{
            question: string;
            options: string[];
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPendingAgentPermission: Dispatch<
        SetStateAction<{
            reason: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPendingPlanConfirm: Dispatch<
        SetStateAction<{
            description: string;
            parsed: Record<string, string>;
            config: Partial<LlamaLaunchConfig>;
        } | null>
    >;
    setPatchResults: Dispatch<SetStateAction<PatchResult[] | null>>;
    applyMode: (mode: ChatMode) => void;
    onOpenBrowserUrl?: (url: string) => void;
    onOpenTerminal?: () => void;
    onConversationTitleChanged?: () => void;
    conversationId: number | null;
    ttsEnabled: boolean;
    speakText: (text: string) => void;
    setTodoItems: Dispatch<SetStateAction<{ text: string; done: boolean }[]>>;
    setProjectStructure: Dispatch<SetStateAction<string>>;
    projectStructureRef: React.MutableRefObject<string>;
    setPlanContent: Dispatch<SetStateAction<string>>;
    planRef: React.MutableRefObject<string>;
}

export function useToolCalling({
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
}: UseToolCallingOptions): void {
    // Tool calling : dÃƒÆ’Ã‚Â©tecter <tool>{...}</tool> aprÃƒÆ’Ã‚Â¨s fin du streaming
    // Scanne TOUS les <tool> dans le message et les exÃƒÆ’Ã‚Â©cute en sÃƒÆ’Ã‚Â©quence avant de renvoyer au LLM.
    useEffect(() => {
        if (prevStreamingRef.current && !streaming && !toolRunning) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const normalizedContent = normalizeToolTags(lastMsg.content);

                // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Format <patch_file path="...">SEARCH:\n...\nREPLACE:\n...</patch_file> ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                const pfTagMatches = [
                    ...normalizedContent.matchAll(/<patch_file\s+path="([^"]+)">([\s\S]*?)<\/patch_file>/g),
                ];
                if (pfTagMatches.length > 0) {
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };
                    setToolRunning(true);
                    (async () => {
                        const results: string[] = [];
                        for (const m of pfTagMatches) {
                            const filePath = m[1];
                            const body = m[2];
                            const searchMatch = body.match(
                                /SEARCH:[ \t]?\r?\n?([\s\S]*?)(?=\r?\n?[ \t]*REPLACE:[ \t]?\r?\n?)/,
                            );
                            const replaceMatch = body.match(/REPLACE:[ \t]?\r?\n?([\s\S]*)$/);
                            if (!searchMatch || !replaceMatch) {
                                lastToolWasErrorRef.current = true;
                                const missingPart = !searchMatch ? "SEARCH" : "REPLACE";
                                results.push(
                                    `ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ${filePath} : bloc ${missingPart} manquant dans <patch_file>.\n` +
                                        `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Format obligatoire ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â exemple correct :\n` +
                                        `<patch_file path="${filePath}">\n` +
                                        `SEARCH:\n` +
                                        `texte exact ÃƒÆ’Ã‚Â  trouver (copiÃƒÆ’Ã‚Â© mot pour mot depuis le fichier)\n` +
                                        `REPLACE:\n` +
                                        `nouveau texte ÃƒÆ’Ã‚Â  mettre ÃƒÆ’Ã‚Â  la place\n` +
                                        `</patch_file>\n` +
                                        `RÃƒÆ’Ã‹â€ GLE : N'utilise JAMAIS ce tag sans bloc REPLACE ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â mÃƒÆ’Ã‚Âªme pour montrer un aperÃƒÆ’Ã‚Â§u.`,
                                );
                                continue;
                            }
                            const search = searchMatch[1].trim();
                            const replace = replaceMatch[1].trimEnd();
                            try {
                                const r = await invokeWithTimeout<string>(
                                    "patch_file",
                                    { path: filePath, search, replace },
                                    20000,
                                );
                                results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ ${r}`);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ${filePath} : ${err}`);
                            }
                        }
                        const allOk = results.every((r) => r.startsWith("ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“"));
                        if (!allOk) lastToolWasErrorRef.current = true;
                        await sendPrompt(
                            `[RÃƒÆ’Ã‚Â©sultats patch_file]\n${results.join("\n")}\n` +
                                (allOk
                                    ? `Patch(es) appliquÃƒÆ’Ã‚Â©(s) avec succÃƒÆ’Ã‚Â¨s.`
                                    : `ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â PATCH ÃƒÆ’Ã¢â‚¬Â°CHOUÃƒÆ’Ã¢â‚¬Â° ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PROTOCOLE OBLIGATOIRE :\n` +
                                      `  1. Appelle read_file sur le fichier pour voir le texte EXACT\n` +
                                      `  2. Compare caractÃƒÆ’Ã‚Â¨re par caractÃƒÆ’Ã‚Â¨re ton bloc SEARCH avec le texte rÃƒÆ’Ã‚Â©el\n` +
                                      `  3. Corrige le SEARCH et relance patch_file\n` +
                                      `INTERDIT : basculer vers write_file pour rÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©crire le fichier ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â la capitulation est une erreur grave.\n` +
                                      `INTERDIT : dire "le patching est un leurre" ou "je vais rÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©crire" ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â la cause est toujours un SEARCH incorrect.\n` +
                                      `Ne fais RIEN d'autre avant que le patch soit appliquÃƒÆ’Ã‚Â© avec succÃƒÆ’Ã‚Â¨s.`),
                            config,
                        );
                    })().finally(() => setToolRunning(false));
                    return;
                }

                // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Format <write_file path="...">CONTENT</write_file> ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                const wfTagMatches = [
                    ...normalizedContent.matchAll(/<write_file\s+path="([^"]+)">([\/\s\S]*?)<\/write_file>/g),
                ];
                if (wfTagMatches.length > 0) {
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };
                    setToolRunning(true);
                    (async () => {
                        const results: string[] = [];
                        for (const m of wfTagMatches) {
                            const filePath = m[1];
                            const fileContent = m[2];
                            try {
                                const r = await invokeWithTimeout<string>(
                                    "write_file",
                                    { path: filePath, content: fileContent },
                                    20000,
                                );
                                results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ ${r}`);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ${filePath} : ${err}`);
                            }
                        }
                        await sendPrompt(
                            `[Fichiers ÃƒÆ’Ã‚Â©crits]\n${results.join("\n")}\n` +
                                `PROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`,
                            config,
                        );
                    })().finally(() => setToolRunning(false));
                    return;
                }

                // Extraire TOUS les blocs <tool> dans l'ordre
                const allToolMatches = [...normalizedContent.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)];
                const toolMatch = allToolMatches.length > 0 ? allToolMatches[0] : null;
                if (toolMatch) {
                    let parsed: Record<string, string> | null = null;
                    let parseError: unknown = null;
                    try {
                        parsed = JSON.parse(sanitizeLlmJson(toolMatch[1]));
                    } catch (jsonErr) {
                        parseError = jsonErr;
                        if (toolMatch[1].includes('"write_file"')) {
                            const extracted = extractWriteFileTool(toolMatch[1]);
                            if (extracted) {
                                parsed = extracted as unknown as Record<string, string>;
                                parseError = null;
                            }
                        }
                    }
                    if (parseError !== null || parsed === null) {
                        jsonParseErrorCountRef.current += 1;
                        const config: Partial<LlamaLaunchConfig> = {
                            modelPath,
                            temperature,
                            contextWindow,
                            turboQuant,
                            sampling,
                            thinkingEnabled,
                            systemPrompt: machineContext
                                ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                                : systemPrompt,
                        };
                        setToolRunning(true);
                        let errMsg: string;
                        const isWriteFile = toolMatch[1].includes('"write_file"');
                        const isBatchRename = toolMatch[1].includes('"batch_rename"');
                        const isReadPdfBatch = toolMatch[1].includes('"read_pdf_batch"');
                        if (jsonParseErrorCountRef.current <= 2) {
                            if (isBatchRename) {
                                errMsg =
                                    `[Erreur batch_rename ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â JSON invalide ou trop long]\n` +
                                    `Le JSON de ton batch_rename est mal formÃƒÆ’Ã‚Â© (${parseError}).\n` +
                                    `SOLUTION OBLIGATOIRE : Divise les renommages en 2 appels sÃƒÆ’Ã‚Â©parÃƒÆ’Ã‚Â©s de 15 fichiers max :\n` +
                                    `Appel 1 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ÃƒÂ¢Ã¢â‚¬Â Ã‚Â 15 premiers\n` +
                                    `Appel 2 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ <tool>{"batch_rename": [{"from": "...", "to": "..."}, ...]}</tool>  ÃƒÂ¢Ã¢â‚¬Â Ã‚Â 15 suivants\n` +
                                    `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Format TABLEAU NATIF obligatoire ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â PAS de guillemets supplÃƒÆ’Ã‚Â©mentaires autour du tableau.\n` +
                                    `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Aucun guillemet ÃƒÆ’Ã‚Â  ÃƒÆ’Ã‚Â©chapper dans les chemins de fichiers.`;
                            } else if (isReadPdfBatch) {
                                errMsg =
                                    `[Erreur read_pdf_batch ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â JSON invalide]\n` +
                                    `Le JSON est mal formÃƒÆ’Ã‚Â© (${parseError}).\n` +
                                    `SOLUTION : Utilise un tableau natif JSON (PAS une chaÃƒÆ’Ã‚Â®ne sÃƒÆ’Ã‚Â©rialisÃƒÆ’Ã‚Â©e) :\n` +
                                    `<tool>{"read_pdf_batch": ["E:/chemin/fichier1.pdf", "E:/chemin/fichier2.pdf", ...]}</tool>\n` +
                                    `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Maximum 30 chemins par appel. Si > 30 fichiers, fais 2 appels sÃƒÆ’Ã‚Â©parÃƒÆ’Ã‚Â©s.`;
                            } else if (isWriteFile) {
                                errMsg =
                                    `[Erreur write_file ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FORMAT TAG OBLIGATOIRE]\n` +
                                    `ARRÃƒÆ’Ã…Â TE toute tentative JSON pour write_file. Utilise EXACTEMENT ce format (commence par < pas par {) :\n` +
                                    `\n` +
                                    `<write_file path="D:/projetavenire/index.html">\n` +
                                    `<!DOCTYPE html>\n` +
                                    `<html>...contenu complet ici...</html>\n` +
                                    `</write_file>\n` +
                                    `\n` +
                                    `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â La balise DOIT commencer par le caractÃƒÆ’Ã‚Â¨re < (chevron), PAS par { (accolade).\n` +
                                    `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â NE pas envelopper dans <tool>...</tool> ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â le format TAG est DIRECT, sans wrapper.\n` +
                                    `Adapte le path avec le vrai chemin du fichier ÃƒÆ’Ã‚Â  crÃƒÆ’Ã‚Â©er.`;
                            } else {
                                errMsg =
                                    `[Erreur JSON dans <tool>] Le JSON est invalide (${parseError}).\n` +
                                    `Cause : les guillemets dans le champ content ne sont PAS echappes.\n` +
                                    `Regles absolues :\n` +
                                    `  1. Remplace CHAQUE guillemet dans content par backslash+guillemet (\\\")\n` +
                                    `  2. Remplace chaque saut de ligne par backslash+n (\\n)\n` +
                                    `  3. NE mets AUCUN vrai saut de ligne dans la valeur JSON\n` +
                                    `Exemple valide : {"create_skill":"x","content":"Write-Host \\\"bonjour\\\""}\n` +
                                    `Reemet le <tool> avec le JSON corrige.`;
                            }
                        } else {
                            jsonParseErrorCountRef.current = 0;
                            if (isBatchRename) {
                                errMsg =
                                    `[Erreur batch_rename persistante ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SPLIT OBLIGATOIRE]\n` +
                                    `Impossible de parser le JSON. RÃƒÆ’Ã‹â€ GLE : max 10 fichiers par appel batch_rename.\n` +
                                    `GÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â¨re autant d'appels <tool>{"batch_rename": [...]}</tool> que nÃƒÆ’Ã‚Â©cessaire (10 par appel).`;
                            } else if (isReadPdfBatch) {
                                errMsg =
                                    `[Erreur read_pdf_batch persistante ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SPLIT OBLIGATOIRE]\n` +
                                    `Impossible de parser le JSON. RÃƒÆ’Ã‚Â©duis ÃƒÆ’Ã‚Â  10 chemins maximum par appel.\n` +
                                    `<tool>{"read_pdf_batch": ["chemin1.pdf", ..., "chemin10.pdf"]}</tool>`;
                            } else if (isWriteFile) {
                                errMsg =
                                    `[ECHEC REPEATED write_file ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FALLBACK CMD OBLIGATOIRE]\n` +
                                    `Le format TAG n'a pas fonctionnÃƒÆ’Ã‚Â©. Ecris le fichier via PowerShell cmd ÃƒÆ’Ã‚Â  la place :\n` +
                                    `\n` +
                                    `<tool>{"cmd": "New-Item -ItemType Directory -Force 'D:/projetavenire'; Set-Content -Path 'D:/projetavenire/index.html' -Encoding UTF8 -Value '<!DOCTYPE html><html><head><title>Page</title></head><body><h1>Pepe-Studio</h1></body></html>'"}</tool>\n` +
                                    `\n` +
                                    `Adapte le -Path et le -Value avec le vrai contenu. NE retente PAS write_file.`;
                            } else {
                                errMsg =
                                    `[Erreur JSON persistante apres plusieurs tentatives] Nouvelle strategie OBLIGATOIRE :\n` +
                                    `Remplace TOUS les guillemets doubles dans ton script PowerShell par des apostrophes simples (').\n` +
                                    `PowerShell accepte les deux. Exemple : Write-Host 'Bonjour' au lieu de Write-Host "Bonjour".\n` +
                                    `Reemet le <tool> create_skill avec uniquement des apostrophes simples dans content.`;
                            }
                        }
                        sendPrompt(errMsg, config).finally(() => setToolRunning(false));
                        return;
                    }
                    jsonParseErrorCountRef.current = 0;

                    setToolRunning(true);
                    const config: Partial<LlamaLaunchConfig> = {
                        modelPath,
                        temperature,
                        contextWindow,
                        turboQuant,
                        sampling,
                        thinkingEnabled,
                        systemPrompt: machineContext
                            ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                            : systemPrompt,
                    };

                    const dispatch = async (
                        parsedTool: Record<string, string>,
                        cfg: Partial<LlamaLaunchConfig>,
                        forceExecute = false,
                    ): Promise<void> => {
                        /** Injecte une directive d'auto-correction si la sortie contient des marqueurs d'erreur. */
                        const withAutoCritique = (output: string, toolName: string): string => {
                            const stripped = output.replace(/"(?:[^"\\]|\\.)*"/g, '""');
                            const isError =
                                /\b(error|exception|traceback|failed|erreur|introuvable|not found|cannot|refused|access denied|permission denied|syntax error|nameerror|typeerror|valueerror|referenceerror|cannot find|no such file|module not found|is not defined|unexpected token)\b/i.test(
                                    stripped,
                                );
                            if (!isError) return output;
                            return (
                                output +
                                `\n\n[ÃƒÂ¢Ã…Â¡Ã‚Â  AUTO-CRITIQUE] La sortie de "${toolName}" contient une erreur. ` +
                                `Analyse la cause racine et applique un correctif IMMÃƒÆ’Ã¢â‚¬Â°DIATEMENT ` +
                                `(patch_skill / patch_file / cmd selon le contexte). ` +
                                `Ne rÃƒÆ’Ã‚Â©pÃƒÆ’Ã‚Â¨te PAS la mÃƒÆ’Ã‚Âªme action. Si c'est un skill, lis-le d'abord avec read_skill.`
                            );
                        };
                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ DÃƒÆ’Ã‚Â©tection de boucle : mÃƒÆ’Ã‚Âªme tool call deux fois de suite ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        const toolSignature = JSON.stringify(parsedTool);
                        if (toolSignature === lastToolSignatureRef.current && !lastToolWasErrorRef.current) {
                            await sendPrompt(
                                `[SystÃƒÆ’Ã‚Â¨me] Action bloquÃƒÆ’Ã‚Â©e : tu viens d'exÃƒÆ’Ã‚Â©cuter exactement ce mÃƒÆ’Ã‚Âªme outil. Stop la boucle et rÃƒÆ’Ã‚Â©ponds directement ÃƒÆ’Ã‚Â  l'utilisateur.`,
                                cfg,
                            );
                            return;
                        }
                        lastToolSignatureRef.current = toolSignature;
                        lastToolWasErrorRef.current = false;

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ ask_user (question interactive) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.ask_user !== undefined) {
                            let options: string[] = [];
                            try {
                                const raw = parsedTool.options;
                                options = Array.isArray(raw) ? raw : JSON.parse(raw ?? "[]");
                            } catch {
                                options = [];
                            }
                            setPendingQuestion({ question: parsedTool.ask_user, options, config: cfg });
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ set_mode (l'IA change de mode) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.set_mode !== undefined) {
                            const requested = parsedTool.set_mode as ChatMode;
                            if (requested === "agent" && chatModeRef.current !== "agent") {
                                setPendingAgentPermission({
                                    reason:
                                        parsedTool.reason ??
                                        "L'IA souhaite passer en mode Agent pour exÃƒÆ’Ã‚Â©cuter des actions.",
                                    parsed: parsedTool,
                                    config: cfg,
                                });
                                return;
                            }
                            applyMode(requested);
                            await sendPrompt(`[SystÃƒÆ’Ã‚Â¨me] Mode changÃƒÆ’Ã‚Â© : ${requested}`, cfg);
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ request_agent_mode ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.request_agent_mode !== undefined) {
                            setPendingAgentPermission({
                                reason: parsedTool.request_agent_mode || "L'IA souhaite passer en mode Agent.",
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_tool_doc (lookup documentation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_tool_doc !== undefined) {
                            const query = String(parsedTool.get_tool_doc).toLowerCase().trim();
                            const exactMatch = TOOL_DOCS[query];
                            if (exactMatch) {
                                await sendPrompt(`[Documentation : ${query}]\n\n${exactMatch}`, cfg);
                            } else {
                                // Recherche partielle : tous les outils dont le nom contient la requÃƒÆ’Ã‚Âªte
                                const matches = Object.entries(TOOL_DOCS).filter(([key]) =>
                                    key.toLowerCase().includes(query),
                                );
                                if (matches.length === 1) {
                                    await sendPrompt(`[Documentation : ${matches[0][0]}]\n\n${matches[0][1]}`, cfg);
                                } else if (matches.length > 1) {
                                    const combined = matches
                                        .map(([, doc]) => doc)
                                        .join("\n\n" + "ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬".repeat(60) + "\n\n");
                                    await sendPrompt(
                                        `[Documentation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${matches.length} outils trouvÃƒÆ’Ã‚Â©s pour "${parsedTool.get_tool_doc}"]\n\n${combined}`,
                                        cfg,
                                    );
                                } else {
                                    const available = Object.keys(TOOL_DOCS).join(", ");
                                    await sendPrompt(
                                        `[get_tool_doc] Aucun outil trouvÃƒÆ’Ã‚Â© pour "${parsedTool.get_tool_doc}".\n\nOutils documentÃƒÆ’Ã‚Â©s :\n${available}`,
                                        cfg,
                                    );
                                }
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ set_todo (IA crÃƒÆ’Ã‚Â©e/remplace la todo list) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.set_todo !== undefined) {
                            try {
                                let items: string[] = [];
                                const raw = parsedTool.set_todo;
                                if (Array.isArray(raw)) {
                                    items = raw.map(String);
                                } else if (typeof raw === "string") {
                                    try {
                                        const parsed = JSON.parse(raw);
                                        items = Array.isArray(parsed) ? parsed.map(String) : [raw];
                                    } catch {
                                        items = [raw];
                                    }
                                }
                                if (items.length === 0) {
                                    setTodoItems([]);
                                    await sendPrompt(`[Todo] Liste vidÃƒÆ’Ã‚Â©e.`, cfg);
                                } else {
                                    setTodoItems(items.map((text) => ({ text, done: false })));
                                    await sendPrompt(
                                        `[Todo] Liste crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©e avec ${items.length} tÃƒÆ’Ã‚Â¢che(s) :\n${items.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}\nMarque chaque tÃƒÆ’Ã‚Â¢che terminÃƒÆ’Ã‚Â©e avec check_todo quand tu l'as accomplie.`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur set_todo]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ check_todo (IA marque une/plusieurs tÃƒÆ’Ã‚Â¢ches faites) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.check_todo !== undefined) {
                            const val = parsedTool.check_todo;
                            setTodoItems((prev) => {
                                if (String(val).toLowerCase() === "all") {
                                    return prev.map((t) => ({ ...t, done: true }));
                                } else {
                                    const idx = Number(val);
                                    return prev.map((t, i) => (i === idx ? { ...t, done: true } : t));
                                }
                            });
                            await sendPrompt(
                                `[Todo] TÃƒÆ’Ã‚Â¢che ${String(val) === "all" ? "toutes" : `nÃƒâ€šÃ‚Â°${Number(val) + 1}`} marquÃƒÆ’Ã‚Â©e(s) ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“. CONTINUE IMMÃƒÆ’Ã¢â‚¬Â°DIATEMENT avec la prochaine tÃƒÆ’Ã‚Â¢che sans attendre de confirmation utilisateur.`,
                                cfg,
                            );
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ save_project_structure (IA mÃƒÆ’Ã‚Â©morise la structure) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.save_project_structure !== undefined) {
                            const structure = String(parsedTool.save_project_structure);
                            setProjectStructure(structure);
                            if (conversationId) {
                                invokeWithTimeout("save_project_structure", { conversationId, structure }, 5000).catch(
                                    () => {},
                                );
                            }
                            await sendPrompt(
                                `[Structure projet sauvegardÃƒÆ’Ã‚Â©e] La structure est mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©e pour cette conversation et sera rechargÃƒÆ’Ã‚Â©e ÃƒÆ’Ã‚Â  la prochaine reprise.`,
                                cfg,
                            );
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_project_structure (IA relit la structure) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_project_structure !== undefined) {
                            const current = projectStructureRef.current;
                            if (current.trim()) {
                                await sendPrompt(`[Structure du projet mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©e]\n\`\`\`\n${current}\n\`\`\``, cfg);
                            } else {
                                await sendPrompt(
                                    `[Structure du projet] Aucune structure mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©e pour cette conversation. Utilise save_project_structure pour en enregistrer une.`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_plan (lecture pure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_plan !== undefined) {
                            try {
                                let content = planRef.current;
                                if (!content && conversationId) {
                                    content = await invokeWithTimeout<string>(
                                        "get_conversation_plan",
                                        { conversationId },
                                        5000,
                                    );
                                    if (content) setPlanContent(content);
                                }
                                if (!content) {
                                    await sendPrompt(
                                        `[PLAN.md] Aucun plan pour cette conversation. CrÃƒÆ’Ã‚Â©e-en un avec save_plan.`,
                                        cfg,
                                    );
                                } else {
                                    const firstLine = content.split("\n")[0] ?? "";
                                    await sendPrompt(
                                        `[PLAN.md ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Plan actuel (titre : ${firstLine})]\n\`\`\`markdown\n${content}\n\`\`\``,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_plan]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_terminal_history (lecture pure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_terminal_history !== undefined) {
                            try {
                                const entries = await invokeWithTimeout<
                                    { command: string; output: string; timestamp: string }[]
                                >(
                                    "get_terminal_history",
                                    { terminalId: String(parsedTool.get_terminal_history) },
                                    5000,
                                );
                                if (entries.length === 0) {
                                    await sendPrompt(
                                        `[Historique terminal] Aucune commande exÃƒÆ’Ã‚Â©cutÃƒÆ’Ã‚Â©e dans ce terminal.`,
                                        cfg,
                                    );
                                } else {
                                    const lines = entries
                                        .map(
                                            (e, i) =>
                                                `[${i + 1}] ${e.timestamp}\n$ ${e.command}\n${e.output.slice(0, 500)}${e.output.length > 500 ? "\n...(tronquÃƒÆ’Ã‚Â©)" : ""}`,
                                        )
                                        .join("\n\n");
                                    await sendPrompt(
                                        `[Historique terminal \`${parsedTool.get_terminal_history}\`]\n${lines}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_terminal_history]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_dev_server_info (lecture pure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_dev_server_info !== undefined) {
                            try {
                                const info = await invokeWithTimeout<Record<string, string>>(
                                    "get_dev_server_info",
                                    {},
                                    5000,
                                );
                                const status = info.running === "true" ? "ÃƒÂ°Ã…Â¸Ã…Â¸Ã‚Â¢ Actif" : "ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â´ ArrÃƒÆ’Ã‚ÂªtÃƒÆ’Ã‚Â©";
                                await sendPrompt(
                                    `[Serveur dev] Statut : ${status}\nPort : ${info.port || "(aucun)"}\nDossier : ${info.base_dir || "(aucun)"}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_dev_server_info]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ list_terminals (lecture pure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.list_terminals !== undefined) {
                            try {
                                const list = await invokeWithTimeout<
                                    { id: string; name: string; cwd: string; entry_count: number }[]
                                >("list_terminals", {}, 5000);
                                if (list.length === 0) {
                                    await sendPrompt(
                                        "[Terminaux] Aucun terminal ouvert. CrÃƒÆ’Ã‚Â©e-en un avec create_terminal.",
                                        cfg,
                                    );
                                } else {
                                    const lines = list
                                        .map(
                                            (t) =>
                                                `  - ${t.id}  "${t.name}"  |  ${t.cwd}  (${t.entry_count} cmd${t.entry_count !== 1 ? "s" : ""})`,
                                        )
                                        .join("\n");
                                    await sendPrompt(`[Terminaux ouverts]\n${lines}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur list_terminals]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ read_file (lecture pure ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas gatable) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.read_file) {
                            try {
                                const content = await invokeWithTimeout<string>(
                                    "read_file_content",
                                    { path: parsedTool.read_file },
                                    15000,
                                );
                                await sendPrompt(
                                    `[Contenu de ${parsedTool.read_file}]\n\`\`\`\n${content}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur lecture fichier]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ list_folder_pdfs ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â liste les PDFs d'un dossier ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.list_folder_pdfs) {
                            try {
                                const recursive = parsedTool.recursive === "true";
                                const files = await invokeWithTimeout<string[]>(
                                    "list_folder_pdfs",
                                    { folder: parsedTool.list_folder_pdfs, recursive },
                                    15000,
                                );
                                if (files.length === 0) {
                                    await sendPrompt(
                                        `[list_folder_pdfs] Aucun fichier PDF trouvÃƒÆ’Ã‚Â© dans : ${parsedTool.list_folder_pdfs}`,
                                        cfg,
                                    );
                                } else {
                                    await sendPrompt(
                                        `[PDFs dans ${parsedTool.list_folder_pdfs}] ${files.length} fichier(s) :\n${files.map((f, i) => `  ${i + 1}. ${f}`).join("\n")}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur list_folder_pdfs]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ read_pdf ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â lit et extrait le texte d'un PDF sur disque ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.read_pdf) {
                            try {
                                const base64 = await invokeWithTimeout<string>(
                                    "read_pdf_bytes",
                                    { path: parsedTool.read_pdf },
                                    30000,
                                );
                                const pages = await extractPdfPagesFromBase64(base64);
                                if (pages.length === 0) {
                                    await sendPrompt(
                                        `[read_pdf] Le PDF "${parsedTool.read_pdf}" ne contient aucun texte extractible (PDF image ou protÃƒÆ’Ã‚Â©gÃƒÆ’Ã‚Â©).`,
                                        cfg,
                                    );
                                } else {
                                    const text = pages.map((p) => `[Page ${p.pageNum}]\n${p.text}`).join("\n\n");
                                    await sendPrompt(
                                        `[Contenu PDF : ${parsedTool.read_pdf}] (${pages.length} page(s))\n\n${text}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ read_pdf_brief ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 1ÃƒÆ’Ã‚Â¨re page uniquement, max 2000 car ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.read_pdf_brief) {
                            try {
                                const base64 = await invokeWithTimeout<string>(
                                    "read_pdf_bytes",
                                    { path: parsedTool.read_pdf_brief },
                                    30000,
                                );
                                const pages = await extractPdfPagesFromBase64(base64);
                                if (pages.length === 0) {
                                    await sendPrompt(
                                        `[read_pdf_brief] ${parsedTool.read_pdf_brief} : aucun texte extractible.`,
                                        cfg,
                                    );
                                } else {
                                    const text = pages[0].text.slice(0, 2000);
                                    await sendPrompt(`[PDF page 1 : ${parsedTool.read_pdf_brief}]\n${text}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf_brief]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ read_pdf_batch ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â lit N PDFs (1ÃƒÆ’Ã‚Â¨re page) en un seul appel IPC ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.read_pdf_batch) {
                            try {
                                let paths: string[];
                                if (Array.isArray(parsedTool.read_pdf_batch)) {
                                    // L'IA a gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©rÃƒÆ’Ã‚Â© un tableau natif JSON
                                    paths = parsedTool.read_pdf_batch as string[];
                                } else {
                                    try {
                                        paths = JSON.parse(parsedTool.read_pdf_batch);
                                    } catch {
                                        lastToolWasErrorRef.current = true;
                                        await sendPrompt(
                                            `[Erreur read_pdf_batch] JSON invalide. Format attendu : ["chemin1.pdf", "chemin2.pdf", ...]\nLes guillemets internes doivent ÃƒÆ’Ã‚Âªtre ÃƒÆ’Ã‚Â©chappÃƒÆ’Ã‚Â©s avec \\\\.`,
                                            cfg,
                                        );
                                        return;
                                    }
                                }
                                type PdfBatchItem = {
                                    path: string;
                                    base64: string | null;
                                    error: string | null;
                                };
                                const items = await invokeWithTimeout<PdfBatchItem[]>(
                                    "read_pdf_batch",
                                    { paths },
                                    60000,
                                );
                                const parts: string[] = [];
                                for (const item of items) {
                                    const name = item.path.split(/[\\/]/).pop() ?? item.path;
                                    if (item.error || !item.base64) {
                                        parts.push(`[${name}] Erreur: ${item.error ?? "base64 vide"}`);
                                        continue;
                                    }
                                    try {
                                        const pages = await extractPdfPagesFromBase64(item.base64);
                                        const text = pages.length > 0 ? pages[0].text.slice(0, 2000) : "(aucun texte)";
                                        parts.push(`[PDF: ${name}]\n${text}`);
                                    } catch (e) {
                                        parts.push(`[${name}] Erreur extraction: ${e}`);
                                    }
                                }
                                await sendPrompt(
                                    `[read_pdf_batch] ${items.length} fichier(s) analysÃƒÆ’Ã‚Â©s :\n\n${parts.join("\n\n---\n\n")}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_pdf_batch]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ batch_rename ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â renommer plusieurs fichiers en un appel ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.batch_rename) {
                            try {
                                let entries: Array<{ from: string; to: string }>;
                                if (Array.isArray(parsedTool.batch_rename)) {
                                    // L'IA a gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©rÃƒÆ’Ã‚Â© un tableau natif JSON
                                    entries = parsedTool.batch_rename as Array<{ from: string; to: string }>;
                                } else {
                                    try {
                                        entries = JSON.parse(parsedTool.batch_rename);
                                    } catch {
                                        lastToolWasErrorRef.current = true;
                                        await sendPrompt(
                                            `[Erreur batch_rename] JSON invalide. Format attendu : [{"from": "chemin/ancien.pdf", "to": "nouveau.pdf"}, ...]\nLes guillemets internes doivent ÃƒÆ’Ã‚Âªtre ÃƒÆ’Ã‚Â©chappÃƒÆ’Ã‚Â©s avec \\\\.`,
                                            cfg,
                                        );
                                        return;
                                    }
                                }
                                type RenameResult = {
                                    from: string;
                                    to: string;
                                    success: boolean;
                                    error: string | null;
                                };
                                const results = await invokeWithTimeout<RenameResult[]>(
                                    "batch_rename_files",
                                    { renames: entries },
                                    30000,
                                );
                                const successCount = results.filter((r) => r.success).length;
                                const lines = results.map((r) =>
                                    r.success
                                        ? `  ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ ${r.from.split("/").pop()} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${r.to.split("/").pop()}`
                                        : `  ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ${r.from.split("/").pop()} : ${r.error}`,
                                );
                                await sendPrompt(
                                    `[batch_rename] ${successCount}/${results.length} fichiers renommÃƒÆ’Ã‚Â©s avec succÃƒÆ’Ã‚Â¨s.\n${lines.join("\n")}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur batch_rename]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Garde de mode : outils d'action bloquÃƒÆ’Ã‚Â©s hors mode agent ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        const isActionTool = !!(
                            parsedTool.create_skill ||
                            parsedTool.run_skill ||
                            parsedTool.cmd ||
                            parsedTool.command ||
                            parsedTool.http_request ||
                            parsedTool.write_file ||
                            parsedTool.create_mcp_server ||
                            parsedTool.start_mcp_server ||
                            parsedTool.call_mcp_tool ||
                            parsedTool.open_browser !== undefined ||
                            parsedTool.start_dev_server !== undefined ||
                            parsedTool.stop_dev_server !== undefined ||
                            parsedTool.get_browser_errors !== undefined ||
                            parsedTool.save_image !== undefined ||
                            parsedTool.download_image !== undefined ||
                            parsedTool.scrape_url !== undefined ||
                            parsedTool.search_web !== undefined ||
                            parsedTool["context7-search"] !== undefined ||
                            parsedTool["context7-docs"] !== undefined ||
                            parsedTool.save_plan !== undefined ||
                            parsedTool.create_terminal !== undefined ||
                            parsedTool.terminal_exec !== undefined ||
                            parsedTool.terminal_start_interactive !== undefined ||
                            parsedTool.terminal_send_stdin !== undefined ||
                            parsedTool.close_terminal !== undefined
                        );
                        if (!forceExecute && isActionTool && chatModeRef.current === "ask") {
                            const toolDesc =
                                parsedTool.cmd ??
                                parsedTool.command ??
                                parsedTool.create_skill ??
                                parsedTool.run_skill ??
                                parsedTool.http_request ??
                                parsedTool.read_file ??
                                parsedTool.write_file ??
                                parsedTool.create_mcp_server ??
                                parsedTool.start_mcp_server ??
                                parsedTool.call_mcp_tool ??
                                parsedTool.open_browser ??
                                parsedTool.start_dev_server ??
                                "action";
                            setPendingAgentPermission({
                                reason: `Je veux exÃƒÆ’Ã‚Â©cuter : **${toolDesc}**\nAutoriser en passant en mode Agent ?`,
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }
                        if (!forceExecute && isActionTool && chatModeRef.current === "plan") {
                            const toolDesc =
                                parsedTool.cmd ??
                                parsedTool.command ??
                                parsedTool.create_skill ??
                                parsedTool.run_skill ??
                                parsedTool.http_request ??
                                parsedTool.write_file ??
                                parsedTool.create_mcp_server ??
                                parsedTool.start_mcp_server ??
                                parsedTool.call_mcp_tool ??
                                parsedTool.open_browser ??
                                parsedTool.start_dev_server ??
                                "action";
                            setPendingPlanConfirm({
                                description: `**Plan** : je vais exÃƒÆ’Ã‚Â©cuter l'action suivante :\n\`${toolDesc}\`\n\nConfirmer l'exÃƒÆ’Ã‚Â©cution ?`,
                                parsed: parsedTool,
                                config: cfg,
                            });
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ create_skill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.create_skill) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "create_skill",
                                    {
                                        name: parsedTool.create_skill,
                                        description: parsedTool.description ?? "",
                                        content: parsedTool.content ?? "",
                                        skillType: parsedTool.skill_type ?? null,
                                        method: parsedTool.method ?? null,
                                        url: parsedTool.url ?? null,
                                        headersTemplate: parsedTool.headers ?? null,
                                        defaultBody: parsedTool.default_body ?? null,
                                        baseUrl: parsedTool.base_url ?? null,
                                        routes: parsedTool.routes ?? null,
                                    },
                                    20000,
                                );
                                await buildMachineContext();
                                const skillTypeLabel =
                                    parsedTool.skill_type === "http"
                                        ? "HTTP"
                                        : parsedTool.skill_type === "python"
                                          ? "Python"
                                          : parsedTool.skill_type === "nodejs"
                                            ? "Node.js"
                                            : parsedTool.skill_type === "composite"
                                              ? "Composite"
                                              : "PS1";
                                await sendPrompt(
                                    `[Skill ${skillTypeLabel} crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â© avec succÃƒÆ’Ã‚Â¨s] "${parsedTool.create_skill}" est sauvegardÃƒÆ’Ã‚Â© et prÃƒÆ’Ã‚Âªt.\n${result}\n\n` +
                                        `ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Tu peux maintenant :\n` +
                                        `  - Le tester avec \`run_skill\`\n` +
                                        `  - Ou rÃƒÆ’Ã‚Â©pondre ÃƒÆ’Ã‚Â  l'utilisateur que le skill est disponible\n` +
                                        `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â NE crÃƒÆ’Ã‚Â©e PAS ce skill ÃƒÆ’Ã‚Â  nouveau (il est dÃƒÆ’Ã‚Â©jÃƒÆ’Ã‚Â  sauvegardÃƒÆ’Ã‚Â© dans le fichier).`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur crÃƒÆ’Ã‚Â©ation skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ run_skill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.run_skill) {
                            try {
                                const output = await invokeWithTimeout<string>(
                                    "run_skill",
                                    { name: parsedTool.run_skill, args: parsedTool.args ?? null },
                                    60000,
                                );
                                await sendPrompt(
                                    `[RÃƒÆ’Ã‚Â©sultat du skill \`${parsedTool.run_skill}\`]\n\`\`\`\n${withAutoCritique(output, `run_skill:${parsedTool.run_skill}`)}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur d'exÃƒÆ’Ã‚Â©cution du skill \`${parsedTool.run_skill}\`]\n\`\`\`\n${err}\n\`\`\`\n\n` +
                                        `Pour corriger le skill, utilise create_skill avec le mÃƒÆ’Ã‚Âªme nom et le contenu corrigÃƒÆ’Ã‚Â©.`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ search_conversation ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.search_conversation !== undefined) {
                            try {
                                const results = await invokeWithTimeout<
                                    { conversation_id: number; day_label: string; role: string; content: string }[]
                                >("search_conversation_messages", { query: parsedTool.search_conversation }, 20000);
                                if (results.length === 0) {
                                    await sendPrompt(
                                        `[MÃƒÆ’Ã‚Â©moire] Aucun message trouvÃƒÆ’Ã‚Â© pour : "${parsedTool.search_conversation}"`,
                                        cfg,
                                    );
                                } else {
                                    const groups = new Map<
                                        number,
                                        { day_label: string; msgs: { role: string; content: string }[] }
                                    >();
                                    for (const m of results) {
                                        if (!groups.has(m.conversation_id))
                                            groups.set(m.conversation_id, { day_label: m.day_label, msgs: [] });
                                        groups.get(m.conversation_id)!.msgs.push({ role: m.role, content: m.content });
                                    }
                                    const parts: string[] = [];
                                    for (const [id, g] of groups) {
                                        parts.push(`\nÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Conv #${id} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${g.day_label} ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬`);
                                        for (const msg of g.msgs) {
                                            parts.push(`${msg.role === "user" ? "ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚Â¤" : "ÃƒÂ°Ã…Â¸Ã‚Â¤Ã¢â‚¬â€œ"} ${msg.content}`);
                                        }
                                    }
                                    await sendPrompt(
                                        `[MÃƒÆ’Ã‚Â©moire ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â "${parsedTool.search_conversation}"]${parts.join("\n")}`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur mÃƒÆ’Ã‚Â©moire]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ save_plan (checkpoint / mise ÃƒÆ’Ã‚Â  jour du plan) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.save_plan !== undefined) {
                            try {
                                const content = String(parsedTool.save_plan);
                                if (conversationId) {
                                    await invokeWithTimeout<string>(
                                        "save_conversation_plan",
                                        { conversationId, content },
                                        5000,
                                    );
                                    setPlanContent(content);
                                    await sendPrompt(`[PLAN.md] Plan sauvegardÃƒÆ’Ã‚Â© pour cette conversation.`, cfg);
                                } else {
                                    await sendPrompt(`[Erreur save_plan] Aucune conversation active.`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur save_plan]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ create_terminal ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.create_terminal !== undefined) {
                            onOpenTerminal?.();
                            try {
                                const info = await invokeWithTimeout<{ id: string; name: string; cwd: string }>(
                                    "create_terminal",
                                    { name: parsedTool.create_terminal || null, cwd: parsedTool.cwd ?? null },
                                    10000,
                                );
                                await sendPrompt(
                                    `[Terminal crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©]\n` +
                                        `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â ID RÃƒÆ’Ã¢â‚¬Â°EL (obligatoire pour toutes les commandes suivantes) : "${info.id}"\n` +
                                        `Nom : "${info.name}" | RÃƒÆ’Ã‚Â©pertoire : ${info.cwd}\n` +
                                        `\n` +
                                        `Tu DOIS utiliser l'ID "${info.id}" (pas le nom) dans tous les appels suivants.\n` +
                                        `Commandes disponibles :\n` +
                                        `  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ terminal_exec         ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ commandes ponctuelles non-interactives\n` +
                                        `  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ terminal_start_interactive ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ SSH, REPL et tout processus interactif\n` +
                                        `Exemple SSH :\n` +
                                        `  <tool>{"terminal_start_interactive": "ssh user@host", "terminal_id": "${info.id}"}</tool>`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur create_terminal]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ terminal_exec ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.terminal_exec !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_exec] ParamÃƒÆ’Ã‚Â¨tre terminal_id manquant. Utilise list_terminals pour voir les IDs disponibles.",
                                    cfg,
                                );
                                return;
                            }
                            try {
                                const _cmd = String(parsedTool.terminal_exec);
                                const isLongRunning =
                                    /^(npx\s+create-|yarn\s+create\s+|pnpm\s+create\s+|cargo\s+new\s+|dotnet\s+new\s+|ng\s+new\s+)/i.test(
                                        _cmd.trim(),
                                    );
                                const execTimeout = isLongRunning ? 300000 : 60000;
                                const result = await invokeWithTimeout<{
                                    terminal_id: string;
                                    output: string;
                                    new_cwd: string;
                                }>("terminal_exec", { terminalId: tid, command: _cmd }, execTimeout);
                                const feedback = withAutoCritique(result.output, `terminal_exec:${tid}`);
                                await sendPrompt(
                                    `[Terminal "${tid}" | cwd: ${result.new_cwd}]\n\`\`\`\n${feedback}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_exec "${tid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ close_terminal ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.close_terminal !== undefined) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "close_terminal",
                                    { terminalId: String(parsedTool.close_terminal) },
                                    5000,
                                );
                                await sendPrompt(`[Terminal] ${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur close_terminal]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ terminal_start_interactive ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.terminal_start_interactive !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_start_interactive] ParamÃƒÆ’Ã‚Â¨tre terminal_id manquant.\n" +
                                        "Flux correct :\n" +
                                        "  1. create_terminal pour obtenir un terminal_id (format: term-XXXXXXXXXX)\n" +
                                        "  2. terminal_start_interactive avec cet ID EXACT (ex: term-1776174852395)",
                                    cfg,
                                );
                                return;
                            }
                            // DÃƒÆ’Ã‚Â©tecter si l'IA a passÃƒÆ’Ã‚Â© un nom (sans "term-") au lieu d'un ID
                            if (!tid.startsWith("term-")) {
                                // Tenter de rÃƒÆ’Ã‚Â©soudre via list_terminals
                                try {
                                    const tlist = await invokeWithTimeout<{ id: string; name: string }[]>(
                                        "list_terminals",
                                        {},
                                        5000,
                                    );
                                    const match = tlist.find((t) => t.name === tid || t.id === tid);
                                    if (!match) {
                                        await sendPrompt(
                                            `[Erreur terminal_start_interactive] "${tid}" est un NOM, pas un ID.\n` +
                                                `L'ID doit commencer par "term-" (ex: term-1776174852395).\n` +
                                                `Terminaux disponibles :\n` +
                                                tlist.map((t) => `  ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ "${t.id}" (nom: ${t.name})`).join("\n"),
                                            cfg,
                                        );
                                        return;
                                    }
                                    // Corriger silencieusement et continuer avec le bon ID
                                    parsedTool.terminal_id = match.id;
                                } catch {
                                    await sendPrompt(
                                        `[Erreur terminal_start_interactive] "${tid}" n'est pas un ID valide (doit commencer par "term-").\n` +
                                            `Utilise create_terminal pour crÃƒÆ’Ã‚Â©er un terminal et rÃƒÆ’Ã‚Â©cupÃƒÆ’Ã‚Â¨re son ID.`,
                                        cfg,
                                    );
                                    return;
                                }
                            }
                            const realTid = String(parsedTool.terminal_id);
                            // RÃƒÆ’Ã‚Â©initialiser le curseur de lecture pour cette nouvelle session
                            terminalReadCursors.delete(realTid);
                            try {
                                await invokeWithTimeout<void>(
                                    "terminal_start_interactive",
                                    { terminalId: realTid, command: String(parsedTool.terminal_start_interactive) },
                                    8000,
                                );
                                await sendPrompt(
                                    `[Processus interactif dÃƒÆ’Ã‚Â©marrÃƒÆ’Ã‚Â© dans le terminal "${realTid}"]\n` +
                                        `Commande : ${parsedTool.terminal_start_interactive}\n` +
                                        `ÃƒÂ¢Ã‚ÂÃ‚Â³ L'utilisateur entre son mot de passe directement dans le terminal xterm.js.\n` +
                                        `ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ DÃƒÆ’Ã‚Â¨s que l'utilisateur confirme ÃƒÆ’Ã‚Âªtre connectÃƒÆ’Ã‚Â© (ou que tu vois un prompt distant), envoie les commandes avec terminal_send_stdin.\n` +
                                        `   La sortie de chaque commande te sera AUTOMATIQUEMENT retournÃƒÆ’Ã‚Â©e aprÃƒÆ’Ã‚Â¨s ~2.5 s.\n` +
                                        `   Exemple : <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "${realTid}"}</tool>\n` +
                                        `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Ne pas envoyer de commandes AVANT que l'utilisateur soit connectÃƒÆ’Ã‚Â© (mot de passe saisi).`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_start_interactive "${realTid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ terminal_send_stdin ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.terminal_send_stdin !== undefined) {
                            onOpenTerminal?.();
                            const tid = String(parsedTool.terminal_id ?? "");
                            if (!tid) {
                                await sendPrompt(
                                    "[Erreur terminal_send_stdin] ParamÃƒÆ’Ã‚Â¨tre terminal_id manquant.\n" +
                                        "Utilise list_terminals pour obtenir l'ID du terminal actif.",
                                    cfg,
                                );
                                return;
                            }
                            const input = String(parsedTool.terminal_send_stdin);

                            // Lire la taille du buffer AVANT d'envoyer la commande
                            let cursorBefore = terminalReadCursors.get(tid) ?? 0;
                            try {
                                const histBefore = await invokeWithTimeout<{ output: string }[]>(
                                    "get_terminal_history",
                                    { terminalId: tid },
                                    5000,
                                );
                                const liveBefore = histBefore[histBefore.length - 1]?.output ?? "";
                                // Supprimer les ANSI pour calculer la longueur texte rÃƒÆ’Ã‚Â©elle
                                cursorBefore = stripAnsi(liveBefore).length;
                            } catch {
                                /* si ÃƒÆ’Ã‚Â§a ÃƒÆ’Ã‚Â©choue, on prend le curseur mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â© */
                            }

                            try {
                                // Envoyer la commande au PTY
                                await invokeWithTimeout<void>("terminal_send_stdin", { terminalId: tid, input }, 5000);

                                // Attendre la rÃƒÆ’Ã‚Â©ponse (2.5 s max pour les commandes rapides)
                                await new Promise((r) => setTimeout(r, 2500));

                                // Lire la sortie accumulÃƒÆ’Ã‚Â©e depuis le curseur
                                const histAfter = await invokeWithTimeout<{ command: string; output: string }[]>(
                                    "get_terminal_history",
                                    { terminalId: tid },
                                    5000,
                                );
                                const rawOutput = histAfter[histAfter.length - 1]?.output ?? "";
                                const cleanOutput = stripAnsi(rawOutput);
                                const newOutput = cleanOutput.slice(cursorBefore).trimStart();

                                // Mettre ÃƒÆ’Ã‚Â  jour le curseur pour la prochaine commande
                                terminalReadCursors.set(tid, cleanOutput.length);

                                const snippet =
                                    newOutput.length > 6000
                                        ? newOutput.slice(0, 6000) + `\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦[tronquÃƒÆ’Ã‚Â© ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${newOutput.length} chars au total]`
                                        : newOutput;

                                if (snippet.trim()) {
                                    await sendPrompt(
                                        `[Sortie du terminal "${tid}" ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â commande: ${JSON.stringify(input.trim())}]\n` +
                                            `\`\`\`\n${snippet}\n\`\`\``,
                                        cfg,
                                    );
                                } else {
                                    await sendPrompt(
                                        `[Terminal "${tid}"] Commande envoyÃƒÆ’Ã‚Â©e (${JSON.stringify(input.trim())}), aucune sortie reÃƒÆ’Ã‚Â§ue en 2.5 s.\n` +
                                            `La commande est peut-ÃƒÆ’Ã‚Âªtre encore en cours ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tu peux rÃƒÆ’Ã‚Â©envoyer terminal_send_stdin avec une commande vide ("\\n") pour rafraÃƒÆ’Ã‚Â®chir.`,
                                        cfg,
                                    );
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur terminal_send_stdin "${tid}"]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ context7-search ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool["context7-search"] !== undefined) {
                            try {
                                const result = await searchLibrary(
                                    String(parsedTool["context7-search"]),
                                    parsedTool.query ?? "",
                                );
                                await sendPrompt(`[Context7 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â BibliothÃƒÆ’Ã‚Â¨ques trouvÃƒÆ’Ã‚Â©es]\n${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur context7-search]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ context7-docs ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool["context7-docs"] !== undefined) {
                            try {
                                const result = await queryDocs(
                                    String(parsedTool["context7-docs"]),
                                    parsedTool.query ?? "",
                                    Number(parsedTool.tokens ?? 4000),
                                );
                                await sendPrompt(`[Context7 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Documentation]\n${result}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur context7-docs]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ http_request ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.http_request) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "http_request",
                                    {
                                        method: parsedTool.http_request,
                                        url: parsedTool.url ?? "",
                                        headers: parsedTool.headers ?? null,
                                        body: parsedTool.body ?? null,
                                    },
                                    30000,
                                );
                                await sendPrompt(
                                    `[RÃƒÆ’Ã‚Â©ponse HTTP]\n\`\`\`\n${withAutoCritique(result, "http_request")}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur HTTP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ create_mcp_server ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.create_mcp_server) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "create_mcp_server",
                                    {
                                        name: parsedTool.create_mcp_server,
                                        description: parsedTool.description ?? "",
                                        content: parsedTool.content ?? "",
                                    },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Serveur MCP crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â©] "${parsedTool.create_mcp_server}" sauvegardÃƒÆ’Ã‚Â©.\n${result}\n\n` +
                                        `DÃƒÆ’Ã‚Â©marre-le maintenant avec start_mcp_server pour voir ses outils.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur crÃƒÆ’Ã‚Â©ation serveur MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ start_mcp_server ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.start_mcp_server) {
                            try {
                                const tools = await invokeWithTimeout<{ name: string; description: string }[]>(
                                    "start_mcp_server",
                                    { name: parsedTool.start_mcp_server },
                                    20000,
                                );
                                const toolList = tools.map((t) => `  - ${t.name}: ${t.description}`).join("\n");
                                await sendPrompt(
                                    `[Serveur MCP "${parsedTool.start_mcp_server}" dÃƒÆ’Ã‚Â©marrÃƒÆ’Ã‚Â©]\nOutils disponibles :\n${toolList || "  (aucun outil)"}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur dÃƒÆ’Ã‚Â©marrage serveur MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ call_mcp_tool ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.call_mcp_tool) {
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "call_mcp_tool",
                                    {
                                        serverName: parsedTool.call_mcp_tool,
                                        toolName: parsedTool.tool ?? "",
                                        argsJson: parsedTool.args ?? null,
                                    },
                                    20000,
                                );
                                await sendPrompt(
                                    `[RÃƒÆ’Ã‚Â©sultat MCP tool "${parsedTool.tool}"]\n${withAutoCritique(result, `mcp:${parsedTool.tool}`)}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur appel outil MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ list_mcp_servers ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.list_mcp_servers !== undefined) {
                            try {
                                const servers = await invokeWithTimeout<
                                    { name: string; description: string; running: boolean; tools: { name: string }[] }[]
                                >("list_mcp_servers", {}, 20000);
                                if (servers.length === 0) {
                                    await sendPrompt(
                                        `[MCP] Aucun serveur MCP disponible. CrÃƒÆ’Ã‚Â©e-en un avec create_mcp_server.`,
                                        cfg,
                                    );
                                } else {
                                    const list = servers
                                        .map(
                                            (s) =>
                                                `  - ${s.name} ${s.running ? "(en cours)" : "(arrÃƒÆ’Ã‚ÂªtÃƒÆ’Ã‚Â©)"}: ${s.description}\n    Outils: ${s.tools.map((t) => t.name).join(", ") || "dÃƒÆ’Ã‚Â©marrer pour voir"}`,
                                        )
                                        .join("\n");
                                    await sendPrompt(`[Serveurs MCP disponibles]\n${list}`, cfg);
                                }
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur liste MCP]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ read_skill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.read_skill !== undefined) {
                            try {
                                const content = await invokeWithTimeout<string>(
                                    "read_skill",
                                    { name: String(parsedTool.read_skill) },
                                    10000,
                                );
                                await sendPrompt(
                                    `[Contenu du skill \`${parsedTool.read_skill}\`]\n\`\`\`\n${content}\n\`\`\`\n\nAnalyse ce contenu et applique les corrections nÃƒÆ’Ã‚Â©cessaires avec create_skill.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur read_skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ patch_skill ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.patch_skill !== undefined) {
                            try {
                                const msg = await invokeWithTimeout<string>(
                                    "patch_skill",
                                    {
                                        name: String(parsedTool.patch_skill),
                                        search: String(parsedTool.search ?? ""),
                                        replace: String(parsedTool.replace ?? ""),
                                    },
                                    10000,
                                );
                                await sendPrompt(`[patch_skill OK] ${msg}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur patch_skill]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ write_file ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.write_file) {
                            try {
                                const rawContent = parsedTool.content ?? "";
                                const content = rawContent
                                    .replace(/\\n/g, "\n")
                                    .replace(/\\t/g, "\t")
                                    .replace(/\\r/g, "\r");
                                const result = await invokeWithTimeout<string>(
                                    "write_file",
                                    { path: parsedTool.write_file, content },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Fichier ÃƒÆ’Ã‚Â©crit] ${result}\n` +
                                        `PROCHAINE ACTION OBLIGATOIRE : si d'autres fichiers restent ÃƒÆ’Ã‚Â  ÃƒÆ’Ã‚Â©crire, appelle write_file immÃƒÆ’Ã‚Â©diatement. Sinon (tous les fichiers sont prÃƒÆ’Ã‚Âªts), appelle start_dev_server sur le dossier du projet. Ne gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â¨re PAS de texte d'explication entre deux outils.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur ÃƒÆ’Ã‚Â©criture fichier]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ open_browser (ouvrir une URL dans le navigateur intÃƒÆ’Ã‚Â©grÃƒÆ’Ã‚Â©) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.open_browser !== undefined) {
                            try {
                                const targetUrl = parsedTool.open_browser as string;
                                onOpenBrowserUrl?.(targetUrl);
                                await new Promise((r) => setTimeout(r, 1500));
                                const errs = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
                                const errReport =
                                    errs.length > 0
                                        ? `\nErreurs JS capturÃƒÆ’Ã‚Â©es :\n${errs.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
                                        : "\nAucune erreur JS capturÃƒÆ’Ã‚Â©e.";
                                await sendPrompt(`[Navigateur] Page ouverte : ${targetUrl}${errReport}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur open_browser]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ get_browser_errors (lire les erreurs JS capturÃƒÆ’Ã‚Â©es) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.get_browser_errors !== undefined) {
                            try {
                                const errs = await invokeWithTimeout<string[]>("get_browser_errors", {}, 5000);
                                const report =
                                    errs.length === 0
                                        ? "Aucune erreur capturÃƒÆ’Ã‚Â©es."
                                        : errs.map((e, i) => `${i + 1}. ${e}`).join("\n");

                                // DÃƒÆ’Ã‚Â©tecter les erreurs pointant vers des fichiers EXTERNES (pas index.html)
                                let externalFilesNote = "";
                                if (errs.length > 0) {
                                    const externalPaths = new Set<string>();
                                    for (const e of errs) {
                                        const m = e.match(/\(https?:\/\/[^/]+\/([^:)]+):\d+:\d+\)/);
                                        if (m && !m[1].endsWith("index.html")) {
                                            externalPaths.add(m[1]); // ex: "src/index.js"
                                        }
                                    }
                                    if (externalPaths.size > 0) {
                                        const paths = [...externalPaths];
                                        externalFilesNote =
                                            `\n\nÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â ATTENTION ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FICHIERS EXTERNES DÃƒÆ’Ã¢â‚¬Â°TECTÃƒÆ’Ã¢â‚¬Â°S :\n` +
                                            `Ces erreurs NE viennent PAS de ton index.html, elles pointent vers :\n` +
                                            paths.map((p) => `  - ${p}`).join("\n") +
                                            `\nDIAGNOSTIC OBLIGATOIRE AVANT TOUT PATCH :\n` +
                                            `  1. As-tu crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â© ces fichiers toi-mÃƒÆ’Ã‚Âªme ? Si oui ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ lis-les avec read_file.\n` +
                                            `  2. Si non ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ le serveur de dev charge un template par dÃƒÆ’Ã‚Â©faut. Dans ce cas :\n` +
                                            `     ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Utilise cmd pour lister le dossier du projet et identifier les fichiers parasites.\n` +
                                            `     ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Supprime ou ignore ces fichiers (ils ne font pas partie de ton projet).\n` +
                                            `  3. NE JAMAIS patcher ton index.html pour corriger une erreur provenant d'un autre fichier.`;
                                    }
                                }

                                const base = errs.length > 0 ? withAutoCritique(report, "get_browser_errors") : report;
                                await sendPrompt(`[Erreurs navigateur]\n${base}${externalFilesNote}`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur get_browser_errors]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ stop_dev_server ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.stop_dev_server !== undefined) {
                            try {
                                await invokeWithTimeout<void>("stop_dev_server", {}, 5000);
                                await sendPrompt(`[Serveur dev arrÃƒÆ’Ã‚ÂªtÃƒÆ’Ã‚Â©] Le serveur local a ÃƒÆ’Ã‚Â©tÃƒÆ’Ã‚Â© stoppÃƒÆ’Ã‚Â©.`, cfg);
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur stop_dev_server]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ start_dev_server (dÃƒÆ’Ã‚Â©marrer le serveur local) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.start_dev_server !== undefined) {
                            try {
                                const dir = parsedTool.start_dev_server as string;
                                const port = await invokeWithTimeout<number>(
                                    "start_dev_server",
                                    { baseDir: dir, port: 7820 },
                                    8000,
                                );
                                const devUrl = `http://127.0.0.1:${port}/`;
                                onOpenBrowserUrl?.(devUrl);
                                shellOpen(devUrl).catch(() => {});
                                await new Promise((r) => setTimeout(r, 1500));
                                const errs = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
                                let errReport = "\nAucune erreur JS capturÃƒÆ’Ã‚Â©e au dÃƒÆ’Ã‚Â©marrage.";
                                if (errs.length > 0) {
                                    const lines = errs.map((e, i) => `${i + 1}. ${e}`).join("\n");
                                    const externalPaths = new Set<string>();
                                    for (const e of errs) {
                                        const m = e.match(/\(https?:\/\/[^/]+\/([^:)]+):\d+:\d+\)/);
                                        if (m && !m[1].endsWith("index.html")) externalPaths.add(m[1]);
                                    }
                                    errReport = `\nErreurs JS capturÃƒÆ’Ã‚Â©es :\n${lines}`;
                                    if (externalPaths.size > 0) {
                                        errReport +=
                                            `\n\nÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â Ces erreurs pointent vers des fichiers EXTERNES (${[...externalPaths].join(", ")}) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ` +
                                            `probablement un template du serveur. Utilise cmd pour lister le dossier et identifier les fichiers parasites.`;
                                    }
                                }
                                await sendPrompt(
                                    `[Serveur dev dÃƒÆ’Ã‚Â©marrÃƒÆ’Ã‚Â©] ${devUrl} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â dossier : ${dir}${errReport}\nProchaine action OBLIGATOIRE : appelle get_browser_errors pour valider le rendu, puis open_browser pour ouvrir la page.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur start_dev_server]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ save_image (sauvegarder une image base64 sur disque) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.save_image !== undefined) {
                            try {
                                const result = await invokeWithTimeout<{
                                    path: string;
                                    dataUrl: string;
                                    filename: string;
                                }>(
                                    "save_image",
                                    { dataUrl: parsedTool.save_image, filename: parsedTool.filename ?? null },
                                    20000,
                                );
                                await sendPrompt(
                                    `[Image sauvegardÃƒÆ’Ã‚Â©e] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur save_image]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ download_image (tÃƒÆ’Ã‚Â©lÃƒÆ’Ã‚Â©charger une image depuis une URL) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.download_image !== undefined) {
                            try {
                                const result = await invokeWithTimeout<{
                                    path: string;
                                    dataUrl: string;
                                    filename: string;
                                }>(
                                    "download_image",
                                    { url: parsedTool.download_image, filename: parsedTool.filename ?? null },
                                    30000,
                                );
                                await sendPrompt(
                                    `[Image tÃƒÆ’Ã‚Â©lÃƒÆ’Ã‚Â©chargÃƒÆ’Ã‚Â©e] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur download_image]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ search_web (recherche web rÃƒÆ’Ã‚Â©elle) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.search_web !== undefined) {
                            const swQuery = parsedTool.search_web as string;
                            const swSource = (parsedTool.source as string) || "duckduckgo";
                            const swLocale = (parsedTool.locale as string) || "fr";
                            if (!swQuery || typeof swQuery !== "string") {
                                await sendPrompt(`[Erreur search_web]: paramÃƒÆ’Ã‚Â¨tre query requis`, cfg);
                                return;
                            }
                            let swApiKey: string | null = null;
                            if (swSource === "brave") swApiKey = localStorage.getItem("search_brave_api_key") || null;
                            if (swSource === "serper") swApiKey = localStorage.getItem("search_serper_api_key") || null;
                            if (swSource === "tavily") swApiKey = localStorage.getItem("search_tavily_api_key") || null;
                            try {
                                interface SWResult {
                                    title: string;
                                    snippet: string;
                                    url: string;
                                    source: string;
                                }
                                const results = await invokeWithTimeout<SWResult[]>(
                                    "search_web",
                                    { query: swQuery, source: swSource, apiKey: swApiKey, locale: swLocale },
                                    20000,
                                );
                                const lines = results
                                    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${r.url}`)
                                    .join("\n\n");
                                await sendPrompt(
                                    `[RÃƒÆ’Ã‚Â©sultats de recherche ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â source: ${swSource}]\nRequÃƒÆ’Ã‚Âªte: "${swQuery}"\n\n${lines}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur search_web]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ scrape_url (extraire le contenu d'une page web) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.scrape_url !== undefined) {
                            const scrapeTarget = parsedTool.scrape_url as string;
                            const scrapeMode = (parsedTool.mode as string) || "static";
                            if (!scrapeTarget || typeof scrapeTarget !== "string") {
                                await sendPrompt(`[Erreur scrape_url]: paramÃƒÆ’Ã‚Â¨tre url requis`, cfg);
                                return;
                            }
                            try {
                                interface ScrapedPage {
                                    url: string;
                                    title: string;
                                    description: string;
                                    text: string;
                                    headings: { level: string; text: string }[];
                                    links: { text: string; href: string }[];
                                    mode: string;
                                }
                                const page = await invokeWithTimeout<ScrapedPage>(
                                    "scrape_url",
                                    { url: scrapeTarget, mode: scrapeMode },
                                    scrapeMode === "js" ? 20000 : 35000,
                                );
                                const headingsMd =
                                    page.headings.length > 0
                                        ? "\n**Titres :**\n" +
                                          page.headings.map((h) => `- [${h.level}] ${h.text}`).join("\n")
                                        : "";
                                const linksMd =
                                    page.links.length > 0
                                        ? "\n**Liens (top 10) :**\n" +
                                          page.links
                                              .slice(0, 10)
                                              .map((l) => `- [${l.text || l.href}](${l.href})`)
                                              .join("\n")
                                        : "";
                                await sendPrompt(
                                    `[Page scrapÃƒÆ’Ã‚Â©e ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â mode:${page.mode}]\n**URL :** ${page.url}\n**Titre :** ${page.title}\n**Description :** ${page.description}\n\n**Contenu :**\n${page.text}${headingsMd}${linksMd}`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur scrape_url]: ${err}`, cfg);
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ save_fact JSON ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.save_fact !== undefined) {
                            try {
                                const key = String(parsedTool.save_fact);
                                const val = String(parsedTool.value ?? "");
                                if (key && val) {
                                    await invokeWithTimeout<void>("save_user_fact", { key, value: val }, 5000).catch(
                                        () => {},
                                    );
                                }
                            } catch {
                                /* silencieux */
                            }
                            await sendPrompt(
                                `[Fait mÃƒÆ’Ã‚Â©morisÃƒÆ’Ã‚Â©] Poursuis ta rÃƒÆ’Ã‚Â©ponse lÃƒÆ’Ã‚Â  oÃƒÆ’Ã‚Â¹ tu t'es arrÃƒÆ’Ã‚ÂªtÃƒÆ’Ã‚Â© ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ne rÃƒÆ’Ã‚Â©pÃƒÆ’Ã‚Â¨te pas ce que tu as dÃƒÆ’Ã‚Â©jÃƒÆ’Ã‚Â  dit.`,
                                cfg,
                            );
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ patch_file JSON (format alternatif ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SEARCH/REPLACE comme clÃƒÆ’Ã‚Â©s) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        if (parsedTool.patch_file !== undefined) {
                            const filePath = String(parsedTool.patch_file);
                            const searchStr = String(parsedTool.SEARCH ?? parsedTool.search ?? "");
                            const replaceStr = String(parsedTool.REPLACE ?? parsedTool.replace ?? "");
                            if (!searchStr) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur patch_file] ParamÃƒÆ’Ã‚Â¨tre SEARCH manquant.\n` +
                                        `RAPPEL : utilise le format TAG <patch_file> ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â JAMAIS le format JSON pour patch_file :\n` +
                                        `<patch_file path="${filePath}">SEARCH:\n` +
                                        `<texte exact ÃƒÆ’Ã‚Â  trouver>\n` +
                                        `REPLACE:\n` +
                                        `<nouveau texte>\n` +
                                        `</patch_file>`,
                                    cfg,
                                );
                                return;
                            }
                            try {
                                const result = await invokeWithTimeout<string>(
                                    "patch_file",
                                    { path: filePath, search: searchStr, replace: replaceStr },
                                    20000,
                                );
                                await sendPrompt(
                                    `[patch_file] ${result}\n` +
                                        `ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â RAPPEL : utilise le format TAG <patch_file path="..."> ÃƒÆ’Ã‚Â  l'avenir ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pas le format JSON.`,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(
                                    `[Erreur patch_file sur "${filePath}"]: ${err}\n` +
                                        `RAPPEL : le format correct est le TAG <patch_file path="${filePath}">SEARCH:\n...\nREPLACE:\n...</patch_file>`,
                                    cfg,
                                );
                            }
                            return;
                        }

                        // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ cmd (commande ponctuelle) ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
                        const cmd = parsedTool.cmd ?? parsedTool.command ?? "";
                        if (cmd.trim()) {
                            try {
                                const output = await invokeWithTimeout<string>(
                                    "run_shell_command",
                                    { command: cmd },
                                    60000,
                                );
                                await sendPrompt(
                                    `[RÃƒÆ’Ã‚Â©sultat de la commande \`${cmd}\`]\n\`\`\`\n${withAutoCritique(output, `cmd:${cmd}`)}\n\`\`\``,
                                    cfg,
                                );
                            } catch (err) {
                                lastToolWasErrorRef.current = true;
                                await sendPrompt(`[Erreur commande \`${cmd}\`]: ${err}`, cfg);
                            }
                        } else {
                            // Aucun outil reconnu dans le JSON parsÃƒÆ’Ã‚Â© ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ forcer une rÃƒÆ’Ã‚Â©ponse pour ÃƒÆ’Ã‚Â©viter le silence
                            const knownKeys = Object.keys(parsedTool).join(", ");
                            await sendPrompt(
                                `[SystÃƒÆ’Ã‚Â¨me] Outil inconnu ou clÃƒÆ’Ã‚Â© non reconnue : { ${knownKeys} }.\n` +
                                    `VÃƒÆ’Ã‚Â©rifie le nom de l'outil avec get_tool_doc ou consulte la liste des outils disponibles.`,
                                cfg,
                            );
                        }
                    };
                    // Exposer dispatch pour les boutons de confirmation
                    dispatchToolRef.current = dispatch;

                    // Si plusieurs <tool> dans le mÃƒÆ’Ã‚Âªme message, exÃƒÆ’Ã‚Â©cuter UNIQUEMENT le premier ici.
                    // Exception : si ce sont tous des write_file consÃƒÆ’Ã‚Â©cutifs, les exÃƒÆ’Ã‚Â©cuter tous d'un coup.
                    const remainingWriteFiles = allToolMatches.slice(1).reduce<Record<string, string>[]>((acc, m) => {
                        try {
                            const p = JSON.parse(sanitizeLlmJson(m[1]));
                            if (p.write_file) acc.push(p);
                        } catch {
                            /* ignore */
                        }
                        return acc;
                    }, []);

                    if (parsed.write_file && remainingWriteFiles.length > 0) {
                        // Mode batch : exÃƒÆ’Ã‚Â©cute tous les write_file du message en une fois
                        (async () => {
                            const results: string[] = [];
                            const allFiles = [parsed, ...remainingWriteFiles];
                            for (const fileTool of allFiles) {
                                try {
                                    const rawContent = fileTool.content ?? "";
                                    const content = rawContent
                                        .replace(/\\n/g, "\n")
                                        .replace(/\\t/g, "\t")
                                        .replace(/\\r/g, "\r");
                                    const r = await invokeWithTimeout<string>(
                                        "write_file",
                                        { path: fileTool.write_file, content },
                                        20000,
                                    );
                                    results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ ${r}`);
                                } catch (err) {
                                    results.push(`ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ ${fileTool.write_file} : ${err}`);
                                }
                            }
                            await sendPrompt(
                                `[Fichiers ÃƒÆ’Ã‚Â©crits en batch]\n${results.join("\n")}\n` +
                                    `PROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`,
                                config,
                            );
                        })().finally(() => setToolRunning(false));
                    } else {
                        dispatch(parsed, config).finally(() => setToolRunning(false));
                    }
                }
            }
        }
        // Sauvegarder la rÃƒÆ’Ã‚Â©ponse assistant une fois le streaming terminÃƒÆ’Ã‚Â©
        if (prevStreamingRef.current && !streaming) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content && conversationId) {
                let content = lastMsg.content;

                // Extraction du titre gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©rÃƒÆ’Ã‚Â© par le LLM (<conv_title>...</conv_title>)
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
                    }
                }

                // Extraction et sauvegarde des faits utilisateur (<save_fact key="..." value="..."/>)
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

                // DÃƒÆ’Ã‚Â©tection et application automatique des blocs patch (FILE/SEARCH/REPLACE)
                if (hasPatchBlocks(content)) {
                    setPatchResults(null);
                    applyAllPatches(content).then((results) => {
                        setPatchResults(results);
                    });
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming]);

    // Lecture automatique TTS quand le streaming se termine
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
        // speakText est stable (dÃƒÆ’Ã‚Â©fini dans le mÃƒÆ’Ã‚Âªme scope), ttsEnabled intentionnellement exclu pour ÃƒÆ’Ã‚Â©viter double-lecture
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming, messages]);
}
