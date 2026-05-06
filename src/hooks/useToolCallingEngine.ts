import React, { useEffect } from "react";
import { type PatchResult } from "../lib/skillPatcher";
import { normalizeToolTags } from "../lib/chatUtils";
import { parseToolBlock } from "../lib/toolJsonParser";
import { buildToolParseError } from "../lib/toolParseErrors";
import { collectRemainingWriteFiles, runWriteFileBatch } from "../lib/toolCoreHandlers";
import { handlePatchFileTags, handleWriteFileTags } from "../lib/toolTagHandlers";
import type { LlamaMessage, Attachment } from "./useLlama";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { TurboQuantType } from "../context/ModelSettingsContext";
import type { ChatMode } from "../lib/chatUtils";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createDispatchToolCall } from "./useToolCallingDispatch";
import { handlePostStreamPersistence } from "./useToolCallingPostStream";
import { useToolCallingTts } from "./useToolCallingTts";

export interface UseModelConfig {
    modelPath: string;
    temperature: number;
    contextWindow: number;
    turboQuant: TurboQuantType;
    sampling: LlamaLaunchConfig["sampling"];
    thinkingEnabled: boolean;
    machineContext: string | null;
    systemPrompt: string;
}

export interface UseToolCallingRefs {
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
    projectStructureRef: React.MutableRefObject<string>;
    planRef: React.MutableRefObject<string>;
}

export interface UseSDConfig {
    /** Format imposé par le sélecteur UI avant génération — ex: "16:9" */
    selectedSDFormat?: string | null;
    /** Nombre d'itérations de génération (1-4) */
    selectedBatchCount?: number;
    /** Modèle SD imposé par le sélecteur UI */
    selectedSDModel?: string | null;
}

interface UseToolCallingOptions {
    streaming: boolean;
    toolRunning: boolean;
    setToolRunning: Dispatch<SetStateAction<boolean>>;
    messages: LlamaMessage[];
    modelConfig: UseModelConfig;
    refs: UseToolCallingRefs;
    sdConfig?: UseSDConfig;
    sendPrompt: (
        prompt: string,
        config: Partial<LlamaLaunchConfig>,
        attachments?: Attachment[],
        save?: boolean,
    ) => Promise<unknown>;
    updateLastAssistantContent: (content: string) => void;
    buildMachineContext: () => Promise<void>;
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
    setPlanContent: Dispatch<SetStateAction<string>>;
    setImageGenerating: Dispatch<SetStateAction<boolean>>;
    setLiveImagePreview?: Dispatch<SetStateAction<string | null>>;
    setLiveImageProgress?: Dispatch<SetStateAction<number>>;
    insertMessage: (msg: LlamaMessage) => void;
}

export function useToolCalling({
    streaming,
    toolRunning,
    setToolRunning,
    messages,
    modelConfig,
    refs,
    sdConfig,
    sendPrompt,
    updateLastAssistantContent,
    buildMachineContext,
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
    setPlanContent,
    setImageGenerating,
    setLiveImagePreview,
    setLiveImageProgress,
    insertMessage,
}: UseToolCallingOptions): void {
    const {
        modelPath,
        temperature,
        contextWindow,
        turboQuant,
        sampling,
        thinkingEnabled,
        machineContext,
        systemPrompt,
    } = modelConfig;
    const {
        chatModeRef,
        prevStreamingRef,
        lastToolSignatureRef,
        lastToolWasErrorRef,
        jsonParseErrorCountRef,
        convTitleSetRef,
        dispatchToolRef,
        projectStructureRef,
        planRef,
    } = refs;
    const selectedSDFormat = sdConfig?.selectedSDFormat;
    const selectedBatchCount = sdConfig?.selectedBatchCount;
    const selectedSDModel = sdConfig?.selectedSDModel;

    const consultedToolDocsRef = React.useRef<Set<string>>(new Set());
    const buildConfig = (): Partial<LlamaLaunchConfig> => ({
        modelPath,
        temperature,
        contextWindow,
        turboQuant,
        sampling,
        thinkingEnabled,
        systemPrompt: machineContext ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "") : systemPrompt,
    });

    useEffect(() => {
        if (prevStreamingRef.current && !streaming && !toolRunning) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const normalizedContent = normalizeToolTags(lastMsg.content);

                const config = buildConfig();

                setToolRunning(true);
                (async () => {
                    const handledPatchTags = await handlePatchFileTags({
                        normalizedContent,
                        cfg: config,
                        sendPrompt,
                        lastToolWasErrorRef,
                    });
                    if (handledPatchTags) return;

                    const handledWriteTags = await handleWriteFileTags({
                        normalizedContent,
                        cfg: config,
                        sendPrompt,
                        lastToolWasErrorRef,
                    });
                    if (handledWriteTags) return;

                    // Extraire TOUS les blocs <tool> dans l'ordre
                    const allToolMatches = [...normalizedContent.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)];
                    const toolMatch = allToolMatches.length > 0 ? allToolMatches[0] : null;
                    if (toolMatch) {
                        const { parsed, error: parseError } = parseToolBlock(toolMatch[1]);
                        if (parseError !== null || parsed === null) {
                            jsonParseErrorCountRef.current += 1;
                            const attempt = jsonParseErrorCountRef.current;
                            const config = buildConfig();
                            setToolRunning(true);
                            const errMsg = buildToolParseError(toolMatch[1], parseError, attempt);
                            if (attempt > 2) jsonParseErrorCountRef.current = 0;
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

                        const dispatch = createDispatchToolCall({
                            chatModeRef,
                            lastToolSignatureRef,
                            lastToolWasErrorRef,
                            consultedToolDocsRef,
                            sendPrompt,
                            setPendingQuestion,
                            setPendingAgentPermission,
                            setPendingPlanConfirm,
                            applyMode,
                            setTodoItems,
                            setProjectStructure,
                            setPlanContent,
                            buildMachineContext,
                            conversationId,
                            projectStructureRef,
                            planRef,
                            onOpenTerminal,
                            onOpenBrowserUrl,
                            setImageGenerating,
                            setLiveImagePreview,
                            setLiveImageProgress,
                            selectedSDFormat,
                            selectedBatchCount,
                            selectedSDModel,
                            insertMessage,
                        });
                        // Exposer dispatch pour les boutons de confirmation
                        dispatchToolRef.current = dispatch;

                        const remainingWriteFiles = collectRemainingWriteFiles(
                            allToolMatches.map((match) => {
                                const copy = [...match];
                                return copy as RegExpMatchArray;
                            }),
                        );

                        if (parsed.write_file && remainingWriteFiles.length > 0) {
                            runWriteFileBatch([parsed, ...remainingWriteFiles], config, sendPrompt).finally(() =>
                                setToolRunning(false),
                            );
                        } else {
                            dispatch(parsed, config).finally(() => setToolRunning(false));
                        }
                    }
                })().finally(() => setToolRunning(false));
            }
        }
        handlePostStreamPersistence({
            streaming,
            prevStreamingRef,
            messages,
            conversationId,
            convTitleSetRef,
            onConversationTitleChanged,
            updateLastAssistantContent,
            setPatchResults,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming]);

    useToolCallingTts({
        streaming,
        prevStreamingRef,
        ttsEnabled,
        messages,
        speakText,
    });
}
