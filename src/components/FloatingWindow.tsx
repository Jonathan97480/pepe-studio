"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";

interface FloatingWindowProps {
    title: string;
    icon?: string;
    open: boolean;
    onClose: () => void;
    defaultWidth?: number;
    defaultHeight?: number;
    defaultX?: number;
    defaultY?: number;
    children: React.ReactNode;
}

export default function FloatingWindow({
    title,
    icon = "🪟",
    open,
    onClose,
    defaultWidth = 900,
    defaultHeight = 600,
    defaultX,
    defaultY,
    children,
}: FloatingWindowProps) {
    // Sizes adaptatifs au viewport
    const getAdaptiveWidth = () => {
        if (typeof window === "undefined") return defaultWidth;
        const screenW = window.innerWidth;
        return Math.min(defaultWidth, Math.max(280, screenW - 40));
    };
    const getAdaptiveHeight = () => {
        if (typeof window === "undefined") return defaultHeight;
        const screenH = window.innerHeight;
        return Math.min(defaultHeight, Math.max(200, screenH - 80));
    };
    
    const adaptiveW = getAdaptiveWidth();
    const adaptiveH = getAdaptiveHeight();
    
    const [pos, setPos] = useState(() => ({
        x: defaultX ?? (typeof window !== "undefined" ? Math.max(0, Math.min((window.innerWidth - adaptiveW) / 2, window.innerWidth - adaptiveW)) : 0),
        y: defaultY ?? (typeof window !== "undefined" ? Math.max(0, Math.min((window.innerHeight - adaptiveH) / 4, window.innerHeight - adaptiveH - 40)) : 0),
    }));
    const [size, setSize] = useState({ w: adaptiveW, h: adaptiveH });
    const [minimized, setMinimized] = useState(false);

    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizing = useRef(false);
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const windowRef = useRef<HTMLDivElement>(null);

    // Recentrer uniquement à la première ouverture (open passe false → true)
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open && !wasOpen.current) {
            const w = getAdaptiveWidth();
            const h = getAdaptiveHeight();
            setPos({
                x: defaultX ?? Math.max(0, Math.min((window.innerWidth - w) / 2, window.innerWidth - w)),
                y: defaultY ?? Math.max(0, Math.min((window.innerHeight - h) / 4, window.innerHeight - h - 40)),
            });
            setSize({ w, h });
            setMinimized(false);
        }
        wasOpen.current = open;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const onHeaderMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest("button")) return;
            dragging.current = true;
            dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
            e.preventDefault();
        },
        [pos],
    );

    const onResizeMouseDown = useCallback(
        (e: React.MouseEvent) => {
            resizing.current = true;
            resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
            e.preventDefault();
            e.stopPropagation();
        },
        [size],
    );
    
    // Min sizes adaptatifs au viewport
    const getMinWidth = () => Math.min(280, window.innerWidth - 40);
    const getMinHeight = () => Math.min(200, window.innerHeight - 80);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (dragging.current) {
                const minW = getMinWidth();
                setPos({
                    x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - minW)),
                    y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - 40)),
                });
            }
            if (resizing.current) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                const minW = getMinWidth();
                const minH = getMinHeight();
                setSize({
                    w: Math.max(minW, resizeStart.current.w + dx),
                    h: Math.max(minH, resizeStart.current.h + dy),
                });
            }
        };
        const onMouseUp = () => {
            dragging.current = false;
            resizing.current = false;
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [size.w]);

    // Ne jamais démonter les enfants (preserve state / polling)
    // On cache juste visuellement avec visibility + pointer-events
    return (
        <div
            ref={windowRef}
            className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0f1115] shadow-2xl shadow-black/60"
            style={{
                left: pos.x,
                top: pos.y,
                width: size.w,
                height: minimized ? "auto" : size.h,
                visibility: open ? "visible" : "hidden",
                pointerEvents: open ? "auto" : "none",
            }}
        >
            {/* ── Barre de titre ── */}
            <div
                className="flex shrink-0 cursor-grab items-center gap-2 border-b border-white/10 bg-white/5 px-3 md:px-4 py-2 md:py-2.5 select-none active:cursor-grabbing"
                onMouseDown={onHeaderMouseDown}
            >
                <span className="text-sm md:text-base">{icon}</span>
                <span className="flex-1 text-xs md:text-sm font-semibold text-white truncate">{title}</span>
                <button
                    onClick={() => setMinimized((v) => !v)}
                    title={minimized ? "Restaurer" : "Réduire"}
                    className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-lg text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
                >
                    {minimized ? "▲" : "▼"}
                </button>
                <button
                    onClick={onClose}
                    title="Fermer"
                    className="flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-lg text-xs text-slate-400 transition hover:bg-red-500/20 hover:text-red-400"
                >
                    ✕
                </button>
            </div>

            {/* ── Contenu ── */}
            {!minimized && <div className="relative flex-1 overflow-hidden">{children}</div>}

            {/* ── Poignée de redimensionnement ── */}
            {!minimized && (
                <div
                    className="absolute bottom-0 right-0 h-3 w-3 md:h-4 md:w-4 cursor-se-resize hidden md:block"
                    onMouseDown={onResizeMouseDown}
                    title="Redimensionner"
                >
                    <svg viewBox="0 0 8 8" className="h-full w-full opacity-30">
                        <line x1="0" y1="8" x2="8" y2="0" stroke="white" strokeWidth="1.5" />
                        <line x1="4" y1="8" x2="8" y2="4" stroke="white" strokeWidth="1.5" />
                    </svg>
                </div>
            )}
        </div>
    );
}
