import React from "react";

type Context7SectionProps = {
    context7Key: string;
    setContext7Key: (value: string) => void;
    context7Saved: boolean;
    onSave: () => void;
};

export default function Context7Section({ context7Key, setContext7Key, context7Saved, onSave }: Context7SectionProps) {
    return (
        <div className="mt-2 flex flex-col gap-3 border-t border-white/10 pt-5">
            <div>
                <h3 className="text-sm font-semibold text-white">Context7</h3>
                <p className="mt-1 text-xs text-slate-400">
                    Documentation officielle et à jour injectée automatiquement dans le contexte de l&apos;IA.{" "}
                    <a
                        href="https://context7.com/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline"
                    >
                        Obtenir une clé gratuite →
                    </a>
                </p>
            </div>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Clé API Context7</span>
                <div className="flex gap-2">
                    <input
                        type="password"
                        value={context7Key}
                        onChange={(event) => setContext7Key(event.target.value)}
                        placeholder="ctx7sk-…  (optionnel, rate-limit élevé avec clé)"
                        className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-400"
                    />
                    <button
                        onClick={onSave}
                        className={`rounded-2xl border px-4 py-2 text-sm transition ${
                            context7Saved
                                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                                : "border-white/10 bg-white/5 text-slate-300 hover:border-blue-400/40 hover:text-blue-300"
                        }`}
                    >
                        {context7Saved ? "✓ Sauvegardé" : "Sauvegarder"}
                    </button>
                </div>
                <p className="text-xs text-slate-500">
                    Sans clé : fonctionne avec des limites basses. Avec clé : accès illimité aux 86 000+ bibliothèques
                    indexées.
                </p>
            </label>
        </div>
    );
}
