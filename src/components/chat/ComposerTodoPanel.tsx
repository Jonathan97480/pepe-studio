import React from "react";

type TodoItem = { text: string; done: boolean };

type ComposerTodoPanelProps = {
    todoItems: TodoItem[];
    todoCollapsed: boolean;
    onToggleTodoCollapsed: () => void;
    onClearTodoItems: () => void;
};

export default function ComposerTodoPanel({
    todoItems,
    todoCollapsed,
    onToggleTodoCollapsed,
    onClearTodoItems,
}: ComposerTodoPanelProps) {
    if (todoItems.length === 0) return null;

    return (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-violet-400">
                    ✅ Tâches en cours ({todoItems.filter((item) => item.done).length}/{todoItems.length})
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleTodoCollapsed}
                        className="text-xs text-slate-500 transition-colors hover:text-slate-300"
                    >
                        {todoCollapsed ? "▼ Afficher" : "▲ Réduire"}
                    </button>
                    <button
                        onClick={onClearTodoItems}
                        className="text-xs text-slate-600 transition-colors hover:text-red-400"
                        title="Fermer la todo list"
                    >
                        ✕
                    </button>
                </div>
            </div>
            {!todoCollapsed && (
                <ul className="flex flex-col gap-1.5">
                    {todoItems.map((item, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                            <span className={item.done ? "mt-0.5 text-emerald-400" : "mt-0.5 text-slate-500"}>
                                {item.done ? "✓" : "○"}
                            </span>
                            <span className={item.done ? "line-through text-slate-500" : "text-slate-200"}>
                                {item.text}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
