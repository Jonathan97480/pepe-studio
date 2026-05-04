import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { LlamaMessage } from "./useLlama";

type ConversationLoaderOptions = {
    convRequest?: { key: number; id: number | null };
    resetMessages: (msgs?: LlamaMessage[]) => void;
    modelPath: string;
    onConversationReady?: (id: number) => void;
};

type ConversationLoaderResult = {
    conversationId: number | null;
    setConversationId: React.Dispatch<React.SetStateAction<number | null>>;
    isLoadingConv: boolean;
    isResumingConv: boolean;
    setIsResumingConv: React.Dispatch<React.SetStateAction<boolean>>;
    convTitleSetRef: React.MutableRefObject<boolean>;
    todoItems: { text: string; done: boolean }[];
    setTodoItems: React.Dispatch<React.SetStateAction<{ text: string; done: boolean }[]>>;
    projectStructure: string;
    setProjectStructure: React.Dispatch<React.SetStateAction<string>>;
    projectStructureRef: React.MutableRefObject<string>;
    planContent: string;
    setPlanContent: React.Dispatch<React.SetStateAction<string>>;
    planRef: React.MutableRefObject<string>;
};

export function useConversationLoader({
    convRequest,
    resetMessages,
    modelPath,
    onConversationReady,
}: ConversationLoaderOptions): ConversationLoaderResult {
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [isLoadingConv, setIsLoadingConv] = useState(false);
    const [isResumingConv, setIsResumingConv] = useState(false);

    const [todoItems, setTodoItems] = useState<{ text: string; done: boolean }[]>([]);
    const [projectStructure, setProjectStructure] = useState("");
    const projectStructureRef = useRef("");
    projectStructureRef.current = projectStructure;

    const [planContent, setPlanContent] = useState("");
    const planRef = useRef("");
    planRef.current = planContent;

    const convTitleSetRef = useRef<boolean>(false);

    useEffect(() => {
        resetMessages();
        setConversationId(null);
        setTodoItems([]);
        setProjectStructure("");
        setPlanContent("");

        const requestedId = convRequest?.id ?? null;
        if (requestedId !== null) {
            setIsLoadingConv(true);
            Promise.all([
                invoke<
                    {
                        role: string;
                        content: string;
                        imagePath?: string | null;
                        displayOnly?: boolean;
                    }[]
                >("load_conversation_messages", {
                    conversationId: requestedId,
                }),
                invoke<string>("get_project_structure", { conversationId: requestedId }).catch(() => ""),
                invoke<string>("get_conversation_plan", { conversationId: requestedId }).catch(() => ""),
            ])
                .then(async ([msgs, structure, plan]) => {
                    const llamaMsgs: LlamaMessage[] = await Promise.all(
                        msgs.map(async (m) => {
                            let imageDataUrl: string | undefined;
                            if (m.imagePath) {
                                try {
                                    const image = await invoke<{ data_url: string }>("read_image", {
                                        path: m.imagePath,
                                    });
                                    imageDataUrl = image.data_url;
                                } catch {
                                    imageDataUrl = undefined;
                                }
                            }
                            return {
                                role: m.role as "user" | "assistant" | "system",
                                content: m.content,
                                displayOnly: m.displayOnly ?? false,
                                imagePath: m.imagePath ?? undefined,
                                imageDataUrl,
                            };
                        }),
                    );
                    resetMessages(llamaMsgs);
                    setConversationId(requestedId);
                    convTitleSetRef.current = true;
                    if (llamaMsgs.length > 0) setIsResumingConv(true);
                    if (structure) setProjectStructure(structure);
                    if (plan) setPlanContent(plan);
                    onConversationReady?.(requestedId);
                })
                .catch(() => {})
                .finally(() => setIsLoadingConv(false));
        } else {
            invoke<number>("start_conversation", { modelName: modelPath || "inconnu" })
                .then((id) => {
                    setConversationId(id);
                    convTitleSetRef.current = false;
                    onConversationReady?.(id);
                })
                .catch(() => {});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convRequest?.key]);

    return {
        conversationId,
        setConversationId,
        isLoadingConv,
        isResumingConv,
        setIsResumingConv,
        convTitleSetRef,
        todoItems,
        setTodoItems,
        projectStructure,
        setProjectStructure,
        projectStructureRef,
        planContent,
        setPlanContent,
        planRef,
    };
}
