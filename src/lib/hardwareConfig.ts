import type { TurboQuantType } from "./llamaWrapper";
import type { ModelMetadata } from "./modelMetadata";

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
    return metadata?.file_size_bytes ? metadata.file_size_bytes / (1024 ** 3) : 0;
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
    const gpuKvCap = offloadRatio > 0
        ? (availableVramGb * 1024 ** 3) / (kvBytesPerToken * offloadRatio)
        : Number.POSITIVE_INFINITY;
    const cpuKvCap = offloadRatio < 1
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
    const modeName = mode === "gpu_only" ? "🎮 GPU seul"
        : mode === "max_context" ? "📐 Contexte max"
            : "⚖️ Équilibré";
    notes.push(`Mode : ${modeName}`);

    // ── Threads CPU ─────────────────────────────────────────────────────────
    const threads = Math.max(1, hw.cpu_threads - 2);

    // ═══════════════════════════════════════════════════════════════════════
    // MODE GPU_ONLY : tout en VRAM, vitesse max, contexte conservateur
    // ═══════════════════════════════════════════════════════════════════════
    if (mode === "gpu_only") {
        if (!hw.has_dedicated_gpu || hw.gpu_vram_gb < 2) {
            notes.push("⚠ Pas de GPU dédié — bascule sur mode équilibré");
            return autoConfigureFromHardware(hw, "balanced");
        }

        const n_gpu_layers = 999; // toutes les couches en GPU

        // Contexte conservateur pour que tout tienne en VRAM
        let context_window: number;
        if (hw.gpu_vram_gb < 6) {
            context_window = 2048;
        } else if (hw.gpu_vram_gb < 8) {
            context_window = 4096;
        } else if (hw.gpu_vram_gb < 12) {
            context_window = 8192;
        } else if (hw.gpu_vram_gb < 16) {
            context_window = 16384;
        } else {
            context_window = 32768;
        }

        // Cache KV quantifié selon VRAM restante
        let turbo_quant: TurboQuantType;
        if (hw.gpu_vram_gb < 8) {
            turbo_quant = "q4_0";
            notes.push("Cache KV : q4_0 (VRAM limitée)");
        } else if (hw.gpu_vram_gb < 16) {
            turbo_quant = "q8_0";
            notes.push("Cache KV : q8_0");
        } else {
            turbo_quant = "none";
            notes.push("Cache KV : fp16 (VRAM suffisante)");
        }

        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → toutes les couches`);
        notes.push(`Contexte : ${context_window.toLocaleString()} tokens (tout en VRAM)`);
        notes.push(`CPU : ${threads} threads`);

        const cappedContext = capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
        if (cappedContext < context_window) {
            notes.push(`Contexte bridé par le modèle: ${cappedContext.toLocaleString()} tokens`);
        }
        return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODE MAX_CONTEXT : exploite RAM + VRAM pour maximiser le contexte
    // ═══════════════════════════════════════════════════════════════════════
    if (mode === "max_context") {
        // Contexte plus large basé sur RAM + VRAM combinés
        const totalMem = hw.total_ram_gb + (hw.has_dedicated_gpu ? hw.gpu_vram_gb : 0);
        let context_window: number;
        if (totalMem < 8) {
            context_window = 4096;
        } else if (totalMem < 16) {
            context_window = 8192;
        } else if (totalMem < 24) {
            context_window = 16384;
        } else if (totalMem < 40) {
            context_window = 32768;
        } else if (totalMem < 64) {
            context_window = 65536;
        } else {
            context_window = 131072;
        }

        // Toujours quantifier le cache KV pour économiser la mémoire
        let turbo_quant: TurboQuantType;
        if (totalMem < 16) {
            turbo_quant = "q4_0";
            notes.push("Cache KV : q4_0 (économie mémoire max)");
        } else {
            turbo_quant = "q8_0";
            notes.push("Cache KV : q8_0 (bon compromis pour grand contexte)");
        }

        // GPU layers : autant que possible mais on réserve de la VRAM pour le KV
        let n_gpu_layers: number;
        if (!hw.has_dedicated_gpu || hw.gpu_vram_gb < 1) {
            n_gpu_layers = 0;
            notes.push("GPU : CPU uniquement");
        } else if (hw.gpu_vram_gb < 4) {
            n_gpu_layers = 15;
            notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 15 couches`);
        } else if (hw.gpu_vram_gb < 8) {
            n_gpu_layers = 30;
            notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 30 couches`);
        } else {
            n_gpu_layers = 40;
            notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 40 couches (reste en RAM)`);
        }

        notes.push(`RAM : ${hw.total_ram_gb.toFixed(1)} Go — Contexte : ${context_window.toLocaleString()} tokens`);
        notes.push(`CPU : ${threads} threads`);
        notes.push("⚠ Génération plus lente (KV cache partagé RAM/VRAM)");

        const cappedContext = capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
        if (cappedContext < context_window) {
            notes.push(`Contexte bridé par mémoire réelle du modèle: ${cappedContext.toLocaleString()} tokens`);
        }
        return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MODE BALANCED (défaut) : ancien comportement, bon compromis
    // ═══════════════════════════════════════════════════════════════════════
    let context_window: number;
    if (hw.total_ram_gb < 6) {
        context_window = 2048;
    } else if (hw.total_ram_gb < 12) {
        context_window = 4096;
    } else if (hw.total_ram_gb < 24) {
        context_window = 8192;
    } else if (hw.total_ram_gb < 48) {
        context_window = 16384;
    } else {
        context_window = 32768;
    }
    notes.push(`RAM : ${hw.total_ram_gb.toFixed(1)} Go → contexte ${context_window.toLocaleString()} tokens`);

    let turbo_quant: TurboQuantType;
    if (hw.total_ram_gb < 8) {
        turbo_quant = "q4_0";
        notes.push("Cache KV : q4_0 (économie maximale — RAM faible)");
    } else if (hw.total_ram_gb < 16) {
        turbo_quant = "q8_0";
        notes.push("Cache KV : q8_0 (équilibre qualité/mémoire)");
    } else {
        turbo_quant = "none";
        notes.push("Cache KV : désactivé (RAM suffisante)");
    }

    let n_gpu_layers: number;
    if (!hw.has_dedicated_gpu || hw.gpu_vram_gb < 1) {
        n_gpu_layers = 0;
        notes.push("GPU : CPU uniquement (pas de GPU dédié ou VRAM insuffisante)");
    } else if (hw.gpu_vram_gb < 3) {
        n_gpu_layers = 12;
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 12 couches GPU`);
    } else if (hw.gpu_vram_gb < 5) {
        n_gpu_layers = 24;
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 24 couches GPU`);
    } else if (hw.gpu_vram_gb < 7) {
        n_gpu_layers = 35;
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 35 couches GPU`);
    } else if (hw.gpu_vram_gb < 12) {
        n_gpu_layers = 48;
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → 48 couches GPU`);
    } else {
        n_gpu_layers = 999;
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → toutes les couches en GPU`);
    }

    notes.push(`CPU : ${hw.cpu_threads} threads logiques → ${threads} threads alloués à llama`);

    const cappedContext = capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
    if (cappedContext < context_window) {
        notes.push(`Contexte bridé par surcharge modèle/KV: ${cappedContext.toLocaleString()} tokens`);
    }

    return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
}
