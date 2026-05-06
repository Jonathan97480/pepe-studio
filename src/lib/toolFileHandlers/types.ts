import type { MutableRefObject } from "react";
import type { Attachment } from "../../hooks/useLlama";
import type { LlamaLaunchConfig } from "../llamaWrapper";

export type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

export type ToolRecord = Record<string, unknown>;

export type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
};

export type PdfBatchItem = {
    path: string;
    base64: string | null;
    error: string | null;
};

export type ImageReadResult = {
    path: string;
    data_url: string;
    filename: string;
    mime_type: string;
};

export type ImageBatchItem = {
    path: string;
    data_url: string | null;
    filename: string | null;
    mime_type: string | null;
    error: string | null;
};

export type RenameEntry = {
    from: string;
    to: string;
};

export type RenameResult = {
    from: string;
    to: string;
    success: boolean;
    error: string | null;
};

export const TEXT_FILE_EXTENSIONS = new Set([
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

export const IMAGE_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

export function fileNameFromPath(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

export function fileExtension(path: string): string {
    return path.split(".").pop()?.toLowerCase() ?? "";
}

export function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}
