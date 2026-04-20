import type { MutableRefObject } from "react";
import type { Attachment } from "../hooks/useLlama";
import type { LlamaLaunchConfig } from "./llamaWrapper";
import { invokeWithTimeout } from "./chatUtils";
import { extractPdfPagesFromBase64 } from "./pdfExtract";

type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

type ToolRecord = Record<string, unknown>;

type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
};

type PdfBatchItem = {
    path: string;
    base64: string | null;
    error: string | null;
};

type RenameEntry = {
    from: string;
    to: string;
};

type RenameResult = {
    from: string;
    to: string;
    success: boolean;
    error: string | null;
};

function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

export async function handleReadFile(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_file) return false;

    try {
        const path = String(parsedTool.read_file);
        const content = await invokeWithTimeout<string>("read_file_content", { path }, 15000);
        await sendPrompt(`[Contenu de ${path}]\n\`\`\`\n${content}\n\`\`\``, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur lecture fichier]: ${error}`, cfg);
    }

    return true;
}

export async function handleListFolderPdfs(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.list_folder_pdfs) return false;

    try {
        const folder = String(parsedTool.list_folder_pdfs);
        const recursive = parsedTool.recursive === "true";
        const files = await invokeWithTimeout<string[]>("list_folder_pdfs", { folder, recursive }, 15000);
        if (files.length === 0) {
            await sendPrompt(`[list_folder_pdfs] Aucun fichier PDF trouvé dans : ${folder}`, cfg);
        } else {
            await sendPrompt(
                `[PDFs dans ${folder}] ${files.length} fichier(s) :\n${files
                    .map((file, index) => `  ${index + 1}. ${file}`)
                    .join("\n")}`,
                cfg,
            );
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur list_folder_pdfs]: ${error}`, cfg);
    }

    return true;
}

export async function handleReadPdf(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_pdf) return false;

    try {
        const path = String(parsedTool.read_pdf);
        const base64 = await invokeWithTimeout<string>("read_pdf_bytes", { path }, 30000);
        const pages = await extractPdfPagesFromBase64(base64);
        if (pages.length === 0) {
            await sendPrompt(
                `[read_pdf] Le PDF "${path}" ne contient aucun texte extractible (PDF image ou protégé).`,
                cfg,
            );
        } else {
            const text = pages.map((page) => `[Page ${page.pageNum}]\n${page.text}`).join("\n\n");
            await sendPrompt(`[Contenu PDF : ${path}] (${pages.length} page(s))\n\n${text}`, cfg);
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
        const pages = await extractPdfPagesFromBase64(base64);
        if (pages.length === 0) {
            await sendPrompt(`[read_pdf_brief] ${path} : aucun texte extractible.`, cfg);
        } else {
            await sendPrompt(`[PDF page 1 : ${path}]\n${pages[0].text.slice(0, 2000)}`, cfg);
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
                const pages = await extractPdfPagesFromBase64(item.base64);
                const text = pages.length > 0 ? pages[0].text.slice(0, 2000) : "(aucun texte)";
                parts.push(`[PDF: ${name}]\n${text}`);
            } catch (error) {
                parts.push(`[${name}] Erreur extraction: ${error}`);
            }
        }

        await sendPrompt(
            `[read_pdf_batch] ${items.length} fichier(s) analysés :\n\n${parts.join("\n\n---\n\n")}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_pdf_batch]: ${error}`, cfg);
    }

    return true;
}

export async function handleBatchRename(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.batch_rename) return false;

    try {
        let entries: RenameEntry[];
        if (Array.isArray(parsedTool.batch_rename)) {
            entries = parsedTool.batch_rename
                .filter((entry): entry is RenameEntry => {
                    if (typeof entry !== "object" || entry === null) return false;
                    return "from" in entry && "to" in entry;
                })
                .map((entry) => ({ from: String(entry.from), to: String(entry.to) }));
        } else {
            try {
                const parsed = JSON.parse(String(parsedTool.batch_rename));
                entries = Array.isArray(parsed)
                    ? parsed
                          .filter((entry): entry is RenameEntry => {
                              if (typeof entry !== "object" || entry === null) return false;
                              return "from" in entry && "to" in entry;
                          })
                          .map((entry) => ({ from: String(entry.from), to: String(entry.to) }))
                    : [];
            } catch {
                markError(lastToolWasErrorRef);
                await sendPrompt(
                    '[Erreur batch_rename] JSON invalide. Format attendu : [{"from": "chemin/ancien.pdf", "to": "nouveau.pdf"}, ...]\nLes guillemets internes doivent être échappés avec \\\\.',
                    cfg,
                );
                return true;
            }
        }

        const results = await invokeWithTimeout<RenameResult[]>(
            "batch_rename_files",
            { renames: entries },
            30000,
        );
        const successCount = results.filter((result) => result.success).length;
        const lines = results.map((result) =>
            result.success
                ? `  ✓ ${result.from.split("/").pop()} -> ${result.to.split("/").pop()}`
                : `  ✗ ${result.from.split("/").pop()} : ${result.error}`,
        );
        await sendPrompt(
            `[batch_rename] ${successCount}/${results.length} fichiers renommés avec succès.\n${lines.join("\n")}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur batch_rename]: ${error}`, cfg);
    }

    return true;
}
