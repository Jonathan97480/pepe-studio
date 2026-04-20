import { useMemo } from "react";
import { defaultMcpManager } from "../tools/McpManager";

export function useMCP() {
    const manager = useMemo(() => defaultMcpManager, []);

    const execute = async (toolId: string, payload: unknown) => {
        return manager.execute(toolId, payload);
    };

    return {
        tools: manager.list(),
        execute,
    };
}
