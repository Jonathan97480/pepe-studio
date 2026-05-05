/**
 * Utilitaires de génération d'image Stable Diffusion.
 *
 * Contient toute la logique pure (sans dépendances React ni Tauri) :
 * - détection de langue (français)
 * - amélioration et combinaison des prompts
 * - normalisation et inférence des presets
 * - configuration des presets (steps, cfgScale, sampler, boosts)
 * - extraction du ratio d'aspect depuis le prompt
 */

const DEFAULT_IMAGE_NEGATIVE_PROMPT =
    "lowres, blurry, bad anatomy, bad hands, missing hands, extra fingers, too many fingers, fused fingers, mutated hands, deformed, disfigured, ugly, gross proportions, bad face, disfigured face, poorly drawn face, distorted face, mutation, duplicate, multiple people, multiple faces, cloned face, extra heads, extra persons, crowd, out of frame, cropped, worst quality, low quality, jpeg artifacts, artifacts, glitch, noise, distortion, chromatic aberration, color bleeding, pixelated, oversaturated, text, watermark, logo, signature";

const QUALITY_PROMPT_PREFIX = "masterpiece, best quality, ultra-detailed, sharp focus, 8k uhd, ";

export type ImagePreset =
    | "default"
    | "portrait"
    | "wide_scene"
    | "product"
    | "illustration"
    | "cinematic"
    | "architecture"
    | "food"
    | "fantasy_art"
    | "logo_flat";

export interface PresetConfig {
    steps: number;
    cfgScale: number;
    sampler: string;
    promptBoost: string;
    negativeBoost: string;
}

// Mots grammaticaux français qui n'existent pas en anglais — jamais présents dans un prompt SD anglais.
const FRENCH_GRAMMAR_WORDS =
    /^(de|du|des|une|les|au|aux|est|sont|avec|dans|sur|pour|par|mais|donc|très|cette|celui|celle|ceux|leurs|notre|votre|aussi|tout|tous|toute|toutes|quand|comme|plus|moins|entre|avant|après|pendant|depuis|vers|chez|sans|sous|loin|haut|bas|même|autre|autres|chaque|plusieurs|quelques|souvent|toujours|jamais|encore|enfin|surtout|notamment|ainsi|donc|car|puisque|afin|selon|parmi|malgré|grâce|lors|dès|jusqu|jusque)$/i;

/**
 * Retourne true si le prompt ressemble à du texte français.
 * Stratégie :
 *  1. Caractères accentués typiquement français (é, è, â, ç, œ…)
 *  2. ≥ 3 mots grammaticaux français purs (inexistants en anglais)
 */
export function isLikelyFrench(text: string): boolean {
    if (/[àâéèêëîïôùûüçœæ]/i.test(text)) return true;
    const words = text.toLowerCase().split(/[\s,.:;!?()\[\]]+/);
    const frenchHits = words.filter((w) => w.length > 1 && FRENCH_GRAMMAR_WORDS.test(w)).length;
    return frenchHits >= 3;
}

/** Injecte les tokens qualité SD en début de prompt si absents. */
export function enhancePrompt(rawPrompt: string): string {
    const lower = rawPrompt.toLowerCase();
    const hasQualityTokens =
        lower.includes("masterpiece") ||
        lower.includes("best quality") ||
        lower.includes("ultra-detailed") ||
        lower.includes("ultra detailed");
    return hasQualityTokens ? rawPrompt : QUALITY_PROMPT_PREFIX + rawPrompt;
}

export function addTokensIfMissing(base: string, extraTokens: string): string {
    const existing = new Set(
        base
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean),
    );
    const toAdd = extraTokens
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && !existing.has(t.toLowerCase()));
    if (toAdd.length === 0) return base;
    return `${base}, ${toAdd.join(", ")}`;
}

export function normalizePresetName(value: string): ImagePreset | null {
    const v = value.trim().toLowerCase();
    if (!v) return null;
    if (["portrait", "face", "person", "character", "visage"].includes(v)) return "portrait";
    if (["wide", "wide_scene", "scene", "landscape", "grand_decor", "decor"].includes(v)) return "wide_scene";
    if (["product", "packshot", "objet", "object"].includes(v)) return "product";
    if (["illustration", "anime", "drawing", "concept_art", "art"].includes(v)) return "illustration";
    if (["cinematic", "movie", "film", "cinema"].includes(v)) return "cinematic";
    if (["architecture", "archi", "building", "interior", "exterior", "real_estate"].includes(v)) {
        return "architecture";
    }
    if (["food", "meal", "dish", "culinary"].includes(v)) return "food";
    if (["fantasy", "fantasy_art", "creature", "heroic_fantasy"].includes(v)) return "fantasy_art";
    if (["logo", "logo_flat", "icon", "brandmark", "vector"].includes(v)) return "logo_flat";
    if (["default", "photo", "realistic", "auto"].includes(v)) return "default";
    return null;
}

export function inferPresetFromPrompt(prompt: string): ImagePreset {
    const lower = prompt.toLowerCase();

    const hasHumanSubject =
        /(portrait|headshot|face|selfie|character|person|woman|man|girl|boy|people|human|model|visage)/.test(lower);
    const hasLargeEnvironment =
        /(landscape|scenery|cinematic|wide shot|environment|city|street|mountain|forest|desert|battlefield|grand decor|d[ée]cor|full body|panoramic|background)/.test(
            lower,
        );
    if (hasHumanSubject && hasLargeEnvironment) return "wide_scene";

    if (/(portrait|headshot|close[- ]?up|closeup|face|selfie|character|person|woman|man|eyes|smile|visage)/.test(lower))
        return "portrait";
    if (
        /(landscape|scenery|cinematic|wide shot|environment|city|street|mountain|forest|desert|battlefield|grand decor|d[ée]cor|full body)/.test(
            lower,
        )
    )
        return "wide_scene";
    if (/(product|packshot|studio shot|catalog|ecommerce|object on|isolated object|white background)/.test(lower))
        return "product";
    if (/(cinematic|movie still|film still|dramatic lighting|anamorphic|letterbox|color grading)/.test(lower))
        return "cinematic";
    if (/(architecture|interior|exterior|building|facade|living room|kitchen design|real estate)/.test(lower))
        return "architecture";
    if (/(food|dish|meal|plate|restaurant|culinary|gourmet|dessert|burger|pizza|pasta|sushi)/.test(lower))
        return "food";
    if (/(fantasy|dragon|wizard|sorcerer|epic armor|mythical|magic aura|rpg|creature)/.test(lower))
        return "fantasy_art";
    if (/(logo|icon|minimal mark|brand mark|flat vector|clean vector|emblem)/.test(lower)) return "logo_flat";
    if (/(anime|illustration|drawing|sketch|concept art|painting|comic|manga|3d render|stylized)/.test(lower))
        return "illustration";
    return "default";
}

export function resolvePreset(
    parsedTool: Record<string, unknown>,
    prompt: string,
    getStringValue: (keys: string[]) => string | null,
): ImagePreset {
    const explicitPreset = getStringValue(["preset", "image_preset", "style_preset"]);
    if (explicitPreset) {
        const normalized = normalizePresetName(explicitPreset);
        if (normalized) return normalized;
    }
    return inferPresetFromPrompt(prompt);
}

export function getPresetConfig(preset: ImagePreset): PresetConfig {
    switch (preset) {
        case "portrait":
            return {
                steps: 40,
                cfgScale: 7.2,
                sampler: "euler_a",
                promptBoost: "detailed face, symmetrical face, sharp eyes, natural skin texture, realistic proportions",
                negativeBoost:
                    "deformed face, asymmetrical eyes, malformed eyes, bad eyes, extra eyes, distorted mouth, bad teeth, disfigured",
            };
        case "wide_scene":
            return {
                steps: 38,
                cfgScale: 7.0,
                sampler: "euler_a",
                promptBoost: "subject in focus, coherent anatomy, readable face, medium shot",
                negativeBoost:
                    "deformed face, asymmetrical eyes, malformed eyes, tiny face, blurry face, disfigured, bad anatomy",
            };
        case "product":
            return {
                steps: 34,
                cfgScale: 6.8,
                sampler: "euler_a",
                promptBoost: "studio lighting, crisp details, clean edges, centered composition",
                negativeBoost: "warped geometry, blurry edges, reflections artifacts, deformed object",
            };
        case "illustration":
            return {
                steps: 32,
                cfgScale: 7.8,
                sampler: "euler_a",
                promptBoost: "clean linework, consistent style, readable composition",
                negativeBoost: "muddy colors, broken anatomy, extra limbs, distorted perspective",
            };
        case "cinematic":
            return {
                steps: 38,
                cfgScale: 7.0,
                sampler: "euler_a",
                promptBoost: "cinematic lighting, dramatic contrast, film still look, depth of field",
                negativeBoost: "washed colors, noisy shadows, plastic skin, overexposed highlights",
            };
        case "architecture":
            return {
                steps: 36,
                cfgScale: 6.7,
                sampler: "euler_a",
                promptBoost: "straight lines, accurate perspective, realistic materials, balanced lighting",
                negativeBoost: "warped perspective, bent walls, distorted geometry, messy composition",
            };
        case "food":
            return {
                steps: 34,
                cfgScale: 7.1,
                sampler: "euler_a",
                promptBoost: "appetizing presentation, natural texture, soft studio lighting, shallow depth of field",
                negativeBoost: "burnt colors, mushy texture, plastic look, deformed cutlery, messy plate",
            };
        case "fantasy_art":
            return {
                steps: 40,
                cfgScale: 8.0,
                sampler: "euler_a",
                promptBoost: "epic composition, intricate details, magical atmosphere, dynamic pose",
                negativeBoost: "flat lighting, muddy details, broken anatomy, extra limbs, distorted face",
            };
        case "logo_flat":
            return {
                steps: 28,
                cfgScale: 6.2,
                sampler: "euler_a",
                promptBoost: "flat vector style, minimal design, strong silhouette, clean edges",
                negativeBoost: "photorealistic texture, gradients, blurry edges, cluttered details, watermark",
            };
        default:
            return {
                steps: 35,
                cfgScale: 7.5,
                sampler: "euler_a",
                promptBoost: "coherent anatomy, sharp subject, natural lighting",
                negativeBoost: "deformed face, bad anatomy, artifacts, glitch",
            };
    }
}

export function extractAspectRatioFromPrompt(prompt: string): string | null {
    const lower = prompt.toLowerCase();

    const numMatch = prompt.match(/(?:^|\s)(\d{1,3})\s*[:/xX]\s*(\d{1,3})(?=\s|$)/);
    if (numMatch) {
        const w = Number(numMatch[1]);
        const h = Number(numMatch[2]);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            return `${Math.round(w)}/${Math.round(h)}`;
        }
    }

    if (/\bsquare\b|\bcarr[ée]\b|\b1:1\b/.test(lower)) return "1/1";
    if (/\blandscape\b|\bpaysage\b|\bwide\b/.test(lower)) return "16/9";
    if (/\bportrait\b/.test(lower)) return "9/16";

    return null;
}

export { DEFAULT_IMAGE_NEGATIVE_PROMPT };
