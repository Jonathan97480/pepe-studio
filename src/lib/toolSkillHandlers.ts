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

type SharedArgs = {
    cfg: Partial<LlamaLaunchConfig>;
    parsedTool: ToolRecord;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
};

type CritiqueOutput = (output: string, toolName: string) => string;
type BuildMachineContext = () => Promise<void>;

function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

function getSkillTypeLabel(skillType: unknown): string {
    switch (skillType) {
        case "http":
            return "HTTP";
        case "python":
            return "Python";
        case "nodejs":
            return "Node.js";
        case "composite":
            return "Composite";
        default:
            return "PS1";
    }
}

export async function handleCreateSkill(
    args: SharedArgs & {
        buildMachineContext: BuildMachineContext;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, buildMachineContext } = args;
    if (!parsedTool.create_skill) return false;

    try {
        const name = String(parsedTool.create_skill);
        const result = await invokeWithTimeout<string>(
            "create_skill",
            {
                name,
                description: parsedTool.description ?? "",
                content: parsedTool.content ?? "",
                skillType: parsedTool.skill_type ?? null,
                method: parsedTool.method ?? null,
                url: parsedTool.url ?? null,
                headersTemplate: parsedTool.headers ?? null,
                defaultBody: parsedTool.default_body ?? null,
                baseUrl: parsedTool.base_url ?? null,
                routes: parsedTool.routes ?? null,
            },
            20000,
        );
        await buildMachineContext();
        await sendPrompt(
            `[Skill ${getSkillTypeLabel(parsedTool.skill_type)} créé avec succès] "${name}" est sauvegardé et prêt.\n${result}\n\n` +
                `Tu peux maintenant :\n` +
                `  - Le tester avec \`run_skill\`\n` +
                `  - Ou répondre à l'utilisateur que le skill est disponible\n` +
                `Ne recrée pas ce skill: il est déjà sauvegardé dans le fichier.`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur création skill]: ${error}`, cfg);
    }

    return true;
}

export async function handleRunSkill(
    args: SharedArgs & {
        critiqueOutput: CritiqueOutput;
    },
): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    if (!parsedTool.run_skill) return false;

    try {
        const name = String(parsedTool.run_skill);
        const output = await invokeWithTimeout<string>("run_skill", { name, args: parsedTool.args ?? null }, 60000);
        await sendPrompt(
            `[Résultat du skill \`${name}\`]\n\`\`\`\n${critiqueOutput(output, `run_skill:${name}`)}\n\`\`\``,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(
            `[Erreur d'exécution du skill \`${String(parsedTool.run_skill)}\`]\n\`\`\`\n${error}\n\`\`\`\n\n` +
                `Pour corriger le skill, utilise create_skill avec le même nom et le contenu corrigé.`,
            cfg,
        );
    }

    return true;
}

export async function handleReadSkill(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.read_skill === undefined) return false;

    try {
        const name = String(parsedTool.read_skill);
        const content = await invokeWithTimeout<string>("read_skill", { name }, 10000);
        await sendPrompt(
            `[Contenu du skill \`${name}\`]\n\`\`\`\n${content}\n\`\`\`\n\nAnalyse ce contenu et applique les corrections nécessaires avec create_skill.`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur read_skill]: ${error}`, cfg);
    }

    return true;
}

export async function handlePatchSkill(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.patch_skill === undefined) return false;

    try {
        const message = await invokeWithTimeout<string>(
            "patch_skill",
            {
                name: String(parsedTool.patch_skill),
                search: String(parsedTool.search ?? ""),
                replace: String(parsedTool.replace ?? ""),
            },
            10000,
        );
        await sendPrompt(`[patch_skill OK] ${message}`, cfg);
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur patch_skill]: ${error}`, cfg);
    }

    return true;
}
