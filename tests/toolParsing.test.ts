import test from "node:test";
import assert from "node:assert/strict";
import { extractWriteFileTool, normalizeToolTags, parseMessageSegments, sanitizeLlmJson } from "../src/lib/toolParsing";

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
