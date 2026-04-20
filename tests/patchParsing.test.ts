import test from "node:test";
import assert from "node:assert/strict";
import { hasPatchBlocks, parsePatchBlocks } from "../src/lib/patchParsing";

test("parsePatchBlocks extracts multiple FILE/SEARCH/REPLACE blocks", () => {
    const blocks = parsePatchBlocks(`FILE: demo
SEARCH:
old text
REPLACE:
new text

FILE: second
SEARCH:
alpha
REPLACE:
beta`);

    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0], {
        file: "demo",
        search: "old text",
        replace: "new text",
    });
});

test("hasPatchBlocks returns false for incomplete blocks", () => {
    assert.equal(hasPatchBlocks("FILE: demo\nSEARCH:\nmissing replace"), false);
});

test("hasPatchBlocks returns true for valid block markers", () => {
    assert.equal(hasPatchBlocks("FILE: demo\nSEARCH:\nold\nREPLACE:\nnew"), true);
});
