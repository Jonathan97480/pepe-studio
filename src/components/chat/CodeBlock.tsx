"use client";

import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

/** Composant code block avec coloration syntaxique et bouton copier */
const CodeBlock = ({
    inline,
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
    const [copied, setCopied] = useState(false);
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    const code = String(children).replace(/\n$/, "");

    if (inline || !match) {
        return (
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-sm font-mono text-amber-300" {...props}>
                {children}
            </code>
        );
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="relative my-3 rounded-xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between bg-slate-800/80 px-4 py-1.5 text-xs text-slate-400">
                <span className="font-mono">{lang || "code"}</span>
                <button
                    onClick={handleCopy}
                    className="rounded px-2 py-0.5 text-xs hover:bg-white/10 transition-colors"
                >
                    {copied ? "✓ Copié" : "Copier"}
                </button>
            </div>
            <SyntaxHighlighter
                language={lang}
                style={oneDark}
                customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.82rem", background: "#0f172a" }}
                showLineNumbers={code.split("\n").length > 4}
                wrapLongLines
            >
                {code}
            </SyntaxHighlighter>
        </div>
    );
};

export const markdownComponents = { code: CodeBlock };
export default CodeBlock;
