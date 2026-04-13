"use client";

import React, { useState } from "react";

type QuestionBlockProps = {
    question: string;
    options: string[];
    onAnswer: (answer: string) => void;
};

export default function QuestionBlock({ question, options, onAnswer }: QuestionBlockProps) {
    const [custom, setCustom] = useState("");
    const [answered, setAnswered] = useState(false);
    const [chosenAnswer, setChosenAnswer] = useState<string | null>(null);

    const handleAnswer = (answer: string) => {
        if (answered) return;
        setAnswered(true);
        setChosenAnswer(answer);
        onAnswer(answer);
    };

    const handleCustomSubmit = () => {
        const trimmed = custom.trim();
        if (!trimmed || answered) return;
        handleAnswer(trimmed);
    };

    return (
        <div className="mt-3 rounded-2xl border border-blue-500/30 bg-blue-950/30 p-4">
            <p className="mb-3 text-sm font-semibold text-blue-200">{question}</p>
            <div className="mb-3 flex flex-wrap gap-2">
                {options.map((opt, i) => (
                    <button
                        key={i}
                        disabled={answered}
                        onClick={() => handleAnswer(opt)}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition
                            ${answered && chosenAnswer === opt
                                ? "bg-blue-500 text-white"
                                : answered
                                    ? "cursor-not-allowed bg-white/5 text-slate-500"
                                    : "bg-white/10 text-slate-200 hover:bg-blue-500/40 hover:text-white"
                            }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
            {!answered && (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCustomSubmit(); }}
                        placeholder="Autre réponse…"
                        className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button
                        onClick={handleCustomSubmit}
                        disabled={!custom.trim()}
                        className="rounded-xl bg-blue-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Envoyer
                    </button>
                </div>
            )}
            {answered && chosenAnswer && (
                <p className="mt-2 text-xs text-slate-400">
                    ✓ Répondu : <span className="text-blue-300">{chosenAnswer}</span>
                </p>
            )}
        </div>
    );
}
