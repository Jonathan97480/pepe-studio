import type { MutableRefObject } from "react";
import type { Attachment } from "../hooks/useLlama";
import { invokeWithTimeout } from "./chatUtils";
import type { LlamaLaunchConfig } from "./llamaWrapper";
import { extractPatchFileTags, extractWriteFileTags } from "./toolParsing";

type SendPrompt = (
    prompt: string,
    config: Partial<LlamaLaunchConfig>,
    attachments?: Attachment[],
    save?: boolean,
) => Promise<unknown>;

type PatchTagArgs = {
    normalizedContent: string;
    cfg: Partial<LlamaLaunchConfig>;
    sendPrompt: SendPrompt;
    lastToolWasErrorRef: MutableRefObject<boolean>;
};

function markError(lastToolWasErrorRef: MutableRefObject<boolean>) {
    lastToolWasErrorRef.current = true;
}

export async function handlePatchFileTags(args: PatchTagArgs): Promise<boolean> {
    const { normalizedContent, cfg, sendPrompt, lastToolWasErrorRef } = args;
    const tags = extractPatchFileTags(normalizedContent);
    if (tags.length === 0) return false;

    const results: string[] = [];
    for (const tag of tags) {
        if (!tag.search || tag.replace === undefined) {
            markError(lastToolWasErrorRef);
            const missingPart = !tag.search ? "SEARCH" : "REPLACE";
            results.push(
                `✗ ${tag.path} : bloc ${missingPart} manquant dans <patch_file>.\n` +
                    `Format obligatoire :\n` +
                    `<patch_file path="${tag.path}">\n` +
                    `SEARCH:\ntexte exact à trouver\n` +
                    `REPLACE:\nnouveau texte\n` +
                    `</patch_file>`,
            );
            continue;
        }

        try {
            const result = await invokeWithTimeout<string>(
                "patch_file",
                { path: tag.path, search: tag.search, replace: tag.replace },
                20000,
            );
            results.push(`✓ ${result}`);
        } catch (error) {
            markError(lastToolWasErrorRef);
            results.push(`✗ ${tag.path} : ${error}`);
        }
    }

    const allOk = results.every((result) => result.startsWith("✓"));
    if (!allOk) markError(lastToolWasErrorRef);
    await sendPrompt(
        `[Résultats patch_file]\n${results.join("\n")}\n` +
            (allOk
                ? `Patch(es) appliqué(s) avec succès.`
                : `PATCH ÉCHOUÉ : lis le fichier avec read_file, corrige le SEARCH exact et relance patch_file. N'utilise pas write_file comme contournement.`),
        cfg,
    );
    return true;
}

export async function handleWriteFileTags(args: PatchTagArgs): Promise<boolean> {
    const { normalizedContent, cfg, sendPrompt, lastToolWasErrorRef } = args;
    const tags = extractWriteFileTags(normalizedContent);
    if (tags.length === 0) return false;

    const results: string[] = [];
    for (const tag of tags) {
        try {
            const result = await invokeWithTimeout<string>(
                "write_file",
                { path: tag.path, content: tag.content },
                20000,
            );
            results.push(`✓ ${result}`);
        } catch (error) {
            markError(lastToolWasErrorRef);
            results.push(`✗ ${tag.path} : ${error}`);
        }
    }

    await sendPrompt(
        `[Fichiers écrits]\n${results.join("\n")}\nPROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`,
        cfg,
    );
    return true;
}
