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
    systemPrompt?: string;
    turboQuant?: TurboQuantType;
    mmprojPath?: string;
    nGpuLayers?: number;  // -ngl : couches GPU (0 = CPU uniquement)
    threads?: number;     // -t : threads CPU (-1 = auto)
    chatTemplate?: string; // --chat-template : forcer le template si absent/cassé dans le GGUF
    useJinja?: boolean;      // --jinja : utiliser le template Jinja2 embarqué dans le GGUF (Gemma 4 uncensored)
    sampling?: SamplingParams;
    thinkingEnabled?: boolean;
};

/**
 * Architectures qui crashent avec --cache-type-k quantifié dans cette version de llama.cpp.
 * Gemma4 provoque un Access Violation (0xC0000005) avec q8_0/q4_0.
 */
const UNSUPPORTED_KV_QUANT_PATTERNS = ["gemma-4", "gemma4"];

export function modelSupportsKvQuant(modelPath: string): boolean {
    const name = modelPath.split(/[\/\\]/).pop()?.toLowerCase() ?? "";
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

    if (config.contextWindow !== undefined) {
        args.push("-c", config.contextWindow.toString());
    }

    if (config.turboQuant && config.modelPath && modelSupportsKvQuant(config.modelPath)) {
        args.push(...buildTurboQuantArgs(config.turboQuant));
    }

    if (config.mmprojPath && config.mmprojPath.trim()) {
        args.push("--mmproj", config.mmprojPath.trim());
    }

    if (config.nGpuLayers !== undefined && config.nGpuLayers > 0) {
        args.push("-ngl", config.nGpuLayers.toString());
    }

    if (config.threads !== undefined && config.threads > 0) {
        args.push("-t", config.threads.toString());
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

export function detectChatTemplate(modelPath: string): DetectedTemplate {
    const name = modelPath.split(/[\/\\]/).pop()?.toLowerCase() ?? "";

    // Forcer le template uniquement si le modèle est un finetune sans template GGUF valide
    const isMissingTemplate =
        name.includes("uncensored") ||
        name.includes("abliterat") ||
        name.includes("ablation") ||
        name.includes("noncensored");

    if (!isMissingTemplate) return {};

    // Déduire l'architecture depuis le nom du fichier
    // Gemma 4 : utiliser --jinja (template Jinja2 natif), pas --chat-template gemma (Gemma 1/2)
    if ((name.includes("gemma-4") || name.includes("gemma4")) && isMissingTemplate) return { useJinja: true };
    if (name.includes("gemma")) return { chatTemplate: "gemma" };
    if (name.includes("llama-3") || name.includes("llama3")) return { chatTemplate: "llama3" };
    if (name.includes("llama-2") || name.includes("llama2")) return { chatTemplate: "llama2" };
    if (name.includes("mistral")) return { chatTemplate: "mistral" };
    if (name.includes("phi-3") || name.includes("phi3")) return { chatTemplate: "phi3" };
    if (name.includes("qwen") || name.includes("chatml")) return { chatTemplate: "chatml" };
    if (name.includes("deepseek")) return { chatTemplate: "deepseek" };
    return {};
}
