import React from "react";

type ComposerActionsBarProps = {
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileSelect: React.ChangeEventHandler<HTMLInputElement>;
    onToggleSDFormatPicker: () => void;
    showSDFormatPicker: boolean;
    selectedSDFormat: string | null;
    isListening: boolean;
    onToggleMic: () => void;
    thinkingEnabled: boolean;
    onToggleThinking: () => void;
    deepThinkingEnabled: boolean;
    onToggleDeepThinking: () => void;
    pendingQueueCount: number;
    loading: boolean;
    streaming: boolean;
    onCancelGeneration: () => void;
    onSend: () => void;
    isIndexing: boolean;
    isContextReady: boolean;
};

export default function ComposerActionsBar({
    fileInputRef,
    handleFileSelect,
    onToggleSDFormatPicker,
    showSDFormatPicker,
    selectedSDFormat,
    isListening,
    onToggleMic,
    thinkingEnabled,
    onToggleThinking,
    deepThinkingEnabled,
    onToggleDeepThinking,
    pendingQueueCount,
    loading,
    streaming,
    onCancelGeneration,
    onSend,
    isIndexing,
    isContextReady,
}: ComposerActionsBarProps) {
    return (
        <div className="flex items-center gap-2">
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,text/*,.pdf,.json,.ts,.tsx,.js,.jsx,.py,.md,.csv,.xml,.yaml,.yml"
                className="hidden"
                onChange={handleFileSelect}
            />
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Joindre un fichier ou une image"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-slate-400 transition hover:border-blue-400/40 hover:text-blue-300"
            >
                📎
            </button>
            <button
                type="button"
                onClick={onToggleSDFormatPicker}
                title={showSDFormatPicker ? "Masquer le sélecteur de format image" : "Choisir le format d'image SD"}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition ${
                    showSDFormatPicker || selectedSDFormat
                        ? "border-indigo-400/60 bg-indigo-500/20 text-indigo-300"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-indigo-400/40 hover:text-indigo-300"
                }`}
            >
                🖼️
            </button>
            <button
                type="button"
                onClick={onToggleMic}
                title={isListening ? "Arrêter la dictée" : "Dicter un message"}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-lg transition ${
                    isListening
                        ? "animate-pulse border-red-400/50 bg-red-500/10 text-red-400"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-violet-400/40 hover:text-violet-300"
                }`}
            >
                🎤
            </button>
            <button
                type="button"
                onClick={onToggleThinking}
                title={thinkingEnabled ? "Désactiver le mode réflexion" : "Activer le mode réflexion"}
                className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition ${
                    thinkingEnabled
                        ? "border-amber-400/50 bg-amber-500/10 text-amber-300"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-slate-400/40"
                }`}
            >
                💭 {thinkingEnabled ? "Think" : "No Think"}
            </button>
            <button
                type="button"
                onClick={onToggleDeepThinking}
                title={deepThinkingEnabled ? "Désactiver la réflexion profonde" : "Activer la réflexion profonde"}
                className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition ${
                    deepThinkingEnabled
                        ? "border-purple-400/50 bg-purple-500/10 text-purple-300"
                        : "border-white/10 bg-white/5 text-slate-400 hover:border-slate-400/40"
                }`}
            >
                🧠 {deepThinkingEnabled ? "Deep" : "No Deep"}
            </button>
            <div className="flex-1" />
            {pendingQueueCount > 0 && (
                <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                    File d&apos;attente: {pendingQueueCount}
                </div>
            )}
            {(loading || streaming) && (
                <button
                    onClick={onCancelGeneration}
                    className="animate-pulse rounded-3xl bg-red-600/80 px-6 py-2.5 font-medium text-white transition hover:bg-red-500"
                    title="Arrêter la génération"
                >
                    ⏹ Stop
                </button>
            )}
            <button
                onClick={onSend}
                disabled={isIndexing || !isContextReady}
                className="rounded-3xl bg-blue-500 px-6 py-2.5 font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-400/70"
            >
                {isIndexing ? "⏳ Indexation…" : !isContextReady ? "⏳ Contexte…" : "Envoyer →"}
            </button>
        </div>
    );
}
