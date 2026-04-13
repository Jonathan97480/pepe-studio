"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "customapp_skill_disabled";

/** Retourne l'ensemble des noms de skills désactivés (persisté dans localStorage) */
function loadDisabled(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
}

function saveDisabled(disabled: Set<string>) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...disabled]));
    } catch { /* ignore */ }
}

type SkillsContextValue = {
    /** Noms de skills désactivés — tous les autres sont actifs */
    disabled: Set<string>;
    isEnabled: (name: string) => boolean;
    toggle: (name: string) => void;
    enableAll: () => void;
};

const SkillsContext = createContext<SkillsContextValue | null>(null);

export function SkillsProvider({ children }: { children: ReactNode }) {
    const [disabled, setDisabled] = useState<Set<string>>(loadDisabled);

    useEffect(() => {
        saveDisabled(disabled);
    }, [disabled]);

    const isEnabled = useCallback(
        (name: string) => !disabled.has(name),
        [disabled],
    );

    const toggle = useCallback((name: string) => {
        setDisabled((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    }, []);

    const enableAll = useCallback(() => setDisabled(new Set()), []);

    return (
        <SkillsContext.Provider value={{ disabled, isEnabled, toggle, enableAll }}>
            {children}
        </SkillsContext.Provider>
    );
}

export function useSkills(): SkillsContextValue {
    const ctx = useContext(SkillsContext);
    if (!ctx) throw new Error("useSkills must be used inside <SkillsProvider>");
    return ctx;
}
