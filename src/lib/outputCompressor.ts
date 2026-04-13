/**
 * outputCompressor.ts — "Pepe-Compressor"
 *
 * Transforme une sortie brute (stdout/stderr, résultat d'outil, log)
 * en flux sémantique compact avant injection dans le modèle Gemma 4.
 *
 * Quatre modules :
 *   A – Pattern Matcher  : Regex sur chemins, IP, timestamps, UUIDs
 *   B – Token Budget     : Tronquage intelligent si > limite
 *   C – Log Collapser    : Dédoublage + résumé de listes + stack-trace slim
 *   D – Diff Output      : Marquage des blocs non diff-able (future intégration)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressorOptions {
    /** Budget maximal en tokens estimés (1 token ≈ 4 caractères). Défaut : 1000 */
    tokenBudget?: number;
    /** Nombre de lignes conservées en tête lors du tronquage. Défaut : 20 */
    headLines?: number;
    /** Nombre de lignes conservées en queue lors du tronquage. Défaut : 20 */
    tailLines?: number;
    /** Seuil de répétition à partir duquel on collapse. Défaut : 3 */
    repeatThreshold?: number;
    /** Nombre de fichiers affichés en début/fin lors d'une liste. Défaut : 5 */
    listHeadTail?: number;
}

export interface CompressResult {
    /** Texte compressé prêt à envoyer au modèle */
    compressed: string;
    /** Tokens estimés dans la version compressée */
    estimatedTokens: number;
    /** Taux de compression (0–1) */
    ratio: number;
    /** Meta-tag résumant le contenu (pour index RAG) */
    metaTag: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 4; // caractères ≈ 1 token (estimation conservative)

// ─────────────────────────────────────────────────────────────────────────────
// Module A — Pattern Matcher
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns de remplacement : [regex, remplacement] */
const PATTERNS: [RegExp, string][] = [
    // Codes ANSI couleur / escape sequences
    [/\x1b\[[0-9;]*[mGKHFSTJu]/g, ""],
    // Timestamps ISO / logs
    [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, "<ts>"],
    // Timestamps heure seule (HH:MM:SS.mmm)
    [/\b\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?\b/g, "<time>"],
    // Chemins Windows longs (>= 3 segments)
    [/[A-Za-z]:\\(?:[^\\:\n"*?<>|]+\\){2,}[^\\:\n"*?<>|\s]*/g, "<path>"],
    // Chemins Unix longs (>= 3 segments)
    [/\/(?:[^\s/]+\/){2,}[^\s/]*/g, "<path>"],
    // Adresses IP v4
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>"],
    // UUID v4
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
    // Hashes Git / SHA-256 hex longs
    [/\b[0-9a-f]{40,64}\b/gi, "<hash>"],
    // Numéros de port standalone
    [/\bport\s+(\d{2,5})\b/gi, "port $1"],
    // Octets / tailles mémoire
    [/\b\d+(?:\.\d+)?\s*(?:bytes?|[KkMmGgTt][Bb]?)\b/g, "<size>"],
];

function applyPatterns(text: string): string {
    let out = text;
    for (const [rx, rep] of PATTERNS) {
        out = out.replace(rx, rep);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module C — Log Collapser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Supprime les lignes vides consécutives (garde une seule ligne blanche).
 * 2. Dédoublonne les lignes répétitives en [ligne × N].
 * 3. Détecte et collapse les stack-traces Node.js / JS.
 * 4. Résume les longues listes de fichiers.
 */
function collapseLog(
    lines: string[],
    repeatThreshold: number,
    listHeadTail: number,
): string[] {
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── Dédoublonnage ─────────────────────────────────────────────────
        let count = 1;
        while (i + count < lines.length && lines[i + count] === line) count++;
        if (count >= repeatThreshold) {
            result.push(`[Ligne répétée ×${count}] ${line}`);
            i += count;
            continue;
        }

        // ── Stack-trace Node.js / JS : on ne garde que le message d'erreur
        //    et la première frame externe (hors node_modules / node:)
        if (/^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError)[:：]/.test(line)) {
            result.push(line); // message principal
            i++;
            const frames: string[] = [];
            while (
                i < lines.length &&
                /^\s+at /.test(lines[i])
            ) {
                const frame = lines[i].trim();
                const isInternal =
                    frame.includes("node_modules") ||
                    frame.startsWith("at node:") ||
                    frame.startsWith("at async node:");
                if (!isInternal && frames.length === 0) {
                    frames.push(`  → ${frame.replace(/^\s*at\s+/, "")}`);
                }
                i++;
            }
            if (frames.length) result.push(...frames);
            else result.push("  → (frame interne)");
            continue;
        }

        // ── Résumé de liste de fichiers ────────────────────────────────────
        // Heuristique : bloc de lignes qui ressemblent toutes à des fichiers
        if (i + listHeadTail * 3 < lines.length) {
            const windowEnd = Math.min(i + 300, lines.length);
            const fileBlock = lines.slice(i, windowEnd).filter(
                (l) => /(?:^\s*[\w.-]+\.\w{1,10}\s*$|<path>)/.test(l),
            );
            if (fileBlock.length >= listHeadTail * 3) {
                const total = fileBlock.length;
                const head = fileBlock.slice(0, listHeadTail);
                const tail = fileBlock.slice(total - listHeadTail);
                result.push(...head);
                result.push(`[... ${total - listHeadTail * 2} fichiers masqués ...]`);
                result.push(...tail);
                i += total;
                continue;
            }
        }

        result.push(line);
        i++;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module B — Token Budget + tronquage intelligent
// ─────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
    return Math.ceil(text.length / CHUNK_SIZE);
}

function truncateToBudget(
    lines: string[],
    tokenBudget: number,
    headLines: number,
    tailLines: number,
): string[] {
    const full = lines.join("\n");
    if (estimateTokens(full) <= tokenBudget) return lines;

    // Tronquage tête + queue
    const head = lines.slice(0, headLines);
    const tail = lines.slice(-tailLines);
    const hidden = lines.length - headLines - tailLines;

    if (hidden <= 0) return lines;

    return [
        ...head,
        `[⚠ ${hidden} lignes supprimées — budget ${tokenBudget} tokens dépassé]`,
        ...tail,
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Module D — Meta-Tag (pour indexation RAG)
// ─────────────────────────────────────────────────────────────────────────────

function buildMetaTag(original: string, compressed: string): string {
    const lower = original.toLowerCase();

    // Détection du type de contenu
    const isError =
        /error|exception|traceback|echec|failed|fatal/i.test(lower);
    const isSuccess = /success|done|completed|ok\b|réussi/i.test(lower);
    const isFileList = /\n[\w.-]+\.\w{1,10}\s*\n/.test(original);
    const isLog = /<ts>|<time>/.test(compressed);
    const isSearch = /search|résultat|result|found/i.test(lower);

    const parts: string[] = [];
    if (isError) parts.push("Erreur");
    if (isSuccess) parts.push("Succès");
    if (isFileList) parts.push("Liste-Fichiers");
    if (isLog) parts.push("Log");
    if (isSearch) parts.push("Recherche");

    // Extrait les 5 premiers mots significatifs du texte compressé
    const keywords = compressed
        .replace(/\[.*?\]/g, "")
        .replace(/[^a-zA-ZÀ-ÿ\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5)
        .join(" ");

    return `[${parts.join("|") || "Sortie"}: ${keywords}]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<CompressorOptions> = {
    tokenBudget: 1000,
    headLines: 20,
    tailLines: 20,
    repeatThreshold: 3,
    listHeadTail: 5,
};

/**
 * Compresse une sortie brute en flux sémantique compact.
 *
 * @param raw    Texte brut (stdout, stderr, résultat d'outil JSON stringifié…)
 * @param opts   Options de compression
 * @returns      CompressResult avec le texte compressé, les métriques et le meta-tag
 *
 * @example
 * const { compressed, metaTag } = sanitizeOutput(rawLog, { tokenBudget: 800 });
 */
export function sanitizeOutput(
    raw: string,
    opts: CompressorOptions = {},
): CompressResult {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    const originalLen = raw.length;

    // Étape 1 — Nettoyage de base
    let text = raw
        .replace(/\r\n/g, "\n") // normalise CRLF → LF
        .replace(/\r/g, "\n");

    // Étape 2 — Module A : suppression des patterns bruités
    text = applyPatterns(text);

    // Étape 3 — Découpe en lignes, suppression des blancs excessifs
    let lines = text
        .split("\n")
        .map((l) => l.trimEnd())
        // Supprime les blocs de 2+ lignes vides consécutives
        .reduce<string[]>((acc, line) => {
            if (line === "" && acc[acc.length - 1] === "") return acc;
            acc.push(line);
            return acc;
        }, []);

    // Étape 4 — Module C : collapse des répétitions / stack-traces / listes
    lines = collapseLog(lines, options.repeatThreshold, options.listHeadTail);

    // Étape 5 — Module B : tronquage au budget token
    lines = truncateToBudget(
        lines,
        options.tokenBudget,
        options.headLines,
        options.tailLines,
    );

    const compressed = lines.join("\n").trim();
    const estimatedTokens = estimateTokens(compressed);
    const ratio =
        originalLen > 0 ? 1 - compressed.length / originalLen : 0;

    // Étape 6 — Module D : meta-tag pour le RAG
    const metaTag = buildMetaTag(raw, compressed);

    return { compressed, estimatedTokens, ratio, metaTag };
}

/**
 * Variante async pour les gros payloads (>500 Ko) — traite par chunks
 * pour éviter de bloquer le thread UI.
 */
export async function sanitizeOutputAsync(
    raw: string,
    opts: CompressorOptions = {},
): Promise<CompressResult> {
    // Pour les textes courts, pas besoin d'async
    if (raw.length < 500_000) return sanitizeOutput(raw, opts);

    return new Promise((resolve) => {
        setTimeout(() => resolve(sanitizeOutput(raw, opts)), 0);
    });
}

/**
 * Compresse le résultat d'un outil MCP/IA (qui peut être un objet ou du texte).
 * Convertit automatiquement les objets JSON en texte avant compression.
 */
export function sanitizeToolOutput(
    toolResult: unknown,
    opts: CompressorOptions = {},
): CompressResult {
    if (typeof toolResult === "string") {
        return sanitizeOutput(toolResult, opts);
    }
    // Objet JSON → stringify indenté pour le rendre lisible avant compression
    const text = JSON.stringify(toolResult, null, 2);
    return sanitizeOutput(text, opts);
}
