import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { LlamaMessage } from "./useLlama";

type ConversationLoaderOptions = {
    convRequest?: { key: number; id: number | null };
    resetMessages: (msgs?: LlamaMessage[]) => void;
    modelPath: string;
    onConversationReady?: (id: number) => void;
    onError?: (message: string) => void;
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
    onError,
}: ConversationLoaderOptions): ConversationLoaderResult {
    const [conversationId, setConversationId] = useState<number | null>(null);
    const [isLoadingConv, setIsLoadingConv] = useState(false);
    const [isResumingConv, setIsResumingConv] = useState(false);

    const [todoItems, setTodoItems] = useState<{ text: string; done: boolean }[]>([]);
    const [projectStructure, setProjectStructure] = useState("");
    const projectStructureRef = useRef("");

    const [planContent, setPlanContent] = useState("");
    const planRef = useRef("");

    const convTitleSetRef = useRef<boolean>(false);

    // Refs stables pour éviter les stale closures sans les mettre en dépendances de l'effet principal
    const resetMessagesRef = useRef(resetMessages);
    const modelPathRef = useRef(modelPath);
    const onConversationReadyRef = useRef(onConversationReady);
    const onErrorRef = useRef(onError);

    // Synchroniser les refs après chaque render (avant que l'effet principal puisse s'exécuter)
    useEffect(() => {
        projectStructureRef.current = projectStructure;
        planRef.current = planContent;
        resetMessagesRef.current = resetMessages;
        modelPathRef.current = modelPath;
        onConversationReadyRef.current = onConversationReady;
        onErrorRef.current = onError;
    });

    useEffect(() => {
        // Reset de l'état à chaque nouvelle requête de conversation — setState intentionnel dans useEffect
        /* eslint-disable react-hooks/set-state-in-effect */
        resetMessagesRef.current();
        setConversationId(null);
        setTodoItems([]);
        setProjectStructure("");
        setPlanContent("");
        /* eslint-enable react-hooks/set-state-in-effect */

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
                    resetMessagesRef.current(llamaMsgs);
                    setConversationId(requestedId);
                    convTitleSetRef.current = true;
                    if (llamaMsgs.length > 0) setIsResumingConv(true);
                    if (structure) setProjectStructure(structure);
                    if (plan) setPlanContent(plan);
                    onConversationReadyRef.current?.(requestedId);
                })
                .catch((e) =>
                    onErrorRef.current?.(`Impossible de charger la conversation : ${(e as Error)?.message ?? String(e)}`),
                )
                .finally(() => setIsLoadingConv(false));
        } else {
            invoke<number>("start_conversation", { modelName: modelPathRef.current || "inconnu" })
                .then((id) => {
                    setConversationId(id);
                    convTitleSetRef.current = false;
                    onConversationReadyRef.current?.(id);
                })
                .catch((e) =>
                    onErrorRef.current?.(`Impossible de démarrer la conversation : ${(e as Error)?.message ?? String(e)}`),
                );
        }
    }, [convRequest?.key, convRequest?.id]);

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
