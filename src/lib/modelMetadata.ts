import { invoke } from "@tauri-apps/api/tauri";

export type ModelMetadata = {
    path: string;
    architecture: string;
    name: string;
    context_length: number;
    block_count: number;
    head_count_kv: number;
    key_length: number;
    value_length: number;
    embedding_length: number;
    file_size_bytes: number;
    has_chat_template: boolean;
};

export async function inspectModelMetadata(modelPath: string): Promise<ModelMetadata> {
    return invoke<ModelMetadata>("inspect_model_metadata", { modelPath });
}
