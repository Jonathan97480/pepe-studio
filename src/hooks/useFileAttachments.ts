import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { extractPdfPages, ocrPdfPages } from "../lib/pdfExtract";
import { resizeImageToDataUrl } from "../lib/chatUtils";
import type { Attachment } from "./useLlama";

interface UseFileAttachmentsResult {
    attachments: Attachment[];
    setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
    isIndexing: boolean;
    isDragging: boolean;
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleDragOver: (e: React.DragEvent) => void;
    handleDragEnter: (e: React.DragEvent) => void;
    handleDragLeave: (e: React.DragEvent) => void;
    handleDrop: (e: React.DragEvent) => Promise<void>;
}

export function useFileAttachments(): UseFileAttachmentsResult {
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isIndexing, setIsIndexing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounterRef = useRef(0);

    const processFiles = async (files: File[]) => {
        if (files.length === 0) return;
        const newAtts: Attachment[] = [];
        const hasIndexableFiles = files.some((f) => !f.type.startsWith("image/"));
        if (hasIndexableFiles) setIsIndexing(true);
        try {
            for (const file of files) {
                if (file.type.startsWith("image/")) {
                    const dataUrl = await resizeImageToDataUrl(file);
                    newAtts.push({ name: file.name, mimeType: file.type, dataUrl });
                } else if (file.type === "application/pdf") {
                    try {
                        let pages = await extractPdfPages(file);
                        if (pages.length === 0) {
                            pages = await ocrPdfPages(file);
                        }
                        const docId = await invoke<number>("store_document", {
                            name: file.name,
                            chunks: pages.map((p) => ({ page_num: p.pageNum, text: p.text })),
                        });
                        newAtts.push({ name: file.name, mimeType: file.type, docId, totalPages: pages.length });
                    } catch (err) {
                        console.error("[RAG] indexation PDF échouée", err);
                        try {
                            let pages = await extractPdfPages(file);
                            if (pages.length === 0) {
                                pages = await ocrPdfPages(file);
                            }
                            const text = pages.map((p) => `[Page ${p.pageNum}]\n${p.text}`).join("\n\n");
                            newAtts.push({ name: file.name, mimeType: file.type, text });
                        } catch {
                            newAtts.push({
                                name: file.name,
                                mimeType: file.type,
                                text: `[Erreur : impossible de lire le PDF "${file.name}"]`,
                            });
                        }
                    }
                } else {
                    // Fichier texte → découper en chunks et indexer via RAG (comme les PDFs)
                    try {
                        const text = await file.text();
                        const CHUNK_SIZE = 1800; // ~450 tokens/chunk, confortable pour FTS5
                        const chunks: { page_num: number; text: string }[] = [];
                        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                            chunks.push({
                                page_num: Math.floor(i / CHUNK_SIZE) + 1,
                                text: text.slice(i, i + CHUNK_SIZE),
                            });
                        }
                        const docId = await invoke<number>("store_document", {
                            name: file.name,
                            chunks,
                        });
                        newAtts.push({ name: file.name, mimeType: file.type, docId, totalPages: chunks.length });
                    } catch (err) {
                        console.error("[RAG] indexation texte échouée", err);
                        // Fallback : injection directe si l'indexation échoue
                        const text = await file.text();
                        newAtts.push({ name: file.name, mimeType: file.type, text });
                    }
                }
            }
        } finally {
            setAttachments((prev) => [...prev, ...newAtts]);
            setIsIndexing(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        await processFiles(files);
        e.target.value = "";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDragging(false);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        await processFiles(files);
    };

    return {
        attachments,
        setAttachments,
        isIndexing,
        isDragging,
        handleFileSelect,
        handleDragOver,
        handleDragEnter,
        handleDragLeave,
        handleDrop,
    };
}
