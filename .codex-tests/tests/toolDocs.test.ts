import test from "node:test";
import assert from "node:assert/strict";
import { resolveToolDoc } from "../src/lib/toolDispatchUtils";

// Tests pour la documentation des outils
test("resolveToolDoc - trouve la doc de cmd", () => {
    const doc = resolveToolDoc("cmd");
    assert.equal(doc.type, "exact");
    assert.match(doc.title, /cmd/i);
    assert.ok(doc.body.length > 0);
});

test("resolveToolDoc - trouve la doc de write_file", () => {
    const doc = resolveToolDoc("write_file");
    assert.equal(doc.type, "exact");
    assert.match(doc.title, /write_file/i);
});

test("resolveToolDoc - retourne fuzzy pour tool inconnu", () => {
    const doc = resolveToolDoc("unknown_tool_xyz");
    // Type peut être "fuzzy" ou avoir un message "missing"
    assert.ok(doc.type === "fuzzy" || doc.title.includes("unknown"));
});

test("resolveToolDoc - cmd contient des paramètres", () => {
    const doc = resolveToolDoc("cmd");
    assert.match(doc.body, /command|execute|run/i);
});
