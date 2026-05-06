import { invoke } from "@tauri-apps/api/tauri";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invokeWithTimeout } from "../chatUtils";
import {
    DEFAULT_IMAGE_NEGATIVE_PROMPT,
    addTokensIfMissing,
    enhancePrompt,
    extractAspectRatioFromPrompt,
    getPresetConfig,
    isLikelyFrench,
    resolvePreset,
} from "../sdPromptUtils";
import { getStringToolValue, markError, type SharedArgs } from "./types";

/** Attend que llama-server soit prêt (polling is_llama_running) avec un timeout en ms. */
async function waitForLlamaReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const ready = await invoke<boolean>("is_llama_running");
            if (ready) return;
        } catch {
            // commande non supportée ou erreur -> on continue
        }
        await new Promise((r) => setTimeout(r, 1500));
    }
}

function isLlamaLoadingError(error: unknown): boolean {
    const msg = String(error ?? "").toLowerCase();
    return (
        msg.includes("503") &&
        (msg.includes("loading model") || msg.includes("service unavailable") || msg.includes("unavailable_error"))
    );
}

async function sendPromptWithLlamaRetry(
    sendPrompt: SharedArgs["sendPrompt"],
    prompt: string,
    cfg: SharedArgs["cfg"],
    maxAttempts = 8,
): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await sendPrompt(prompt, cfg);
            return;
        } catch (error) {
            lastError = error;
            if (!isLlamaLoadingError(error) || attempt === maxAttempts) {
                throw error;
            }
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    throw lastError;
}

export async function handleSaveImage(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.save_image === undefined) return false;

    try {
        const result = await invokeWithTimeout<{ path: string; dataUrl: string; filename: string }>(
            "save_image",
            { dataUrl: parsedTool.save_image, filename: parsedTool.filename ?? null },
            20000,
        );
        await sendPrompt(`[Image sauvegardée] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur save_image]: ${error}`, cfg);
    }

    return true;
}

export async function handleDownloadImage(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.download_image === undefined) return false;

    try {
        const result = await invokeWithTimeout<{ path: string; dataUrl: string; filename: string }>(
            "download_image",
            { url: parsedTool.download_image, filename: parsedTool.filename ?? null },
            30000,
        );
        await sendPrompt(`[Image téléchargée] \`${result.path}\`\n![${result.filename}](${result.dataUrl})`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur download_image]: ${error}`, cfg);
    }

    return true;
}

export async function handleGenerateImage(args: SharedArgs): Promise<boolean> {
    const {
        parsedTool,
        cfg,
        sendPrompt,
        lastToolWasErrorRef,
        conversationId,
        insertMessage,
        onImagePreview,
        onImageProgress,
        overrideAspectRatio,
        overrideBatchCount,
        overrideModel,
    } = args;
    if (parsedTool.generate_image === undefined && parsedTool.list_sd_models === undefined) return false;

    if (parsedTool.list_sd_models !== undefined) {
        try {
            const models = await invokeWithTimeout<string[]>("list_sd_models", {}, 10000);
            if (models.length === 0) {
                await sendPrompt(
                    `[list_sd_models] Aucun modèle SD trouvé.\nPlacez un fichier .safetensors dans le dossier models/sd/`,
                    cfg,
                );
            } else {
                await sendPrompt(
                    `[list_sd_models] Modèles disponibles :\n${models.map((m) => `• \`${m}\``).join("\n")}`,
                    cfg,
                );
            }
        } catch (error) {
            markError(lastToolWasErrorRef);
            await sendPrompt(`[Erreur list_sd_models]: ${error}`, cfg);
        }
        return true;
    }

    const rawPrompt = String(parsedTool.generate_image ?? "");
    if (!rawPrompt) {
        await sendPrompt(`[Erreur generate_image]: le prompt est requis`, cfg);
        return true;
    }

    if (isLikelyFrench(rawPrompt)) {
        await sendPrompt(
            `[generate_image] ⚠️ PROMPT EN FRANÇAIS DÉTECTÉ — ABANDON.\n` +
                `Stable Diffusion ne comprend que l'anglais. Un prompt français produit des images aléatoires.\n\n` +
                `Traduis ce prompt en mots-clés anglais descriptifs, puis rappelle generate_image :\n` +
                `"${rawPrompt}"`,
            cfg,
        );
        return true;
    }

    const preset = resolvePreset(parsedTool, rawPrompt, (keys) => getStringToolValue(parsedTool, keys));
    const presetConfig = getPresetConfig(preset);
    const prompt = addTokensIfMissing(enhancePrompt(rawPrompt), presetConfig.promptBoost);

    const userNegativePrompt =
        getStringToolValue(parsedTool, [
            "negative_prompt",
            "negativePrompt",
            "negativeprompt",
            "neg_prompt",
            "negPrompt",
        ]) ?? DEFAULT_IMAGE_NEGATIVE_PROMPT;
    const negativePrompt = addTokensIfMissing(userNegativePrompt, presetConfig.negativeBoost);
    const aspectRatio =
        overrideAspectRatio ||
        getStringToolValue(parsedTool, ["aspect_ratio", "aspectRatio", "ratio", "format"]) ||
        extractAspectRatioFromPrompt(prompt);

    const batchCount = Math.min(4, Math.max(1, overrideBatchCount ?? 1));
    const modelName = overrideModel || getStringToolValue(parsedTool, ["model", "sd_model", "model_name"]);
    const generatedPaths: string[] = [];
    let llamaWasStopped = false;

    let unlistenPreview: UnlistenFn | null = null;
    try {
        if (onImagePreview) {
            onImagePreview(null);
            unlistenPreview = await listen("sd-preview", (event) => {
                const payload = event.payload as { data_url?: unknown; progress?: unknown };
                const dataUrl = typeof payload?.data_url === "string" ? payload.data_url : null;
                const progress = typeof payload?.progress === "number" ? payload.progress : null;
                if (dataUrl) onImagePreview(dataUrl);
                if (progress !== null) onImageProgress?.(progress);
            });
        }

        for (let i = 0; i < batchCount; i++) {
            const result = await invokeWithTimeout<{ path: string; upscaled: boolean; llama_was_stopped: boolean }>(
                "generate_image",
                {
                    prompt,
                    negativePrompt,
                    aspectRatio,
                    steps: parsedTool.steps ?? presetConfig.steps,
                    cfgScale:
                        parsedTool.cfg_scale != null
                            ? Number(parsedTool.cfg_scale)
                            : parsedTool.cfgScale != null
                              ? Number(parsedTool.cfgScale)
                              : presetConfig.cfgScale,
                    sampler:
                        getStringToolValue(parsedTool, ["sampler", "sampling_method", "samplingMethod"]) ??
                        presetConfig.sampler,
                    width: parsedTool.width ?? null,
                    height: parsedTool.height ?? null,
                    model: modelName ?? null,
                    upscale: parsedTool.upscale === true || String(parsedTool.upscale).toLowerCase() === "true",
                    seed: parsedTool.seed ?? null,
                },
                360000,
            );

            generatedPaths.push(result.path);
            if (result.llama_was_stopped) llamaWasStopped = true;

            let imageDataUrl: string | undefined;
            try {
                const image = await invokeWithTimeout<{ path: string; data_url: string; filename: string }>(
                    "read_image",
                    { path: result.path },
                    15000,
                );
                imageDataUrl = image.data_url;
            } catch {}

            const upscaleNote = result.upscaled ? " (upscalé ×4 par Real-ESRGAN)" : "";
            const iterLabel = batchCount > 1 ? ` [${i + 1}/${batchCount}]` : "";

            if (insertMessage) {
                insertMessage({
                    role: "system",
                    content: `Image générée${iterLabel}${upscaleNote}`,
                    imageDataUrl,
                    imagePath: result.path,
                    displayOnly: true,
                });
            }
            if (conversationId) {
                invokeWithTimeout(
                    "save_message",
                    {
                        conversationId,
                        role: "system",
                        content: `Image générée${iterLabel}${upscaleNote}`,
                        imagePath: result.path,
                        displayOnly: true,
                    },
                    10000,
                ).catch(() => {});
            }

            if (i < batchCount - 1) {
                onImagePreview?.(null);
                onImageProgress?.(0);
            }
        }

        if (llamaWasStopped) {
            await waitForLlamaReady(90_000);
        }

        const pathsNote =
            batchCount > 1
                ? `\nChemins :\n${generatedPaths.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
                : `\nChemin : ${generatedPaths[0]}`;

        await sendPromptWithLlamaRetry(
            sendPrompt,
            `[generate_image] ✅ ${batchCount > 1 ? `${batchCount} images générées` : "Image générée"} avec succès !\nPreset : ${preset}\nModele : ${modelName ?? "auto"}\nPrompt : "${prompt}"${pathsNote}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur generate_image]: ${error}`, cfg);
    } finally {
        if (unlistenPreview) unlistenPreview();
        onImagePreview?.(null);
    }

    return true;
}
