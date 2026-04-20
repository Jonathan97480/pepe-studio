"use client";

import QuestionBlock from "../QuestionBlock";
import type { PatchResult } from "../../lib/skillPatcher";

interface ConversationPanelsProps {
    compactToast: boolean;
    pendingQuestion: {
        question: string;
        options: string[];
    } | null;
    onAnswerQuestion: (answer: string) => void;
    pendingAgentPermission: {
        reason: string;
    } | null;
    onApproveAgentMode: () => void;
    onRejectAgentMode: () => void;
    patchResults: PatchResult[] | null;
    onDismissPatchResults: () => void;
    pendingPlanConfirm: {
        description: string;
    } | null;
    onConfirmPlanAction: () => void;
    onRejectPlanAction: () => void;
}

export function ConversationPanels({
    compactToast,
    pendingQuestion,
    onAnswerQuestion,
    pendingAgentPermission,
    onApproveAgentMode,
    onRejectAgentMode,
    patchResults,
    onDismissPatchResults,
    pendingPlanConfirm,
    onConfirmPlanAction,
    onRejectPlanAction,
}: ConversationPanelsProps) {
    return (
        <>
            {compactToast && (
                <div className="mx-auto mb-2 w-full max-w-3xl px-6">
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
                        <span>📦</span>
                        <span>Contexte compacté automatiquement — les anciens échanges ont été résumés.</span>
                    </div>
                </div>
            )}

            {pendingQuestion && (
                <div className="mx-auto w-full max-w-3xl px-6">
                    <QuestionBlock
                        question={pendingQuestion.question}
                        options={pendingQuestion.options}
                        onAnswer={onAnswerQuestion}
                    />
                </div>
            )}

            {pendingAgentPermission && (
                <div className="mx-auto w-full max-w-3xl px-6">
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4">
                        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-400">
                            ⚡ Demande de passage en mode Agent
                        </p>
                        <p className="mb-3 whitespace-pre-wrap text-sm text-amber-200">
                            {pendingAgentPermission.reason}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={onApproveAgentMode}
                                className="rounded-xl bg-amber-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-400"
                            >
                                ✓ Autoriser mode Agent
                            </button>
                            <button
                                onClick={onRejectAgentMode}
                                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20"
                            >
                                ✗ Refuser
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {patchResults && patchResults.length > 0 && (
                <div className="mx-auto w-full max-w-3xl px-6">
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-emerald-400">
                            🔧 Patches appliqués
                        </p>
                        <ul className="flex flex-col gap-1">
                            {patchResults.map((result, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                    <span className={result.success ? "text-emerald-400" : "text-red-400"}>
                                        {result.success ? "✓" : "✗"}
                                    </span>
                                    <span className="font-mono text-xs text-slate-300">{result.file}</span>
                                    <span className={result.success ? "text-slate-400" : "text-red-300"}>
                                        {result.message}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={onDismissPatchResults}
                            className="mt-2 text-xs text-slate-500 transition-colors hover:text-slate-300"
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            )}

            {pendingPlanConfirm && (
                <div className="mx-auto w-full max-w-3xl px-6">
                    <div className="rounded-2xl border border-violet-500/30 bg-violet-950/30 p-4">
                        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-400">
                            📋 Confirmation requise — Mode Plan
                        </p>
                        <p className="mb-3 whitespace-pre-wrap text-sm text-violet-200">
                            {pendingPlanConfirm.description}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={onConfirmPlanAction}
                                className="rounded-xl bg-violet-500/80 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
                            >
                                ✓ Confirmer l'action
                            </button>
                            <button
                                onClick={onRejectPlanAction}
                                className="rounded-xl bg-white/10 px-4 py-2 text-sm text-slate-300 transition hover:bg-white/20"
                            >
                                ✗ Annuler
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
