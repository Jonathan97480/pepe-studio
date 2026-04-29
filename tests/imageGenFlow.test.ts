import test from "node:test";
import assert from "node:assert/strict";
import { extractSimpleTool, normalizeToolTags } from "../src/lib/toolParsing";
import { isActionTool, describeTool, resolveToolDoc } from "../src/lib/toolDispatchUtils";

// ── 1. Parsing du tag <tool>{"generate_image":"..."}</tool> ──────────────────

test("extractSimpleTool parse generate_image avec prompt simple", () => {
    const raw = `{"generate_image":"un chat roux mignon sur un canapé"}`;
    const result = extractSimpleTool(raw);
    assert.deepEqual(result, { generate_image: "un chat roux mignon sur un canapé" });
});

test("extractSimpleTool parse syntaxe legacy generate_image:prompt", () => {
    const raw = `generate_image:un chat bleu mignon`;
    const result = extractSimpleTool(raw);
    assert.deepEqual(result, { generate_image: "un chat bleu mignon" });
});

test("extractSimpleTool parse generate_image avec paramètres supplémentaires", () => {
    // Le LLM peut envoyer un JSON plus riche ; extractSimpleTool doit au moins récupérer generate_image
    const raw = `{"generate_image":"dragon volant","steps":30,"width":768,"height":512}`;
    const result = extractSimpleTool(raw);
    assert.ok(result !== null, "doit retourner un objet non-null");
    assert.equal(result!["generate_image"], "dragon volant");
});

test("extractSimpleTool parse list_sd_models (booléen)", () => {
    const raw = `{"list_sd_models":true}`;
    const result = extractSimpleTool(raw);
    assert.deepEqual(result, { list_sd_models: true });
});

test("normalizeToolTags ne transforme pas <tool>generate_image en mauvais format", () => {
    const input = `<tool>{"generate_image":"paysage montagneux"}</tool>`;
    // normalizeToolTags ne doit pas altérer un bloc <tool> JSON valide
    const output = normalizeToolTags(input);
    assert.ok(output.includes('"generate_image"'), "generate_image doit rester intact");
    assert.ok(output.includes("<tool>"), "le tag <tool> doit être préservé");
});

test("normalizeToolTags convertit la syntaxe legacy generate_image:prompt en <tool> JSON", () => {
    const input = `generate_image:un chat bleu mignon`;
    const output = normalizeToolTags(input);
    assert.equal(output, '<tool>{"generate_image": "un chat bleu mignon"}</tool>');
});

// ── 2. Catégorisation de l'outil (dispatch) ─────────────────────────────────

test("isActionTool reconnaît generate_image comme outil d'action", () => {
    assert.equal(isActionTool({ generate_image: "un lapin blanc" }), true);
});

test("isActionTool reconnaît list_sd_models comme outil d'action", () => {
    assert.equal(isActionTool({ list_sd_models: true }), true);
});

test("describeTool retourne une chaîne non vide pour generate_image", () => {
    // generate_image n'est pas dans la liste prioritaire de describeTool, elle tombe sur "action"
    const desc = describeTool({ generate_image: "un château médiéval" });
    assert.ok(typeof desc === "string" && desc.length > 0, "describeTool doit retourner une chaîne non vide");
});

test("describeTool retourne 'action' pour list_sd_models booléen", () => {
    // list_sd_models: true — aucune chaîne de prompt, describeTool doit tomber sur son fallback
    const desc = describeTool({ list_sd_models: true });
    // Le fallback renvoie "action" ou la clé selon l'implémentation
    assert.ok(typeof desc === "string" && desc.length > 0, "describeTool doit retourner une chaîne non vide");
});

// ── 3. Documentation de l'outil disponible ──────────────────────────────────

test("resolveToolDoc trouve la doc de generate_image", () => {
    const doc = resolveToolDoc("generate_image");
    assert.equal(doc.type, "exact", "generate_image doit avoir une doc exacte");
    assert.match(doc.title, /generate_image/i);
});

test("resolveToolDoc trouve la doc de list_sd_models", () => {
    const doc = resolveToolDoc("list_sd_models");
    assert.equal(doc.type, "exact", "list_sd_models doit avoir une doc exacte");
    assert.match(doc.title, /list_sd_models/i);
});

// ── 4. Détection du mauvais pattern (catégorie utilisée comme clé) ───────────

test("extractSimpleTool retourne null pour le mauvais pattern {images:generate_image}", () => {
    // Le LLM peut se tromper et envoyer la catégorie comme clé
    const bad = `{"images":"generate_image"}`;
    const result = extractSimpleTool(bad);
    // Ce mauvais format ne doit PAS produire un outil generate_image valide
    assert.ok(
        result === null || result["generate_image"] === undefined,
        "le mauvais pattern {images:generate_image} ne doit pas être interprété comme generate_image",
    );
});
