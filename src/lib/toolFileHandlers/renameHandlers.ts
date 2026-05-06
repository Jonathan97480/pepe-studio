import { invokeWithTimeout } from "../chatUtils";
import { markError, type RenameEntry, type RenameResult, type SharedArgs } from "./types";

export async function handleBatchRename(args: SharedArgs): Promise<boolean> {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.batch_rename) return false;

    try {
        let entries: RenameEntry[];
        if (Array.isArray(parsedTool.batch_rename)) {
            entries = parsedTool.batch_rename
                .filter((entry): entry is RenameEntry => {
                    if (typeof entry !== "object" || entry === null) return false;
                    return "from" in entry && "to" in entry;
                })
                .map((entry) => ({ from: String(entry.from), to: String(entry.to) }));
        } else {
            try {
                const parsed = JSON.parse(String(parsedTool.batch_rename));
                entries = Array.isArray(parsed)
                    ? parsed
                          .filter((entry): entry is RenameEntry => {
                              if (typeof entry !== "object" || entry === null) return false;
                              return "from" in entry && "to" in entry;
                          })
                          .map((entry) => ({ from: String(entry.from), to: String(entry.to) }))
                    : [];
            } catch {
                markError(lastToolWasErrorRef);
                await sendPrompt(
                    '[Erreur batch_rename] JSON invalide. Format attendu : [{"from": "chemin/ancien.pdf", "to": "nouveau.pdf"}, ...]\nLes guillemets internes doivent être échappés avec \\\\.',
                    cfg,
                );
                return true;
            }
        }

        const results = await invokeWithTimeout<RenameResult[]>("batch_rename_files", { renames: entries }, 30000);
        const successCount = results.filter((result) => result.success).length;
        const lines = results.map((result) =>
            result.success
                ? `  ✓ ${result.from.split("/").pop()} -> ${result.to.split("/").pop()}`
                : `  ✗ ${result.from.split("/").pop()} : ${result.error}`,
        );
        await sendPrompt(
            `[batch_rename] ${successCount}/${results.length} fichiers renommés avec succès.\n${lines.join("\n")}`,
            cfg,
        );
    } catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur batch_rename]: ${error}`, cfg);
    }

    return true;
}
