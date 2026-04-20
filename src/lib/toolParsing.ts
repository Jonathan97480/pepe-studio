export type MessageSegment =
    | { type: "text"; content: string }
    | { type: "tool"; rawJson: string }
    | { type: "patch_file"; path: string; body: string }
    | { type: "write_file_tag"; path: string; content: string };

/**
 * Normalise les variantes de tool call tags vers <tool>...</tool>
 * — Gemma 4 : <|tool_call>tool>, etc.
 * — XML-style : <read_file path="..." />, <cmd command="..." />, etc.
 */
export const normalizeToolTags = (text: string): string => {
    let t = text
        .replace(/<\|tool_call\|?>(?:\w*>)?/gi, "<tool>")
        .replace(/<\|?\/?tool_call\|?>/gi, "</tool>")
        .replace(/<tool>\s*tool>/gi, "<tool>");

    // Le modèle mélange parfois JSON et TAG.
    t = t.replace(
        /\{"write_file":\s*"([^"]+)"\s*\}?"?\s*>([\s\S]*?)<\/write_file>/g,
        (_, p, c) => `<write_file path="${p}">${c}</write_file>`,
    );
    t = t.replace(
        /\{"write_file":\s*"([^"]+)"\s*\}?"?\s*>([\s\S]*?)(?=<tool>|\{"write_file"|<\/write_file>|$)/g,
        (_, p, c) => {
            const trimmed = c.trim();
            if (!trimmed) return _;
            return `<write_file path="${p}">${trimmed}</write_file>`;
        },
    );

    t = t.replace(
        /<read_file\s+path="([^"]*)"(?:\s*\/?>\s*(?:<\/read_file>)?)/gi,
        (_, p) => `<tool>{"read_file": ${JSON.stringify(p)}}</tool>`,
    );
    t = t.replace(
        /<write_file\s+path="([^"]*)"(?:[^>]*?)content="([\s\S]*?)"(?:\s*\/?>\s*(?:<\/write_file>)?)/gi,
        (_, p, c) => `<tool>{"write_file": ${JSON.stringify(p)}, "content": ${JSON.stringify(c)}}</tool>`,
    );
    t = t.replace(
        /<cmd\s+command="([^"]*)"(?:\s*\/?>\s*(?:<\/cmd>)?)/gi,
        (_, c) => `<tool>{"cmd": ${JSON.stringify(c)}}</tool>`,
    );
    t = t.replace(/<cmd>([\s\S]*?)<\/cmd>/gi, (_, c) => `<tool>{"cmd": ${JSON.stringify(c.trim())}}</tool>`);
    t = t.replace(
        /<search_web\s+query="([^"]*)"(?:\s*\/?>\s*(?:<\/search_web>)?)/gi,
        (_, q) => `<tool>{"search_web": ${JSON.stringify(q)}}</tool>`,
    );
    t = t.replace(
        /<scrape_url\s+url="([^"]*)"(?:\s*\/?>\s*(?:<\/scrape_url>)?)/gi,
        (_, u) => `<tool>{"scrape_url": ${JSON.stringify(u)}}</tool>`,
    );
    t = t.replace(
        /<open_browser\s+url="([^"]*)"(?:\s*\/?>\s*(?:<\/open_browser>)?)/gi,
        (_, u) => `<tool>{"open_browser": ${JSON.stringify(u)}}</tool>`,
    );

    t = t.replace(/<get_browser_errors[^>]*\/?>/gi, '<tool>{"get_browser_errors": true}</tool>');
    t = t.replace(/<stop_dev_server[^>]*\/?>/gi, '<tool>{"stop_dev_server": true}</tool>');
    t = t.replace(/<get_dev_server_info[^>]*\/?>/gi, '<tool>{"get_dev_server_info": true}</tool>');

    return t;
};

/**
 * Sanitise le JSON généré par le LLM avant JSON.parse.
 * Corrige les vrais sauts de ligne / tabs / CR à l'intérieur des chaînes JSON.
 */
export const sanitizeLlmJson = (raw: string): string => {
    let result = "";
    let inString = false;
    let prevBackslash = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (prevBackslash) {
            result += c;
            prevBackslash = false;
        } else if (c === "\\" && inString) {
            result += c;
            prevBackslash = true;
        } else if (c === '"') {
            result += c;
            inString = !inString;
        } else if (inString && c === "\n") {
            result += "\\n";
        } else if (inString && c === "\r") {
            // skip bare \r
        } else if (inString && c === "\t") {
            result += "\\t";
        } else {
            result += c;
        }
    }
    return result;
};

/**
 * Extracteur de secours pour write_file sans JSON.parse.
 */
export const extractWriteFileTool = (raw: string): { write_file: string; content: string } | null => {
    const pathMatch = raw.match(/"write_file"\s*:\s*"([^"]+)"/);
    if (!pathMatch) return null;

    const contentKeyIdx = raw.indexOf('"content"');
    if (contentKeyIdx === -1) return null;
    const colonIdx = raw.indexOf(":", contentKeyIdx + 9);
    if (colonIdx === -1) return null;
    const openQuoteIdx = raw.indexOf('"', colonIdx + 1);
    if (openQuoteIdx === -1) return null;

    const lastCloseIdx = raw.lastIndexOf('"}');
    if (lastCloseIdx <= openQuoteIdx) return null;

    const rawContent = raw.substring(openQuoteIdx + 1, lastCloseIdx);
    const content = rawContent
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

    return { write_file: pathMatch[1], content };
};

export const parseMessageSegments = (normalized: string): MessageSegment[] => {
    type FoundBlock = { start: number; end: number; seg: MessageSegment };
    const blocks: FoundBlock[] = [];

    for (const m of normalized.matchAll(/<patch_file\s+path="([^"]+)">([\s\S]*?)<\/patch_file>/g)) {
        const hasReplace = /REPLACE:/i.test(m[2]);
        if (!hasReplace) continue;
        blocks.push({
            start: m.index!,
            end: m.index! + m[0].length,
            seg: { type: "patch_file", path: m[1], body: m[2] },
        });
    }
    for (const m of normalized.matchAll(/<write_file\s+path="([^"]+)">([\/\s\S]*?)<\/write_file>/g)) {
        blocks.push({
            start: m.index!,
            end: m.index! + m[0].length,
            seg: { type: "write_file_tag", path: m[1], content: m[2] },
        });
    }
    for (const m of normalized.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)) {
        blocks.push({ start: m.index!, end: m.index! + m[0].length, seg: { type: "tool", rawJson: m[1] } });
    }

    if (blocks.length === 0) return [{ type: "text", content: normalized }];

    blocks.sort((a, b) => a.start - b.start);

    const segments: MessageSegment[] = [];
    let cursor = 0;
    for (const block of blocks) {
        if (block.start > cursor) {
            const text = normalized.slice(cursor, block.start).trim();
            if (text) segments.push({ type: "text", content: text });
        }
        segments.push(block.seg);
        cursor = block.end;
    }
    if (cursor < normalized.length) {
        const text = normalized.slice(cursor).trim();
        if (text) segments.push({ type: "text", content: text });
    }
    return segments;
};
