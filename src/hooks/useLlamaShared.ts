import { invoke as apiInvoke } from "@tauri-apps/api/tauri";

export type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export type TauriWindowShape = {
    __TAURI__?: {
        invoke?: TauriInvoke;
        core?: { invoke?: TauriInvoke };
        tauri?: { invoke?: TauriInvoke };
    };
};

export type LlamaApiImagePart = { type: "image_url"; image_url: { url: string } };
export type LlamaApiTextPart = { type: "text"; text: string };
export type LlamaApiContent = string | Array<LlamaApiTextPart | LlamaApiImagePart>;

export type LlamaMessage = {
    role: "user" | "assistant" | "system";
    content: string;
    apiContent?: LlamaApiContent;
    thinking?: string;
    thinkingDone?: boolean;
    thinkingCollapsed?: boolean;
    thinkingFromTag?: boolean;
    meta?: string;
    displayOnly?: boolean;
    imageDataUrl?: string;
    imagePath?: string;
};

export type Attachment = {
    name: string;
    mimeType: string;
    dataUrl?: string;
    text?: string;
    docId?: number;
    totalPages?: number;
};

const isDev = process.env.NODE_ENV === "development";

export const devLog = isDev ? (...args: unknown[]) => console.log(...args) : () => {};
export const devError = isDev ? (...args: unknown[]) => console.error(...args) : () => {};
export const devWarn = isDev ? (...args: unknown[]) => console.warn(...args) : () => {};

export const safeInvoke = async <T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    if (typeof window === "undefined") {
        throw new Error(
            "Tauri invoke unavailable. Assure-toi de lancer l'application depuis le runtime Tauri, pas depuis le navigateur web.",
        );
    }

    const tauri = (window as TauriWindowShape).__TAURI__;
    devLog("[useLlama] safeInvoke", {
        cmd,
        args,
        hasWindow: true,
        hasTauri: !!tauri,
        hasTauriInvoke: typeof tauri?.invoke === "function",
        hasCoreInvoke: typeof tauri?.core?.invoke === "function",
        hasTauriTauriInvoke: typeof tauri?.tauri?.invoke === "function",
        tauriKeys: tauri ? Object.keys(tauri) : undefined,
        apiInvokeAvailable: typeof apiInvoke === "function",
    });

    if (typeof apiInvoke === "function") {
        try {
            return await apiInvoke(cmd, args);
        } catch (error) {
            devError("[useLlama] apiInvoke failed", error);
            throw error;
        }
    }

    const tauriInvoke = tauri?.invoke ?? tauri?.core?.invoke ?? tauri?.tauri?.invoke;
    if (typeof tauriInvoke === "function") {
        try {
            return await tauriInvoke(cmd, args);
        } catch (error) {
            devError("[useLlama] tauriInvoke failed", error);
            throw error;
        }
    }

    throw new Error(
        "Tauri invoke unavailable. Assure-toi de lancer l'application depuis le runtime Tauri, pas depuis le navigateur web.",
    );
};

export const getErrorMessage = (error: unknown, fallback: string) =>
    typeof error === "string" ? error : error instanceof Error ? error.message : (JSON.stringify(error) ?? fallback);
