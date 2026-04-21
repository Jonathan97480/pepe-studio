export type PdfPage = { pageNum: number; text: string };

type PdfTextItem = { str?: string };

async function loadPdfFromBytes(bytes: ArrayBuffer | Uint8Array) {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return pdfjsLib.getDocument({ data: bytes }).promise;
}

function extractTextFromPageContent(content: { items: unknown[] }): string {
    return content.items
        .map((item) => ((item as PdfTextItem).str ?? ""))
        .join(" ")
        .replace(/  +/g, " ")
        .trim();
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function renderPdfPageToDataUrl(pdf: Awaited<ReturnType<typeof loadPdfFromBytes>>, pageNum: number): Promise<string> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D indisponible pour l'OCR PDF");
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/png");
}

/**
 * Extrait le texte d'un fichier PDF page par page via pdfjs-dist.
 * Retourne un tableau de { pageNum, text } pour l'indexation RAG.
 */
export async function extractPdfPages(file: File): Promise<PdfPage[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await loadPdfFromBytes(arrayBuffer);

    const pages: PdfPage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = extractTextFromPageContent(content);
        if (text) pages.push({ pageNum: i, text });
    }
    return pages;
}

/**
 * Extrait le texte d'un PDF à partir de son contenu encodé en base64.
 * Utilisé par le tool read_pdf pour lire un PDF depuis le disque.
 */
export async function extractPdfPagesFromBase64(base64: string): Promise<PdfPage[]> {
    const pdf = await loadPdfFromBytes(base64ToBytes(base64));
    const pages: PdfPage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = extractTextFromPageContent(content);
        if (text) pages.push({ pageNum: i, text });
    }
    return pages;
}

export async function ocrPdfPages(file: File, maxPages?: number): Promise<PdfPage[]> {
    const { recognizeTextFromImage } = await import("./ocr");
    const pdf = await loadPdfFromBytes(await file.arrayBuffer());
    const pageCount = Math.min(pdf.numPages, maxPages ?? pdf.numPages);
    const pages: PdfPage[] = [];

    for (let i = 1; i <= pageCount; i++) {
        const dataUrl = await renderPdfPageToDataUrl(pdf, i);
        const text = await recognizeTextFromImage(dataUrl);
        if (text) pages.push({ pageNum: i, text });
    }

    return pages;
}

export async function ocrPdfPagesFromBase64(base64: string, maxPages?: number): Promise<PdfPage[]> {
    const { recognizeTextFromImage } = await import("./ocr");
    const pdf = await loadPdfFromBytes(base64ToBytes(base64));
    const pageCount = Math.min(pdf.numPages, maxPages ?? pdf.numPages);
    const pages: PdfPage[] = [];

    for (let i = 1; i <= pageCount; i++) {
        const dataUrl = await renderPdfPageToDataUrl(pdf, i);
        const text = await recognizeTextFromImage(dataUrl);
        if (text) pages.push({ pageNum: i, text });
    }

    return pages;
}
