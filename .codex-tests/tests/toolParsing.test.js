"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolParsing_1 = require("../src/lib/toolParsing");
(0, node_test_1.default)("normalizeToolTags converts xml-style commands to tool json", () => {
    const normalized = (0, toolParsing_1.normalizeToolTags)('<cmd command="Get-Date" />');
    strict_1.default.equal(normalized, '<tool>{"cmd": "Get-Date"}</tool>');
});
(0, node_test_1.default)("sanitizeLlmJson escapes raw newlines inside string values", () => {
    const sanitized = (0, toolParsing_1.sanitizeLlmJson)('{"cmd":"Write-Host "hello"\nnext"}');
    strict_1.default.ok(sanitized.includes("\\n"));
});
(0, node_test_1.default)("extractWriteFileTool recovers content when JSON is not parseable", () => {
    const raw = '{"write_file":"E:/demo/index.html","content":"<div class=\\"hero\\">Hello</div>"}';
    const extracted = (0, toolParsing_1.extractWriteFileTool)(raw);
    strict_1.default.deepEqual(extracted, {
        write_file: "E:/demo/index.html",
        content: '<div class="hero">Hello</div>',
    });
});
(0, node_test_1.default)("parseMessageSegments keeps text and tool blocks ordered", () => {
    const segments = (0, toolParsing_1.parseMessageSegments)('Intro <tool>{"cmd":"Get-Date"}</tool> outro');
    strict_1.default.deepEqual(segments.map((segment) => segment.type), ["text", "tool", "text"]);
});
(0, node_test_1.default)("extractPatchFileTags parses SEARCH and REPLACE blocks", () => {
    const tags = (0, toolParsing_1.extractPatchFileTags)('<patch_file path="E:/demo/app.ts">SEARCH:\nconst a = 1;\nREPLACE:\nconst a = 2;\n</patch_file>');
    strict_1.default.deepEqual(tags, [
        {
            path: "E:/demo/app.ts",
            body: "SEARCH:\nconst a = 1;\nREPLACE:\nconst a = 2;\n",
            search: "const a = 1;",
            replace: "const a = 2;",
        },
    ]);
});
(0, node_test_1.default)("extractWriteFileTags parses direct write_file tags", () => {
    const tags = (0, toolParsing_1.extractWriteFileTags)('<write_file path="E:/demo/index.html"><h1>Hello</h1></write_file>');
    strict_1.default.deepEqual(tags, [{ path: "E:/demo/index.html", content: "<h1>Hello</h1>" }]);
});
