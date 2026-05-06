import type { TurboQuantType } from "./llamaWrapper";
import type { ModelMetadata } from "./modelMetadata";
import { computeBalancedConfig, computeGpuOnlyConfig, computeMaxContextConfig } from "./hardwareConfigModes";

export type HardwareInfo = {
    total_ram_gb: number;
    cpu_threads: number;
    gpu_name: string;
    gpu_vram_gb: number;
    has_dedicated_gpu: boolean;
};

export type AutoConfig = {
    context_window: number;
    turbo_quant: TurboQuantType;
    n_gpu_layers: number;
    threads: number;
    notes: string[];
};

/** Mode d'auto-configuration */
export type AutoMode = "gpu_only" | "balanced" | "max_context";

export type MemoryEstimate = {
    model_vram_gb: number;
    model_ram_gb: number;
    kv_vram_gb: number;
    kv_ram_gb: number;
    total_vram_gb: number;
    total_ram_gb: number;
    available_vram_gb: number;
    available_ram_gb: number;
    has_metadata: boolean;
    has_gpu: boolean;
    offload_ratio: number;
};

function roundContextWindow(value: number): number {
    if (!Number.isFinite(value) || value <= 2048) return 2048;
    return Math.max(2048, Math.floor(value / 2048) * 2048);
}

function getKvBytesPerValue(type: TurboQuantType): number {
    switch (type) {
        case "q4_0":
        case "q4_1":
            return 0.5;
        case "q5_0":
        case "q5_1":
            return 0.625;
        case "q8_0":
            return 1;
        case "none":
        default:
            return 2;
    }
}

function getOffloadRatio(metadata: Pick<ModelMetadata, "block_count"> | undefined, nGpuLayers: number): number {
    if (nGpuLayers <= 0) return 0;
    if (!metadata?.block_count || metadata.block_count <= 0) return nGpuLayers >= 999 ? 1 : 0.75;
    if (nGpuLayers >= 999) return 1;
    return Math.max(0, Math.min(1, nGpuLayers / (metadata.block_count + 1)));
}

function estimateModelMemoryGb(metadata: Pick<ModelMetadata, "file_size_bytes"> | undefined): number {
    return metadata?.file_size_bytes ? metadata.file_size_bytes / 1024 ** 3 : 0;
}

function clampGpuLayers(value: number, metadata?: Pick<ModelMetadata, "block_count">): number {
    const maxLayers =
        metadata?.block_count && metadata.block_count > 0 ? metadata.block_count : Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(Math.floor(value), maxLayers));
}

function estimateGpuLayerFit(
    hw: HardwareInfo,
    metadata: Pick<ModelMetadata, "file_size_bytes" | "block_count"> | undefined,
    requestedLayers: number,
    mode: AutoMode,
): number {
    if (!metadata?.file_size_bytes || !metadata.block_count || metadata.block_count <= 0) {
        return requestedLayers;
    }
    if (!hw.has_dedicated_gpu || hw.gpu_vram_gb < 1) {
        return 0;
    }

    const layerCountWithOutput = metadata.block_count + 1;
    const layerFootprintGb = metadata.file_size_bytes / 1024 ** 3 / layerCountWithOutput;
    if (!Number.isFinite(layerFootprintGb) || layerFootprintGb <= 0) {
        return requestedLayers;
    }

    const reserveGb = mode === "gpu_only" ? 2.0 : mode === "max_context" ? 3.0 : 2.5;
    const budgetRatio = mode === "gpu_only" ? 0.9 : mode === "max_context" ? 0.45 : 0.65;
    const budgetGb = Math.max(0, hw.gpu_vram_gb * budgetRatio - reserveGb);
    const fittedLayers = Math.floor(budgetGb / layerFootprintGb);

    if (requestedLayers >= 999) {
        return clampGpuLayers(fittedLayers, metadata);
    }

    return clampGpuLayers(Math.min(requestedLayers, fittedLayers), metadata);
}

/**
 * Estime l'utilisation mémoire (RAM + VRAM) pour une configuration donnée.
 * Pure, synchrone — réutilise les helpers de capContextToModel.
 * Pour les MoE, prend en compte nCpuMoe qui force des experts sur CPU.
 */
export function estimateMemoryUsage(
    hw: HardwareInfo,
    metadata: ModelMetadata | undefined,
    contextWindow: number,
    nGpuLayers: number,
    turboQuant: TurboQuantType,
    nCpuMoe: number = 0,
    expertCount: number = 0,
): MemoryEstimate {
    const modelMemoryGb = estimateModelMemoryGb(metadata);
    const offloadRatio = getOffloadRatio(metadata, nGpuLayers);
    let modelVramGb = modelMemoryGb * offloadRatio;
    let modelRamGb = modelMemoryGb * (1 - offloadRatio);

    // Pour les MoE avec --n-cpu-moe : augmenter la RAM pour les experts forcés sur CPU
    if (expertCount > 0 && nCpuMoe > 0) {
        // Estimation simple : chaque expert représente 1/block_count du poids
        const blockCount = metadata?.block_count || 1;
        const moeExpertRatio = nCpuMoe / blockCount;
        const moeRamOverhead = modelMemoryGb * moeExpertRatio * 0.5; // ~50% du poids des experts en RAM
        modelRamGb += moeRamOverhead;
        modelVramGb = Math.max(0, modelVramGb - moeRamOverhead * 0.25); // Léger allègement VRAM
    }

    let kvVramGb = 0;
    let kvRamGb = 0;

    if (metadata) {
        const effectiveKeyLength = metadata.key_length || metadata.embedding_length || 0;
        const effectiveValueLength = metadata.value_length || metadata.key_length || metadata.embedding_length || 0;
        const effectiveHeadsKv = metadata.head_count_kv || 0;
        const effectiveLayers = metadata.block_count || 0;

        if (effectiveKeyLength > 0 && effectiveValueLength > 0 && effectiveHeadsKv > 0 && effectiveLayers > 0) {
            const bytesPerValue = getKvBytesPerValue(turboQuant);
            const kvBytesPerToken =
                effectiveLayers * effectiveHeadsKv * (effectiveKeyLength + effectiveValueLength) * bytesPerValue;

            if (Number.isFinite(kvBytesPerToken) && kvBytesPerToken > 0) {
                const totalKvGb = (kvBytesPerToken * contextWindow) / 1024 ** 3;
                kvVramGb = totalKvGb * offloadRatio;
                kvRamGb = totalKvGb * (1 - offloadRatio);
            }
        }
    }

    return {
        model_vram_gb: modelVramGb,
        model_ram_gb: modelRamGb,
        kv_vram_gb: kvVramGb,
        kv_ram_gb: kvRamGb,
        total_vram_gb: modelVramGb + kvVramGb,
        total_ram_gb: modelRamGb + kvRamGb,
        available_vram_gb: hw.gpu_vram_gb,
        available_ram_gb: hw.total_ram_gb,
        has_metadata: !!metadata,
        has_gpu: hw.has_dedicated_gpu && nGpuLayers > 0,
        offload_ratio: offloadRatio,
    };
}

function capContextToModel(
    desired: number,
    hw: HardwareInfo,
    metadata: ModelMetadata | undefined,
    nGpuLayers: number,
    turboQuant: TurboQuantType,
): number {
    if (!metadata) return desired;
    const nativeCap = metadata.context_length > 0 ? metadata.context_length : desired;
    const effectiveKeyLength = metadata.key_length || metadata.embedding_length || 0;
    const effectiveValueLength = metadata.value_length || metadata.key_length || metadata.embedding_length || 0;
    const effectiveHeadsKv = metadata.head_count_kv || 0;
    const effectiveLayers = metadata.block_count || 0;

    if (effectiveKeyLength <= 0 || effectiveValueLength <= 0 || effectiveHeadsKv <= 0 || effectiveLayers <= 0) {
        return Math.min(desired, nativeCap);
    }

    const bytesPerValue = getKvBytesPerValue(turboQuant);
    const kvBytesPerToken =
        effectiveLayers * effectiveHeadsKv * (effectiveKeyLength + effectiveValueLength) * bytesPerValue;
    if (!Number.isFinite(kvBytesPerToken) || kvBytesPerToken <= 0) {
        return Math.min(desired, nativeCap);
    }

    const modelMemoryGb = estimateModelMemoryGb(metadata);
    const offloadRatio = getOffloadRatio(metadata, nGpuLayers);
    const modelVramGb = modelMemoryGb * offloadRatio;
    const modelRamGb = modelMemoryGb * (1 - offloadRatio);
    const availableVramGb = Math.max(0.5, hw.gpu_vram_gb - modelVramGb - 1.5);
    const availableRamGb = Math.max(1, hw.total_ram_gb - modelRamGb - 6);
    const gpuKvCap =
        offloadRatio > 0 ? (availableVramGb * 1024 ** 3) / (kvBytesPerToken * offloadRatio) : Number.POSITIVE_INFINITY;
    const cpuKvCap =
        offloadRatio < 1
            ? (availableRamGb * 1024 ** 3) / (kvBytesPerToken * Math.max(0.15, 1 - offloadRatio))
            : Number.POSITIVE_INFINITY;

    const memoryCap = Math.max(2048, Math.min(gpuKvCap, cpuKvCap, nativeCap));
    return Math.min(desired, roundContextWindow(memoryCap));
}

/**
 * Calcule la configuration optimale de llama-server
 * à partir des informations matérielles détectées.
 *
 * Modes :
 * - gpu_only    : vitesse max — tout en VRAM, contexte conservateur
 * - balanced    : compromis vitesse/contexte (par défaut, équivalent à l'ancien comportement)
 * - max_context : exploite RAM + VRAM pour maximiser le contexte, plus lent
 */
export function autoConfigureFromHardware(
    hw: HardwareInfo,
    mode: AutoMode = "balanced",
    metadata?: ModelMetadata,
): AutoConfig {
    const notes: string[] = [];
    const modeName = mode === "gpu_only" ? "🎮 GPU seul" : mode === "max_context" ? "📐 Contexte max" : "⚖️ Équilibré";
    notes.push(`Mode : ${modeName}`);

    // ── Threads CPU ─────────────────────────────────────────────────────────
    const threads = Math.max(1, hw.cpu_threads - 2);

    const deps = { capContextToModel, estimateGpuLayerFit };

    if (mode === "gpu_only") {
        return computeGpuOnlyConfig(hw, metadata, threads, notes, deps);
    }
    if (mode === "max_context") {
        return computeMaxContextConfig(hw, metadata, threads, notes, deps);
    }
    return computeBalancedConfig(hw, metadata, threads, notes, deps);
}

