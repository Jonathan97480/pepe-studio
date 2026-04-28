"use client";

import type { MemoryEstimate } from "../lib/hardwareConfig";

type Props = {
    estimate: MemoryEstimate | null;
    loading?: boolean;
};

function usageColor(ratio: number): string {
    if (ratio >= 1) return "bg-red-500";
    if (ratio >= 0.9) return "bg-amber-500";
    if (ratio >= 0.7) return "bg-amber-400";
    return "bg-emerald-500";
}

function textColor(ratio: number): string {
    if (ratio >= 1) return "text-red-400";
    if (ratio >= 0.9) return "text-amber-400";
    if (ratio >= 0.7) return "text-amber-300";
    return "text-emerald-400";
}

function fmtGb(value: number): string {
    return value < 0.01 ? "< 0.01" : value.toFixed(2);
}

export default function MemoryEstimationBar({ estimate, loading }: Props) {
    if (loading) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs text-slate-500">Chargement des informations matérielles...</p>
            </div>
        );
    }

    if (!estimate) return null;

    const ramRatio = estimate.available_ram_gb > 0
        ? estimate.total_ram_gb / estimate.available_ram_gb
        : 0;
    const vramRatio = estimate.has_gpu && estimate.available_vram_gb > 0
        ? estimate.total_vram_gb / estimate.available_vram_gb
        : 0;

    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-300">Estimation mémoire</p>
                {!estimate.has_metadata && (
                    <span className="text-[0.6rem] text-slate-500">
                        Métadonnées manquantes
                    </span>
                )}
                {estimate.has_metadata && estimate.offload_ratio > 0 && (
                    <span className="text-[0.6rem] text-slate-500">
                        GPU offload : {Math.round(estimate.offload_ratio * 100)}%
                    </span>
                )}
            </div>

            {/* RAM */}
            <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[0.65rem] text-slate-400">RAM</span>
                    <span className={`text-[0.65rem] font-mono ${textColor(ramRatio)}`}>
                        {fmtGb(estimate.total_ram_gb)} / {fmtGb(estimate.available_ram_gb)} GB
                    </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-200 ${usageColor(ramRatio)}`}
                        style={{ width: `${Math.min(100, ramRatio * 100)}%` }}
                    />
                </div>
                <div className="flex justify-between mt-0.5">
                    <span className="text-[0.55rem] text-slate-600">
                        Modèle : {fmtGb(estimate.model_ram_gb)} GB
                    </span>
                    <span className="text-[0.55rem] text-slate-600">
                        KV : {fmtGb(estimate.kv_ram_gb)} GB
                    </span>
                </div>
            </div>

            {/* VRAM */}
            {estimate.has_gpu && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.65rem] text-slate-400">VRAM</span>
                        <span className={`text-[0.65rem] font-mono ${textColor(vramRatio)}`}>
                            {fmtGb(estimate.total_vram_gb)} / {fmtGb(estimate.available_vram_gb)} GB
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-200 ${usageColor(vramRatio)}`}
                            style={{ width: `${Math.min(100, vramRatio * 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-0.5">
                        <span className="text-[0.55rem] text-slate-600">
                            Modèle : {fmtGb(estimate.model_vram_gb)} GB
                        </span>
                        <span className="text-[0.55rem] text-slate-600">
                            KV : {fmtGb(estimate.kv_vram_gb)} GB
                        </span>
                    </div>
                </div>
            )}

            <p className="mt-2 text-[0.55rem] text-slate-600">
                Réserve OS : ~1.5 GB VRAM, ~6 GB RAM non inclus
            </p>
        </div>
    );
}
