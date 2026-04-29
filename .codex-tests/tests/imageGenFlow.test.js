"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolParsing_1 = require("../src/lib/toolParsing");
const toolDispatchUtils_1 = require("../src/lib/toolDispatchUtils");
// ── 1. Parsing du tag <tool>{"generate_image":"..."}</tool> ──────────────────
(0, node_test_1.default)("extractSimpleTool parse generate_image avec prompt simple", () => {
    const raw = `{"generate_image":"un chat roux mignon sur un canapé"}`;
    const result = (0, toolParsing_1.extractSimpleTool)(raw);
    strict_1.default.deepEqual(result, { generate_image: "un chat roux mignon sur un canapé" });
});
(0, node_test_1.default)("extractSimpleTool parse syntaxe legacy generate_image:prompt", () => {
    const raw = `generate_image:un chat bleu mignon`;
    const result = (0, toolParsing_1.extractSimpleTool)(raw);
    strict_1.default.deepEqual(result, { generate_image: "un chat bleu mignon" });
});
(0, node_test_1.default)("extractSimpleTool parse generate_image avec paramètres supplémentaires", () => {
    // Le LLM peut envoyer un JSON plus riche ; extractSimpleTool doit au moins récupérer generate_image
    const raw = `{"generate_image":"dragon volant","steps":30,"width":768,"height":512}`;
    const result = (0, toolParsing_1.extractSimpleTool)(raw);
    strict_1.default.ok(result !== null, "doit retourner un objet non-null");
    strict_1.default.equal(result["generate_image"], "dragon volant");
});
(0, node_test_1.default)("extractSimpleTool parse list_sd_models (booléen)", () => {
    const raw = `{"list_sd_models":true}`;
    const result = (0, toolParsing_1.extractSimpleTool)(raw);
    strict_1.default.deepEqual(result, { list_sd_models: true });
});
(0, node_test_1.default)("normalizeToolTags ne transforme pas <tool>generate_image en mauvais format", () => {
    const input = `<tool>{"generate_image":"paysage montagneux"}</tool>`;
    // normalizeToolTags ne doit pas altérer un bloc <tool> JSON valide
    const output = (0, toolParsing_1.normalizeToolTags)(input);
    strict_1.default.ok(output.includes('"generate_image"'), "generate_image doit rester intact");
    strict_1.default.ok(output.includes("<tool>"), "le tag <tool> doit être préservé");
});
(0, node_test_1.default)("normalizeToolTags convertit la syntaxe legacy generate_image:prompt en <tool> JSON", () => {
    const input = `generate_image:un chat bleu mignon`;
    const output = (0, toolParsing_1.normalizeToolTags)(input);
    strict_1.default.equal(output, '<tool>{"generate_image": "un chat bleu mignon"}</tool>');
});
// ── 2. Catégorisation de l'outil (dispatch) ─────────────────────────────────
(0, node_test_1.default)("isActionTool reconnaît generate_image comme outil d'action", () => {
    strict_1.default.equal((0, toolDispatchUtils_1.isActionTool)({ generate_image: "un lapin blanc" }), true);
});
(0, node_test_1.default)("isActionTool reconnaît list_sd_models comme outil d'action", () => {
    strict_1.default.equal((0, toolDispatchUtils_1.isActionTool)({ list_sd_models: true }), true);
});
(0, node_test_1.default)("describeTool retourne une chaîne non vide pour generate_image", () => {
    // generate_image n'est pas dans la liste prioritaire de describeTool, elle tombe sur "action"
    const desc = (0, toolDispatchUtils_1.describeTool)({ generate_image: "un château médiéval" });
    strict_1.default.ok(typeof desc === "string" && desc.length > 0, "describeTool doit retourner une chaîne non vide");
});
(0, node_test_1.default)("describeTool retourne 'action' pour list_sd_models booléen", () => {
    // list_sd_models: true — aucune chaîne de prompt, describeTool doit tomber sur son fallback
    const desc = (0, toolDispatchUtils_1.describeTool)({ list_sd_models: true });
    // Le fallback renvoie "action" ou la clé selon l'implémentation
    strict_1.default.ok(typeof desc === "string" && desc.length > 0, "describeTool doit retourner une chaîne non vide");
});
// ── 3. Documentation de l'outil disponible ──────────────────────────────────
(0, node_test_1.default)("resolveToolDoc trouve la doc de generate_image", () => {
    const doc = (0, toolDispatchUtils_1.resolveToolDoc)("generate_image");
    strict_1.default.equal(doc.type, "exact", "generate_image doit avoir une doc exacte");
    strict_1.default.match(doc.title, /generate_image/i);
});
(0, node_test_1.default)("resolveToolDoc trouve la doc de list_sd_models", () => {
    const doc = (0, toolDispatchUtils_1.resolveToolDoc)("list_sd_models");
    strict_1.default.equal(doc.type, "exact", "list_sd_models doit avoir une doc exacte");
    strict_1.default.match(doc.title, /list_sd_models/i);
});
// ── 4. Détection du mauvais pattern (catégorie utilisée comme clé) ───────────
(0, node_test_1.default)("extractSimpleTool retourne null pour le mauvais pattern {images:generate_image}", () => {
    // Le LLM peut se tromper et envoyer la catégorie comme clé
    const bad = `{"images":"generate_image"}`;
    const result = (0, toolParsing_1.extractSimpleTool)(bad);
    // Ce mauvais format ne doit PAS produire un outil generate_image valide
    strict_1.default.ok(result === null || result["generate_image"] === undefined, "le mauvais pattern {images:generate_image} ne doit pas être interprété comme generate_image");
});
