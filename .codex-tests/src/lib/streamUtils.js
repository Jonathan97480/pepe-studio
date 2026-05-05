"use strict";
/**
 * Utilitaires de traitement du stream LLM.
 *
 * Fonctions pures (sans dépendances React) extraites de useLlama.ts :
 * - normalizeVisibleAssistantText : normalise le texte visible pour la détection de boucle
 * - isCorruptedThinkingChunk : détecte les chunks de réflexion corrompus
 * - detectRepetitionLoop : détecte une séquence répétée dans le buffer du stream
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVisibleAssistantText = normalizeVisibleAssistantText;
exports.isCorruptedThinkingChunk = isCorruptedThinkingChunk;
exports.detectRepetitionLoop = detectRepetitionLoop;
/**
 * Normalise le texte assistant visible pour la détection de boucle.
 * Retire les balises tool/patch/write/think et la ponctuation lourde.
 */
function normalizeVisibleAssistantText(text) {
    return text
        .replace(/<tool>[\s\S]*?<\/tool>/gi, " ")
        .replace(/<patch_file[\s\S]*?<\/patch_file>/gi, " ")
        .replace(/<write_file[\s\S]*?<\/write_file>/gi, " ")
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .replace(/\[start thinking\]|\[end thinking\]/gi, " ")
        .replace(/<unused\d+>/g, " ")
        .replace(/[{}[\]<>`"\\/_|=:~]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Retourne true si un chunk de thinking est corrompu (caractères illisibles).
 * Utilisé pour ignorer les tokens garbled dans le raisonnement.
 */
function isCorruptedThinkingChunk(text) {
    const trimmed = text.trim();
    if (!trimmed)
        return false;
    const visibleChars = Array.from(trimmed).filter((ch) => !/\s/.test(ch));
    if (visibleChars.length < 12)
        return false;
    const questionLikeCount = visibleChars.filter((ch) => ch === "?" || ch === "â€" || ch === "\uFFFD").length;
    const alphaNumCount = visibleChars.filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
    const punctuationOnly = alphaNumCount === 0;
    const questionRatio = questionLikeCount / visibleChars.length;
    return punctuationOnly || (questionLikeCount >= 16 && questionRatio >= 0.55);
}
/**
 * Détecte si le texte assistant visible contient une vraie séquence répétée en boucle.
 * Analyse le buffer normalisé pour trouver des patterns répétés ≥ 4 fois.
 */
function detectRepetitionLoop(buffer) {
    const normalized = normalizeVisibleAssistantText(buffer);
    if (normalized.length < 260)
        return false;
    const alphaChars = (normalized.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
    if (alphaChars < 180)
        return false;
    const tail = normalized.slice(-700);
    for (let len = 30; len <= 120; len++) {
        const pattern = tail.slice(-len).trim();
        if (pattern.length < 24)
            continue;
        const wordCount = pattern.split(/\s+/).filter(Boolean).length;
        if (wordCount < 4)
            continue;
        let count = 0;
        let pos = tail.length - len;
        while (pos >= 0) {
            const segment = tail.slice(pos, pos + len).trim();
            if (segment === pattern) {
                count++;
                pos -= len;
            }
            else {
                break;
            }
        }
        if (count >= 4)
            return true;
    }
    return false;
}
