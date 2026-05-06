import type { Attachment } from "../../hooks/useLlama";
import { invokeWithTimeout } from "../chatUtils";
import { recognizeTextFromImage } from "../ocr";
import { fileNameFromPath, markError, type ImageBatchItem, type ImageReadResult, type SharedArgs } from "./types";

export async function handleReadImage(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_image) return false;

    try {
        const path = String(parsedTool.read_image);
        const image = await invokeWithTimeout<ImageReadResult>("read_image", { path }, 30000);
        const ocrText = await recognizeTextFromImage(image.data_url).catch(() => "");
        const prompt = ocrText
            ? `[Résultat outil: read_image]\nImage locale chargée: ${image.path}\nTexte OCR détecté:\n${ocrText.slice(0, 4000)}\n\nUtilise d'abord le texte OCR ci-dessus, puis l'image jointe si nécessaire. N'invente pas de contenu non visible.`
            : `[Résultat outil: read_image]\nImage locale chargée: ${image.path}\nUtilise l'image jointe pour répondre à la demande de l'utilisateur. N'invente pas de contenu non visible.`;
        await sendPrompt(prompt, cfg, [{ name: image.filename, mimeType: image.mime_type, dataUrl: image.data_url }]);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_image]: ${error}`, cfg);
    }

    return true;
}

export async function handleReadImageBatch(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_image_batch) return false;

    try {
        let paths: string[];
        if (Array.isArray(parsedTool.read_image_batch)) {
            paths = parsedTool.read_image_batch.map(String);
        } else {
            try {
                const parsed = JSON.parse(String(parsedTool.read_image_batch));
                paths = Array.isArray(parsed) ? parsed.map(String) : [];
            } catch {
                markError(lastToolWasErrorRef);
                await sendPrompt(
                    '[Erreur read_image_batch] JSON invalide. Format attendu : ["chemin1.png", "chemin2.jpg", ...]',
                    cfg,
                );
                return true;
            }
        }

        const items = await invokeWithTimeout<ImageBatchItem[]>("read_image_batch", { paths }, 60000);
        const attachments: Attachment[] = [];
        const summary: string[] = [];

        for (const item of items) {
            const name = item.filename ?? fileNameFromPath(item.path);
            if (item.error || !item.data_url || !item.mime_type) {
                summary.push(`- ${name}: erreur ${item.error ?? "image vide"}`);
                continue;
            }
            attachments.push({ name, mimeType: item.mime_type, dataUrl: item.data_url });
            summary.push(`- ${name}: image jointe prête à analyser`);
        }

        await sendPrompt(
            `[Résultat outil: read_image_batch]\n${items.length} image(s) traitée(s).\n${summary.join("\n")}\n\nUtilise uniquement les images jointes et la liste ci-dessus pour répondre. Si certaines images ont échoué, signale-le brièvement.`,
            cfg,
            attachments,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_image_batch]: ${error}`, cfg);
    }

    return true;
}
