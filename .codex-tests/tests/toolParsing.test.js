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
(0, node_test_1.default)("normalizeToolTags converts additional xml-style tool tags", () => {
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<generate_image prompt="sunset over mountains"/>'), '<tool>{"generate_image": "sunset over mountains"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<analyze_folder path="E:/docs"/>'), '<tool>{"analyze_folder": "E:/docs"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<read_image path="E:/img/a.png"/>'), '<tool>{"read_image": "E:/img/a.png"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<read_pdf path="E:/pdf/a.pdf"/>'), '<tool>{"read_pdf": "E:/pdf/a.pdf"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<read_pdf_brief path="E:/pdf/b.pdf"/>'), '<tool>{"read_pdf_brief": "E:/pdf/b.pdf"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<list_folder_files path="E:/docs"/>'), '<tool>{"list_folder_files": "E:/docs"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<list_folder_images path="E:/img"/>'), '<tool>{"list_folder_images": "E:/img"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<list_folder_pdfs path="E:/pdf"/>'), '<tool>{"list_folder_pdfs": "E:/pdf"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<get_tool_doc tool="write_file"/>'), '<tool>{"get_tool_doc": "write_file"}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<get_hardware_info/>'), '<tool>{"get_hardware_info": true}</tool>');
    strict_1.default.equal((0, toolParsing_1.normalizeToolTags)('<list_sd_models/>'), '<tool>{"list_sd_models": true}</tool>');
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
