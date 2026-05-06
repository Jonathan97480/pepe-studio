import React from "react";
import { BUILTIN_TOOLS } from "@/lib/builtinTools";

type BuiltinToolsSectionProps = {
    builtinDisabled: Set<string>;
    onToggleBuiltin: (id: string) => void;
};

export default function BuiltinToolsSection({ builtinDisabled, onToggleBuiltin }: BuiltinToolsSectionProps) {
    return (
        <div className="flex flex-col gap-3">
            <div>
                <h2 className="text-2xl font-semibold text-white">Outils intégrés</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Capacités natives de l&apos;IA · désactiver un outil supprime son prompt système
                </p>
            </div>
            <div className="flex flex-col gap-2">
                {BUILTIN_TOOLS.map((tool) => {
                    const enabled = !builtinDisabled.has(tool.id);
                    return (
                        <div
                            key={tool.id}
                            className={`rounded-2xl border px-4 py-3 flex items-center gap-4 transition-all ${
                                enabled ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-50"
                            }`}
                        >
                            <button
                                onClick={() => onToggleBuiltin(tool.id)}
                                title={enabled ? "Désactiver" : "Activer"}
                                className={`relative flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                                    enabled ? "bg-emerald-500" : "bg-slate-700"
                                }`}
                            >
                                <span
                                    className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                        enabled ? "translate-x-6" : "translate-x-1"
                                    }`}
                                />
                            </button>
                            <span className="text-xl shrink-0">{tool.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-white">{tool.label}</span>
                                    <span className="rounded-md border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-400">
                                        intégré
                                    </span>
                                    {!enabled && (
                                        <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400">
                                            inactif
                                        </span>
                                    )}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500 truncate">{tool.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
