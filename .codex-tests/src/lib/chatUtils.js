"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripSystemTags = exports.resizeImageToDataUrl = exports.sanitizeLlmJson = exports.parseMessageSegments = exports.normalizeToolTags = exports.extractWriteFileTool = exports.extractSimpleTool = void 0;
exports.invokeWithTimeout = invokeWithTimeout;
const tauri_1 = require("@tauri-apps/api/tauri");
var toolParsing_1 = require("./toolParsing");
Object.defineProperty(exports, "extractSimpleTool", { enumerable: true, get: function () { return toolParsing_1.extractSimpleTool; } });
Object.defineProperty(exports, "extractWriteFileTool", { enumerable: true, get: function () { return toolParsing_1.extractWriteFileTool; } });
Object.defineProperty(exports, "normalizeToolTags", { enumerable: true, get: function () { return toolParsing_1.normalizeToolTags; } });
Object.defineProperty(exports, "parseMessageSegments", { enumerable: true, get: function () { return toolParsing_1.parseMessageSegments; } });
Object.defineProperty(exports, "sanitizeLlmJson", { enumerable: true, get: function () { return toolParsing_1.sanitizeLlmJson; } });
/** Appelle une commande Tauri avec un timeout. Lance une erreur si pas de réponse dans `ms` ms. */
function invokeWithTimeout(cmd, args, ms) {
    return Promise.race([
        (0, tauri_1.invoke)(cmd, args),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`[Timeout ${ms / 1000}s] L'outil "${cmd}" n'a pas répondu`)), ms)),
    ]);
}
/** Redimensionne une image à 512px max avant encodage base64 */
const resizeImageToDataUrl = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
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
exports.resizeImageToDataUrl = resizeImageToDataUrl;
/** Supprime les balises système invisibles avant affichage */
const stripSystemTags = (content) => content
    .replace(/<conv_title>[\s\S]*?<\/conv_title>\s*/gi, "")
    .replace(/<save_fact\s+key="[^"]+"\s+value="[^"]+"\s*\/?>\s*/gi, "")
    .trim();
exports.stripSystemTags = stripSystemTags;
