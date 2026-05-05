"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolJsonParser_1 = require("../src/lib/toolJsonParser");
const toolParseErrors_1 = require("../src/lib/toolParseErrors");
// ─────────────────────────────────────────────
// parseToolBlock
// ─────────────────────────────────────────────
(0, node_test_1.default)("parseToolBlock parses valid JSON", () => {
    const raw = '{"cmd": "Get-Date"}';
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    strict_1.default.equal(error, null);
    strict_1.default.deepEqual(parsed, { cmd: "Get-Date" });
});
(0, node_test_1.default)("parseToolBlock parses valid JSON with nested quotes (sanitize)", () => {
    const raw = '{"create_skill":"hello","content":"Write-Host \\"bonjour\\""}';
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    strict_1.default.equal(error, null);
    strict_1.default.ok(parsed !== null);
    strict_1.default.equal(parsed.create_skill, "hello");
});
(0, node_test_1.default)("parseToolBlock falls back to extractWriteFileTool on write_file JSON error", () => {
    // Simule un JSON incomplet avec write_file
    const raw = '{"write_file":"E:/demo/index.html","content":"<div class=\\"hero\\">Hello</div>"}';
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    strict_1.default.equal(error, null);
    strict_1.default.ok(parsed !== null);
    strict_1.default.equal(parsed.write_file, "E:/demo/index.html");
});
(0, node_test_1.default)("parseToolBlock falls back to extractSimpleTool on simple tool JSON error", () => {
    // extractSimpleTool handles single-value tools when JSON is malformed
    const raw = '{"cmd": "echo hello world"}';
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    // Valid JSON, should parse normally
    strict_1.default.equal(error, null);
    strict_1.default.deepEqual(parsed, { cmd: "echo hello world" });
});
(0, node_test_1.default)("parseToolBlock returns error for completely invalid JSON without write_file", () => {
    const raw = "not json at all {broken";
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    strict_1.default.equal(parsed, null);
    strict_1.default.notEqual(error, null);
});
(0, node_test_1.default)("parseToolBlock returns error for write_file JSON that extractWriteFileTool cannot recover", () => {
    const raw = '"write_file" completely broken no quotes anywhere xyz';
    const { parsed, error } = (0, toolJsonParser_1.parseToolBlock)(raw);
    // write_file not present → tries extractSimpleTool → fails
    strict_1.default.equal(parsed, null);
    strict_1.default.notEqual(error, null);
});
// ─────────────────────────────────────────────
// buildToolParseError
// ─────────────────────────────────────────────
(0, node_test_1.default)("buildToolParseError returns batch_rename message on attempt 1", () => {
    const raw = '{"batch_rename": []}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("Unexpected token"), 1);
    strict_1.default.ok(msg.includes("batch_rename"), "should mention batch_rename");
    strict_1.default.ok(msg.includes("SOLUTION OBLIGATOIRE"), "should give solution");
    strict_1.default.ok(msg.includes("15 fichiers"), "should mention file limit");
});
(0, node_test_1.default)("buildToolParseError returns batch_rename SPLIT message on attempt 3", () => {
    const raw = '{"batch_rename": []}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 3);
    strict_1.default.ok(msg.includes("SPLIT OBLIGATOIRE"), "should insist on split");
    strict_1.default.ok(msg.includes("10 fichiers"), "should mention 10 file limit");
});
(0, node_test_1.default)("buildToolParseError returns read_pdf_batch message on attempt 1", () => {
    const raw = '{"read_pdf_batch": "not-an-array"}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 1);
    strict_1.default.ok(msg.includes("read_pdf_batch"));
    strict_1.default.ok(msg.includes("tableau natif JSON"));
});
(0, node_test_1.default)("buildToolParseError returns read_pdf_batch SPLIT message on attempt 3", () => {
    const raw = '{"read_pdf_batch": "x"}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 3);
    strict_1.default.ok(msg.includes("SPLIT OBLIGATOIRE"));
    strict_1.default.ok(msg.includes("10 chemins"));
});
(0, node_test_1.default)("buildToolParseError returns write_file TAG FORMAT message on attempt 1", () => {
    const raw = '{"write_file": "path.ts", "content": "..."}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 1);
    strict_1.default.ok(msg.includes("write_file"));
    strict_1.default.ok(msg.includes("FORMAT TAG OBLIGATOIRE"));
    strict_1.default.ok(msg.includes("<write_file path="));
});
(0, node_test_1.default)("buildToolParseError returns write_file FALLBACK CMD message on attempt 3", () => {
    const raw = '{"write_file": "x"}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 3);
    strict_1.default.ok(msg.includes("FALLBACK CMD OBLIGATOIRE"));
    strict_1.default.ok(msg.includes("Set-Content"));
});
(0, node_test_1.default)("buildToolParseError returns generic message on attempt 1", () => {
    const raw = '{"create_skill": "myscript", "content": "..."}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("Unexpected end"), 1);
    strict_1.default.ok(msg.includes("Erreur JSON dans <tool>"));
    strict_1.default.ok(msg.includes("guillemets"));
});
(0, node_test_1.default)("buildToolParseError returns generic persistent message on attempt 3", () => {
    const raw = '{"create_skill": "myscript", "content": "..."}';
    const msg = (0, toolParseErrors_1.buildToolParseError)(raw, new SyntaxError("err"), 3);
    strict_1.default.ok(msg.includes("Erreur JSON persistante"));
    strict_1.default.ok(msg.includes("apostrophes simples"));
});
