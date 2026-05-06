import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Attachment, LlamaMessage } from "./useLlama";
import type { LlamaLaunchConfig } from "../lib/llamaWrapper";
import type { ChatMode } from "../lib/chatUtils";
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
    handleGetHardwareInfo,
    handlePatchFileJson,
    handleRunCommand,
    handleSaveFact,
    handleSavePlan,
    handleSearchConversation,
    handleUnknownTool,
    handleWriteFile,
} from "../lib/toolCoreHandlers";
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

type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

type CreateDispatchToolCallArgs = {
    chatModeRef: MutableRefObject<ChatMode>;
    lastToolSignatureRef: MutableRefObject<string | null>;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    consultedToolDocsRef: MutableRefObject<Set<string>>;
    sendPrompt: SendPrompt;
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
    applyMode: (mode: ChatMode) => void;
    setTodoItems: Dispatch<SetStateAction<{ text: string; done: boolean }[]>>;
    setProjectStructure: Dispatch<SetStateAction<string>>;
    setPlanContent: Dispatch<SetStateAction<string>>;
    buildMachineContext: () => Promise<void>;
    conversationId: number | null;
    projectStructureRef: MutableRefObject<string>;
    planRef: MutableRefObject<string>;
    onOpenTerminal?: () => void;
    onOpenBrowserUrl?: (url: string) => void;
    setImageGenerating: Dispatch<SetStateAction<boolean>>;
    setLiveImagePreview?: Dispatch<SetStateAction<string | null>>;
    setLiveImageProgress?: Dispatch<SetStateAction<number>>;
    selectedSDFormat?: string | null;
    selectedBatchCount?: number;
    selectedSDModel?: string | null;
    insertMessage: (msg: LlamaMessage) => void;
};

export function createDispatchToolCall({
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
}: CreateDispatchToolCallArgs) {
    return async function dispatch(
        parsedTool: Record<string, string>,
        cfg: Partial<LlamaLaunchConfig>,
        forceExecute = false,
    ) {
        const toolSignature = JSON.stringify(parsedTool);
        if (!forceExecute && toolSignature === lastToolSignatureRef.current && !lastToolWasErrorRef.current) {
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

        lastToolSignatureRef.current = toolSignature;
        lastToolWasErrorRef.current = false;

        if (await handleSetTodo({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef, setTodoItems })) return;
        if (await handleCheckTodo({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef, setTodoItems })) return;

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

        if (await handleGetTerminalHistory({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleGetDevServerInfo({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleListTerminals({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

        if (await handleReadFile({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleAnalyzeFolder({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleListFolderFiles({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleListFolderImages({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleListFolderPdfs({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadPdf({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadPdfBrief({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadPdfBatch({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadImageBatch({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleBatchRename({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleCreateSkill({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef, buildMachineContext })) return;
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

        if (await handleSearchConversation({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleGetHardwareInfo({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleContext7Search({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleContext7Docs({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleCreateMcpServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleStartMcpServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleListMcpServers({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleReadSkill({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handlePatchSkill({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleWriteFile({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleStopDevServer({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleSaveImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleDownloadImage({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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

        if (await handleSearchWeb({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleScrapeUrl({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handleSaveFact({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;
        if (await handlePatchFileJson({ parsedTool, cfg, sendPrompt, lastToolWasErrorRef })) return;

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
}
