import { invoke } from "@tauri-apps/api/tauri";
export { extractWriteFileTool, normalizeToolTags, parseMessageSegments, sanitizeLlmJson } from "./toolParsing";

export type ChatMode = "ask" | "plan" | "agent";

/** Appelle une commande Tauri avec un timeout. Lance une erreur si pas de réponse dans `ms` ms. */
export function invokeWithTimeout<T>(cmd: string, args: Record<string, unknown>, ms: number): Promise<T> {
    return Promise.race([
        invoke<T>(cmd, args),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`[Timeout ${ms / 1000}s] L'outil "${cmd}" n'a pas répondu`)), ms),
        ),
    ]);
}

/** Redimensionne une image à 512px max avant encodage base64 */
export const resizeImageToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const maxSize = 512;
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };
        img.src = url;
    });

/** Supprime les balises système invisibles avant affichage */
export const stripSystemTags = (content: string): string =>
    content
        .replace(/<conv_title>[\s\S]*?<\/conv_title>\s*/gi, "")
        .replace(/<save_fact\s+key="[^"]+"\s+value="[^"]+"\s*\/?>\s*/gi, "")
        .trim();
