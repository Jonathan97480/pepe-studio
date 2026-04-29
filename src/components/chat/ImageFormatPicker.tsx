"use client";

import React, { useState } from "react";

export interface SDFormat {
    ratio: string;
    label: string;
    dims: string;
    /** valeur passée à aspect_ratio */
    value: string;
}

export const SD15_FORMATS: SDFormat[] = [
    { ratio: "1:1", label: "Carré", dims: "512×512", value: "1:1" },
    { ratio: "4:3", label: "Photo Classique", dims: "640×480", value: "4:3" },
    { ratio: "3:2", label: "Reflex Photo", dims: "768×512", value: "3:2" },
    { ratio: "2:3", label: "Portrait", dims: "512×768", value: "2:3" },
    { ratio: "16:9", label: "Écran Large", dims: "896×512", value: "16:9" },
    { ratio: "9:16", label: "Mobile Vertical", dims: "512×896", value: "9:16" },
    { ratio: "5:4", label: "Fine Art", dims: "640×512", value: "5:4" },
    { ratio: "2.39:1", label: "Cinémascope", dims: "1024×428", value: "2.39:1" },
    { ratio: "2:1", label: "Netflix", dims: "1024×512", value: "2:1" },
    { ratio: "17:9", label: "Cinéma DCI", dims: "1024×544", value: "17:9" },
    { ratio: "1.85:1", label: "Widescreen", dims: "960×520", value: "1.85:1" },
    { ratio: "1:2", label: "Affiche Verticale", dims: "512×1024", value: "1:2" },
    { ratio: "3:4", label: "Mobile Portrait", dims: "576×768", value: "3:4" },
    { ratio: "1:1.41", label: "Format A4", dims: "720×1024", value: "1:1.41" },
    { ratio: "4:1", label: "BD Panoramique", dims: "1536×384", value: "4:1" },
];

interface ImageFormatPickerProps {
    selected: string | null;
    onChange: (value: string | null) => void;
}

export function ImageFormatPicker({ selected, onChange }: ImageFormatPickerProps) {
    const [expanded, setExpanded] = useState(false);

    // Formats visibles sans expansion : les 6 principaux
    const visibleFormats = expanded ? SD15_FORMATS : SD15_FORMATS.slice(0, 6);

    return (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-400">
                    Format image SD 1.5
                </span>
                <div className="flex items-center gap-2">
                    {selected && (
                        <button
                            onClick={() => onChange(null)}
                            className="text-[10px] text-slate-500 transition-colors hover:text-red-400"
                            title="Réinitialiser (laisser l'IA choisir)"
                        >
                            ✕ reset
                        </button>
                    )}
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="text-[10px] text-slate-500 transition-colors hover:text-indigo-300"
                    >
                        {expanded ? "▲ moins" : "▼ tous"}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {visibleFormats.map((fmt) => {
                    const isActive = selected === fmt.value;
                    return (
                        <button
                            key={fmt.value}
                            onClick={() => onChange(isActive ? null : fmt.value)}
                            title={`${fmt.label} — ${fmt.dims}`}
                            className={[
                                "flex flex-col items-center rounded-lg border px-2 py-1 text-[10px] leading-tight transition-all",
                                isActive
                                    ? "border-indigo-400 bg-indigo-500/30 text-indigo-200"
                                    : "border-white/10 bg-slate-800/40 text-slate-400 hover:border-indigo-500/40 hover:text-slate-200",
                            ].join(" ")}
                        >
                            <span className="font-bold">{fmt.ratio}</span>
                            <span className="text-slate-500">{fmt.dims}</span>
                        </button>
                    );
                })}
            </div>

            {selected && (
                <p className="mt-1.5 text-[10px] text-indigo-300/70">
                    Format imposé :{" "}
                    <span className="font-semibold text-indigo-300">
                        {SD15_FORMATS.find((f) => f.value === selected)?.label ?? selected}
                    </span>{" "}
                    ({selected}) — sera injecté dans tous les appels generate_image
                </p>
            )}
        </div>
    );
}
