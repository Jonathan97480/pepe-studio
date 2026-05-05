import test from "node:test";
import assert from "node:assert/strict";
import {
    extractPatchFileTags,
    extractWriteFileTags,
    extractWriteFileTool,
    normalizeToolTags,
    parseMessageSegments,
    sanitizeLlmJson,
} from "../src/lib/toolParsing";

test("normalizeToolTags converts xml-style commands to tool json", () => {
    const normalized = normalizeToolTags('<cmd command="Get-Date" />');
    assert.equal(normalized, '<tool>{"cmd": "Get-Date"}</tool>');
});

test("normalizeToolTags converts additional xml-style tool tags", () => {
    assert.equal(
        normalizeToolTags('<generate_image prompt="sunset over mountains"/>'),
        '<tool>{"generate_image": "sunset over mountains"}</tool>',
    );
    assert.equal(
        normalizeToolTags('<analyze_folder path="E:/docs"/>'),
        '<tool>{"analyze_folder": "E:/docs"}</tool>',
    );
    assert.equal(normalizeToolTags('<read_image path="E:/img/a.png"/>'), '<tool>{"read_image": "E:/img/a.png"}</tool>');
    assert.equal(normalizeToolTags('<read_pdf path="E:/pdf/a.pdf"/>'), '<tool>{"read_pdf": "E:/pdf/a.pdf"}</tool>');
    assert.equal(
        normalizeToolTags('<read_pdf_brief path="E:/pdf/b.pdf"/>'),
        '<tool>{"read_pdf_brief": "E:/pdf/b.pdf"}</tool>',
    );
    assert.equal(
        normalizeToolTags('<list_folder_files path="E:/docs"/>'),
        '<tool>{"list_folder_files": "E:/docs"}</tool>',
    );
    assert.equal(
        normalizeToolTags('<list_folder_images path="E:/img"/>'),
        '<tool>{"list_folder_images": "E:/img"}</tool>',
    );
    assert.equal(
        normalizeToolTags('<list_folder_pdfs path="E:/pdf"/>'),
        '<tool>{"list_folder_pdfs": "E:/pdf"}</tool>',
    );
    assert.equal(normalizeToolTags('<get_tool_doc tool="write_file"/>'), '<tool>{"get_tool_doc": "write_file"}</tool>');
    assert.equal(normalizeToolTags('<get_hardware_info/>'), '<tool>{"get_hardware_info": true}</tool>');
    assert.equal(normalizeToolTags('<list_sd_models/>'), '<tool>{"list_sd_models": true}</tool>');
});

test("sanitizeLlmJson escapes raw newlines inside string values", () => {
    const sanitized = sanitizeLlmJson('{"cmd":"Write-Host "hello"\nnext"}');
    assert.ok(sanitized.includes("\\n"));
});

test("extractWriteFileTool recovers content when JSON is not parseable", () => {
    const raw = '{"write_file":"E:/demo/index.html","content":"<div class=\\"hero\\">Hello</div>"}';
    const extracted = extractWriteFileTool(raw);
    assert.deepEqual(extracted, {
        write_file: "E:/demo/index.html",
        content: '<div class="hero">Hello</div>',
    });
});

test("parseMessageSegments keeps text and tool blocks ordered", () => {
    const segments = parseMessageSegments('Intro <tool>{"cmd":"Get-Date"}</tool> outro');
    assert.deepEqual(
        segments.map((segment) => segment.type),
        ["text", "tool", "text"],
    );
});

test("extractPatchFileTags parses SEARCH and REPLACE blocks", () => {
    const tags = extractPatchFileTags(
        '<patch_file path="E:/demo/app.ts">SEARCH:\nconst a = 1;\nREPLACE:\nconst a = 2;\n</patch_file>',
    );
    assert.deepEqual(tags, [
        {
            path: "E:/demo/app.ts",
            body: "SEARCH:\nconst a = 1;\nREPLACE:\nconst a = 2;\n",
            search: "const a = 1;",
            replace: "const a = 2;",
        },
    ]);
});

test("extractWriteFileTags parses direct write_file tags", () => {
    const tags = extractWriteFileTags('<write_file path="E:/demo/index.html"><h1>Hello</h1></write_file>');
    assert.deepEqual(tags, [{ path: "E:/demo/index.html", content: "<h1>Hello</h1>" }]);
});
