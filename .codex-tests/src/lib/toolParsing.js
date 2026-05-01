"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractWriteFileTags = exports.extractPatchFileTags = exports.parseMessageSegments = exports.extractSimpleTool = exports.extractWriteFileTool = exports.sanitizeLlmJson = exports.normalizeToolTags = void 0;
/**
 * Normalise les variantes de tool call tags vers <tool>...</tool>
 * — Gemma 4 : <|tool_call>tool>, etc.
 * — XML-style : <read_file path="..." />, <cmd command="..." />, etc.
 */
const normalizeToolTags = (text) => {
    let t = text
        .replace(/<\|tool_call\|?>(?:\w*>)?/gi, "<tool>")
        .replace(/<\|?\/?tool_call\|?>/gi, "</tool>")
        .replace(/<tool>\s*tool>/gi, "<tool>");
    // Compatibilité legacy : certains modèles émettent "generate_image:..." sans JSON/tag.
    // On ne convertit que si tout le message correspond à une unique commande key:value.
    const bare = t.trim();
    const bareMatch = bare.match(/^([a-z0-9_]+)\s*:\s*([\s\S]+)$/i);
    if (bareMatch && !bare.includes("<tool>")) {
        const key = bareMatch[1].toLowerCase();
        const value = bareMatch[2].trim();
        const stringKeys = new Set([
            "generate_image",
            "generate_3d_model",
            "install_trellis",
            "cmd",
            "read_file",
            "analyze_folder",
            "read_image",
            "read_pdf",
            "read_pdf_brief",
            "list_folder_files",
            "list_folder_images",
            "list_folder_pdfs",
            "start_dev_server",
            "get_tool_doc",
            "search_web",
            "scrape_url",
            "open_browser",
        ]);
        if (stringKeys.has(key)) {
            return `<tool>{"${key}": ${JSON.stringify(value)}}</tool>`;
        }
        if (key === "list_sd_models" && /^(true|1|yes|oui)$/i.test(value)) {
            return '<tool>{"list_sd_models": true}</tool>';
        }
    }
    // Le modèle mélange parfois JSON et TAG.
    t = t.replace(/\{"write_file":\s*"([^"]+)"\s*\}?"?\s*>([\s\S]*?)<\/write_file>/g, (_, p, c) => `<write_file path="${p}">${c}</write_file>`);
    t = t.replace(/\{"write_file":\s*"([^"]+)"\s*\}?"?\s*>([\s\S]*?)(?=<tool>|\{"write_file"|<\/write_file>|$)/g, (_, p, c) => {
        const trimmed = c.trim();
        if (!trimmed)
            return _;
        return `<write_file path="${p}">${trimmed}</write_file>`;
    });
    t = t.replace(/<read_file\s+path="([^"]*)"(?:\s*\/?>\s*(?:<\/read_file>)?)/gi, (_, p) => `<tool>{"read_file": ${JSON.stringify(p)}}</tool>`);
    t = t.replace(/<write_file\s+path="([^"]*)"(?:[^>]*?)content="([\s\S]*?)"(?:\s*\/?>\s*(?:<\/write_file>)?)/gi, (_, p, c) => `<tool>{"write_file": ${JSON.stringify(p)}, "content": ${JSON.stringify(c)}}</tool>`);
    t = t.replace(/<cmd\s+command="([^"]*)"(?:\s*\/?>\s*(?:<\/cmd>)?)/gi, (_, c) => `<tool>{"cmd": ${JSON.stringify(c)}}</tool>`);
    t = t.replace(/<cmd>([\s\S]*?)<\/cmd>/gi, (_, c) => `<tool>{"cmd": ${JSON.stringify(c.trim())}}</tool>`);
    t = t.replace(/<search_web\s+query="([^"]*)"(?:\s*\/?>\s*(?:<\/search_web>)?)/gi, (_, q) => `<tool>{"search_web": ${JSON.stringify(q)}}</tool>`);
    t = t.replace(/<scrape_url\s+url="([^"]*)"(?:\s*\/?>\s*(?:<\/scrape_url>)?)/gi, (_, u) => `<tool>{"scrape_url": ${JSON.stringify(u)}}</tool>`);
    t = t.replace(/<open_browser\s+url="([^"]*)"(?:\s*\/?>\s*(?:<\/open_browser>)?)/gi, (_, u) => `<tool>{"open_browser": ${JSON.stringify(u)}}</tool>`);
    t = t.replace(/<get_browser_errors[^>]*\/?>/gi, '<tool>{"get_browser_errors": true}</tool>');
    t = t.replace(/<stop_dev_server[^>]*\/?>/gi, '<tool>{"stop_dev_server": true}</tool>');
    t = t.replace(/<get_dev_server_info[^>]*\/?>/gi, '<tool>{"get_dev_server_info": true}</tool>');
    // generate_3d_model : <generate_3d image="chemin/image.png" texture_resolution="1024" />
    t = t.replace(/<generate_3d(?:\s+image="([^"]*)")?(?:\s+texture_resolution="([^"]*)")?[^>]*\/?>/gi, (_, img, res) => {
        const obj = { generate_3d_model: img ?? "" };
        if (res)
            obj.texture_resolution = Number(res);
        return `<tool>${JSON.stringify(obj)}</tool>`;
    });
    return t;
};
exports.normalizeToolTags = normalizeToolTags;
/**
 * Sanitise le JSON généré par le LLM avant JSON.parse.
 * Corrige les vrais sauts de ligne / tabs / CR à l'intérieur des chaînes JSON.
 */
const sanitizeLlmJson = (raw) => {
    let result = "";
    let inString = false;
    let prevBackslash = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (prevBackslash) {
            result += c;
            prevBackslash = false;
        }
        else if (c === "\\" && inString) {
            result += c;
            prevBackslash = true;
        }
        else if (c === '"') {
            result += c;
            inString = !inString;
        }
        else if (inString && c === "\n") {
            result += "\\n";
        }
        else if (inString && c === "\r") {
            // skip bare \r
        }
        else if (inString && c === "\t") {
            result += "\\t";
        }
        else {
            result += c;
        }
    }
    return result;
};
exports.sanitizeLlmJson = sanitizeLlmJson;
/**
 * Extracteur de secours pour write_file sans JSON.parse.
 */
const extractWriteFileTool = (raw) => {
    const pathMatch = raw.match(/"write_file"\s*:\s*"([^"]+)"/);
    if (!pathMatch)
        return null;
    const contentKeyIdx = raw.indexOf('"content"');
    if (contentKeyIdx === -1)
        return null;
    const colonIdx = raw.indexOf(":", contentKeyIdx + 9);
    if (colonIdx === -1)
        return null;
    const openQuoteIdx = raw.indexOf('"', colonIdx + 1);
    if (openQuoteIdx === -1)
        return null;
    const lastCloseIdx = raw.lastIndexOf('"}');
    if (lastCloseIdx <= openQuoteIdx)
        return null;
    const rawContent = raw.substring(openQuoteIdx + 1, lastCloseIdx);
    const content = rawContent
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    return { write_file: pathMatch[1], content };
};
exports.extractWriteFileTool = extractWriteFileTool;
const extractSimpleTool = (raw) => {
    const trimmed = raw.trim();
    const directPatterns = [
        { key: "cmd", regex: /"cmd"\s*:\s*"([\s\S]*?)"/i },
        { key: "generate_image", regex: /"generate_image"\s*:\s*"([\s\S]*?)"/i },
        { key: "generate_3d_model", regex: /"generate_3d_model"\s*:\s*"([\s\S]*?)"/i },
        { key: "read_file", regex: /"read_file"\s*:\s*"([\s\S]*?)"/i },
        { key: "analyze_folder", regex: /"analyze_folder"\s*:\s*"([\s\S]*?)"/i },
        { key: "read_image", regex: /"read_image"\s*:\s*"([\s\S]*?)"/i },
        { key: "read_pdf", regex: /"read_pdf"\s*:\s*"([\s\S]*?)"/i },
        { key: "read_pdf_brief", regex: /"read_pdf_brief"\s*:\s*"([\s\S]*?)"/i },
        { key: "list_folder_files", regex: /"list_folder_files"\s*:\s*"([\s\S]*?)"/i },
        { key: "list_folder_images", regex: /"list_folder_images"\s*:\s*"([\s\S]*?)"/i },
        { key: "list_folder_pdfs", regex: /"list_folder_pdfs"\s*:\s*"([\s\S]*?)"/i },
        { key: "start_dev_server", regex: /"start_dev_server"\s*:\s*"([\s\S]*?)"/i },
        { key: "get_tool_doc", regex: /"get_tool_doc"\s*:\s*"([\s\S]*?)"/i },
        { key: "search_web", regex: /"search_web"\s*:\s*"([\s\S]*?)"/i },
        { key: "scrape_url", regex: /"scrape_url"\s*:\s*"([\s\S]*?)"/i },
        { key: "open_browser", regex: /"open_browser"\s*:\s*"([\s\S]*?)"/i },
    ];
    for (const { key, regex } of directPatterns) {
        const match = trimmed.match(regex);
        if (match)
            return { [key]: match[1].replace(/\\"/g, '"').trim() };
    }
    // Compatibilité syntaxe simple sans guillemets : generate_image:un chat bleu mignon
    const bareKv = trimmed.match(/^([a-z0-9_]+)\s*:\s*([\s\S]+)$/i);
    if (bareKv) {
        const key = bareKv[1].toLowerCase();
        const value = bareKv[2].trim();
        const stringKeys = new Set([
            "generate_image",
            "generate_3d_model",
            "install_trellis",
            "cmd",
            "read_file",
            "analyze_folder",
            "read_image",
            "read_pdf",
            "read_pdf_brief",
            "list_folder_files",
            "list_folder_images",
            "list_folder_pdfs",
            "start_dev_server",
            "get_tool_doc",
            "search_web",
            "scrape_url",
            "open_browser",
        ]);
        if (stringKeys.has(key))
            return { [key]: value };
        if (key === "list_sd_models" && /^(true|1|yes|oui)$/i.test(value)) {
            return { list_sd_models: true };
        }
    }
    if (/"get_browser_errors"/i.test(trimmed))
        return { get_browser_errors: true };
    if (/"stop_dev_server"/i.test(trimmed))
        return { stop_dev_server: true };
    if (/"get_dev_server_info"/i.test(trimmed))
        return { get_dev_server_info: true };
    if (/"get_hardware_info"/i.test(trimmed))
        return { get_hardware_info: true };
    if (/"list_sd_models"/i.test(trimmed))
        return { list_sd_models: true };
    if (/"install_trellis"/i.test(trimmed))
        return { install_trellis: true };
    // Fallback tolérant pour {"cmd"...:"..."} cassé: on prend la dernière chaîne après "cmd".
    if (/"cmd"/i.test(trimmed)) {
        const afterCmd = trimmed.slice(trimmed.search(/"cmd"/i) + 5);
        const quoted = [...afterCmd.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
        if (quoted.length > 0) {
            return { cmd: quoted[quoted.length - 1] };
        }
    }
    return null;
};
exports.extractSimpleTool = extractSimpleTool;
const parseMessageSegments = (normalized) => {
    const blocks = [];
    for (const m of normalized.matchAll(/<patch_file\s+path="([^"]+)">([\s\S]*?)<\/patch_file>/g)) {
        const hasReplace = /REPLACE:/i.test(m[2]);
        if (!hasReplace)
            continue;
        blocks.push({
            start: m.index,
            end: m.index + m[0].length,
            seg: { type: "patch_file", path: m[1], body: m[2] },
        });
    }
    for (const m of normalized.matchAll(/<write_file\s+path="([^"]+)">([\/\s\S]*?)<\/write_file>/g)) {
        blocks.push({
            start: m.index,
            end: m.index + m[0].length,
            seg: { type: "write_file_tag", path: m[1], content: m[2] },
        });
    }
    for (const m of normalized.matchAll(/<tool>\s*([\s\S]*?)\s*<\/tool>/g)) {
        blocks.push({ start: m.index, end: m.index + m[0].length, seg: { type: "tool", rawJson: m[1] } });
    }
    if (blocks.length === 0)
        return [{ type: "text", content: normalized }];
    blocks.sort((a, b) => a.start - b.start);
    const segments = [];
    let cursor = 0;
    for (const block of blocks) {
        if (block.start > cursor) {
            const text = normalized.slice(cursor, block.start).trim();
            if (text)
                segments.push({ type: "text", content: text });
        }
        segments.push(block.seg);
        cursor = block.end;
    }
    if (cursor < normalized.length) {
        const text = normalized.slice(cursor).trim();
        if (text)
            segments.push({ type: "text", content: text });
    }
    return segments;
};
exports.parseMessageSegments = parseMessageSegments;
const extractPatchFileTags = (normalized) => [...normalized.matchAll(/<patch_file\s+path="([^"]+)">([\s\S]*?)<\/patch_file>/g)]
    .map((match) => {
    const body = match[2];
    const searchMatch = body.match(/SEARCH:[ \t]?\r?\n?([\s\S]*?)(?=\r?\n?[ \t]*REPLACE:[ \t]?\r?\n?)/);
    const replaceMatch = body.match(/REPLACE:[ \t]?\r?\n?([\s\S]*)$/);
    return {
        path: match[1],
        body,
        search: searchMatch ? searchMatch[1].trim() : null,
        replace: replaceMatch ? replaceMatch[1].trimEnd() : null,
    };
})
    .filter((tag) => /REPLACE:/i.test(tag.body));
exports.extractPatchFileTags = extractPatchFileTags;
const extractWriteFileTags = (normalized) => [...normalized.matchAll(/<write_file\s+path="([^"]+)">([\/\s\S]*?)<\/write_file>/g)].map((match) => ({
    path: match[1],
    content: match[2],
}));
exports.extractWriteFileTags = extractWriteFileTags;
