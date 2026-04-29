"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSearchConversation = handleSearchConversation;
exports.handleGetHardwareInfo = handleGetHardwareInfo;
exports.handleSavePlan = handleSavePlan;
exports.handleWriteFile = handleWriteFile;
exports.handleSaveFact = handleSaveFact;
exports.handlePatchFileJson = handlePatchFileJson;
exports.handleRunCommand = handleRunCommand;
exports.handleUnknownTool = handleUnknownTool;
exports.collectRemainingWriteFiles = collectRemainingWriteFiles;
exports.runWriteFileBatch = runWriteFileBatch;
const chatUtils_1 = require("./chatUtils");
function markError(lastToolWasErrorRef) {
    lastToolWasErrorRef.current = true;
}
function decodeEscapedContent(rawContent) {
    return String(rawContent ?? "")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r");
}
async function handleSearchConversation(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.search_conversation === undefined)
        return false;
    try {
        const query = String(parsedTool.search_conversation);
        const results = await (0, chatUtils_1.invokeWithTimeout)("search_conversation_messages", { query }, 20000);
        if (results.length === 0) {
            await sendPrompt(`[Mémoire] Aucun message trouvé pour : "${query}"`, cfg);
        }
        else {
            const groups = new Map();
            for (const result of results) {
                if (!groups.has(result.conversation_id)) {
                    groups.set(result.conversation_id, { dayLabel: result.day_label, messages: [] });
                }
                groups.get(result.conversation_id)?.messages.push({ role: result.role, content: result.content });
            }
            const parts = [];
            for (const [id, group] of groups) {
                parts.push(`\n---- Conv #${id} - ${group.dayLabel} ----`);
                for (const message of group.messages) {
                    parts.push(`${message.role === "user" ? "U" : "A"} ${message.content}`);
                }
            }
            await sendPrompt(`[Mémoire - "${query}"]${parts.join("\n")}`, cfg);
        }
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur mémoire]: ${error}`, cfg);
    }
    return true;
}
async function handleGetHardwareInfo(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.get_hardware_info === undefined)
        return false;
    try {
        const hw = await (0, chatUtils_1.invokeWithTimeout)("get_hardware_info", {}, 10000);
        const gpu = hw.has_dedicated_gpu
            ? `${hw.gpu_name} (${hw.gpu_vram_gb.toFixed(1)} Go VRAM)`
            : "GPU intégré / non détecté";
        await sendPrompt(`[Résultat outil: get_hardware_info]
Réponds maintenant à l'utilisateur en utilisant UNIQUEMENT les données ci-dessous.
N'ajoute aucun GPU, aucune RAM, aucun CPU ou aucune capacité qui n'apparaît pas dans ce résultat.
Ne te présente pas. Ne décris pas tes capacités. Ne reformule pas en liste inventée.

RAM: ${hw.total_ram_gb.toFixed(1)} Go
CPU threads: ${hw.cpu_threads}
GPU détecté: ${gpu}`, cfg);
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur get_hardware_info]: ${error}`, cfg);
    }
    return true;
}
async function handleSavePlan(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, conversationId, setPlanContent } = args;
    if (parsedTool.save_plan === undefined)
        return false;
    try {
        const content = String(parsedTool.save_plan);
        if (!conversationId) {
            await sendPrompt(`[Erreur save_plan] Aucune conversation active.`, cfg);
            return true;
        }
        await (0, chatUtils_1.invokeWithTimeout)("save_conversation_plan", { conversationId, content }, 5000);
        setPlanContent(content);
        await sendPrompt(`[PLAN.md] Plan sauvegardé pour cette conversation.`, cfg);
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur save_plan]: ${error}`, cfg);
    }
    return true;
}
async function handleWriteFile(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (!parsedTool.write_file)
        return false;
    try {
        const result = await (0, chatUtils_1.invokeWithTimeout)("write_file", { path: parsedTool.write_file, content: decodeEscapedContent(parsedTool.content) }, 20000);
        await sendPrompt(`[Fichier écrit] ${result}\nPROCHAINE ACTION OBLIGATOIRE : si d'autres fichiers restent à écrire, appelle write_file immédiatement. Sinon, appelle start_dev_server sur le dossier du projet. Ne génère pas de texte d'explication entre deux outils.`, cfg);
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur écriture fichier]: ${error}`, cfg);
    }
    return true;
}
async function handleSaveFact(args) {
    const { parsedTool, cfg, sendPrompt } = args;
    if (parsedTool.save_fact === undefined)
        return false;
    try {
        const key = String(parsedTool.save_fact);
        const value = String(parsedTool.value ?? "");
        if (key && value) {
            await (0, chatUtils_1.invokeWithTimeout)("save_user_fact", { key, value }, 5000).catch(() => { });
        }
    }
    catch {
        // silent on purpose
    }
    await sendPrompt(`[Fait mémorisé] Poursuis ta réponse là où tu t'es arrêté, sans répéter ce que tu as déjà dit.`, cfg);
    return true;
}
async function handlePatchFileJson(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef } = args;
    if (parsedTool.patch_file === undefined)
        return false;
    const filePath = String(parsedTool.patch_file);
    const search = String(parsedTool.SEARCH ?? parsedTool.search ?? "");
    const replace = String(parsedTool.REPLACE ?? parsedTool.replace ?? "");
    if (!search) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur patch_file] Paramètre SEARCH manquant.\nRAPPEL : utilise le format TAG <patch_file> et jamais le format JSON pour patch_file :\n<patch_file path="${filePath}">SEARCH:\n<texte exact à trouver>\nREPLACE:\n<nouveau texte>\n</patch_file>`, cfg);
        return true;
    }
    try {
        const result = await (0, chatUtils_1.invokeWithTimeout)("patch_file", { path: filePath, search, replace }, 20000);
        await sendPrompt(`[patch_file] ${result}\nRAPPEL : utilise le format TAG <patch_file path="..."> à l'avenir, pas le format JSON.`, cfg);
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur patch_file sur "${filePath}"]: ${error}\nRAPPEL : le format correct est le TAG <patch_file path="${filePath}">SEARCH:\n...\nREPLACE:\n...</patch_file>`, cfg);
    }
    return true;
}
async function handleRunCommand(args) {
    const { parsedTool, cfg, sendPrompt, lastToolWasErrorRef, critiqueOutput } = args;
    const command = String(parsedTool.cmd ?? parsedTool.command ?? "");
    if (!command.trim())
        return false;
    try {
        const output = await (0, chatUtils_1.invokeWithTimeout)("run_shell_command", { command }, 60000);
        await sendPrompt(`[Résultat de la commande \`${command}\`]\n\`\`\`\n${critiqueOutput(output, `cmd:${command}`)}\n\`\`\``, cfg);
    }
    catch (error) {
        markError(lastToolWasErrorRef);
        await sendPrompt(`[Erreur commande \`${command}\`]: ${error}`, cfg);
    }
    return true;
}
async function handleUnknownTool(args) {
    const { parsedTool, cfg, sendPrompt } = args;
    const knownKeys = Object.keys(parsedTool).join(", ");
    if (parsedTool.images !== undefined) {
        await sendPrompt(`[Système] La clé \`images\` n'est pas un outil. C'est une catégorie.\nUtilise une vraie clé d'outil, par exemple :\n<tool>{"generate_image":"un chat roux mignon"}</tool>\nou\n<tool>{"list_sd_models":true}</tool>`, cfg);
        return;
    }
    await sendPrompt(`[Système] Outil inconnu ou clé non reconnue : { ${knownKeys} }.\nVérifie le nom de l'outil avec get_tool_doc ou consulte la liste des outils disponibles.`, cfg);
}
function collectRemainingWriteFiles(allToolMatches) {
    return allToolMatches.slice(1).reduce((acc, match) => {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.write_file)
                acc.push(parsed);
        }
        catch {
            // ignore
        }
        return acc;
    }, []);
}
async function runWriteFileBatch(files, config, sendPrompt) {
    const results = [];
    for (const fileTool of files) {
        try {
            const result = await (0, chatUtils_1.invokeWithTimeout)("write_file", { path: fileTool.write_file, content: decodeEscapedContent(fileTool.content) }, 20000);
            results.push(`✓ ${result}`);
        }
        catch (error) {
            results.push(`✗ ${fileTool.write_file} : ${error}`);
        }
    }
    await sendPrompt(`[Fichiers écrits en batch]\n${results.join("\n")}\nPROCHAINE ACTION OBLIGATOIRE : appelle start_dev_server sur le dossier du projet.`, config);
}
