import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { markdownComponents } from "./CodeBlock";

type MessageMarkdownProps = {
    content: string;
    className?: string;
};

export default function MessageMarkdown({ content, className }: MessageMarkdownProps) {
    return (
        <div
            className={`mt-2 text-base leading-7 break-words prose prose-invert max-w-none prose-p:my-1 prose-li:my-0 prose-headings:my-2 prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-white/20 prose-td:px-3 prose-td:py-1.5 ${className ?? ""}`}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
