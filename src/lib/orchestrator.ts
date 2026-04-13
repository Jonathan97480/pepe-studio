// src/lib/orchestrator.ts
import { sanitizeToolOutput, CompressorOptions } from "./outputCompressor";

export type LlamaRequest = {
    prompt: string;
    stream?: boolean;
    params?: {
        temperature?: number;
        maxTokens?: number;
        contextWindow?: number;
        systemPrompt?: string;
        turboQuant?: boolean;
    };
};

export type LlamaResponse = {
    message: string;
    done: boolean;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};

export type ToolRequest = {
    type: "search" | "api" | "mcp";
    payload: any;
};

import { defaultMcpManager } from "../tools/McpManager";

export type OrchestratorMessage =
    | { type: "llama"; data: LlamaRequest }
    | { type: "tool"; data: ToolRequest };

export interface Orchestrator {
    send(msg: OrchestratorMessage): Promise<LlamaResponse | any>;
    onStream?(cb: (partial: LlamaResponse) => void): void;
    /** Options de compression appliquées aux sorties d'outils */
    compressorOptions?: CompressorOptions;
}

export class OrchestratorImpl implements Orchestrator {
    compressorOptions: CompressorOptions = { tokenBudget: 1000 };

    async send(msg: OrchestratorMessage): Promise<LlamaResponse | any> {
        if (msg.type === "tool") {
            const toolId = msg.data.type === "search" ? "search-web" : msg.data.type === "api" ? "api-client" : msg.data.payload.toolId;
            const raw = await defaultMcpManager.execute(toolId, msg.data.payload);
            // ── Pepe-Compressor : compression de la sortie d'outil ──
            const { compressed, metaTag, ratio, estimatedTokens } =
                sanitizeToolOutput(raw, this.compressorOptions);
            if (ratio > 0.05) {
                console.debug(
                    `[PepeCompressor] ${toolId} — ${Math.round(ratio * 100)}% compressé` +
                    ` (≈${estimatedTokens} tokens) ${metaTag}`,
                );
            }
            return compressed;
        }

        if (msg.type === "llama") {
            // Placeholder: appeler le wrapper Tauri / node-llama-cpp ici
            return {
                message: msg.data.prompt,
                done: true,
                usage: {
                    promptTokens: msg.data.prompt.split(/\s+/).length,
                    completionTokens: 0,
                    totalTokens: msg.data.prompt.split(/\s+/).length,
                },
            };
        }

        throw new Error("Type de message non supporté");
    }
}
