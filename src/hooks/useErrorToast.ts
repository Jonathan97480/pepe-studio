import { useState, useCallback, useRef } from "react";

export interface ToastMessage {
    id: number;
    message: string;
    type: "error" | "warning";
}

let _nextId = 1;

export function useErrorToast(autoDismissMs = 5000) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    const showError = useCallback(
        (message: string, type: ToastMessage["type"] = "error") => {
            const id = _nextId++;
            setToasts((prev) => [...prev, { id, message, type }]);
            const timer = setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
                timerRefs.current.delete(id);
            }, autoDismissMs);
            timerRefs.current.set(id, timer);
        },
        [autoDismissMs],
    );

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const timer = timerRefs.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timerRefs.current.delete(id);
        }
    }, []);

    return { toasts, showError, dismiss };
}
