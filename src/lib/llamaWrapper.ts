import type { ModelMetadata } from "./modelMetadata";

export type TurboQuantType = "none" | "q8_0" | "q4_0" | "q4_1" | "q5_0" | "q5_1";

export type SamplingParams = {
    topP?: number;
    topK?: number;
    penaltyLastN?: number;
    repeatPenalty?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    mirostat?: number;
    mirostatTau?: number;
    mirostatEta?: number;
    minP?: number;
    typicalP?: number;
    dynaTempRange?: number;
    dynaTempExponent?: number;
    xtcProbability?: number;
    xtcThreshold?: number;
    topNSigma?: number;
    dryMultiplier?: number;
    dryBase?: number;
    dryAllowedLength?: number;
    dryPenaltyLastN?: number;
    drySequenceBreakers?: string;
};

export type LlamaLaunchConfig = {
    modelPath: string;
    temperature?: number;
    maxTokens?: number;
    contextWindow?: number;
    evalBatchSize?: number; // -b : taille du lot d'evaluation (tokens d'entree traites a la fois)
    flashAttention?: boolean; // --flash-attn on : active Flash Attention
    systemPrompt?: string;
    turboQuant?: TurboQuantType;
    mmprojPath?: string;
    nGpuLayers?: number; // -ngl : couches GPU (0 = CPU uniquement)
    threads?: number; // -t : threads CPU (-1 = auto)
    chatTemplate?: string; // --chat-template : forcer le template si absent/cassé dans le GGUF
    useJinja?: boolean; // --jinja : utiliser le template Jinja2 embarqué dans le GGUF (Gemma 4 uncensored)
    reasoningBudget?: number; // --reasoning-budget : -1 = illimité, 0 = stop immédiat, N > 0 = budget
    sampling?: SamplingParams;
    thinkingEnabled?: boolean;
};

/**
 * Architectures qui crashent avec --cache-type-k quantifié dans cette version de llama.cpp.
 * Gemma4 provoque un Access Violation (0xC0000005) avec q8_0/q4_0.
 */
const UNSUPPORTED_KV_QUANT_PATTERNS = ["gemma-4", "gemma4"];

export function modelSupportsKvQuant(modelPath: string): boolean {
    const name =
        modelPath
            .split(/[\/\\]/)
            .pop()
            ?.toLowerCase() ?? "";
    return !UNSUPPORTED_KV_QUANT_PATTERNS.some((p) => name.includes(p));
}

/**
 * TurboQuant : quantification du cache KV (clés ET valeurs) de llama.cpp.
 * Applique le même type aux deux caches pour un maximum d’économie mémoire.
 * Ref: https://github.com/ggml-org/llama.cpp/discussions/20969
 */
export function buildTurboQuantArgs(type: TurboQuantType): string[] {
    if (!type || type === "none") {
        return [];
    }
    return ["--cache-type-k", type, "--cache-type-v", type];
}

export function buildLlamaArgs(config: Partial<LlamaLaunchConfig>): string[] {
    const args: string[] = [];

    // Note: temperature est passée par requête API, pas au démarrage du serveur.
    // -t ici serait le nombre de threads, pas la température.

    const mmprojPath = config.mmprojPath?.trim();
    const hasMmproj = !!mmprojPath;
    const modelName =
        config.modelPath
            ?.split(/[\/\\]/)
            .pop()
            ?.toLowerCase() ?? "";
    const isGemma4 = modelName.includes("gemma-4") || modelName.includes("gemma4");
    const useSafeGemma4MultimodalProfile = hasMmproj && isGemma4;
    const effectiveContextWindow =
        config.contextWindow !== undefined
            ? hasMmproj
                ? Math.min(config.contextWindow, 32768)
                : config.contextWindow
            : undefined;
    const effectiveEvalBatchSize =
        config.evalBatchSize !== undefined && Number.isFinite(config.evalBatchSize) && config.evalBatchSize > 0
            ? useSafeGemma4MultimodalProfile
                ? Math.min(Math.trunc(config.evalBatchSize), 128)
                : Math.trunc(config.evalBatchSize)
            : undefined;

    if (effectiveContextWindow !== undefined) {
        args.push("-c", effectiveContextWindow.toString());
    }

    if (effectiveEvalBatchSize !== undefined) {
        args.push("-b", effectiveEvalBatchSize.toString());
    }

    if (useSafeGemma4MultimodalProfile) {
        // Evite un crash scheduler ggml observé sur certains builds Gemma4 + mmproj + CUDA.
        args.push("--flash-attn", "off");
    } else if (config.flashAttention === true) {
        args.push("--flash-attn", "on");
    } else if (config.flashAttention === false) {
        args.push("--flash-attn", "off");
    }

    if (config.turboQuant && config.modelPath && modelSupportsKvQuant(config.modelPath)) {
        args.push(...buildTurboQuantArgs(config.turboQuant));
    }

    if (hasMmproj) {
        // Mitige un crash connu ggml scheduler sur certains builds CUDA + mmproj quand -fit est actif.
        args.push("-fit", "off", "--parallel", "1");
        args.push("--mmproj", mmprojPath);
    }

    if (config.nGpuLayers !== undefined && config.nGpuLayers > 0) {
        args.push("-ngl", config.nGpuLayers.toString());
    }

    if (config.threads !== undefined && config.threads > 0) {
        args.push("-t", config.threads.toString());
    }

    if (config.reasoningBudget !== undefined && Number.isFinite(config.reasoningBudget)) {
        args.push("--reasoning-budget", Math.trunc(config.reasoningBudget).toString());
    }

    if (config.useJinja) {
        args.push("--jinja");
    } else if (config.chatTemplate) {
        args.push("--chat-template", config.chatTemplate);
    }

    return args;
}

/**
 * Détecte le chat template à forcer UNIQUEMENT pour les finetunes uncensored/abliterated.
 * Ces modèles suppriment souvent le template Jinja2 embarqué dans le GGUF → crash ou hallucinations.
 * Les modèles officiels ont leur propre template correct dans le GGUF : ne jamais l'overrider.
 */
export type DetectedTemplate = { chatTemplate?: string; useJinja?: boolean };

export function detectChatTemplate(
    modelPath: string,
    metadata?: Pick<ModelMetadata, "has_chat_template">,
): DetectedTemplate {
    const name =
        modelPath
            .split(/[\/\\]/)
            .pop()
            ?.toLowerCase() ?? "";

    if (metadata?.has_chat_template) return {};

    // Qwen3 officiel : forcer --jinja même si le GGUF contient déjà un template.
    // Sans --jinja, le serveur ignore le chat_template embarqué → réponses silencieuses.
    // Ne pas toucher aux variantes uncensored/abliterated (gérées ci-dessous).
    const isQwen3 = /(^|[-_])qwen[-_]?3([-. _]|$)/i.test(name);
    const isUncensoredVariant =
        name.includes("uncensored") ||
        name.includes("abliterat") ||
        name.includes("ablation") ||
        name.includes("noncensored");
    if (isQwen3 && !isUncensoredVariant) return { useJinja: true };

    // Forcer le template uniquement si le modèle est un finetune sans template GGUF valide
    const isMissingTemplate =
        name.includes("uncensored") ||
        name.includes("abliterat") ||
        name.includes("ablation") ||
        name.includes("noncensored");

    if (!isMissingTemplate) return {};

    // Déduire l'architecture depuis le nom du fichier.
    // Heuristique volontairement conservatrice: ne forcer que les familles
    // dont le fallback a été observé comme stable dans l'app.
    if ((name.includes("gemma-4") || name.includes("gemma4")) && isMissingTemplate) return { useJinja: true };
    if (name.includes("qwen") || name.includes("chatml")) return { chatTemplate: "chatml" };
    return {};
}
