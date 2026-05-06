import React from "react";

type McpCreateServerFormProps = {
    newName: string;
    setNewName: (value: string) => void;
    newDesc: string;
    setNewDesc: (value: string) => void;
    newScript: string;
    setNewScript: (value: string) => void;
    createError: string | null;
    creating: boolean;
    onCreate: () => void;
    onCancel: () => void;
};

export default function McpCreateServerForm({
    newName,
    setNewName,
    newDesc,
    setNewDesc,
    newScript,
    setNewScript,
    createError,
    creating,
    onCreate,
    onCancel,
}: McpCreateServerFormProps) {
    return (
        <div className="flex flex-col gap-4 rounded-2xl border border-blue-400/30 bg-blue-500/5 p-5">
            <h3 className="font-semibold text-blue-300">Nouveau serveur MCP</h3>
            <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-400">Nom (sans espaces)</label>
                    <input
                        type="text"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder="mon-serveur"
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                    />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-400">Description</label>
                    <input
                        type="text"
                        value={newDesc}
                        onChange={(event) => setNewDesc(event.target.value)}
                        placeholder="Ce que fait ce serveur"
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                    />
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Script Node.js (JSON-RPC 2.0 over stdio)</label>
                <textarea
                    value={newScript}
                    onChange={(event) => setNewScript(event.target.value)}
                    rows={18}
                    spellCheck={false}
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-xs text-slate-200 outline-none focus:border-blue-400"
                />
            </div>
            {createError && (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {createError}
                </p>
            )}
            <div className="flex gap-2">
                <button
                    onClick={onCreate}
                    disabled={creating || !newName.trim()}
                    className="rounded-2xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:opacity-50"
                >
                    {creating ? "Sauvegarde…" : "💾 Sauvegarder"}
                </button>
                <button
                    onClick={onCancel}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                >
                    Annuler
                </button>
            </div>
        </div>
    );
}
