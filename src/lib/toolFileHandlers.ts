import type { MutableRefObject } from "react";
import type { Attachment } from "../hooks/useLlama";
import type { LlamaLaunchConfig } from "./llamaWrapper";
import { invokeWithTimeout } from "./chatUtils";
import { extractPdfPagesFromBase64, ocrPdfPagesFromBase64 } from "./pdfExtract";
import { recognizeTextFromImage } from "./ocr";

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

type ImageReadResult = {
    path: string;
    data_url: string;
    filename: string;
    mime_type: string;
};

type ImageBatchItem = {
    path: string;
    data_url: string | null;
    filename: string | null;
    mime_type: string | null;
    error: string | null;
};

const TEXT_FILE_EXTENSIONS = new Set([
    "txt",
    "md",
    "json",
    "js",
    "jsx",
    "ts",
    "tsx",
    "html",
    "css",
    "csv",
    "xml",
    "yaml",
    "yml",
    "log",
]);

const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

function fileNameFromPath(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

function fileExtension(path: string): string {
    return path.split(".").pop()?.toLowerCase() ?? "";
}

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

export async function handleAnalyzeFolder(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.analyze_folder) return false;

    try {
        const folder = String(parsedTool.analyze_folder);
        const recursive = parsedTool.recursive === true || parsedTool.recursive === "true";
        const maxFiles = Math.min(
            100,
            Math.max(1, Number(parsedTool.max_files ?? parsedTool.maxFiles ?? 30) || 30),
        );

        const files = await invokeWithTimeout<string[]>("list_folder_files", { folder, recursive, extensions: null }, 20000);
        if (files.length === 0) {
            await sendPrompt(`[analyze_folder] Aucun fichier trouvé dans : ${folder}`, cfg);
            return true;
        }

        const limitedFiles = files.slice(0, maxFiles);
        const truncated = files.length > limitedFiles.length;
        const pdfs = limitedFiles.filter((path) => fileExtension(path) === "pdf");
        const images = limitedFiles.filter((path) => IMAGE_FILE_EXTENSIONS.has(fileExtension(path)));
        const textFiles = limitedFiles.filter((path) => TEXT_FILE_EXTENSIONS.has(fileExtension(path)));
        const others = limitedFiles.filter(
            (path) => !pdfs.includes(path) && !images.includes(path) && !textFiles.includes(path),
        );

        const sections: string[] = [
            `[analyze_folder] Dossier: ${folder}`,
            `Fichiers analysés: ${limitedFiles.length}${truncated ? ` sur ${files.length}` : ""}`,
            `PDFs: ${pdfs.length} | Images: ${images.length} | Textes: ${textFiles.length} | Autres: ${others.length}`,
        ];

        if (pdfs.length > 0) {
            const pdfItems = await invokeWithTimeout<PdfBatchItem[]>(
                "read_pdf_batch",
                { paths: pdfs.slice(0, 8) },
                60000,
            );
            const previews: string[] = [];
            for (const item of pdfItems) {
                const name = fileNameFromPath(item.path);
                if (item.error || !item.base64) {
                    previews.push(`- ${name}: erreur ${item.error ?? "lecture impossible"}`);
                    continue;
                }
                let pages = await extractPdfPagesFromBase64(item.base64);
                let usedOcr = false;
                if (pages.length === 0) {
                    pages = await ocrPdfPagesFromBase64(item.base64, 1);
                    usedOcr = pages.length > 0;
                }
                const preview = pages[0]?.text.slice(0, 1200) ?? "(aucun texte)";
                previews.push(`- ${name}${usedOcr ? " [OCR]" : ""}: ${preview}`);
            }
            sections.push(`\n[PDF previews]\n${previews.join("\n")}`);
        }

        const attachments: Attachment[] = [];
        if (images.length > 0) {
            const imageItems = await invokeWithTimeout<ImageBatchItem[]>(
                "read_image_batch",
                { paths: images.slice(0, 6) },
                60000,
            );
            const previews: string[] = [];
            for (const item of imageItems) {
                const name = item.filename ?? fileNameFromPath(item.path);
                if (item.error || !item.data_url || !item.mime_type) {
                    previews.push(`- ${name}: erreur ${item.error ?? "lecture impossible"}`);
                    continue;
                }
                const ocrText = await recognizeTextFromImage(item.data_url).catch(() => "");
                previews.push(`- ${name}${ocrText ? ` [OCR: ${ocrText.slice(0, 400)}]` : ""}`);
                if (attachments.length < 4) {
                    attachments.push({ name, mimeType: item.mime_type, dataUrl: item.data_url });
                }
            }
            sections.push(`\n[Image previews]\n${previews.join("\n")}`);
        }

        if (textFiles.length > 0) {
            const previews: string[] = [];
            for (const path of textFiles.slice(0, 8)) {
                try {
                    const content = await invokeWithTimeout<string>("read_file_content", { path }, 15000);
                    previews.push(`- ${fileNameFromPath(path)}: ${content.slice(0, 1200)}`);
                } catch (error) {
                    previews.push(`- ${fileNameFromPath(path)}: erreur ${error}`);
                }
            }
            sections.push(`\n[Text previews]\n${previews.join("\n")}`);
        }

        if (others.length > 0) {
            sections.push(`\n[Autres fichiers]\n${others.slice(0, 20).map((path) => `- ${fileNameFromPath(path)}`).join("\n")}`);
        }

        sections.push(
            `\nRéponds maintenant avec une analyse synthétique du dossier en t'appuyant uniquement sur cet inventaire, les aperçus et les éventuelles images jointes.`,
        );

        await sendPrompt(sections.join("\n"), cfg, attachments.length > 0 ? attachments : undefined);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur analyze_folder]: ${error}`, cfg);
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

export async function handleListFolderFiles(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.list_folder_files) return false;

    try {
        const folder = String(parsedTool.list_folder_files);
        const recursive = parsedTool.recursive === true || parsedTool.recursive === "true";
        let extensions: string[] | null = null;
        if (Array.isArray(parsedTool.extensions)) {
            extensions = parsedTool.extensions.map(String);
        } else if (typeof parsedTool.extensions === "string" && parsedTool.extensions.trim()) {
            try {
                const parsed = JSON.parse(parsedTool.extensions);
                if (Array.isArray(parsed)) extensions = parsed.map(String);
            } catch {
                extensions = parsedTool.extensions
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
            }
        }

        const files = await invokeWithTimeout<string[]>("list_folder_files", { folder, recursive, extensions }, 20000);
        if (files.length === 0) {
            await sendPrompt(`[list_folder_files] Aucun fichier trouvé dans : ${folder}`, cfg);
        } else {
            await sendPrompt(
                `[Fichiers dans ${folder}] ${files.length} fichier(s) :\n${files
                    .map((file, index) => `  ${index + 1}. ${file}`)
                    .join("\n")}`,
                cfg,
            );
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur list_folder_files]: ${error}`, cfg);
    }

    return true;
}

export async function handleListFolderImages(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.list_folder_images) return false;

    try {
        const folder = String(parsedTool.list_folder_images);
        const recursive = parsedTool.recursive === true || parsedTool.recursive === "true";
        const files = await invokeWithTimeout<string[]>("list_folder_images", { folder, recursive }, 15000);
        if (files.length === 0) {
            await sendPrompt(`[list_folder_images] Aucune image trouvée dans : ${folder}`, cfg);
        } else {
            await sendPrompt(
                `[Images dans ${folder}] ${files.length} fichier(s) :\n${files
                    .map((file, index) => `  ${index + 1}. ${file}`)
                    .join("\n")}`,
                cfg,
            );
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur list_folder_images]: ${error}`, cfg);
    }

    return true;
}

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

export async function handleReadImage(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.read_image) return false;

    try {
        const path = String(parsedTool.read_image);
        const image = await invokeWithTimeout<ImageReadResult>("read_image", { path }, 30000);
        const ocrText = await recognizeTextFromImage(image.data_url).catch(() => "");
        const prompt = ocrText
            ? `[Résultat outil: read_image]
Image locale chargée: ${image.path}
Texte OCR détecté:
${ocrText.slice(0, 4000)}

Utilise d'abord le texte OCR ci-dessus, puis l'image jointe si nécessaire. N'invente pas de contenu non visible.`
            : `[Résultat outil: read_image]
Image locale chargée: ${image.path}
Utilise l'image jointe pour répondre à la demande de l'utilisateur. N'invente pas de contenu non visible.`;
        await sendPrompt(
            prompt,
            cfg,
            [{ name: image.filename, mimeType: image.mime_type, dataUrl: image.data_url }],
        );
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
            const name = item.filename ?? item.path.split(/[\\/]/).pop() ?? item.path;
            if (item.error || !item.data_url || !item.mime_type) {
                summary.push(`- ${name}: erreur ${item.error ?? "image vide"}`);
                continue;
            }
            attachments.push({ name, mimeType: item.mime_type, dataUrl: item.data_url });
            summary.push(`- ${name}: image jointe prête à analyser`);
        }

        await sendPrompt(
            `[Résultat outil: read_image_batch]
${items.length} image(s) traitée(s).
${summary.join("\n")}

Utilise uniquement les images jointes et la liste ci-dessus pour répondre. Si certaines images ont échoué, signale-le brièvement.`,
            cfg,
            attachments,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_image_batch]: ${error}`, cfg);
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
