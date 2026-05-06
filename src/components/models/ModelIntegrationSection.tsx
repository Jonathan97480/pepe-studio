import React from "react";

type ModelIntegrationSectionProps = {
    filePath: string;
    mmprojFiles: string[];
    mmprojPath: string | null;
    chatTemplate: string;
    onUpdate: (updates: { mmproj_path?: string; chat_template?: string }) => void;
};

export default function ModelIntegrationSection({
    filePath,
    mmprojFiles,
    mmprojPath,
    chatTemplate,
    onUpdate,
}: ModelIntegrationSectionProps) {
    return (
        <>
            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Fichier mmproj <span className="text-slate-500">(vision — optionnel)</span>
                </span>
                {mmprojFiles.length > 0 ? (
                    <select
                        value={mmprojPath ?? ""}
                        onChange={(event) => onUpdate({ mmproj_path: event.target.value })}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                    >
                        <option value="">Aucun (texte uniquement)</option>
                        {mmprojFiles.map((file) => (
                            <option key={file} value={file}>
                                {file.split(/[/\\]/).pop()}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        type="text"
                        value={mmprojPath ?? ""}
                        onChange={(event) => onUpdate({ mmproj_path: event.target.value })}
                        placeholder="models/gemma-4-E4B-it-Q4_K_M-mmproj-f16.gguf"
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-400"
                    />
                )}
                <p className="text-[0.65rem] text-slate-500">
                    {mmprojFiles.length > 0 ? (
                        `${mmprojFiles.length} fichier(s) mmproj détecté(s) dans models/`
                    ) : (
                        <>
                            Place le fichier <code className="rounded bg-white/10 px-1">-mmproj-f16.gguf</code> dans{" "}
                            <code className="rounded bg-white/10 px-1">models/</code> et actualise.
                        </>
                    )}
                </p>
            </div>

            <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">
                    Chat template <span className="text-slate-500">(format de conversation)</span>
                </span>
                <select
                    value={chatTemplate}
                    onChange={(event) => onUpdate({ chat_template: event.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
                >
                    <option value="">🔍 Auto-détect (recommandé)</option>
                    <option value="jinja">⚡ jinja — Jinja2 embarqué (Gemma 4 uncensored)</option>
                    <option value="gemma">gemma — Gemma 1/2</option>
                    <option value="llama3">llama3 — Llama 3.x</option>
                    <option value="llama2">llama2 — Llama 2</option>
                    <option value="mistral">mistral</option>
                    <option value="phi3">phi3</option>
                    <option value="chatml">chatml — Qwen / ChatML</option>
                    <option value="deepseek">deepseek</option>
                </select>
                <p className="text-[0.65rem] text-slate-500">
                    Laisse sur Auto pour les modèles officiels. Utilise{" "}
                    <code className="rounded bg-white/10 px-1">jinja</code> pour Gemma 4 uncensored/abliterated.
                </p>
            </div>
        </>
    );
}
