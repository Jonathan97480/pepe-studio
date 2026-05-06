"use client";

import React from "react";
import { invoke } from "@tauri-apps/api/tauri";
import "katex/dist/katex.min.css";
import GeneratedImageBubble from "./GeneratedImageBubble";
import MessageMarkdown from "./MessageMarkdown";
import ThinkingPanel from "./ThinkingPanel";
import ToolCallPill from "./ToolCallPill";
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
            <GeneratedImageBubble
                index={index}
                content={message.content}
                imageDataUrl={message.imageDataUrl}
                lightboxOpen={lightboxOpen}
                onOpenLightbox={() => setLightboxOpen(true)}
                onCloseLightbox={() => setLightboxOpen(false)}
                onSaveImageAs={handleSaveImageAs}
                onDeleteImage={handleDeleteImage}
                isSavingImage={isSavingImage}
                isDeletingImage={isDeletingImage}
                saveStatus={saveStatus}
            />
        );
    }

    // ── Blocs tool call et tool feedback ─────────────────
    const normalizedMsgContent = normalizeToolTags(message.content || "");
    const isToolFeedback = message.role === "user" && /^\[/.test((message.content || "").trim());

    // Helper : rendu d'un pill outil
    const renderToolPill = (key: string, toolDetails: string) => {
        const isExpandedTool = expandedToolCalls[key] ?? false;
        return (
            <div key={key}>
                <ToolCallPill
                    expanded={isExpandedTool}
                    onToggle={() => setExpandedToolCalls((prev) => ({ ...prev, [key]: !prev[key] }))}
                    details={toolDetails}
                />
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
                                <MessageMarkdown content={seg.content} />
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
                    <ThinkingPanel
                        expanded={isExpanded}
                        onToggle={() => toggleThinking(index)}
                        thinking={message.thinking ?? ""}
                        className="mt-1 self-start max-w-[80%]"
                    />
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
                <MessageMarkdown content={displayContent ?? ""} className={isEditing ? "opacity-30 select-none" : ""} />
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
                    <ThinkingPanel
                        expanded={isExpanded}
                        onToggle={() => toggleThinking(index)}
                        thinking={message.thinking ?? ""}
                    />
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
