"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePatchBlocks = parsePatchBlocks;
exports.hasPatchBlocks = hasPatchBlocks;
function parsePatchBlocks(text) {
    const blocks = [];
    const segments = text.split(/(?=^FILE:\s*\S)/im);
    for (const segment of segments) {
        const fileMatch = segment.match(/^FILE:\s*(.+)$/im);
        if (!fileMatch)
            continue;
        const file = fileMatch[1].trim();
        const searchMatch = segment.match(/^SEARCH:\s*\n([\s\S]*?)(?=^REPLACE:\s*$)/im);
        const replaceMatch = segment.match(/^REPLACE:\s*\n([\s\S]*?)(?=^FILE:|\s*$)/im);
        if (!searchMatch || !replaceMatch)
            continue;
        const search = searchMatch[1].replace(/\r\n/g, "\n").trimEnd();
        const replace = replaceMatch[1].replace(/\r\n/g, "\n").trimEnd();
        if (search.length === 0)
            continue;
        blocks.push({ file, search, replace });
    }
    return blocks;
}
function hasPatchBlocks(text) {
    return /^FILE:\s*\S/im.test(text) && /^SEARCH:\s*$/im.test(text) && /^REPLACE:\s*$/im.test(text);
}
