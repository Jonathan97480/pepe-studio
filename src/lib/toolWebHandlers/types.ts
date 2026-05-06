import type { MutableRefObject } from "react";
import type { Attachment, LlamaMessage } from "../../hooks/useLlama";
import type { LlamaLaunchConfig } from "../llamaWrapper";

export type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

export type ToolRecord = Record<string, unknown>;
export type CritiqueOutput = (output: string, toolName: string) => string;

export type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    conversationId?: number | null;
    insertMessage?: (msg: LlamaMessage) => void;
    onImagePreview?: (dataUrl: string | null) => void;
    onImageProgress?: (progress: number) => void;
    overrideAspectRatio?: string | null;
    overrideBatchCount?: number;
    overrideModel?: string | null;
};

export type BrowserArgs = SharedArgs & {
    critiqueOutput: CritiqueOutput;
    onOpenBrowserUrl?: (url: string) => void;
};

export function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

export function getStringToolValue(parsedTool: ToolRecord, keys: string[]): string | null {
    for (const key of keys) {
        const value = parsedTool[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return null;
}
