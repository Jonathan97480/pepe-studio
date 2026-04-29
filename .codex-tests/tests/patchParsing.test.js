"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const patchParsing_1 = require("../src/lib/patchParsing");
(0, node_test_1.default)("parsePatchBlocks extracts multiple FILE/SEARCH/REPLACE blocks", () => {
    const blocks = (0, patchParsing_1.parsePatchBlocks)(`FILE: demo
SEARCH:
old text
REPLACE:
new text

FILE: second
SEARCH:
alpha
REPLACE:
beta`);
    strict_1.default.equal(blocks.length, 2);
    strict_1.default.deepEqual(blocks[0], {
        file: "demo",
        search: "old text",
        replace: "new text",
    });
});
(0, node_test_1.default)("hasPatchBlocks returns false for incomplete blocks", () => {
    strict_1.default.equal((0, patchParsing_1.hasPatchBlocks)("FILE: demo\nSEARCH:\nmissing replace"), false);
});
(0, node_test_1.default)("hasPatchBlocks returns true for valid block markers", () => {
    strict_1.default.equal((0, patchParsing_1.hasPatchBlocks)("FILE: demo\nSEARCH:\nold\nREPLACE:\nnew"), true);
});
