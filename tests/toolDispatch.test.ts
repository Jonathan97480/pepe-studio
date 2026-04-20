import test from "node:test";
import assert from "node:assert/strict";
import { collectRemainingWriteFiles } from "../src/lib/toolCoreHandlers";
import { describeTool, isActionTool, resolveToolDoc } from "../src/lib/toolDispatchUtils";

test("isActionTool detects actionable tool payloads", () => {
    assert.equal(isActionTool({ read_file: "E:/demo.txt" }), false);
    assert.equal(isActionTool({ cmd: "Get-Date" }), true);
    assert.equal(isActionTool({ start_dev_server: "E:/demo" }), true);
});

test("describeTool prioritizes command-like keys", () => {
    assert.equal(describeTool({ write_file: "E:/a.txt", cmd: "Get-Date" }), "Get-Date");
    assert.equal(describeTool({ create_skill: "demo-skill" }), "demo-skill");
    assert.equal(describeTool({ unknown: true }), "action");
});

test("resolveToolDoc returns exact and missing matches", () => {
    const exact = resolveToolDoc("cmd");
    assert.equal(exact.type, "exact");
    assert.match(exact.title, /\[Documentation : cmd\]/);

    const missing = resolveToolDoc("tool-inexistant");
    assert.equal(missing.type, "missing");
    assert.match(missing.body, /cmd/);
});

test("collectRemainingWriteFiles keeps only valid trailing write_file tools", () => {
    const content =
        '<tool>{"cmd":"Get-Date"}</tool>' +
        '<tool>{"write_file":"E:/demo/a.txt","content":"A"}</tool>' +
        '<tool>{"read_file":"E:/demo/a.txt"}</tool>' +
        '<tool>{"write_file":"E:/demo/b.txt","content":"B"}</tool>';
    const matches = [...content.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)];
    const files = collectRemainingWriteFiles(matches);

    assert.deepEqual(files, [
        { write_file: "E:/demo/a.txt", content: "A" },
        { write_file: "E:/demo/b.txt", content: "B" },
    ]);
});
