type OcrWorker = {
    recognize: (image: string | HTMLCanvasElement) => Promise<{ data: { text: string } }>;
    setParameters?: (params: Record<string, string>) => Promise<unknown>;
};

let workerPromise: Promise<OcrWorker> | null = null;

function normalizeOcrText(text: string): string {
    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

async function getWorker(): Promise<OcrWorker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            const mod = await import("tesseract.js");
            const createWorker = mod.createWorker ?? mod.default?.createWorker;
            if (typeof createWorker !== "function") {
                throw new Error("Tesseract createWorker indisponible");
            }

            const worker = (await createWorker("fra+eng", 1, {
                logger: () => {},
                errorHandler: () => {},
            })) as OcrWorker;

            await worker.setParameters?.({
                tessedit_pageseg_mode: "6",
                preserve_interword_spaces: "1",
            });

            return worker;
        })();
    }
    return workerPromise;
}

export async function recognizeTextFromImage(
    image: string | HTMLCanvasElement,
    minLength = 8,
): Promise<string> {
    const worker = await getWorker();
    const result = await worker.recognize(image);
    const text = normalizeOcrText(result.data.text ?? "");
    return text.length >= minLength ? text : "";
}

