import React from "react";

type LlamaLogs = {
    stdout_path: string;
    stderr_path: string;
    stdout: string;
    stderr: string;
};

type ModelsPanelErrorBlockProps = {
    listError: string | null;
    actionError: string | null;
    llamaLogs: LlamaLogs | null;
};

export default function ModelsPanelErrorBlock({ listError, actionError, llamaLogs }: ModelsPanelErrorBlockProps) {
    if (!listError && !actionError) return null;

    return (
        <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 whitespace-pre-wrap">
            {listError ?? actionError}
            {!listError && llamaLogs?.stderr && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-300">
                        Logs llama-server
                    </p>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-red-100">
                        {llamaLogs.stderr}
                    </pre>
                </div>
            )}
        </div>
    );
}
