import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { hasPatchBlocks, applyAllPatches, type PatchResult } from "../lib/skillPatcher";
import { normalizeToolTags } from "../lib/chatUtils";
import { parseToolBlock } from "../lib/toolJsonParser";
import { buildToolParseError } from "../lib/toolParseErrors";
import { describeTool, isActionTool, resolveToolDoc, withAutoCritique } from "../lib/toolDispatchUtils";
import {
    handleAnalyzeFolder,
    handleBatchRename,
    handleListFolderFiles,
    handleListFolderImages,
    handleListFolderPdfs,
    handleReadFile,
    handleReadImage,
    handleReadImageBatch,
    handleReadPdf,
    handleReadPdfBatch,
    handleReadPdfBrief,
} from "../lib/toolFileHandlers";
import { handleCreateSkill, handlePatchSkill, handleReadSkill, handleRunSkill } from "../lib/toolSkillHandlers";
import {
    handleCloseTerminal,
    handleCreateTerminal,
    handleTerminalExec,
    handleTerminalSendStdin,
    handleTerminalStartInteractive,
} from "../lib/toolTerminalHandlers";
import {
    collectRemainingWriteFiles,
    handleGetHardwareInfo,
    handlePatchFileJson,
    handleRunCommand,
    handleSaveFact,
    handleSavePlan,
    handleSearchConversation,
    handleUnknownTool,
    handleWriteFile,
    runWriteFileBatch,
} from "../lib/toolCoreHandlers";
import { handlePatchFileTags, handleWriteFileTags } from "../lib/toolTagHandlers";
import {
    handleCallMcpTool,
    handleContext7Docs,
    handleContext7Search,
    handleCreateMcpServer,
    handleDownloadImage,
    handleGenerateImage,
    handleGetBrowserErrors,
    handleHttpRequest,
    handleListMcpServers,
    handleOpenBrowser,
    handleSaveImage,
    handleScrapeUrl,
    handleSearchWeb,
    handleStartDevServer,
    handleStartMcpServer,
    handleStopDevServer,
} from "../lib/toolWebHandlers";
import {
    handleCheckTodo,
    handleGetDevServerInfo,
    handleGetPlan,
    handleGetProjectStructure,
    handleGetTerminalHistory,
    handleListTerminals,
    handleSaveProjectStructure,
    handleSetTodo,
} from "../lib/toolStateHandlers";
import type { LlamaMessage, Attachment } from "./useLlama";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { TurboQuantType } from "../context/ModelSettingsContext";
import type { ChatMode } from "../lib/chatUtils";
import { buildFallbackConversationTitle } from "../lib/chatUtils";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

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

    useEffect(() => {
        if (prevStreamingRef.current && !streaming && !toolRunning) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content) {
                const normalizedContent = normalizeToolTags(lastMsg.content);

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
                            const errMsg = buildToolParseError(toolMatch[1], parseError, attempt);
                            if (attempt > 2) jsonParseErrorCountRef.current = 0;
                            sendPrompt(errMsg, config).finally(() => setToolRunning(false));
                            return;
                        }
                        jsonParseErrorCountRef.current = 0;
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
                            const toolSignature = JSON.stringify(parsedTool);
                            if (
                                !forceExecute &&
                                toolSignature === lastToolSignatureRef.current &&
                                !lastToolWasErrorRef.current
                            ) {
                                await sendPrompt(
                                    `[Système] Action bloquée : tu viens d'exécuter exactement ce même outil et cette NOUVELLE tentative n'a PAS été exécutée.
Ne prétends pas qu'elle a réussi.
Soit tu utilises un outil différent, soit tu réponds avec le dernier résultat réel déjà obtenu.`,
                                    cfg,
                                );
                                return;
                            }
                            const hadPreviousToolError = lastToolWasErrorRef.current;
                            const primaryToolName = Object.keys(parsedTool)[0]?.toLowerCase() ?? "";

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

                            if (parsedTool.set_mode !== undefined) {
                                const requested = parsedTool.set_mode as ChatMode;
                                if (requested === "agent" && chatModeRef.current !== "agent") {
                                    setPendingAgentPermission({
                                        reason: parsedTool.reason ?? "L'IA souhaite passer en mode Agent.",
                                        parsed: parsedTool,
                                        config: cfg,
                                    });
                                    return;
                                }
                                applyMode(requested);
                                await sendPrompt(`[System] Mode changed: ${requested}`, cfg);
                                return;
                            }

                            if (parsedTool.request_agent_mode !== undefined) {
                                setPendingAgentPermission({
                                    reason: parsedTool.request_agent_mode || "L'IA souhaite passer en mode Agent.",
                                    parsed: parsedTool,
                                    config: cfg,
                                });
                                return;
                            }

                            if (parsedTool.get_tool_doc !== undefined) {
                                const doc = resolveToolDoc(parsedTool.get_tool_doc);
                                consultedToolDocsRef.current.add(String(parsedTool.get_tool_doc).toLowerCase());
                                await sendPrompt(`${doc.title}\n\n${doc.body}`, cfg);
                                return;
                            }

                            const actionTool = isActionTool(parsedTool);
                            if (actionTool && primaryToolName) {
                                const hasConsultedDoc = consultedToolDocsRef.current.has(primaryToolName);
                                if (!hasConsultedDoc || hadPreviousToolError) {
                                    const doc = resolveToolDoc(primaryToolName);
                                    consultedToolDocsRef.current.add(primaryToolName);
                                    // Important: si on envoie la doc "suite à erreur", on doit lever ce flag,
                                    // sinon chaque retry renverra la doc et l'outil ne s'exécutera jamais.
                                    if (hadPreviousToolError) {
                                        lastToolWasErrorRef.current = false;
                                    }
                                    const reason = hadPreviousToolError
                                        ? `Suite à une erreur précédente, consultation obligatoire de la doc pour \`${primaryToolName}\`.`
                                        : `Première utilisation de \`${primaryToolName}\` dans cette conversation : consultation obligatoire de la doc.`;
                                    await sendPrompt(
                                        `[Système] ${reason}\n\n${doc.title}\n\n${doc.body}\n\nEnsuite, réémet l'appel outil avec les bons paramètres.`,
                                        cfg,
                                    );
                                    return;
                                }
                            }

                            // On ne mémorise la signature qu'au moment d'une exécution réelle.
                            // Les étapes "doc obligatoire"/confirmations ne doivent pas déclencher l'anti-boucle.
                            lastToolSignatureRef.current = toolSignature;

                            // Reset avant exécution; les handlers remettent ce flag à true via markError si besoin.
                            lastToolWasErrorRef.current = false;

                            if (
                                await handleSetTodo({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    setTodoItems,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleCheckTodo({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    setTodoItems,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleSaveProjectStructure({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    conversationId,
                                    setProjectStructure,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleGetProjectStructure({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    projectStructureRef,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleGetPlan({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    conversationId,
                                    planRef,
                                    setPlanContent,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleGetTerminalHistory({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleGetDevServerInfo({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleListTerminals({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                })
                            ) {
                                return;
                            }

                            if (await handleReadFile({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleAnalyzeFolder({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleListFolderFiles({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleListFolderImages({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleListFolderPdfs({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadPdf({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadPdfBrief({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadPdfBatch({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadImageBatch({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleBatchRename({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (!forceExecute && actionTool && chatModeRef.current === "ask") {
                                const toolDesc = describeTool(parsedTool);
                                setPendingAgentPermission({
                                    reason: `I want to execute: **${toolDesc}**\nAllow by switching to Agent mode?`,
                                    parsed: parsedTool,
                                    config: cfg,
                                });
                                return;
                            }
                            if (!forceExecute && actionTool && chatModeRef.current === "plan") {
                                const toolDesc = describeTool(parsedTool);
                                setPendingPlanConfirm({
                                    description: `**Plan**: I will execute this action:\n\`${toolDesc}\`\n\nConfirm execution?`,
                                    parsed: parsedTool,
                                    config: cfg,
                                });
                                return;
                            }

                            if (
                                await handleCreateSkill({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    buildMachineContext,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleRunSkill({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                })
                            ) {
                                return;
                            }

                            if (await handleSearchConversation({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleGetHardwareInfo({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleSavePlan({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    conversationId,
                                    setPlanContent,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleCreateTerminal({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    onOpenTerminal,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleTerminalExec({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    onOpenTerminal,
                                    critiqueOutput: withAutoCritique,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleCloseTerminal({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    onOpenTerminal,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleTerminalStartInteractive({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    onOpenTerminal,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleTerminalSendStdin({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    onOpenTerminal,
                                })
                            ) {
                                return;
                            }

                            if (await handleContext7Search({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleContext7Docs({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleHttpRequest({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                })
                            ) {
                                return;
                            }

                            if (await handleCreateMcpServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleStartMcpServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleCallMcpTool({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                })
                            ) {
                                return;
                            }

                            if (await handleListMcpServers({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleReadSkill({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handlePatchSkill({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleWriteFile({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleOpenBrowser({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                    onOpenBrowserUrl,
                                })
                            ) {
                                return;
                            }

                            if (
                                await handleGetBrowserErrors({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                    onOpenBrowserUrl,
                                })
                            ) {
                                return;
                            }

                            if (await handleStopDevServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleStartDevServer({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                    onOpenBrowserUrl,
                                })
                            ) {
                                return;
                            }

                            if (await handleSaveImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            // ── download_image (télécharger une image depuis une URL) ──
                            if (await handleDownloadImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            // ── generate_image / list_sd_models (Stable Diffusion) ──
                            if (parsedTool.generate_image !== undefined) {
                                setImageGenerating(true);
                            }
                            try {
                                if (
                                    await handleGenerateImage({
                                        parsedTool,
                                        cfg,
                                        sendPrompt,
                                        lastToolWasErrorRef,
                                        conversationId,
                                        insertMessage,
                                        onImagePreview: setLiveImagePreview,
                                        onImageProgress: setLiveImageProgress,
                                        overrideAspectRatio: selectedSDFormat ?? null,
                                        overrideBatchCount: selectedBatchCount ?? 1,
                                        overrideModel: selectedSDModel ?? null,
                                    })
                                ) {
                                    return;
                                }
                            } finally {
                                setLiveImagePreview?.(null);
                                setLiveImageProgress?.(0);
                                setImageGenerating(false);
                            }

                            // ── search_web
                            if (await handleSearchWeb({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleScrapeUrl({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handleSaveFact({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (await handlePatchFileJson({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) {
                                return;
                            }

                            if (
                                await handleRunCommand({
                                    parsedTool,
                                    cfg,
                                    sendPrompt,
                                    lastToolWasErrorRef,
                                    critiqueOutput: withAutoCritique,
                                })
                            ) {
                                return;
                            }
                            await handleUnknownTool({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef });
                        };
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
        if (prevStreamingRef.current && !streaming) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content && conversationId) {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streaming, messages]);
}
