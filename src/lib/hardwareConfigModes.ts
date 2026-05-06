import type { TurboQuantType } from "./llamaWrapper";
import type { ModelMetadata } from "./modelMetadata";
import type { AutoConfig, AutoMode, HardwareInfo } from "./hardwareConfig";

type ModeDeps = {
    capContextToModel: (
        desired: number,
        hw: HardwareInfo,
        metadata: ModelMetadata | undefined,
        nGpuLayers: number,
        turboQuant: TurboQuantType,
    ) => number;
    estimateGpuLayerFit: (
        hw: HardwareInfo,
        metadata: Pick<ModelMetadata, "file_size_bytes" | "block_count"> | undefined,
        requestedLayers: number,
        mode: AutoMode,
    ) => number;
};

export function computeGpuOnlyConfig(
    hw: HardwareInfo,
    metadata: ModelMetadata | undefined,
    threads: number,
    notes: string[],
    deps: ModeDeps,
): AutoConfig {
    if (!hw.has_dedicated_gpu || hw.gpu_vram_gb < 2) {
        notes.push("⚠ Pas de GPU dédié — bascule sur mode équilibré");
        return computeBalancedConfig(hw, metadata, threads, notes, deps);
    }

    let n_gpu_layers = 999;
    let context_window: number;

    if (hw.gpu_vram_gb < 6) context_window = 2048;
    else if (hw.gpu_vram_gb < 8) context_window = 4096;
    else if (hw.gpu_vram_gb < 12) context_window = 8192;
    else if (hw.gpu_vram_gb < 16) context_window = 16384;
    else context_window = 32768;

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

    n_gpu_layers = deps.estimateGpuLayerFit(hw, metadata, n_gpu_layers, "gpu_only");
    if (metadata?.block_count && n_gpu_layers >= metadata.block_count) {
        notes.push(`GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → toutes les couches`);
    } else {
        notes.push(
            `GPU : ${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go) → ${n_gpu_layers} couches (taille modèle prise en compte)`,
        );
    }
    notes.push(`Contexte : ${context_window.toLocaleString()} tokens (tout en VRAM)`);
    notes.push(`CPU : ${threads} threads`);

    const cappedContext = deps.capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
    if (cappedContext < context_window) {
        notes.push(`Contexte bridé par le modèle: ${cappedContext.toLocaleString()} tokens`);
    }

    return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
}

export function computeMaxContextConfig(
    hw: HardwareInfo,
    metadata: ModelMetadata | undefined,
    threads: number,
    notes: string[],
    deps: ModeDeps,
): AutoConfig {
    const totalMem = hw.total_ram_gb + (hw.has_dedicated_gpu ? hw.gpu_vram_gb : 0);

    let context_window: number;
    if (totalMem < 8) context_window = 4096;
    else if (totalMem < 16) context_window = 8192;
    else if (totalMem < 24) context_window = 16384;
    else if (totalMem < 40) context_window = 32768;
    else if (totalMem < 64) context_window = 65536;
    else context_window = 131072;

    let turbo_quant: TurboQuantType;
    if (totalMem < 16) {
        turbo_quant = "q4_0";
        notes.push("Cache KV : q4_0 (économie mémoire max)");
    } else {
        turbo_quant = "q8_0";
        notes.push("Cache KV : q8_0 (bon compromis pour grand contexte)");
    }

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

    const requestedGpuLayers = n_gpu_layers;
    n_gpu_layers = deps.estimateGpuLayerFit(hw, metadata, n_gpu_layers, "max_context");
    if (n_gpu_layers < requestedGpuLayers) {
        notes.push(`GPU : plafond réduit à ${n_gpu_layers} couches selon la taille réelle du modèle`);
    }

    notes.push(`RAM : ${hw.total_ram_gb.toFixed(1)} Go — Contexte : ${context_window.toLocaleString()} tokens`);
    notes.push(`CPU : ${threads} threads`);
    notes.push("⚠ Génération plus lente (KV cache partagé RAM/VRAM)");

    const cappedContext = deps.capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
    if (cappedContext < context_window) {
        notes.push(`Contexte bridé par mémoire réelle du modèle: ${cappedContext.toLocaleString()} tokens`);
    }

    return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
}

export function computeBalancedConfig(
    hw: HardwareInfo,
    metadata: ModelMetadata | undefined,
    threads: number,
    notes: string[],
    deps: ModeDeps,
): AutoConfig {
    let context_window: number;
    if (hw.total_ram_gb < 6) context_window = 2048;
    else if (hw.total_ram_gb < 12) context_window = 4096;
    else if (hw.total_ram_gb < 24) context_window = 8192;
    else if (hw.total_ram_gb < 48) context_window = 16384;
    else context_window = 32768;
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

    const requestedGpuLayers = n_gpu_layers;
    n_gpu_layers = deps.estimateGpuLayerFit(hw, metadata, n_gpu_layers, "balanced");
    if (requestedGpuLayers >= 999) {
        if (metadata?.block_count && n_gpu_layers >= metadata.block_count) {
            notes.push("GPU : le modèle tient entièrement en VRAM selon sa taille GGUF");
        } else {
            notes.push(`GPU : le modèle ne tient pas entièrement en VRAM, plafond ramené à ${n_gpu_layers} couches`);
        }
    } else if (n_gpu_layers < requestedGpuLayers) {
        notes.push(`GPU : plafond réduit à ${n_gpu_layers} couches selon la taille réelle du modèle`);
    }

    notes.push(`CPU : ${hw.cpu_threads} threads logiques → ${threads} threads alloués à llama`);

    const cappedContext = deps.capContextToModel(context_window, hw, metadata, n_gpu_layers, turbo_quant);
    if (cappedContext < context_window) {
        notes.push(`Contexte bridé par surcharge modèle/KV: ${cappedContext.toLocaleString()} tokens`);
    }

    return { context_window: cappedContext, turbo_quant, n_gpu_layers, threads, notes };
}
