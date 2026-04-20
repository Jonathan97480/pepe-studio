import type { MutableRefObject } from "react";
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
type CritiqueOutput = (output: string, toolName: string) => string;

type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
    onOpenTerminal?: () => void;
};

const terminalReadCursors: Map<string, number> = new Map();

function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

function stripAnsi(text: string): string {
    return text
        .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
        .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "")
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, "")
        .replace(/\x1b[=>]/g, "")
        .replace(/\r/g, "")
        .replace(/\x1b\[\d*[ABCDK]/g, "");
}

async function resolveInteractiveTerminalId(
    terminalId: string,
    cfg: Partial<LlamaLaunchConfig>,
    sendPrompt: SendPrompt,
): Promise<string | null> {
    if (terminalId.startsWith("term-")) return terminalId;

    try {
        const terminals = await invokeWithTimeout<{ id: string; name: string }[]>("list_terminals", {}, 5000);
        const match = terminals.find((terminal) => terminal.name === terminalId || terminal.id === terminalId);
        if (!match) {
            await sendPrompt(
                `[Erreur terminal_start_interactive] "${terminalId}" est un NOM, pas un ID.\n` +
                    `L'ID doit commencer par "term-" (ex: term-1776174852395).\n` +
                    `Terminaux disponibles :\n` +
                    terminals.map((terminal) => `  - "${terminal.id}" (nom: ${terminal.name})`).join("\n"),
                cfg,
            );
            return null;
        }
        return match.id;
    } catch {
        await sendPrompt(
            `[Erreur terminal_start_interactive] "${terminalId}" n'est pas un ID valide (doit commencer par "term-").\n` +
                `Utilise create_terminal pour créer un terminal et récupère son ID.`,
            cfg,
        );
        return null;
    }
}

export async function handleCreateTerminal(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenTerminal } = args;
    if (parsedTool.create_terminal === undefined) return false;

    onOpenTerminal?.();
    try {
        const info = await invokeWithTimeout<{ id: string; name: string; cwd: string }>(
            "create_terminal",
            { name: parsedTool.create_terminal || null, cwd: parsedTool.cwd ?? null },
            10000,
        );
        await sendPrompt(
            `[Terminal créé]\n` +
                `ID réel: "${info.id}"\n` +
                `Nom: "${info.name}" | Répertoire: ${info.cwd}\n\n` +
                `Tu dois utiliser l'ID "${info.id}" dans tous les appels suivants.\n` +
                `Commandes disponibles:\n` +
                `  - terminal_exec: commandes ponctuelles non interactives\n` +
                `  - terminal_start_interactive: SSH, REPL et autres processus interactifs\n` +
                `Exemple:\n` +
                `  <tool>{"terminal_start_interactive": "ssh user@host", "terminal_id": "${info.id}"}</tool>`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur create_terminal]: ${error}`, cfg);
    }

    return true;
}

export async function handleTerminalExec(
    args: SharedArgs & {
        critiqueOutput: CritiqueOutput;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenTerminal, critiqueOutput } = args;
    if (parsedTool.terminal_exec === undefined) return false;

    onOpenTerminal?.();
    const terminalId = String(parsedTool.terminal_id ?? "");
    if (!terminalId) {
        await sendPrompt(
            "[Erreur terminal_exec] Paramètre terminal_id manquant. Utilise list_terminals pour voir les IDs disponibles.",
            cfg,
        );
        return true;
    }

    try {
        const command = String(parsedTool.terminal_exec);
        const isLongRunning =
            /^(npx\s+create-|yarn\s+create\s+|pnpm\s+create\s+|cargo\s+new\s+|dotnet\s+new\s+|ng\s+new\s+)/i.test(
                command.trim(),
            );
        const execTimeout = isLongRunning ? 300000 : 60000;
        const result = await invokeWithTimeout<{
            terminal_id: string;
            output: string;
            new_cwd: string;
        }>("terminal_exec", { terminalId, command }, execTimeout);
        await sendPrompt(
            `[Terminal "${terminalId}" | cwd: ${result.new_cwd}]\n\`\`\`\n${critiqueOutput(result.output, `terminal_exec:${terminalId}`)}\n\`\`\``,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur terminal_exec "${terminalId}"]: ${error}`, cfg);
    }

    return true;
}

export async function handleCloseTerminal(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.close_terminal === undefined) return false;

    try {
        const result = await invokeWithTimeout<string>(
            "close_terminal",
            { terminalId: String(parsedTool.close_terminal) },
            5000,
        );
        await sendPrompt(`[Terminal] ${result}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur close_terminal]: ${error}`, cfg);
    }

    return true;
}

export async function handleTerminalStartInteractive(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenTerminal } = args;
    if (parsedTool.terminal_start_interactive === undefined) return false;

    onOpenTerminal?.();
    const terminalId = String(parsedTool.terminal_id ?? "");
    if (!terminalId) {
        await sendPrompt(
            "[Erreur terminal_start_interactive] Paramètre terminal_id manquant.\n" +
                "Flux correct :\n" +
                "  1. create_terminal pour obtenir un terminal_id (format: term-XXXXXXXXXX)\n" +
                "  2. terminal_start_interactive avec cet ID exact",
            cfg,
        );
        return true;
    }

    const resolvedTerminalId = await resolveInteractiveTerminalId(terminalId, cfg, sendPrompt);
    if (!resolvedTerminalId) return true;

    parsedTool.terminal_id = resolvedTerminalId;
    terminalReadCursors.delete(resolvedTerminalId);

    try {
        const command = String(parsedTool.terminal_start_interactive);
        await invokeWithTimeout<void>(
            "terminal_start_interactive",
            { terminalId: resolvedTerminalId, command },
            8000,
        );
        await sendPrompt(
            `[Processus interactif démarré dans le terminal "${resolvedTerminalId}"]\n` +
                `Commande: ${command}\n` +
                `L'utilisateur peut saisir son mot de passe directement dans le terminal xterm.js.\n` +
                `Dès qu'il confirme être connecté, envoie les commandes avec terminal_send_stdin.\n` +
                `Exemple: <tool>{"terminal_send_stdin": "ls -la\\n", "terminal_id": "${resolvedTerminalId}"}</tool>`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur terminal_start_interactive "${resolvedTerminalId}"]: ${error}`, cfg);
    }

    return true;
}

export async function handleTerminalSendStdin(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, onOpenTerminal } = args;
    if (parsedTool.terminal_send_stdin === undefined) return false;

    onOpenTerminal?.();
    const terminalId = String(parsedTool.terminal_id ?? "");
    if (!terminalId) {
        await sendPrompt(
            "[Erreur terminal_send_stdin] Paramètre terminal_id manquant.\nUtilise list_terminals pour obtenir l'ID du terminal actif.",
            cfg,
        );
        return true;
    }

    const input = String(parsedTool.terminal_send_stdin);
    let cursorBefore = terminalReadCursors.get(terminalId) ?? 0;

    try {
        const historyBefore = await invokeWithTimeout<{ output: string }[]>(
            "get_terminal_history",
            { terminalId },
            5000,
        );
        const liveBefore = historyBefore[historyBefore.length - 1]?.output ?? "";
        cursorBefore = stripAnsi(liveBefore).length;
    } catch {
        // fallback to the last remembered cursor
    }

    try {
        await invokeWithTimeout<void>("terminal_send_stdin", { terminalId, input }, 5000);
        await new Promise((resolve) => setTimeout(resolve, 2500));

        const historyAfter = await invokeWithTimeout<{ command: string; output: string }[]>(
            "get_terminal_history",
            { terminalId },
            5000,
        );
        const rawOutput = historyAfter[historyAfter.length - 1]?.output ?? "";
        const cleanOutput = stripAnsi(rawOutput);
        const newOutput = cleanOutput.slice(cursorBefore).trimStart();
        terminalReadCursors.set(terminalId, cleanOutput.length);

        const snippet =
            newOutput.length > 6000
                ? `${newOutput.slice(0, 6000)}\n...[tronqué - ${newOutput.length} chars au total]`
                : newOutput;

        if (snippet.trim()) {
            await sendPrompt(
                `[Sortie du terminal "${terminalId}" - commande: ${JSON.stringify(input.trim())}]\n\`\`\`\n${snippet}\n\`\`\``,
                cfg,
            );
        } else {
            await sendPrompt(
                `[Terminal "${terminalId}"] Commande envoyée (${JSON.stringify(input.trim())}), aucune sortie reçue en 2.5 s.\n` +
                    `La commande est peut-être encore en cours; tu peux renvoyer terminal_send_stdin avec une commande vide ("\\n") pour rafraîchir.`,
                cfg,
            );
        }
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur terminal_send_stdin "${terminalId}"]: ${error}`, cfg);
    }

    return true;
}
