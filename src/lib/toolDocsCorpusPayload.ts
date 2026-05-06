import type { ToolDocsMap } from "./toolDocsTypes";
import { TOOL_DOCS_FILE } from "./toolDocs/fileDocs";
import { TOOL_DOCS_TERMINAL_SKILLS } from "./toolDocs/terminalSkillDocs";
import { TOOL_DOCS_WEB_MCP } from "./toolDocs/webMcpDocs";
import { TOOL_DOCS_STATE_IMAGE } from "./toolDocs/stateImageDocs";

export const TOOL_DOCS: ToolDocsMap = {
    ...TOOL_DOCS_FILE,
    ...TOOL_DOCS_TERMINAL_SKILLS,
    ...TOOL_DOCS_WEB_MCP,
    ...TOOL_DOCS_STATE_IMAGE,
};

