import type { Attachment } from "../../hooks/useLlama";
import { invokeWithTimeout } from "../chatUtils";
import { extractPdfPagesFromBase64, ocrPdfPagesFromBase64 } from "../pdfExtract";
import { recognizeTextFromImage } from "../ocr";
import {
    fileExtension,
    fileNameFromPath,
    IMAGE_FILE_EXTENSIONS,
    markError,
    type ImageBatchItem,
    type PdfBatchItem,
    type SharedArgs,
    TEXT_FILE_EXTENSIONS,
} from "./types";

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
        const maxFiles = Math.min(100, Math.max(1, Number(parsedTool.max_files ?? parsedTool.maxFiles ?? 30) || 30));

        const files = await invokeWithTimeout<string[]>(
            "list_folder_files",
            { folder, recursive, extensions: null },
            20000,
        );
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
            sections.push(
                `\n[Autres fichiers]\n${others
                    .slice(0, 20)
                    .map((path) => `- ${fileNameFromPath(path)}`)
                    .join("\n")}`,
            );
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
