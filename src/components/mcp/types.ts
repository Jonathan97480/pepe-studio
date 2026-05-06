export type McpToolInfo = {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
};

export type McpServerInfo = {
    name: string;
    description: string;
    running: boolean;
    tools: McpToolInfo[];
};
