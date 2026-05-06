import React from "react";

type SearchTestResult = { success: boolean; message: string } | null;

type WebSearchSectionProps = {
    braveKey: string;
    setBraveKey: (value: string) => void;
    serperKey: string;
    setSerperKey: (value: string) => void;
    tavilyKey: string;
    setTavilyKey: (value: string) => void;
    searxngUrl: string;
    setSearxngUrl: (value: string) => void;
    searchSaved: boolean;
    searchTesting: boolean;
    searchTestResult: SearchTestResult;
    onSave: () => void;
    onTest: () => void;
};

export default function WebSearchSection({
    braveKey,
    setBraveKey,
    serperKey,
    setSerperKey,
    tavilyKey,
    setTavilyKey,
    searxngUrl,
    setSearxngUrl,
    searchSaved,
    searchTesting,
    searchTestResult,
    onSave,
    onTest,
}: WebSearchSectionProps) {
    return (
        <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-5">
            <div>
                <h3 className="text-sm font-semibold text-white">Recherche Web</h3>
                <p className="mt-1 text-xs text-slate-400">
                    DuckDuckGo est gratuit et ne nécessite pas de clé. SearXNG est gratuit et open-source. Les autres
                    moteurs offrent de meilleurs résultats avec une clé API.
                </p>
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">
                    Brave Search —{" "}
                    <a
                        href="https://brave.com/search/api/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                    >
                        brave.com/search/api
                    </a>
                </span>
                <input
                    type="password"
                    value={braveKey}
                    onChange={(event) => setBraveKey(event.target.value)}
                    placeholder="BSAb…"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-400"
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">
                    Serper (Google) —{" "}
                    <a
                        href="https://serper.dev"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                    >
                        serper.dev
                    </a>
                </span>
                <input
                    type="password"
                    value={serperKey}
                    onChange={(event) => setSerperKey(event.target.value)}
                    placeholder="…"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-400"
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">
                    Tavily —{" "}
                    <a
                        href="https://app.tavily.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                    >
                        app.tavily.com
                    </a>
                </span>
                <input
                    type="password"
                    value={tavilyKey}
                    onChange={(event) => setTavilyKey(event.target.value)}
                    placeholder="tvly-…"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-400"
                />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">SearXNG — URL du serveur (gratuit, aucune clé requise)</span>
                <input
                    type="text"
                    value={searxngUrl}
                    onChange={(event) => setSearxngUrl(event.target.value)}
                    placeholder="https://searxng.example.com ou http://localhost:8888"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-400"
                />
                <p className="text-xs text-slate-500">
                    Utilise une instance SearXNG publique ou privée. Ex :{" "}
                    <span className="text-slate-400">https://searx.be</span>
                </p>
            </label>
            <div className="flex gap-2">
                <button
                    onClick={onSave}
                    className={`flex-1 rounded-2xl border px-4 py-2 text-sm transition ${
                        searchSaved
                            ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                            : "border-white/10 bg-white/5 text-slate-300 hover:border-blue-400/40 hover:text-blue-300"
                    }`}
                >
                    {searchSaved ? "✓ Sauvegardé" : "Sauvegarder les clés"}
                </button>
                <button
                    onClick={onTest}
                    disabled={searchTesting}
                    className={`flex-1 rounded-2xl border px-4 py-2 text-sm transition ${
                        searchTesting
                            ? "cursor-wait border-slate-400/20 bg-slate-500/10 text-slate-400"
                            : searchTestResult?.success
                              ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                              : searchTestResult?.success === false
                                ? "border-orange-400/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20"
                                : "border-white/10 bg-white/5 text-slate-300 hover:border-blue-400/40 hover:text-blue-300"
                    }`}
                >
                    {searchTesting ? "Test en cours…" : "🧪 Tester"}
                </button>
            </div>
            {searchTestResult && (
                <div
                    className={`rounded-xl px-4 py-3 text-xs ${
                        searchTestResult.success
                            ? "border border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
                            : "border border-orange-500/20 bg-orange-500/10 text-orange-300"
                    }`}
                >
                    {searchTestResult.message}
                </div>
            )}
        </div>
    );
}
