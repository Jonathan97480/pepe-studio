import test from "node:test";
import assert from "node:assert/strict";
import { parseToolBlock } from "../src/lib/toolJsonParser";
import { buildToolParseError } from "../src/lib/toolParseErrors";

// ─────────────────────────────────────────────
// parseToolBlock
// ─────────────────────────────────────────────

test("parseToolBlock parses valid JSON", () => {
    const raw = '{"cmd": "Get-Date"}';
    const { parsed, error } = parseToolBlock(raw);
    assert.equal(error, null);
    assert.deepEqual(parsed, { cmd: "Get-Date" });
});

test("parseToolBlock parses valid JSON with nested quotes (sanitize)", () => {
    const raw = '{"create_skill":"hello","content":"Write-Host \\"bonjour\\""}';
    const { parsed, error } = parseToolBlock(raw);
    assert.equal(error, null);
    assert.ok(parsed !== null);
    assert.equal(parsed.create_skill, "hello");
});

test("parseToolBlock falls back to extractWriteFileTool on write_file JSON error", () => {
    // Simule un JSON incomplet avec write_file
    const raw = '{"write_file":"E:/demo/index.html","content":"<div class=\\"hero\\">Hello</div>"}';
    const { parsed, error } = parseToolBlock(raw);
    assert.equal(error, null);
    assert.ok(parsed !== null);
    assert.equal(parsed.write_file, "E:/demo/index.html");
});

test("parseToolBlock falls back to extractSimpleTool on simple tool JSON error", () => {
    // extractSimpleTool handles single-value tools when JSON is malformed
    const raw = '{"cmd": "echo hello world"}';
    const { parsed, error } = parseToolBlock(raw);
    // Valid JSON, should parse normally
    assert.equal(error, null);
    assert.deepEqual(parsed, { cmd: "echo hello world" });
});

test("parseToolBlock returns error for completely invalid JSON without write_file", () => {
    const raw = "not json at all {broken";
    const { parsed, error } = parseToolBlock(raw);
    assert.equal(parsed, null);
    assert.notEqual(error, null);
});

test("parseToolBlock returns error for write_file JSON that extractWriteFileTool cannot recover", () => {
    const raw = '"write_file" completely broken no quotes anywhere xyz';
    const { parsed, error } = parseToolBlock(raw);
    // write_file not present → tries extractSimpleTool → fails
    assert.equal(parsed, null);
    assert.notEqual(error, null);
});

// ─────────────────────────────────────────────
// buildToolParseError
// ─────────────────────────────────────────────

test("buildToolParseError returns batch_rename message on attempt 1", () => {
    const raw = '{"batch_rename": []}';
    const msg = buildToolParseError(raw, new SyntaxError("Unexpected token"), 1);
    assert.ok(msg.includes("batch_rename"), "should mention batch_rename");
    assert.ok(msg.includes("SOLUTION OBLIGATOIRE"), "should give solution");
    assert.ok(msg.includes("15 fichiers"), "should mention file limit");
});

test("buildToolParseError returns batch_rename SPLIT message on attempt 3", () => {
    const raw = '{"batch_rename": []}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 3);
    assert.ok(msg.includes("SPLIT OBLIGATOIRE"), "should insist on split");
    assert.ok(msg.includes("10 fichiers"), "should mention 10 file limit");
});

test("buildToolParseError returns read_pdf_batch message on attempt 1", () => {
    const raw = '{"read_pdf_batch": "not-an-array"}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 1);
    assert.ok(msg.includes("read_pdf_batch"));
    assert.ok(msg.includes("tableau natif JSON"));
});

test("buildToolParseError returns read_pdf_batch SPLIT message on attempt 3", () => {
    const raw = '{"read_pdf_batch": "x"}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 3);
    assert.ok(msg.includes("SPLIT OBLIGATOIRE"));
    assert.ok(msg.includes("10 chemins"));
});

test("buildToolParseError returns write_file TAG FORMAT message on attempt 1", () => {
    const raw = '{"write_file": "path.ts", "content": "..."}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 1);
    assert.ok(msg.includes("write_file"));
    assert.ok(msg.includes("FORMAT TAG OBLIGATOIRE"));
    assert.ok(msg.includes("<write_file path="));
});

test("buildToolParseError returns write_file FALLBACK CMD message on attempt 3", () => {
    const raw = '{"write_file": "x"}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 3);
    assert.ok(msg.includes("FALLBACK CMD OBLIGATOIRE"));
    assert.ok(msg.includes("Set-Content"));
});

test("buildToolParseError returns generic message on attempt 1", () => {
    const raw = '{"create_skill": "myscript", "content": "..."}';
    const msg = buildToolParseError(raw, new SyntaxError("Unexpected end"), 1);
    assert.ok(msg.includes("Erreur JSON dans <tool>"));
    assert.ok(msg.includes("guillemets"));
});

test("buildToolParseError returns generic persistent message on attempt 3", () => {
    const raw = '{"create_skill": "myscript", "content": "..."}';
    const msg = buildToolParseError(raw, new SyntaxError("err"), 3);
    assert.ok(msg.includes("Erreur JSON persistante"));
    assert.ok(msg.includes("apostrophes simples"));
});
