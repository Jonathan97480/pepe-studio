import React from "react";
import type { Attachment } from "../../hooks/useLlama";

type ComposerAttachmentsProps = {
    attachments: Attachment[];
    onRemoveAttachment: (index: number) => void;
};

export default function ComposerAttachments({ attachments, onRemoveAttachment }: ComposerAttachmentsProps) {
    if (attachments.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
                <div
                    key={index}
                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5"
                >
                    {attachment.dataUrl ? (
                        <img
                            src={attachment.dataUrl}
                            alt={attachment.name}
                            className="h-8 w-8 rounded-lg object-cover"
                        />
                    ) : attachment.docId != null ? (
                        <span className="text-base">📚</span>
                    ) : (
                        <span className="text-base">📄</span>
                    )}
                    <span className="max-w-[160px] truncate text-xs text-slate-300">
                        {attachment.name}
                        {attachment.docId != null && (
                            <span className="ml-1 text-emerald-400">({attachment.totalPages}p · indexé)</span>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={() => onRemoveAttachment(index)}
                        className="ml-1 text-slate-500 transition hover:text-red-400"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
