import { invokeWithTimeout } from "../chatUtils";
import { extractPdfPagesFromBase64, ocrPdfPagesFromBase64 } from "../pdfExtract";
import { markError, type PdfBatchItem, type SharedArgs } from "./types";

export async function handleReadPdf(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_pdf) return false;

    try {
        const path = String(parsedTool.read_pdf);
        const base64 = await invokeWithTimeout<string>("read_pdf_bytes", { path }, 30000);
        let pages = await extractPdfPagesFromBase64(base64);
        let usedOcr = false;
        if (pages.length === 0) {
            pages = await ocrPdfPagesFromBase64(base64);
            usedOcr = pages.length > 0;
        }
        if (pages.length === 0) {
            await sendPrompt(
                `[read_pdf] Le PDF "${path}" ne contient aucun texte extractible (PDF image ou protégé).`,
                cfg,
            );
        } else {
            const text = pages.map((page) => `[Page ${page.pageNum}]\n${page.text}`).join("\n\n");
            const prefix = usedOcr ? `[Contenu PDF OCR : ${path}]` : `[Contenu PDF : ${path}]`;
            await sendPrompt(`${prefix} (${pages.length} page(s))\n\n${text}`, cfg);
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_pdf]: ${error}`, cfg);
    }

    return true;
}

export async function handleReadPdfBrief(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_pdf_brief) return false;

    try {
        const path = String(parsedTool.read_pdf_brief);
        const base64 = await invokeWithTimeout<string>("read_pdf_bytes", { path }, 30000);
        let pages = await extractPdfPagesFromBase64(base64);
        let usedOcr = false;
        if (pages.length === 0) {
            pages = await ocrPdfPagesFromBase64(base64, 1);
            usedOcr = pages.length > 0;
        }
        if (pages.length === 0) {
            await sendPrompt(`[read_pdf_brief] ${path} : aucun texte extractible.`, cfg);
        } else {
            const prefix = usedOcr ? `[PDF OCR page 1 : ${path}]` : `[PDF page 1 : ${path}]`;
            await sendPrompt(`${prefix}\n${pages[0].text.slice(0, 2000)}`, cfg);
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_pdf_brief]: ${error}`, cfg);
    }

    return true;
}

export async function handleReadPdfBatch(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_pdf_batch) return false;

    try {
        let paths: string[];
        if (Array.isArray(parsedTool.read_pdf_batch)) {
            paths = parsedTool.read_pdf_batch.map(String);
        } else {
            try {
                const parsed = JSON.parse(String(parsedTool.read_pdf_batch));
                paths = Array.isArray(parsed) ? parsed.map(String) : [];
            } catch {
                markError(lastToolWasErrorRef);
                await sendPrompt(
                    '[Erreur read_pdf_batch] JSON invalide. Format attendu : ["chemin1.pdf", "chemin2.pdf", ...]\nLes guillemets internes doivent être échappés avec \\\\.',
                    cfg,
                );
                return true;
            }
        }

        const items = await invokeWithTimeout<PdfBatchItem[]>("read_pdf_batch", { paths }, 60000);
        const parts: string[] = [];

        for (const item of items) {
            const name = item.path.split(/[\\/]/).pop() ?? item.path;
            if (item.error || !item.base64) {
                parts.push(`[${name}] Erreur: ${item.error ?? "base64 vide"}`);
                continue;
            }

            try {
                let pages = await extractPdfPagesFromBase64(item.base64);
                let usedOcr = false;
                if (pages.length === 0) {
                    pages = await ocrPdfPagesFromBase64(item.base64, 1);
                    usedOcr = pages.length > 0;
                }
                const text = pages.length > 0 ? pages[0].text.slice(0, 2000) : "(aucun texte)";
                parts.push(`${usedOcr ? "[PDF OCR" : "[PDF"}: ${name}]\n${text}`);
            } catch (error) {
                parts.push(`[${name}] Erreur extraction: ${error}`);
            }
        }

        await sendPrompt(`[read_pdf_batch] ${items.length} fichier(s) analysés :\n\n${parts.join("\n\n---\n\n")}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_pdf_batch]: ${error}`, cfg);
    }

    return true;
}
