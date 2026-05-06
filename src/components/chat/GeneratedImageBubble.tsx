import React from "react";

type GeneratedImageBubbleProps = {
    index: number;
    content: string;
    imageDataUrl: string;
    lightboxOpen: boolean;
    onOpenLightbox: () => void;
    onCloseLightbox: () => void;
    onSaveImageAs: () => void;
    onDeleteImage: () => void;
    isSavingImage: boolean;
    isDeletingImage: boolean;
    saveStatus: string | null;
};

export default function GeneratedImageBubble({
    index,
    content,
    imageDataUrl,
    lightboxOpen,
    onOpenLightbox,
    onCloseLightbox,
    onSaveImageAs,
    onDeleteImage,
    isSavingImage,
    isDeletingImage,
    saveStatus,
}: GeneratedImageBubbleProps) {
    return (
        <div key={index} className="flex max-w-[80%] flex-col gap-1 self-start">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-xl shadow-slate-950/20">
                {content && <p className="px-4 pb-2 pt-3 text-sm font-semibold text-slate-300">{content}</p>}
                <img
                    src={imageDataUrl}
                    alt="image générée"
                    className="block max-w-full cursor-zoom-in rounded-b-3xl"
                    style={{ maxHeight: "512px", objectFit: "contain" }}
                    onClick={onOpenLightbox}
                />
            </div>
            <div className="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenLightbox}
                    className="rounded-xl border border-cyan-500/30 bg-cyan-900/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:border-cyan-400/60"
                >
                    Ouvrir en grand
                </button>
                <button
                    type="button"
                    onClick={onSaveImageAs}
                    disabled={isSavingImage}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:border-emerald-400/60 disabled:opacity-60"
                >
                    {isSavingImage ? "Téléchargement..." : "Télécharger..."}
                </button>
                <button
                    type="button"
                    onClick={onDeleteImage}
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
                    onClick={onCloseLightbox}
                >
                    <div className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
                        <button
                            type="button"
                            onClick={onCloseLightbox}
                            className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
                        >
                            Fermer
                        </button>
                        <img
                            src={imageDataUrl}
                            alt="image générée agrandie"
                            className="max-h-[90vh] max-w-[95vw] rounded-xl border border-white/20 object-contain"
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}
