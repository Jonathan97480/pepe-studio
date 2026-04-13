"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { markdownComponents } from "./CodeBlock";
import { normalizeToolTags, sanitizeLlmJson, parseMessageSegments } from "../../lib/chatUtils";
import type { LlamaMessage } from "../../hooks/useLlama";

interface MessageBubbleProps {
    message: LlamaMessage;
    index: number;
    expandedThinking: Record<number, boolean>;
    toggleThinking: (index: number) => void;
    expandedToolCalls: Record<string, boolean>;
    setExpandedToolCalls: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    editingIndex: number | null;
    setEditingIndex: React.Dispatch<React.SetStateAction<number | null>>;
    editDraft: string;
    setEditDraft: React.Dispatch<React.SetStateAction<string>>;
    editMessage: (index: number, content: string) => void;
    handleResendEdit: (index: number, draft: string) => void;
    deleteMessage: (index: number) => void;
}

export function MessageBubble({
    message,
    index,
    expandedThinking,
    toggleThinking,
    expandedToolCalls,
    setExpandedToolCalls,
    editingIndex,
    setEditingIndex,
    editDraft,
    setEditDraft,
    editMessage,
    handleResendEdit,
    deleteMessage,
}: MessageBubbleProps) {
    const bubbleClass =
        message.role === "assistant" ? "self-start bg-white/10 text-slate-100" : "self-end bg-blue-500/90 text-white";
    const hasThinking = !!message.thinking;
    const isExpanded = expandedThinking[index] ?? false;
    const displayContent = message.content || (hasThinking && !message.thinkingDone ? "..." : message.content);
    const isEditing = editingIndex === index;

    // ── Blocs tool call et tool feedback ─────────────────
    const normalizedMsgContent = normalizeToolTags(message.content || "");
    const isToolFeedback = message.role === "user" && /^\[/.test((message.content || "").trim());

    // Helper : rendu d'un pill outil
    const renderToolPill = (key: string, toolDetails: string) => {
        const isExpandedTool = expandedToolCalls[key] ?? false;
        return (
            <div key={key} className="self-start max-w-[80%]">
                <button
                    type="button"
                    onClick={() => setExpandedToolCalls((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-400/60 transition hover:border-amber-500/40 hover:text-amber-300"
                >
                    <span className="text-base">🔧</span>
                    <span className="text-xs font-medium tracking-widest">call tools</span>
                    <span className="text-[0.6rem] opacity-40 ml-1">{isExpandedTool ? "▲" : "▼"}</span>
                </button>
                {isExpandedTool && (
                    <div className="mt-1 rounded-2xl border border-amber-500/15 bg-slate-950/60 px-4 py-3 max-h-64 overflow-auto">
                        <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono">{toolDetails}</pre>
                    </div>
                )}
            </div>
        );
    };

    // Tool feedback utilisateur ([...] résultats)
    if (isToolFeedback) {
        const key = `${index}-0`;
        return (
            <div key={index} className="flex flex-col gap-1">
                {renderToolPill(key, message.content || "")}
            </div>
        );
    }

    // Segmentation du message en blocs texte / outil
    const segments = parseMessageSegments(normalizedMsgContent);
    const hasToolSegments = segments.some((s) => s.type !== "text");

    // ─── Rendu mixte (texte + outils intercalés) ───────────
    if (hasToolSegments) {
        return (
            <div key={index} className="flex flex-col gap-1">
                {segments.map((seg, segIdx) => {
                    const segKey = `${index}-${segIdx}`;
                    if (seg.type === "text") {
                        return (
                            <div
                                key={segKey}
                                className="min-w-[220px] rounded-3xl px-5 py-4 shadow-xl shadow-slate-950/20 self-start bg-white/10 text-slate-100"
                            >
                                {segIdx === 0 && (
                                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                                        {message.role}
                                    </p>
                                )}
                                <div className="mt-2 text-base leading-7 break-words prose prose-invert max-w-none prose-p:my-1 prose-li:my-0 prose-headings:my-2 prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-white/20 prose-td:px-3 prose-td:py-1.5">
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={markdownComponents}
                                    >
                                        {seg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        );
                    }
                    // Segment outil — construire le détail lisible
                    let toolDetails = "";
                    if (seg.type === "tool") {
                        try {
                            toolDetails = JSON.stringify(JSON.parse(sanitizeLlmJson(seg.rawJson)), null, 2);
                        } catch {
                            toolDetails = seg.rawJson;
                        }
                    } else if (seg.type === "patch_file") {
                        toolDetails = `path: ${seg.path}\n${seg.body}`;
                    } else if (seg.type === "write_file_tag") {
                        toolDetails = `path: ${seg.path}\n${seg.content}`;
                    }
                    return renderToolPill(segKey, toolDetails);
                })}
                {hasThinking ? (
                    <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/80 p-3 self-start max-w-[80%]">
                        <button
                            type="button"
                            onClick={() => toggleThinking(index)}
                            className="text-xs font-medium uppercase tracking-[0.15em] text-slate-300 underline"
                        >
                            {isExpanded ? "Masquer la réflexion" : "Afficher la réflexion"}
                        </button>
                        {isExpanded ? (
                            <div className="mt-2 max-h-56 overflow-auto text-xs leading-5 text-slate-300 prose prose-invert max-w-none prose-p:my-0.5 prose-li:my-0">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={markdownComponents}
                                >
                                    {message.thinking ?? ""}
                                </ReactMarkdown>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {message.meta ? (
                    <p className="text-[0.68rem] italic text-slate-500 px-1 text-left">{message.meta}</p>
                ) : null}
            </div>
        );
    }

    // ─── Rendu standard (100 % texte) ──────────────────────
    return (
        <div key={index} className="flex flex-col gap-1">
            {/* Card */}
            <div
                className={`min-h-[72px] min-w-[220px] rounded-3xl px-5 py-4 shadow-xl shadow-slate-950/20 ${bubbleClass}`}
            >
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">{message.role}</p>
                {/* Contenu toujours visible */}
                <div
                    className={`mt-2 text-base leading-7 break-words prose prose-invert max-w-none prose-p:my-1 prose-li:my-0 prose-headings:my-2 prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-white/20 prose-td:px-3 prose-td:py-1.5 ${isEditing ? "opacity-30 select-none" : ""}`}
                >
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                    >
                        {displayContent ?? ""}
                    </ReactMarkdown>
                </div>
                {/* Formulaire d'édition en dessous, ne remplace pas le contenu */}
                {isEditing ? (
                    <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
                        <textarea
                            autoFocus
                            className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-blue-400"
                            rows={3}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    editMessage(index, editDraft);
                                    setEditingIndex(null);
                                }
                                if (e.key === "Escape") setEditingIndex(null);
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setEditingIndex(null)}
                                className="rounded-2xl border border-white/10 px-3 py-1 text-xs text-slate-400 hover:text-white"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                onClick={() => handleResendEdit(index, editDraft)}
                                className="rounded-2xl bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-400"
                            >
                                Envoyer
                            </button>
                        </div>
                    </div>
                ) : null}
                {hasThinking ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/80 p-3">
                        <button
                            type="button"
                            onClick={() => toggleThinking(index)}
                            className="text-xs font-medium uppercase tracking-[0.15em] text-slate-300 underline"
                        >
                            {isExpanded ? "Masquer la réflexion" : "Afficher la réflexion"}
                        </button>
                        {isExpanded ? (
                            <div className="mt-2 max-h-56 overflow-auto text-xs leading-5 text-slate-300 prose prose-invert max-w-none prose-p:my-0.5 prose-li:my-0">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                    components={markdownComponents}
                                >
                                    {message.thinking ?? ""}
                                </ReactMarkdown>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
            {/* Éditer + Supprimer — uniquement sur les messages utilisateur */}
            {message.role === "user" ? (
                <div className="flex justify-end gap-2 px-1">
                    <button
                        type="button"
                        onClick={() => {
                            setEditDraft(message.content);
                            setEditingIndex(index);
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-slate-400 transition hover:border-blue-400/40 hover:text-blue-300"
                    >
                        Éditer
                    </button>
                    <button
                        type="button"
                        onClick={() => deleteMessage(index)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-slate-400 transition hover:border-red-400/40 hover:text-red-300"
                    >
                        Supprimer
                    </button>
                </div>
            ) : null}
            {/* Stats */}
            {message.meta ? (
                <p
                    className={`text-[0.68rem] italic text-slate-500 px-1 ${message.role === "user" ? "text-right" : "text-left"}`}
                >
                    {message.meta}
                </p>
            ) : null}
        </div>
    );
}
