import React from "react";

type SkillsPanelHeaderProps = {
    enabledCount: number;
    totalCount: number;
    loading: boolean;
    hasDisabledSkills: boolean;
    onEnableAll: () => void;
    onRefresh: () => void;
};

export default function SkillsPanelHeader({
    enabledCount,
    totalCount,
    loading,
    hasDisabledSkills,
    onEnableAll,
    onRefresh,
}: SkillsPanelHeaderProps) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-semibold text-white">Skills</h2>
                <p className="mt-1 text-sm text-slate-400">
                    Scripts créés par l&apos;IA · {enabledCount}/{totalCount} actifs dans le contexte
                </p>
            </div>
            <div className="flex items-center gap-2">
                {hasDisabledSkills && (
                    <button
                        onClick={onEnableAll}
                        className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/20"
                    >
                        Tout activer
                    </button>
                )}
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-blue-400/40 hover:text-blue-300 disabled:opacity-50"
                >
                    {loading ? "…" : "↻ Rafraîchir"}
                </button>
            </div>
        </div>
    );
}
