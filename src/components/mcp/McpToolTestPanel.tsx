import React from "react";

type McpToolTestPanelProps = {
    testServer: string;
    testTool: string;
    testArgs: string;
    setTestArgs: (value: string) => void;
    testing: boolean;
    testResult: string | null;
    onClose: () => void;
    onTest: () => void;
};

export default function McpToolTestPanel({
    testServer,
    testTool,
    testArgs,
    setTestArgs,
    testing,
    testResult,
    onClose,
    onTest,
}: McpToolTestPanelProps) {
    return (
        <div className="flex w-[360px] flex-col gap-4 overflow-y-auto border-l border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-slate-400">Test</p>
                    <p className="text-sm font-semibold text-white">
                        {testServer} / {testTool}
                    </p>
                </div>
                <button onClick={onClose} className="text-lg text-slate-500 transition hover:text-white">
                    ✕
                </button>
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Arguments (JSON)</label>
                <textarea
                    value={testArgs}
                    onChange={(event) => setTestArgs(event.target.value)}
                    rows={6}
                    spellCheck={false}
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-violet-400"
                />
            </div>

            <button
                onClick={onTest}
                disabled={testing}
                className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
            >
                {testing ? "Exécution…" : "▶ Exécuter"}
            </button>

            {testResult !== null && (
                <div className="flex flex-col gap-1">
                    <p className="text-xs text-slate-400">Résultat</p>
                    <pre
                        className={`whitespace-pre-wrap break-words rounded-xl border px-3 py-2 font-mono text-xs ${
                            testResult.startsWith("[Erreur]")
                                ? "border-red-400/30 bg-red-500/10 text-red-300"
                                : "border-emerald-400/20 bg-emerald-500/5 text-emerald-200"
                        }`}
                    >
                        {testResult}
                    </pre>
                </div>
            )}
        </div>
    );
}
