import React from "react";
import type { ToastMessage } from "../../hooks/useErrorToast";

interface ErrorToastProps {
    toasts: ToastMessage[];
    onDismiss: (id: number) => void;
}

export function ErrorToast({ toasts, onDismiss }: ErrorToastProps) {
    if (toasts.length === 0) return null;
    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
                        toast.type === "error" ? "bg-red-600" : "bg-yellow-600"
                    }`}
                >
                    <span className="flex-1">{toast.message}</span>
                    <button
                        onClick={() => onDismiss(toast.id)}
                        className="shrink-0 opacity-70 hover:opacity-100"
                        aria-label="Fermer"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}
