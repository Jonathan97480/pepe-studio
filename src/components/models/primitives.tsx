"use client";

// ─── SliderParam ──────────────────────────────────────────────────────────────

export function SliderParam({
    label,
    tooltip,
    value,
    onChange,
    min,
    max,
    step,
    decimals = 2,
}: {
    label: string;
    tooltip?: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step: number;
    decimals?: number;
}) {
    return (
        <div className="flex flex-col gap-1" title={tooltip}>
            <span className="text-xs text-slate-400">{label}</span>
            <div className="flex items-center gap-3">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="flex-1 accent-blue-500"
                />
                <span className="w-10 text-right text-xs font-mono text-white">{value.toFixed(decimals)}</span>
            </div>
        </div>
    );
}

// ─── NumberParam ──────────────────────────────────────────────────────────────

export function NumberParam({
    label,
    tooltip,
    value,
    onChange,
    min,
    max,
    step,
}: {
    label: string;
    tooltip?: string;
    value: number;
    onChange: (v: number) => void;
    min: number;
    max: number;
    step?: number;
}) {
    return (
        <div className="flex flex-col gap-1" title={tooltip}>
            <span className="text-xs text-slate-400">{label}</span>
            <input
                type="number"
                min={min}
                max={max}
                step={step ?? 1}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
            />
        </div>
    );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({ title, open, toggle }: { title: string; open: boolean; toggle: () => void }) {
    return (
        <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-2 w-full text-left text-xs font-semibold text-blue-400 py-1.5 hover:text-blue-300 transition"
        >
            <span className={`transition-transform ${open ? "rotate-90" : ""}`}>&#9654;</span>
            {title}
        </button>
    );
}
