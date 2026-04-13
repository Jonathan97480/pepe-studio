export type PdfPage = { pageNum: number; text: string };

/**
 * Extrait le texte d'un fichier PDF page par page via pdfjs-dist.
 * Retourne un tableau de { pageNum, text } pour l'indexation RAG.
 */
export async function extractPdfPages(file: File): Promise<PdfPage[]> {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: PdfPage[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
            .map((item: any) => ("str" in item ? item.str : ""))
            .join(" ")
            .replace(/  +/g, " ")
            .trim();
        if (text) pages.push({ pageNum: i, text });
    }
    return pages;
}
