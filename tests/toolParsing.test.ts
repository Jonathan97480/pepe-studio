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
