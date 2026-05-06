"use client";

import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useSkills } from "../context/SkillsContext";
import { loadBuiltinDisabled, saveBuiltinDisabled } from "../lib/builtinTools";
import BuiltinToolsSection from "./skills/BuiltinToolsSection";
import EmptySkillsState from "./skills/EmptySkillsState";
import SkillsPanelHeader from "./skills/SkillsPanelHeader";

type SkillMeta = {
    name: string;
    description: string;
    created_at: string;
    skill_type: string;
};

const SKILL_TYPE_BADGE: Record<string, { label: string; icon: string; color: string }> = {
    ps1: { label: "PowerShell", icon: "🖥", color: "border-blue-400/30 bg-blue-500/10 text-blue-300" },
    http: { label: "HTTP", icon: "🌐", color: "border-violet-400/30 bg-violet-500/10 text-violet-300" },
    python: { label: "Python", icon: "🐍", color: "border-yellow-400/30 bg-yellow-500/10 text-yellow-300" },
    nodejs: { label: "Node.js", icon: "⬡", color: "border-green-400/30 bg-green-500/10 text-green-300" },
    composite: { label: "Composite", icon: "⛓", color: "border-orange-400/30 bg-orange-500/10 text-orange-300" },
};

export default function SkillsPanel() {
    const [skills, setSkills] = useState<SkillMeta[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
    const [skillContent, setSkillContent] = useState<Record<string, string>>({});
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [runOutput, setRunOutput] = useState<Record<string, string>>({});
    const [running, setRunning] = useState<string | null>(null);

    const { isEnabled, toggle, enableAll } = useSkills();

    const [builtinDisabled, setBuiltinDisabled] = useState<Set<string>>(loadBuiltinDisabled);
    const toggleBuiltin = (id: string) => {
        setBuiltinDisabled((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            saveBuiltinDisabled(next);
            return next;
        });
    };

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const list = await invoke<SkillMeta[]>("list_skills");
            setSkills(list);
        } catch (err) {
            console.error("[SkillsPanel] list_skills failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleExpand = async (name: string) => {
        if (expandedSkill === name) {
            setExpandedSkill(null);
            return;
        }
        setExpandedSkill(name);
        if (!skillContent[name]) {
            try {
                const content = await invoke<string>("read_skill", { name });
                setSkillContent((prev) => ({ ...prev, [name]: content }));
            } catch {
                /* ignore */
            }
        }
    };

    const handleDelete = async (name: string) => {
        if (confirmDelete !== name) {
            setConfirmDelete(name);
            return;
        }
        try {
            await invoke("delete_skill", { name });
            setConfirmDelete(null);
            setExpandedSkill(null);
            await refresh();
        } catch (err) {
            console.error("[SkillsPanel] delete_skill failed", err);
        }
    };

    const handleRun = async (name: string) => {
        setRunning(name);
        try {
            const output = await invoke<string>("run_skill", { name, args: null });
            setRunOutput((prev) => ({ ...prev, [name]: output }));
        } catch (err) {
            setRunOutput((prev) => ({ ...prev, [name]: `[Erreur] ${err}` }));
        } finally {
            setRunning(null);
        }
    };

    const enabledCount = skills.filter((s) => isEnabled(s.name)).length;

    return (
        <div className="h-full overflow-y-auto p-8">
            <div className="mx-auto max-w-3xl flex flex-col gap-6">
                <BuiltinToolsSection builtinDisabled={builtinDisabled} onToggleBuiltin={toggleBuiltin} />

                <SkillsPanelHeader
                    enabledCount={enabledCount}
                    totalCount={skills.length}
                    loading={loading}
                    hasDisabledSkills={skills.some((s) => !isEnabled(s.name))}
                    onEnableAll={enableAll}
                    onRefresh={refresh}
                />

                {skills.length === 0 && !loading && <EmptySkillsState />}

                <div className="flex flex-col gap-3">
                    {skills.map((skill) => {
                        const enabled = isEnabled(skill.name);
                        const isExpanded = expandedSkill === skill.name;
                        const output = runOutput[skill.name];
                        const isRunning = running === skill.name;

                        return (
                            <div
                                key={skill.name}
                                className={`rounded-3xl border transition-all ${
                                    enabled ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02] opacity-60"
                                }`}
                            >
                                {/* Ligne principale */}
                                <div className="flex items-center gap-4 px-5 py-4">
                                    {/* Toggle actif/inactif */}
                                    <button
                                        onClick={() => toggle(skill.name)}
                                        title={enabled ? "Désactiver ce skill" : "Activer ce skill"}
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

                                    {/* Infos */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-sm font-medium text-white">
                                                {skill.name}
                                            </span>
                                            {(() => {
                                                const badge = SKILL_TYPE_BADGE[skill.skill_type];
                                                return badge ? (
                                                    <span
                                                        className={`rounded-md border px-1.5 py-0.5 text-[0.6rem] font-medium ${badge.color}`}
                                                    >
                                                        {badge.icon} {badge.label}
                                                    </span>
                                                ) : null;
                                            })()}
                                            {!enabled && (
                                                <span className="rounded-md bg-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400">
                                                    inactif
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-slate-400">
                                            {skill.description || "Aucune description"}
                                        </p>
                                        {skill.created_at && (
                                            <p className="text-[0.65rem] text-slate-600 mt-0.5">
                                                Créé le {skill.created_at}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => handleRun(skill.name)}
                                            disabled={isRunning}
                                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-50"
                                        >
                                            {isRunning ? "…" : "▶ Exécuter"}
                                        </button>
                                        <button
                                            onClick={() => handleExpand(skill.name)}
                                            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-blue-400/40 hover:text-blue-300"
                                        >
                                            {isExpanded ? "Fermer" : "Voir"}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(skill.name)}
                                            className={`rounded-2xl border px-3 py-1.5 text-xs transition ${
                                                confirmDelete === skill.name
                                                    ? "border-red-400/60 bg-red-500/20 text-red-300"
                                                    : "border-white/10 bg-white/5 text-slate-500 hover:border-red-400/40 hover:text-red-400"
                                            }`}
                                        >
                                            {confirmDelete === skill.name ? "Confirmer ?" : "✕"}
                                        </button>
                                        {confirmDelete === skill.name && (
                                            <button
                                                onClick={() => setConfirmDelete(null)}
                                                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                                            >
                                                Annuler
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Contenu du script */}
                                {isExpanded && (
                                    <div className="border-t border-white/5 px-5 pb-4">
                                        <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-slate-950/80 p-4 text-xs text-slate-300 font-mono leading-5 whitespace-pre-wrap">
                                            {skillContent[skill.name] ?? "Chargement…"}
                                        </pre>
                                    </div>
                                )}

                                {/* Sortie d'exécution */}
                                {output && (
                                    <div className="border-t border-white/5 px-5 pb-4">
                                        <p className="mt-3 text-xs text-slate-500 mb-1">Dernière exécution :</p>
                                        <pre className="max-h-48 overflow-auto rounded-2xl bg-emerald-950/40 border border-emerald-400/10 p-3 text-xs text-emerald-300 font-mono leading-5 whitespace-pre-wrap">
                                            {output}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
