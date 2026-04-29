"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelSupportsKvQuant = modelSupportsKvQuant;
exports.buildTurboQuantArgs = buildTurboQuantArgs;
exports.buildLlamaArgs = buildLlamaArgs;
exports.detectChatTemplate = detectChatTemplate;
/**
 * Architectures qui crashent avec --cache-type-k quantifié dans cette version de llama.cpp.
 * Gemma4 provoque un Access Violation (0xC0000005) avec q8_0/q4_0.
 */
const UNSUPPORTED_KV_QUANT_PATTERNS = ["gemma-4", "gemma4"];
function modelSupportsKvQuant(modelPath) {
    const name = modelPath
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
function buildTurboQuantArgs(type) {
    if (!type || type === "none") {
        return [];
    }
    return ["--cache-type-k", type, "--cache-type-v", type];
}
function buildLlamaArgs(config) {
    const args = [];
    // Note: temperature est passée par requête API, pas au démarrage du serveur.
    // -t ici serait le nombre de threads, pas la température.
    const mmprojPath = config.mmprojPath?.trim();
    const hasMmproj = !!mmprojPath;
    const modelName = config.modelPath
        ?.split(/[\/\\]/)
        .pop()
        ?.toLowerCase() ?? "";
    const isGemma4 = modelName.includes("gemma-4") || modelName.includes("gemma4");
    const useSafeGemma4MultimodalProfile = hasMmproj && isGemma4;
    const effectiveContextWindow = config.contextWindow !== undefined
        ? hasMmproj
            ? Math.min(config.contextWindow, 32768)
            : config.contextWindow
        : undefined;
    const effectiveEvalBatchSize = config.evalBatchSize !== undefined && Number.isFinite(config.evalBatchSize) && config.evalBatchSize > 0
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
    }
    else if (config.flashAttention === true) {
        args.push("--flash-attn", "on");
    }
    else if (config.flashAttention === false) {
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
    }
    else if (config.chatTemplate) {
        args.push("--chat-template", config.chatTemplate);
    }
    return args;
}
function detectChatTemplate(modelPath, metadata) {
    const name = modelPath
        .split(/[\/\\]/)
        .pop()
        ?.toLowerCase() ?? "";
    if (metadata?.has_chat_template)
        return {};
    // Qwen3 officiel : forcer --jinja même si le GGUF contient déjà un template.
    // Sans --jinja, le serveur ignore le chat_template embarqué → réponses silencieuses.
    // Ne pas toucher aux variantes uncensored/abliterated (gérées ci-dessous).
    const isQwen3 = /(^|[-_])qwen[-_]?3([-. _]|$)/i.test(name);
    const isUncensoredVariant = name.includes("uncensored") ||
        name.includes("abliterat") ||
        name.includes("ablation") ||
        name.includes("noncensored");
    if (isQwen3 && !isUncensoredVariant)
        return { useJinja: true };
    // Forcer le template uniquement si le modèle est un finetune sans template GGUF valide
    const isMissingTemplate = name.includes("uncensored") ||
        name.includes("abliterat") ||
        name.includes("ablation") ||
        name.includes("noncensored");
    if (!isMissingTemplate)
        return {};
    // Déduire l'architecture depuis le nom du fichier.
    // Heuristique volontairement conservatrice: ne forcer que les familles
    // dont le fallback a été observé comme stable dans l'app.
    if ((name.includes("gemma-4") || name.includes("gemma4")) && isMissingTemplate)
        return { useJinja: true };
    if (name.includes("qwen") || name.includes("chatml"))
        return { chatTemplate: "chatml" };
    return {};
}
