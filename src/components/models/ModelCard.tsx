"use client";

import type { ModelConfig } from "../../hooks/useModels";
import type { HardwareInfo, AutoMode } from "../../lib/hardwareConfig";
import type { ModelMetadata } from "../../lib/modelMetadata";
import { ModelConfigForm } from "./ModelConfigForm";

interface ModelCardProps {
    filePath: string;
    draft: ModelConfig;
    isExpanded: boolean;
    isLoaded: boolean;
    isDefault: boolean;
    isLoading: boolean;
    isStopLoading: boolean;
    isAnyModelLoaded: boolean;
    isAnyActionLoading: boolean;
    mmprojFiles: string[];
    hardwareInfo: HardwareInfo | null;
    meta: ModelMetadata | undefined;
    autoDetectNotes: string[];
    autoDetecting: boolean;
    openSections: Record<string, boolean>;
    toggleSection: (key: string) => void;
    onExpand: () => void;
    onUpdate: (updates: Partial<ModelConfig>) => void;
    onAutoDetect: (mode: AutoMode) => void;
    onPickPersonality: () => void;
    onStop: () => void;
    onSetDefault: () => void;
    onSave: () => void;
    onCancel: () => void;
}

export function ModelCard({
    filePath,
    draft,
    isExpanded,
    isLoaded,
    isDefault,
    isLoading,
    isStopLoading,
    isAnyModelLoaded,
    isAnyActionLoading,
    mmprojFiles,
    hardwareInfo,
    meta,
    autoDetectNotes,
    autoDetecting,
    openSections,
    toggleSection,
    onExpand,
    onUpdate,
    onAutoDetect,
    onPickPersonality,
    onStop,
    onSetDefault,
    onSave,
    onCancel,
}: ModelCardProps) {
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

    return (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/10">
            {/* Ligne principale */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-white" title={filePath}>
                    📦 {fileName}
                </span>
                {isDefault && (
                    <span className="rounded-xl bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                        Par défaut
                    </span>
                )}
                {isLoaded && (
                    <span className="rounded-xl bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                        ● Chargé
                    </span>
                )}

                <button
                    onClick={onExpand}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
                >
                    {isExpanded ? "Fermer" : "⚙ Configurer"}
                </button>

                {!isDefault && (
                    <button
                        onClick={onSetDefault}
                        className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
                    >
                        ★ Par défaut
                    </button>
                )}

                {isLoaded ? (
                    <button
                        onClick={onStop}
                        disabled={isStopLoading}
                        className="rounded-2xl bg-red-500/80 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
                    >
                        {isStopLoading ? "Arrêt…" : "Arrêter"}
                    </button>
                ) : (
                    <button
                        onClick={onPickPersonality}
                        disabled={isAnyModelLoaded || !!isAnyActionLoading}
                        className="rounded-2xl bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isLoading ? "Chargement…" : "▶ Charger"}
                    </button>
                )}
            </div>

            {/* Formulaire de configuration */}
            {isExpanded && (
                <ModelConfigForm
                    filePath={filePath}
                    draft={draft}
                    mmprojFiles={mmprojFiles}
                    hardwareInfo={hardwareInfo}
                    meta={meta}
                    autoDetectNotes={autoDetectNotes}
                    autoDetecting={autoDetecting}
                    openSections={openSections}
                    toggleSection={toggleSection}
                    onUpdate={onUpdate}
                    onAutoDetect={onAutoDetect}
                    onSave={onSave}
                    onCancel={onCancel}
                />
            )}
        </div>
    );
}
