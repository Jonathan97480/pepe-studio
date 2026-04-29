"use client";

import React from "react";
import { invoke } from "@tauri-apps/api/tauri";
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
    conversationId?: number | null;
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
    conversationId,
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
    const [lightboxOpen, setLightboxOpen] = React.useState(false);
    const [isSavingImage, setIsSavingImage] = React.useState(false);
    const [isDeletingImage, setIsDeletingImage] = React.useState(false);
    const [saveStatus, setSaveStatus] = React.useState<string | null>(null);
    const bubbleClass =
        message.role === "assistant" ? "self-start bg-white/10 text-slate-100" : "self-end bg-blue-500/90 text-white";
    const hasThinking = !!message.thinking;
    const isExpanded = expandedThinking[index] ?? false;
    const displayContent = message.content || (hasThinking && !message.thinkingDone ? "..." : message.content);
    const isEditing = editingIndex === index;

    async function handleSaveImageAs() {
        if (!message.imageDataUrl || isSavingImage) return;
        setIsSavingImage(true);
        setSaveStatus(null);
        try {
            const result = await invoke<{ path: string; filename: string }>("save_image_as", {
                dataUrl: message.imageDataUrl,
                filename: null,
            });
            setSaveStatus(`Enregistrée : ${result.path}`);
        } catch (error) {
            setSaveStatus(`Erreur sauvegarde : ${String(error)}`);
        } finally {
            setIsSavingImage(false);
        }
    }

    async function handleDeleteImage() {
        if (isDeletingImage) return;
        const confirmed = window.confirm("Supprimer cette image du chat ?");
        if (!confirmed) return;

        setIsDeletingImage(true);
        try {
            if (message.imagePath) {
                await invoke<string>("delete_generated_image", { path: message.imagePath });
                if (conversationId) {
                    await invoke("delete_image_message", {
                        conversationId,
                        imagePath: message.imagePath,
                    });
                }
            }
            deleteMessage(index);
        } catch (error) {
            setSaveStatus(`Erreur suppression : ${String(error)}`);
        } finally {
            setIsDeletingImage(false);
        }
    }

    // ── Image générée (rendu natif, évite les problèmes ReactMarkdown/CSP) ──
    if (message.imageDataUrl) {
        return (
            <div key={index} className="flex flex-col gap-1 self-start max-w-[80%]">
                <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5 shadow-xl shadow-slate-950/20">
                    {message.content && (
                        <p className="px-4 pt-3 pb-2 text-sm font-semibold text-slate-300">{message.content}</p>
                    )}
                    <img
                        src={message.imageDataUrl}
                        alt="image générée"
                        className="max-w-full rounded-b-3xl block cursor-zoom-in"
                        style={{ maxHeight: "512px", objectFit: "contain" }}
                        onClick={() => setLightboxOpen(true)}
                    />
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="rounded-xl border border-cyan-500/30 bg-cyan-900/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:border-cyan-400/60"
                    >
                        Ouvrir en grand
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveImageAs}
                        disabled={isSavingImage}
                        className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:border-emerald-400/60 disabled:opacity-60"
                    >
                        {isSavingImage ? "Téléchargement..." : "Télécharger..."}
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteImage}
                        disabled={isDeletingImage}
                        className="rounded-xl border border-rose-500/30 bg-rose-900/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:border-rose-400/60 disabled:opacity-60"
                    >
                        {isDeletingImage ? "Suppression..." : "Supprimer"}
                    </button>
                </div>
                {saveStatus ? <p className="text-[0.68rem] text-slate-400">{saveStatus}</p> : null}

                {lightboxOpen ? (
                    <div
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
                        onClick={() => setLightboxOpen(false)}
                    >
                        <div className="relative max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setLightboxOpen(false)}
                                className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
                            >
                                Fermer
                            </button>
                            <img
                                src={message.imageDataUrl}
                                alt="image générée agrandie"
                                className="max-h-[90vh] max-w-[95vw] rounded-xl border border-white/20 object-contain"
                            />
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

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
