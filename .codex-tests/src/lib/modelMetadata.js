"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectModelMetadata = inspectModelMetadata;
const tauri_1 = require("@tauri-apps/api/tauri");
async function inspectModelMetadata(modelPath) {
    return (0, tauri_1.invoke)("inspect_model_metadata", { modelPath });
}
