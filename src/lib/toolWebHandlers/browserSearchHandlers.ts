import { invoke } from "@tauri-apps/api/tauri";
import { open as shellOpen } from "@tauri-apps/api/shell";
import { invokeWithTimeout } from "../chatUtils";
import { markError, type BrowserArgs, type SharedArgs } from "./types";

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
