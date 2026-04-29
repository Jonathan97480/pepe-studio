"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolCoreHandlers_1 = require("../src/lib/toolCoreHandlers");
const toolDispatchUtils_1 = require("../src/lib/toolDispatchUtils");
(0, node_test_1.default)("isActionTool detects actionable tool payloads", () => {
    strict_1.default.equal((0, toolDispatchUtils_1.isActionTool)({ read_file: "E:/demo.txt" }), false);
    strict_1.default.equal((0, toolDispatchUtils_1.isActionTool)({ cmd: "Get-Date" }), true);
    strict_1.default.equal((0, toolDispatchUtils_1.isActionTool)({ start_dev_server: "E:/demo" }), true);
});
(0, node_test_1.default)("describeTool prioritizes command-like keys", () => {
    strict_1.default.equal((0, toolDispatchUtils_1.describeTool)({ write_file: "E:/a.txt", cmd: "Get-Date" }), "Get-Date");
    strict_1.default.equal((0, toolDispatchUtils_1.describeTool)({ create_skill: "demo-skill" }), "demo-skill");
    strict_1.default.equal((0, toolDispatchUtils_1.describeTool)({ unknown: true }), "action");
});
(0, node_test_1.default)("resolveToolDoc returns exact and missing matches", () => {
    const exact = (0, toolDispatchUtils_1.resolveToolDoc)("cmd");
    strict_1.default.equal(exact.type, "exact");
    strict_1.default.match(exact.title, /\[Documentation : cmd\]/);
    const missing = (0, toolDispatchUtils_1.resolveToolDoc)("tool-inexistant");
    strict_1.default.equal(missing.type, "missing");
    strict_1.default.match(missing.body, /cmd/);
});
(0, node_test_1.default)("collectRemainingWriteFiles keeps only valid trailing write_file tools", () => {
    const content = '<tool>{"cmd":"Get-Date"}</tool>' +
        '<tool>{"write_file":"E:/demo/a.txt","content":"A"}</tool>' +
        '<tool>{"read_file":"E:/demo/a.txt"}</tool>' +
        '<tool>{"write_file":"E:/demo/b.txt","content":"B"}</tool>';
    const matches = [...content.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)];
    const files = (0, toolCoreHandlers_1.collectRemainingWriteFiles)(matches);
    strict_1.default.deepEqual(files, [
        { write_file: "E:/demo/a.txt", content: "A" },
        { write_file: "E:/demo/b.txt", content: "B" },
    ]);
});
