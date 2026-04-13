// src/lib/context/manager.ts
// Context Manager pour sliding window + summarization

export type Message = {
    role: "user" | "assistant" | "system";
    content: string;
    tokens: number;
};

export type Summarizer = (messages: Message[]) => Promise<string>;

export class ContextManager {
    private messages: Message[] = [];
    private maxTokens: number;
    private summarizer: Summarizer;
    private summary: string | null = null;
    private summaryRatio: number;

    constructor(maxTokens: number, summarizer: Summarizer, summaryRatio = 0.7) {
        this.maxTokens = maxTokens;
        this.summarizer = summarizer;
        this.summaryRatio = summaryRatio;
    }

    addMessage(msg: Message) {
        this.messages.push(msg);
        this.trimContext();
    }

    getContext(): Message[] {
        if (this.summary) {
            return [
                { role: "system", content: this.summary, tokens: this.countTokens(this.summary) },
                ...this.messages
            ];
        }
        return [...this.messages];
    }

    async trimContext() {
        let total = this.messages.reduce((sum, m) => sum + m.tokens, 0);
        if (total > this.maxTokens * this.summaryRatio) {
            // Résumer les anciens messages
            const toSummarize = this.messages.splice(0, Math.floor(this.messages.length / 2));
            this.summary = await this.summarizer(toSummarize);
        }
    }

    countTokens(text: string): number {
        // À remplacer par un vrai tokenizer (tiktoken, gpt-tokenizer...)
        return Math.ceil(text.split(/\s+/).length / 0.75);
    }
}
