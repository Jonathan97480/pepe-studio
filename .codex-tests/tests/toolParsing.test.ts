import test from "node:test";
import assert from "node:assert/strict";
import { extractSimpleTool, normalizeToolTags } from "../src/lib/toolParsing";
import { isActionTool, describeTool } from "../src/lib/toolDispatchUtils";

// Tests pour le parsing des commandes IA
test("extractSimpleTool - parse JSON tool calls", () => {
    const raw = `{"cmd":"ls -la"}`;
    const result = extractSimpleTool(raw);
    assert.ok(result !== null, "doit retourner un objet");
    assert.equal(result["cmd"], "ls -la");
});

test("extractSimpleTool - parse legacy syntax", () => {
    const raw = `cmd:echo hello`;
    const result = extractSimpleTool(raw);
    assert.ok(result !== null);
    assert.equal(result["cmd"], "echo hello");
});

test("extractSimpleTool - retourne null pour JSON invalide", () => {
    const raw = `invalid json { broken`;
    const result = extractSimpleTool(raw);
    assert.equal(result, null);
});

test("normalizeToolTags - préserve tags valides", () => {
    const input = `<tool>{"cmd":"echo test"}</tool>`;
    const output = normalizeToolTags(input);
    assert.ok(output.includes('"cmd"'));
    assert.ok(output.includes("<tool>"));
});

test("normalizeToolTags - gère syntaxe legacy", () => {
    const input = `cmd:echo test`;
    const output = normalizeToolTags(input);
    assert.ok(output.includes('"cmd"'));
});

test("isActionTool - reconnaît les action tools", () => {
    assert.equal(isActionTool({ cmd: "ls" }), true);
    assert.equal(isActionTool({ write_file: "path/file" }), true);
});

test("isActionTool - rejette les queries", () => {
    assert.equal(isActionTool({ get_tool_doc: "cmd" }), false);
});

test("describeTool - retourne une description", () => {
    const desc = describeTool({ cmd: "echo hello" });
    assert.ok(typeof desc === "string");
    assert.ok(desc.length > 0);
});
