import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Attachment } from "../hooks/useLlama";
import type { LlamaLaunchConfig } from "./llamaWrapper";
import { invokeWithTimeout } from "./chatUtils";

type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

type ToolRecord = Record<string, unknown>;

type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
};

export async function handleSetTodo(
    args: SharedArgs & {
        setTodoItems: Dispatch<SetStateAction<{ text: string; done: boolean }[]>>;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, setTodoItems } = args;
    if (parsedTool.set_todo === undefined) return false;

    try {
        let items: string[] = [];
        const raw = parsedTool.set_todo;
        if (Array.isArray(raw)) {
            items = raw.map(String);
        } else if (typeof raw === "string") {
            try {
                const parsed = JSON.parse(raw);
                items = Array.isArray(parsed) ? parsed.map(String) : [raw];
            } catch {
                items = [raw];
            }
        }

        if (items.length === 0) {
            setTodoItems([]);
            await sendPrompt(`[Todo] Liste vidée.`, cfg);
        } else {
            setTodoItems(items.map((text) => ({ text, done: false })));
            await sendPrompt(
                `[Todo] Liste créée avec ${items.length} tâche(s) :\n${items
                    .map((item, index) => `  ${index + 1}. ${item}`)
                    .join("\n")}\nMarque chaque tâche terminée avec check_todo quand tu l'as accomplie.`,
                cfg,
            );
        }
    } catch (error) {
        lastToolWasErrorRef.current = true;
        await sendPrompt(`[Erreur set_todo]: ${error}`, cfg);
    }

    return true;
}

export async function handleCheckTodo(
    args: SharedArgs & {
        setTodoItems: Dispatch<SetStateAction<{ text: string; done: boolean }[]>>;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, setTodoItems } = args;
    if (parsedTool.check_todo === undefined) return false;

    const value = parsedTool.check_todo;
    setTodoItems((previous) => {
        if (String(value).toLowerCase() === "all") {
            return previous.map((todo) => ({ ...todo, done: true }));
        }

        const index = Number(value);
        return previous.map((todo, todoIndex) => (todoIndex === index ? { ...todo, done: true } : todo));
    });
    await sendPrompt(
        `[Todo] Tâche ${String(value) === "all" ? "toutes" : `n°${Number(value) + 1}`} marquée(s) ✓. CONTINUE IMMÉDIATEMENT avec la prochaine tâche sans attendre de confirmation utilisateur.`,
        cfg,
    );
    return true;
}

export async function handleSaveProjectStructure(
    args: SharedArgs & {
        conversationId: number | null;
        setProjectStructure: Dispatch<SetStateAction<string>>;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, conversationId, setProjectStructure } = args;
    if (parsedTool.save_project_structure === undefined) return false;

    const structure = String(parsedTool.save_project_structure);
    setProjectStructure(structure);
    if (conversationId) {
        invokeWithTimeout("save_project_structure", { conversationId, structure }, 5000).catch(() => {});
    }
    await sendPrompt(
        `[Structure projet sauvegardée] La structure est mémorisée pour cette conversation et sera rechargée à la prochaine reprise.`,
        cfg,
    );
    return true;
}

export async function handleGetProjectStructure(
    args: SharedArgs & {
        projectStructureRef: MutableRefObject<string>;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, projectStructureRef } = args;
    if (parsedTool.get_project_structure === undefined) return false;

    const current = projectStructureRef.current;
    if (current.trim()) {
        await sendPrompt(`[Structure du projet mémorisée]\n\`\`\`\n${current}\n\`\`\``, cfg);
    } else {
        await sendPrompt(
            `[Structure du projet] Aucune structure mémorisée pour cette conversation. Utilise save_project_structure pour en enregistrer une.`,
            cfg,
        );
    }
    return true;
}

export async function handleGetPlan(
    args: SharedArgs & {
        conversationId: number | null;
        planRef: MutableRefObject<string>;
        setPlanContent: Dispatch<SetStateAction<string>>;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, conversationId, planRef, setPlanContent } = args;
    if (parsedTool.get_plan === undefined) return false;

    try {
        let content = planRef.current;
        if (!content && conversationId) {
            content = await invokeWithTimeout<string>("get_conversation_plan", { conversationId }, 5000);
            if (content) setPlanContent(content);
        }
        if (!content) {
            await sendPrompt(`[PLAN.md] Aucun plan pour cette conversation. Crée-en un avec save_plan.`, cfg);
        } else {
            const firstLine = content.split("\n")[0] ?? "";
            await sendPrompt(
                `[PLAN.md — Plan actuel (titre : ${firstLine})]\n\`\`\`markdown\n${content}\n\`\`\``,
                cfg,
            );
        }
    } catch (error) {
        lastToolWasErrorRef.current = true;
        await sendPrompt(`[Erreur get_plan]: ${error}`, cfg);
    }

    return true;
}

export async function handleGetTerminalHistory(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.get_terminal_history === undefined) return false;

    try {
        const terminalId = String(parsedTool.get_terminal_history);
        const entries = await invokeWithTimeout<{ command: string; output: string; timestamp: string }[]>(
            "get_terminal_history",
            { terminalId },
            5000,
        );
        if (entries.length === 0) {
            await sendPrompt(`[Historique terminal] Aucune commande exécutée dans ce terminal.`, cfg);
        } else {
            const lines = entries
                .map(
                    (entry, index) =>
                        `[${index + 1}] ${entry.timestamp}\n$ ${entry.command}\n${entry.output.slice(0, 500)}${
                            entry.output.length > 500 ? "\n...(tronqué)" : ""
                        }`,
                )
                .join("\n\n");
            await sendPrompt(`[Historique terminal \`${terminalId}\`]\n${lines}`, cfg);
        }
    } catch (error) {
        lastToolWasErrorRef.current = true;
        await sendPrompt(`[Erreur get_terminal_history]: ${error}`, cfg);
    }

    return true;
}

export async function handleGetDevServerInfo(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.get_dev_server_info === undefined) return false;

    try {
        const info = await invokeWithTimeout<Record<string, string>>("get_dev_server_info", {}, 5000);
        const status = info.running === "true" ? "🟢 Actif" : "🔴 Arrêté";
        await sendPrompt(
            `[Serveur dev] Statut : ${status}\nPort : ${info.port || "(aucun)"}\nDossier : ${info.base_dir || "(aucun)"}`,
            cfg,
        );
    } catch (error) {
        lastToolWasErrorRef.current = true;
        await sendPrompt(`[Erreur get_dev_server_info]: ${error}`, cfg);
    }

    return true;
}

export async function handleListTerminals(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.list_terminals === undefined) return false;

    try {
        const list = await invokeWithTimeout<{ id: string; name: string; cwd: string; entry_count: number }[]>(
            "list_terminals",
            {},
            5000,
        );
        if (list.length === 0) {
            await sendPrompt("[Terminaux] Aucun terminal ouvert. Crée-en un avec create_terminal.", cfg);
        } else {
            const lines = list
                .map(
                    (terminal) =>
                        `  - ${terminal.id}  "${terminal.name}"  |  ${terminal.cwd}  (${terminal.entry_count} cmd${
                            terminal.entry_count !== 1 ? "s" : ""
                        })`,
                )
                .join("\n");
            await sendPrompt(`[Terminaux ouverts]\n${lines}`, cfg);
        }
    } catch (error) {
        lastToolWasErrorRef.current = true;
        await sendPrompt(`[Erreur list_terminals]: ${error}`, cfg);
    }

    return true;
}
