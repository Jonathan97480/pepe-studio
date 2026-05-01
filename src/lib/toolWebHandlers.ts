import { invoke } from "@tauri-apps/api/tauri";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MutableRefObject } from "react";
import type { Attachment, LlamaMessage } from "../hooks/useLlama";
import { queryDocs, searchLibrary } from "../tools/Context7Client";
import { invokeWithTimeout } from "./chatUtils";
import type { LlamaLaunchConfig } from "./llamaWrapper";

type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

type ToolRecord = Record<string, unknown>;
type CritiqueOutput = (output: string, toolName: string) => string;

type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    conversationId?: number | null;
    insertMessage?: (msg: LlamaMessage) => void;
    onImagePreview?: (dataUrl: string | null) => void;
    onImageProgress?: (progress: number) => void;
    /** Format imposé par l'utilisateur via le sélecteur UI (ex: "16:9"). Prend le dessus sur ce que le LLM propose. */
    overrideAspectRatio?: string | null;
    /** Nombre d'itérations de génération (1-4). */
    overrideBatchCount?: number;
    /** Modèle SD imposé par le sélecteur UI. */
    overrideModel?: string | null;
};

type BrowserArgs = SharedArgs & {
    critiqueOutput: CritiqueOutput;
    onOpenBrowserUrl?: (url: string) => void;
};

function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

/** Attend que llama-server soit prêt (polling is_llama_running) avec un timeout en ms. */
async function waitForLlamaReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const ready = await invoke<boolean>("is_llama_running");
            if (ready) return;
        } catch {
            // commande non supportée ou erreur → on continue
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
    sendPrompt: SendPrompt,
    prompt: string,
    cfg: Partial<LlamaLaunchConfig>,
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
            // Le serveur répond encore "Loading model": on attend un peu puis on réessaie.
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
    throw lastError;
}

function getStringToolValue(parsedTool: ToolRecord, keys: string[]): string | null {
    for (const key of keys) {
        const value = parsedTool[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return null;
}

const DEFAULT_IMAGE_NEGATIVE_PROMPT =
    "lowres, blurry, bad anatomy, bad hands, missing hands, extra fingers, too many fingers, fused fingers, mutated hands, deformed, disfigured, ugly, gross proportions, bad face, disfigured face, poorly drawn face, distorted face, mutation, duplicate, multiple people, multiple faces, cloned face, extra heads, extra persons, crowd, out of frame, cropped, worst quality, low quality, jpeg artifacts, artifacts, glitch, noise, distortion, chromatic aberration, color bleeding, pixelated, oversaturated, text, watermark, logo, signature";

const QUALITY_PROMPT_PREFIX = "masterpiece, best quality, ultra-detailed, sharp focus, 8k uhd, ";

type ImagePreset =
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

// Mots grammaticaux français qui n'existent pas en anglais — jamais présents dans un prompt SD anglais.
const FRENCH_GRAMMAR_WORDS =
    /^(de|du|des|une|les|au|aux|est|sont|avec|dans|sur|pour|par|mais|donc|très|cette|celui|celle|ceux|leurs|notre|votre|aussi|tout|tous|toute|toutes|quand|comme|plus|moins|entre|avant|après|pendant|depuis|vers|chez|sans|sous|loin|haut|bas|même|autre|autres|chaque|plusieurs|quelques|souvent|toujours|jamais|encore|enfin|surtout|notamment|ainsi|donc|car|puisque|afin|selon|parmi|malgré|grâce|lors|dès|jusqu|jusque)$/i;

/**
 * Retourne true si le prompt ressemble à du texte français.
 * Stratégie :
 *  1. Caractères accentués typiquement français (é, è, â, ç, œ…)
 *  2. ≥ 3 mots grammaticaux français purs (inexistants en anglais)
 */
function isLikelyFrench(text: string): boolean {
    // Accents typiques du français absents de l'anglais standard
    if (/[àâéèêëîïôùûüçœæ]/i.test(text)) return true;
    // Mots grammaticaux purs — jamais dans un prompt anglais
    const words = text.toLowerCase().split(/[\s,.:;!?()\[\]]+/);
    const frenchHits = words.filter((w) => w.length > 1 && FRENCH_GRAMMAR_WORDS.test(w)).length;
    return frenchHits >= 3;
}

/** Injecte les tokens qualité SD en début de prompt si absents. */
function enhancePrompt(rawPrompt: string): string {
    const lower = rawPrompt.toLowerCase();
    const hasQualityTokens =
        lower.includes("masterpiece") ||
        lower.includes("best quality") ||
        lower.includes("ultra-detailed") ||
        lower.includes("ultra detailed");
    return hasQualityTokens ? rawPrompt : QUALITY_PROMPT_PREFIX + rawPrompt;
}

function addTokensIfMissing(base: string, extraTokens: string): string {
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

function normalizePresetName(value: string): ImagePreset | null {
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

function inferPresetFromPrompt(prompt: string): ImagePreset {
    const lower = prompt.toLowerCase();

    // Priorité anti-visage déformé : humain + grand décor => wide_scene
    const hasHumanSubject =
        /(portrait|headshot|face|selfie|character|person|woman|man|girl|boy|people|human|model|visage)/.test(lower);
    const hasLargeEnvironment =
        /(landscape|scenery|cinematic|wide shot|environment|city|street|mountain|forest|desert|battlefield|grand decor|d[ée]cor|full body|panoramic|background)/.test(
            lower,
        );
    if (hasHumanSubject && hasLargeEnvironment) {
        return "wide_scene";
    }

    if (
        /(portrait|headshot|close[- ]?up|closeup|face|selfie|character|person|woman|man|eyes|smile|visage)/.test(lower)
    ) {
        return "portrait";
    }
    if (
        /(landscape|scenery|cinematic|wide shot|environment|city|street|mountain|forest|desert|battlefield|grand decor|d[ée]cor|full body)/.test(
            lower,
        )
    ) {
        return "wide_scene";
    }
    if (/(product|packshot|studio shot|catalog|ecommerce|object on|isolated object|white background)/.test(lower)) {
        return "product";
    }
    if (/(cinematic|movie still|film still|dramatic lighting|anamorphic|letterbox|color grading)/.test(lower)) {
        return "cinematic";
    }
    if (/(architecture|interior|exterior|building|facade|living room|kitchen design|real estate)/.test(lower)) {
        return "architecture";
    }
    if (/(food|dish|meal|plate|restaurant|culinary|gourmet|dessert|burger|pizza|pasta|sushi)/.test(lower)) {
        return "food";
    }
    if (/(fantasy|dragon|wizard|sorcerer|epic armor|mythical|magic aura|rpg|creature)/.test(lower)) {
        return "fantasy_art";
    }
    if (/(logo|icon|minimal mark|brand mark|flat vector|clean vector|emblem)/.test(lower)) {
        return "logo_flat";
    }
    if (/(anime|illustration|drawing|sketch|concept art|painting|comic|manga|3d render|stylized)/.test(lower)) {
        return "illustration";
    }
    return "default";
}

function resolvePreset(parsedTool: ToolRecord, prompt: string): ImagePreset {
    const explicitPreset = getStringToolValue(parsedTool, ["preset", "image_preset", "style_preset"]);
    if (explicitPreset) {
        const normalized = normalizePresetName(explicitPreset);
        if (normalized) return normalized;
    }
    return inferPresetFromPrompt(prompt);
}

function getPresetConfig(preset: ImagePreset): {
    steps: number;
    cfgScale: number;
    sampler: string;
    promptBoost: string;
    negativeBoost: string;
} {
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

function extractAspectRatioFromPrompt(prompt: string): string | null {
    const lower = prompt.toLowerCase();

    // Numeric ratio: "16/9", "16:9", "16x9"
    const numMatch = prompt.match(/(?:^|\s)(\d{1,3})\s*[:/xX]\s*(\d{1,3})(?=\s|$)/);
    if (numMatch) {
        const w = Number(numMatch[1]);
        const h = Number(numMatch[2]);
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            return `${Math.round(w)}/${Math.round(h)}`;
        }
    }

    // Text keywords
    if (/\bsquare\b|\bcarr[ée]\b|\b1:1\b/.test(lower)) return "1/1";
    if (/\blandscape\b|\bpaysage\b|\bwide\b/.test(lower)) return "16/9";
    if (/\bportrait\b/.test(lower)) return "9/16";

    return null;
}

function formatExternalBrowserFiles(errors: string[]): string {
    if (errors.length === 0) return "";

    const externalPaths = new Set<string>();
    for (const error of errors) {
        const match = error.match(/\(https?:\/\/[^/]+\/([^:)]+):\d+:\d+\)/);
        if (match && !match[1].endsWith("index.html")) {
            externalPaths.add(match[1]);
        }
    }

    if (externalPaths.size === 0) return "";

    const paths = [...externalPaths];
    return (
        `\n\nAttention: fichiers externes détectés.\n` +
        `Ces erreurs ne viennent pas de index.html, elles pointent vers:\n` +
        paths.map((path) => `  - ${path}`).join("\n") +
        `\nDiagnostic obligatoire avant tout patch:\n` +
        `  1. Si tu as créé ces fichiers, lis-les avec read_file.\n` +
        `  2. Sinon, liste le dossier du projet pour identifier un template ou des fichiers parasites.\n` +
        `  3. Ne patch pas index.html pour corriger une erreur provenant d'un autre fichier.`
    );
}

async function getBrowserErrorsSnapshot(): Promise<string[]> {
    return invokeWithTimeout<string[]>("get_browser_errors", {}, 5000);
}

export async function handleContext7Search(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool["context7-search"] === undefined) return false;

    try {
        const result = await searchLibrary(String(parsedTool["context7-search"]), String(parsedTool.query ?? ""));
        await sendPrompt(`[Context7 - Bibliothèques trouvées]\n${result}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur context7-search]: ${error}`, cfg);
    }

    return true;
}

export async function handleContext7Docs(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool["context7-docs"] === undefined) return false;

    try {
        const result = await queryDocs(
            String(parsedTool["context7-docs"]),
            String(parsedTool.query ?? ""),
            Number(parsedTool.tokens ?? 4000),
        );
        await sendPrompt(`[Context7 - Documentation]\n${result}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur context7-docs]: ${error}`, cfg);
    }

    return true;
}

export async function handleHttpRequest(args: SharedArgs & { critiqueOutput: CritiqueOutput }): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (!parsedTool.http_request) return false;

    try {
        const result = await invokeWithTimeout<string>(
            "http_request",
            {
                method: parsedTool.http_request,
                url: parsedTool.url ?? "",
                headers: parsedTool.headers ?? null,
                body: parsedTool.body ?? null,
            },
            30000,
        );
        await sendPrompt(`[Réponse HTTP]\n\`\`\`\n${critiqueOutput(result, "http_request")}\n\`\`\``, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur HTTP]: ${error}`, cfg);
    }

    return true;
}

export async function handleCreateMcpServer(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.create_mcp_server) return false;

    try {
        const name = String(parsedTool.create_mcp_server);
        const result = await invokeWithTimeout<string>(
            "create_mcp_server",
            {
                name,
                description: parsedTool.description ?? "",
                content: parsedTool.content ?? "",
            },
            20000,
        );
        await sendPrompt(
            `[Serveur MCP créé] "${name}" sauvegardé.\n${result}\n\nDémarre-le maintenant avec start_mcp_server pour voir ses outils.`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur création serveur MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleStartMcpServer(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.start_mcp_server) return false;

    try {
        const name = String(parsedTool.start_mcp_server);
        const tools = await invokeWithTimeout<{ name: string; description: string }[]>(
            "start_mcp_server",
            { name },
            20000,
        );
        const toolList = tools.map((tool) => `  - ${tool.name}: ${tool.description}`).join("\n");
        await sendPrompt(
            `[Serveur MCP "${name}" démarré]\nOutils disponibles :\n${toolList || "  (aucun outil)"}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur démarrage serveur MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleCallMcpTool(args: SharedArgs & { critiqueOutput: CritiqueOutput }): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (!parsedTool.call_mcp_tool) return false;

    try {
        const result = await invokeWithTimeout<string>(
            "call_mcp_tool",
            {
                serverName: parsedTool.call_mcp_tool,
                toolName: parsedTool.tool ?? "",
                argsJson: parsedTool.args ?? null,
            },
            20000,
        );
        await sendPrompt(
            `[Résultat MCP tool "${String(parsedTool.tool ?? "")}"]\n${critiqueOutput(
                result,
                `mcp:${String(parsedTool.tool ?? "")}`,
            )}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur appel outil MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleListMcpServers(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.list_mcp_servers === undefined) return false;

    try {
        const servers = await invokeWithTimeout<
            { name: string; description: string; running: boolean; tools: { name: string }[] }[]
        >("list_mcp_servers", {}, 20000);
        if (servers.length === 0) {
            await sendPrompt(`[MCP] Aucun serveur MCP disponible. Crée-en un avec create_mcp_server.`, cfg);
        } else {
            const list = servers
                .map(
                    (server) =>
                        `  - ${server.name} ${server.running ? "(en cours)" : "(arrêté)"}: ${server.description}\n    Outils: ${server.tools.map((tool) => tool.name).join(", ") || "démarrer pour voir"}`,
                )
                .join("\n");
            await sendPrompt(`[Serveurs MCP disponibles]\n${list}`, cfg);
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur liste MCP]: ${error}`, cfg);
    }

    return true;
}

export async function handleOpenBrowser(args: BrowserArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenBrowserUrl } = args;
    if (parsedTool.open_browser === undefined) return false;

    try {
        const targetUrl = String(parsedTool.open_browser);
        onOpenBrowserUrl?.(targetUrl);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const errors = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
        const report =
            errors.length > 0
                ? `\nErreurs JS capturées:\n${errors.map((error, index) => `${index + 1}. ${error}`).join("\n")}`
                : "\nAucune erreur JS capturée.";
        await sendPrompt(`[Navigateur] Page ouverte : ${targetUrl}${report}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur open_browser]: ${error}`, cfg);
    }

    return true;
}

export async function handleGetBrowserErrors(args: BrowserArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (parsedTool.get_browser_errors === undefined) return false;

    try {
        const errors = await getBrowserErrorsSnapshot();
        const report =
            errors.length === 0
                ? "Aucune erreur capturée."
                : errors.map((error, index) => `${index + 1}. ${error}`).join("\n");
        const base = errors.length > 0 ? critiqueOutput(report, "get_browser_errors") : report;
        await sendPrompt(`[Erreurs navigateur]\n${base}${formatExternalBrowserFiles(errors)}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur get_browser_errors]: ${error}`, cfg);
    }

    return true;
}

export async function handleStopDevServer(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.stop_dev_server === undefined) return false;

    try {
        await invokeWithTimeout<void>("stop_dev_server", {}, 5000);
        await sendPrompt(`[Serveur dev arrêté] Le serveur local a été stoppé.`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur stop_dev_server]: ${error}`, cfg);
    }

    return true;
}

export async function handleStartDevServer(args: BrowserArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenBrowserUrl } = args;
    if (parsedTool.start_dev_server === undefined) return false;

    try {
        const dir = String(parsedTool.start_dev_server);
        const port = await invokeWithTimeout<number>("start_dev_server", { baseDir: dir, port: 7820 }, 8000);
        const devUrl = `http://127.0.0.1:${port}/`;
        onOpenBrowserUrl?.(devUrl);
        shellOpen(devUrl).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const errors = await invoke<string[]>("get_browser_errors").catch(() => [] as string[]);
        let report = "\nAucune erreur JS capturée au démarrage.";
        if (errors.length > 0) {
            report = `\nErreurs JS capturées:\n${errors.map((error, index) => `${index + 1}. ${error}`).join("\n")}`;
            const external = formatExternalBrowserFiles(errors);
            if (external) {
                report += `\n${external}`;
            }
        }
        await sendPrompt(
            `[Serveur dev démarré] ${devUrl} - dossier : ${dir}${report}\nProchaine action obligatoire : appelle get_browser_errors pour valider le rendu, puis open_browser pour ouvrir la page.`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur start_dev_server]: ${error}`, cfg);
    }

    return true;
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

export async function handleSearchWeb(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.search_web === undefined) return false;

    const query = String(parsedTool.search_web ?? "");
    const source = String(parsedTool.source ?? "duckduckgo");
    const locale = String(parsedTool.locale ?? "fr");
    if (!query) {
        await sendPrompt(`[Erreur search_web]: paramètre query requis`, cfg);
        return true;
    }

    let apiKey: string | null = null;
    if (source === "brave") apiKey = localStorage.getItem("search_brave_api_key") || null;
    if (source === "serper") apiKey = localStorage.getItem("search_serper_api_key") || null;
    if (source === "tavily") apiKey = localStorage.getItem("search_tavily_api_key") || null;

    try {
        const results = await invokeWithTimeout<{ title: string; snippet: string; url: string; source: string }[]>(
            "search_web",
            { query, source, apiKey, locale },
            20000,
        );
        const lines = results
            .map((result, index) => `${index + 1}. **${result.title}**\n   ${result.snippet}\n   -> ${result.url}`)
            .join("\n\n");
        await sendPrompt(`[Résultats de recherche - source: ${source}]\nRequête: "${query}"\n\n${lines}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur search_web]: ${error}`, cfg);
    }

    return true;
}

export async function handleScrapeUrl(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.scrape_url === undefined) return false;

    const url = String(parsedTool.scrape_url ?? "");
    const mode = String(parsedTool.mode ?? "static");
    if (!url) {
        await sendPrompt(`[Erreur scrape_url]: paramètre url requis`, cfg);
        return true;
    }

    try {
        const page = await invokeWithTimeout<{
            url: string;
            title: string;
            description: string;
            text: string;
            headings: { level: string; text: string }[];
            links: { text: string; href: string }[];
            mode: string;
        }>("scrape_url", { url, mode }, mode === "js" ? 20000 : 35000);
        const headings =
            page.headings.length > 0
                ? `\n**Titres :**\n${page.headings.map((heading) => `- [${heading.level}] ${heading.text}`).join("\n")}`
                : "";
        const links =
            page.links.length > 0
                ? `\n**Liens (top 10) :**\n${page.links
                      .slice(0, 10)
                      .map((link) => `- [${link.text || link.href}](${link.href})`)
                      .join("\n")}`
                : "";
        await sendPrompt(
            `[Page scrapée - mode:${page.mode}]\n**URL :** ${page.url}\n**Titre :** ${page.title}\n**Description :** ${page.description}\n\n**Contenu :**\n${page.text}${headings}${links}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur scrape_url]: ${error}`, cfg);
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

    // list_sd_models
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

    // generate_image
    const rawPrompt = String(parsedTool.generate_image ?? "");
    if (!rawPrompt) {
        await sendPrompt(`[Erreur generate_image]: le prompt est requis`, cfg);
        return true;
    }

    // Rejet automatique si le prompt est en français — SD est entraîné en anglais uniquement
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

    const preset = resolvePreset(parsedTool, rawPrompt);
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
                if (dataUrl) {
                    onImagePreview(dataUrl);
                }
                if (progress !== null) {
                    onImageProgress?.(progress);
                }
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
                360000, // 6 minutes max
            );

            generatedPaths.push(result.path);
            if (result.llama_was_stopped) llamaWasStopped = true;

            // Charger l'image comme data URL (pour affichage visuel direct)
            let imageDataUrl: string | undefined;
            try {
                const image = await invokeWithTimeout<{ path: string; data_url: string; filename: string }>(
                    "read_image",
                    { path: result.path },
                    15000,
                );
                imageDataUrl = image.data_url;
            } catch {
                // read_image a échoué, l'image sera affichée comme lien texte
            }

            const upscaleNote = result.upscaled ? " (upscalé ×4 par Real-ESRGAN)" : "";
            const iterLabel = batchCount > 1 ? ` [${i + 1}/${batchCount}]` : "";

            // Afficher l'image dans le chat (natif, sans passer au LLM)
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

            // Réinitialiser le preview entre les itérations
            if (i < batchCount - 1) {
                onImagePreview?.(null);
                onImageProgress?.(0);
            }
        }

        // Si llama a été stoppé, attendre qu'il soit prêt avant sendPrompt
        if (llamaWasStopped) {
            await waitForLlamaReady(90_000);
        }

        const pathsNote =
            batchCount > 1
                ? `\nChemins :\n${generatedPaths.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
                : `\nChemin : ${generatedPaths[0]}`;

        // Court résumé texte envoyé au LLM (avec retry si 503 "Loading model")
        await sendPromptWithLlamaRetry(
            sendPrompt,
            `[generate_image] ✅ ${batchCount > 1 ? `${batchCount} images générées` : "Image générée"} avec succès !\nPreset : ${preset}\nModele : ${modelName ?? "auto"}\nPrompt : "${prompt}"${pathsNote}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur generate_image]: ${error}`, cfg);
    } finally {
        if (unlistenPreview) {
            unlistenPreview();
        }
        onImagePreview?.(null);
    }

    return true;
}

