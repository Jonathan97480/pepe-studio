import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { retrieveChunks } from "../lib/ragRetrieval";
import { autoConfigureFromHardware, type HardwareInfo } from "../lib/hardwareConfig";
import { detectChatTemplate, type DetectedTemplate, type LlamaLaunchConfig } from "../lib/llamaWrapper";
import { inspectModelMetadata } from "../lib/modelMetadata";
import { parseSamplingJson, type ModelConfig } from "./useModels";
import type { Attachment } from "./useLlama";
import type { TurboQuantType } from "../context/ModelSettingsContext";

type QueuedPrompt = {
    prompt: string;
    attachments: Attachment[];
};

type QueueArgs = {
    modelPath: string;
    temperature: number;
    contextWindow: number;
    evalBatchSize: number;
    flashAttention: boolean;
    sampling: LlamaLaunchConfig["sampling"];
    reasoningBudget: number;
    thinkingEnabled: boolean;
    machineContext: string | null;
    systemPrompt: string;
    turboQuant: TurboQuantType;
    isModelLoaded: boolean;
    loadModel: (config: LlamaLaunchConfig) => Promise<unknown>;
    setContextWindow: (value: number) => void;
    setEvalBatchSize: (value: number) => void;
    setFlashAttention: (value: boolean) => void;
    setIsModelLoaded: (value: boolean) => void;
    setLoadedModelPath: (value: string | null) => void;
    setModelPath: (value: string) => void;
    setReasoningBudget: (value: number) => void;
    setSystemPrompt: (value: string) => void;
    setTemperature: (value: number) => void;
    setThinkingEnabled: (value: boolean) => void;
    setTurboQuant: (value: TurboQuantType) => void;
    conversationId: number | null;
    convTitleSetRef: MutableRefObject<boolean>;
    isResumingConv: boolean;
    setIsResumingConv: (value: boolean) => void;
    projectStructureRef: MutableRefObject<string>;
    lastToolSignatureRef: MutableRefObject<string | null>;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    sendPrompt: (
        prompt: string,
        config: Partial<LlamaLaunchConfig>,
        attachments?: Attachment[],
        save?: boolean,
    ) => Promise<unknown>;
    showError: (message: string) => void;
    setAutoLoadError: Dispatch<SetStateAction<string | null>>;
    pendingQueue: QueuedPrompt[];
    setPendingQueue: Dispatch<SetStateAction<QueuedPrompt[]>>;
    isQueueProcessingRef: MutableRefObject<boolean>;
    loading: boolean;
    streaming: boolean;
    toolRunning: boolean;
};

export function useChatWindowQueue({
    modelPath,
    temperature,
    contextWindow,
    evalBatchSize,
    flashAttention,
    sampling,
    reasoningBudget,
    thinkingEnabled,
    machineContext,
    systemPrompt,
    turboQuant,
    isModelLoaded,
    loadModel,
    setContextWindow,
    setEvalBatchSize,
    setFlashAttention,
    setIsModelLoaded,
    setLoadedModelPath,
    setModelPath,
    setReasoningBudget,
    setSystemPrompt,
    setTemperature,
    setThinkingEnabled,
    setTurboQuant,
    conversationId,
    convTitleSetRef,
    isResumingConv,
    setIsResumingConv,
    projectStructureRef,
    lastToolSignatureRef,
    lastToolWasErrorRef,
    sendPrompt,
    showError,
    setAutoLoadError,
    pendingQueue,
    setPendingQueue,
    isQueueProcessingRef,
    loading,
    streaming,
    toolRunning,
}: QueueArgs) {
    const processQueuedMessage = useCallback(
        async ({ prompt: queuedPrompt, attachments: queuedAttachments }: QueuedPrompt) => {
            setAutoLoadError(null);

            let effectiveConfig: Partial<LlamaLaunchConfig> = {
                modelPath,
                temperature,
                contextWindow,
                evalBatchSize,
                flashAttention,
                sampling,
                reasoningBudget,
                thinkingEnabled,
                systemPrompt: machineContext
                    ? machineContext + (systemPrompt ? "\n\n" + systemPrompt : "")
                    : systemPrompt,
                turboQuant,
            };

            if (!isModelLoaded) {
                let defaultModel: ModelConfig | null = null;
                try {
                    defaultModel = await invoke<ModelConfig | null>("get_default_model");
                } catch (e) {
                    console.error("[ChatWindow] get_default_model failed", e);
                }
                if (!defaultModel) {
                    setAutoLoadError('Aucun modèle chargé. Va dans "Modèles" pour en configurer un par défaut.');
                    return;
                }
                try {
                    const metadata = await inspectModelMetadata(defaultModel.path).catch(() => undefined);
                    const savedSampling = parseSamplingJson(defaultModel.sampling_json);
                    let runtimeConfig: ModelConfig = defaultModel;
                    if (defaultModel.n_gpu_layers === 0 && defaultModel.threads <= 0) {
                        const hw = await invoke<HardwareInfo>("get_hardware_info");
                        const auto = autoConfigureFromHardware(hw, "balanced", metadata);
                        runtimeConfig = {
                            ...defaultModel,
                            context_window: auto.context_window,
                            turbo_quant: auto.turbo_quant,
                            n_gpu_layers: auto.n_gpu_layers,
                            threads: auto.threads,
                        };
                    }
                    await loadModel({
                        modelPath: runtimeConfig.path,
                        temperature: runtimeConfig.temperature,
                        contextWindow: runtimeConfig.context_window,
                        evalBatchSize: runtimeConfig.eval_batch_size,
                        flashAttention: runtimeConfig.flash_attention,
                        systemPrompt: runtimeConfig.system_prompt,
                        turboQuant: runtimeConfig.turbo_quant as TurboQuantType,
                        mmprojPath: runtimeConfig.mmproj_path || undefined,
                        nGpuLayers: runtimeConfig.n_gpu_layers > 0 ? runtimeConfig.n_gpu_layers : undefined,
                        threads: runtimeConfig.threads > 0 ? runtimeConfig.threads : undefined,
                        reasoningBudget: runtimeConfig.reasoning_budget,
                        sampling: savedSampling,
                        ...((): DetectedTemplate => {
                            if (runtimeConfig.chat_template === "jinja") return { useJinja: true };
                            if (runtimeConfig.chat_template !== "")
                                return { chatTemplate: runtimeConfig.chat_template };
                            return detectChatTemplate(runtimeConfig.path, metadata);
                        })(),
                    });
                    setIsModelLoaded(true);
                    setLoadedModelPath(runtimeConfig.path);
                    setModelPath(runtimeConfig.path);
                    setTemperature(runtimeConfig.temperature);
                    setContextWindow(runtimeConfig.context_window);
                    setEvalBatchSize(runtimeConfig.eval_batch_size);
                    setFlashAttention(runtimeConfig.flash_attention);
                    setSystemPrompt(runtimeConfig.system_prompt);
                    setTurboQuant(runtimeConfig.turbo_quant as TurboQuantType);
                    setReasoningBudget(runtimeConfig.reasoning_budget);
                    setThinkingEnabled(thinkingEnabled);
                    effectiveConfig = {
                        modelPath: runtimeConfig.path,
                        temperature: runtimeConfig.temperature,
                        contextWindow: runtimeConfig.context_window,
                        evalBatchSize: runtimeConfig.eval_batch_size,
                        flashAttention: runtimeConfig.flash_attention,
                        systemPrompt: machineContext
                            ? machineContext + (runtimeConfig.system_prompt ? "\n\n" + runtimeConfig.system_prompt : "")
                            : runtimeConfig.system_prompt,
                        turboQuant: runtimeConfig.turbo_quant as TurboQuantType,
                        mmprojPath: runtimeConfig.mmproj_path || undefined,
                        nGpuLayers: runtimeConfig.n_gpu_layers > 0 ? runtimeConfig.n_gpu_layers : undefined,
                        threads: runtimeConfig.threads > 0 ? runtimeConfig.threads : undefined,
                        reasoningBudget: runtimeConfig.reasoning_budget,
                        sampling: savedSampling,
                        thinkingEnabled,
                    };
                } catch (e: unknown) {
                    setAutoLoadError(
                        `Impossible de charger le modèle par défaut : ${(e as Error)?.message ?? String(e)}`,
                    );
                    return;
                }
            }

            try {
                const ragDocIds = queuedAttachments.filter((a) => a.docId != null).map((a) => a.docId as number);
                let finalAttachments: Attachment[] | undefined =
                    queuedAttachments.length > 0 ? queuedAttachments : undefined;

                if (ragDocIds.length > 0 && queuedPrompt.trim()) {
                    const chunkLimit = Math.max(3, Math.min(40, Math.floor((contextWindow - 1200) / 450)));
                    const ragContext = await retrieveChunks(queuedPrompt, ragDocIds, chunkLimit);
                    const nonRagAtts = queuedAttachments.filter((a) => a.docId == null);
                    const ragAtts = queuedAttachments.filter((a) => a.docId != null);
                    const ragNames = ragAtts.map((a) => a.name).join(", ");
                    const contextText =
                        ragContext ||
                        `[Erreur RAG] Le contenu de "${ragNames}" n'a pas pu être extrait. Détache et re-joint le fichier.`;
                    const ragAtt: Attachment = { name: ragNames, mimeType: "text/plain", text: contextText };
                    finalAttachments = [...nonRagAtts, ragAtt];
                }

                lastToolSignatureRef.current = null;
                lastToolWasErrorRef.current = false;
                if (conversationId) {
                    invoke("save_message", { conversationId, role: "user", content: queuedPrompt }).catch(() => {});
                }
                if (!convTitleSetRef.current) {
                    const titleInstr =
                        "\n\n[TITRE CONVERSATION — instruction système, invisible pour l'utilisateur]\nSur ton PREMIER message uniquement, place cette balise AVANT ta réponse : <conv_title>Titre 4-6 mots</conv_title>\nIMPORTANT : la balise et ta réponse complète doivent être dans le MÊME message.\nFormat attendu : <conv_title>Aide rédaction article</conv_title>\nAprès la balise, réponds normalement à la demande actuelle.\nN'utilise plus jamais cette balise après ce premier message.";
                    effectiveConfig = {
                        ...effectiveConfig,
                        systemPrompt: (effectiveConfig.systemPrompt ?? "") + titleInstr,
                    };
                }
                const actionKeywords =
                    /crée|créer|lance|lancer|installe|installer|exécute|exécuter|fais|faire|génère|générer|ouvre|ouvrir|copie|déplace|supprime|écris|écrire|démarre|démarrer|setup|init|configure|build|compile|run|make|create|start/i;
                let effectivePrompt = actionKeywords.test(queuedPrompt)
                    ? `${queuedPrompt}\n\n[RAPPEL SYSTÈME: exécute IMMÉDIATEMENT avec <tool>{"cmd":"..."}</tool> ou <tool>{"write_file":"..."}</tool>. Première réponse = un <tool>, pas du texte.]`
                    : queuedPrompt;
                if (projectStructureRef.current.trim()) {
                    effectiveConfig = {
                        ...effectiveConfig,
                        systemPrompt:
                            (effectiveConfig.systemPrompt ?? "") +
                            `\n\n=== STRUCTURE DU PROJET (mémorisée) ===\n${projectStructureRef.current}\n=== FIN STRUCTURE ===`,
                    };
                }
                if (isResumingConv) {
                    effectivePrompt = `[REPRISE DE CONVERSATION — Lis attentivement l'historique ci-dessus avant de répondre. Tiens compte de tout ce qui a été dit, des fichiers créés, des décisions prises et du contexte du projet.]\n\n${effectivePrompt}`;
                    setIsResumingConv(false);
                }
                await sendPrompt(effectivePrompt, effectiveConfig, finalAttachments);
            } catch (error) {
                showError(`Erreur lors de l'envoi : ${(error as Error)?.message ?? String(error)}`);
            }
        },
        [
            modelPath,
            temperature,
            contextWindow,
            evalBatchSize,
            flashAttention,
            sampling,
            reasoningBudget,
            thinkingEnabled,
            machineContext,
            systemPrompt,
            turboQuant,
            isModelLoaded,
            loadModel,
            setContextWindow,
            setEvalBatchSize,
            setFlashAttention,
            setIsModelLoaded,
            setLoadedModelPath,
            setModelPath,
            setReasoningBudget,
            setSystemPrompt,
            setTemperature,
            setThinkingEnabled,
            setTurboQuant,
            showError,
            conversationId,
            convTitleSetRef,
            isResumingConv,
            setIsResumingConv,
            projectStructureRef,
            sendPrompt,
            setAutoLoadError,
            lastToolSignatureRef,
            lastToolWasErrorRef,
        ],
    );

    useEffect(() => {
        if (pendingQueue.length === 0) return;
        if (isQueueProcessingRef.current) return;
        if (loading || streaming || toolRunning) return;

        isQueueProcessingRef.current = true;
        const currentItem = pendingQueue[0];
        setPendingQueue((current) => current.slice(1));

        processQueuedMessage(currentItem).finally(() => {
            isQueueProcessingRef.current = false;
        });
    }, [pendingQueue, loading, streaming, toolRunning, processQueuedMessage, setPendingQueue, isQueueProcessingRef]);

    return { processQueuedMessage };
}
