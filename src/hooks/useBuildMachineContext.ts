import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { loadBuiltinDisabled } from "../lib/builtinTools";
import { buildCompactToolCatalog } from "../lib/toolDispatchUtils";
import { formatGpuString, type HardwareInfo } from "./useHardwareInfo";
import { getToolGroupId } from "../lib/toolGroupResolver";
import type { ChatMode } from "../lib/chatUtils";

interface UseBuildMachineContextOptions {
    deepThinkingEnabled: boolean;
    isEnabled: (name: string) => boolean;
    chatModeRef: React.MutableRefObject<ChatMode>;
}

export function useBuildMachineContext({ deepThinkingEnabled, isEnabled, chatModeRef }: UseBuildMachineContextOptions) {
    const [machineContext, setMachineContext] = useState<string | null>(null);
    const [isContextReady, setIsContextReady] = useState(false);

    const buildMachineContext = useCallback(async () => {
        try {
            const hw = await invoke<HardwareInfo>("get_hardware_info");
            const os = navigator.platform ?? "inconnu";
            const gpu = formatGpuString(hw);

            let skillsList = "";
            try {
                const skills = await invoke<{ name: string; description: string }[]>("list_skills");
                const activeSkills = skills.filter((s) => isEnabled(s.name));
                if (activeSkills.length > 0) {
                    skillsList =
                        "\nSkills disponibles:\n" +
                        activeSkills.map((s) => `  - ${s.name}: ${s.description}`).join("\n");
                }
            } catch {
                /* pas de skills encore */
            }

            let memorySummary = "";
            try {
                memorySummary = await invoke<string>("get_conversations_summary");
            } catch {
                /* pas de conversations encore */
            }

            let userProfile = "";
            try {
                const facts = await invoke<{ key: string; value: string }[]>("get_user_facts");
                if (facts.length > 0) {
                    userProfile = "\n[Profil utilisateur]\n" + facts.map((f) => `  ${f.key}: ${f.value}`).join("\n");
                }
            } catch {
                /* silencieux */
            }

            const builtinDisabled = loadBuiltinDisabled();
            const toolOn = (id: string) => !builtinDisabled.has(id);
            const enabledToolIds = new Set<string>();
            for (const id of [
                "cmd",
                "get_hardware_info",
                "create_terminal",
                "terminal_exec",
                "terminal_start_interactive",
                "terminal_send_stdin",
                "close_terminal",
                "list_terminals",
                "get_terminal_history",
                "read_file",
                "analyze_folder",
                "list_folder_files",
                "write_file",
                "patch_file",
                "read_image",
                "read_image_batch",
                "list_folder_images",
                "read_pdf",
                "read_pdf_brief",
                "read_pdf_batch",
                "list_folder_pdfs",
                "batch_rename",
                "create_skill",
                "run_skill",
                "read_skill",
                "patch_skill",
                "delete_skill",
                "http_request",
                "search_web",
                "scrape_url",
                "open_browser",
                "start_dev_server",
                "stop_dev_server",
                "get_browser_errors",
                "get_dev_server_info",
                "save_image",
                "download_image",
                "generate_image",
                "list_sd_models",
                "ask_user",
                "set_mode",
                "request_agent_mode",
                "get_plan",
                "save_plan",
                "set_todo",
                "check_todo",
                "search_conversation",
                "save_project_structure",
                "get_project_structure",
                "context7-search",
                "context7-docs",
                "create_mcp_server",
                "start_mcp_server",
                "call_mcp_tool",
                "list_mcp_servers",
                "save_fact",
                "get_tool_doc",
            ]) {
                const groupId = getToolGroupId(id);
                if (
                    !groupId ||
                    toolOn(groupId) ||
                    id === "ask_user" ||
                    id === "set_mode" ||
                    id === "request_agent_mode" ||
                    id === "get_tool_doc"
                ) {
                    enabledToolIds.add(id);
                }
            }
            const toolCatalog = buildCompactToolCatalog(enabledToolIds);

            const compactCtx = [
                `### SYSTEM OVERRIDE ###`,
                `Tu es un assistant qui répond en français de façon claire, brève et fiable.`,
                `Ne montre jamais ta réflexion interne.`,
                `N'ouvre pas tes réponses par une salutation ou une présentation générique sauf si l'utilisateur te salue sans autre demande.`,
                `Réponds directement à la demande actuelle.`,
                `Utilise un bloc <tool>{...}</tool> non seulement pour les actions explicites, mais aussi pour toute question qui dépend d'un état local réel de la machine, d'un fichier, d'un terminal, du réseau ou de l'heure courante.`,
                `Exemples: "liste mes cartes graphiques", "on est quel jour", "quel fichier est dans ce dossier", "quel port est occupé" => utilise l'outil approprié puis réponds avec le résultat.`,
                `Pour analyser un dossier local complet, utilise de préférence analyze_folder. Si tu dois être plus précis, commence par list_folder_files, list_folder_pdfs ou list_folder_images avant de lire les fichiers utiles.`,
                `Pour les informations matérielles locales (GPU, RAM, CPU), préfère <tool>{"get_hardware_info":true}</tool> avant d'utiliser cmd.`,
                `Quand l'utilisateur demande une action explicite ou une information locale vérifiable, utilise l'outil adapté au lieu de refuser.`,
                `N'invente jamais l'exécution d'une action: soit tu utilises un outil, soit tu réponds en texte.`,
                `Les mots comme terminal, images, files, browser, web, planning, memory, mcp sont des CATÉGORIES, pas des clés d'outil.`,
                `N'écris JAMAIS <tool>{"images":"generate_image"}</tool> ni <tool>{"files":"read_file"}</tool>.`,
                `Tu dois toujours utiliser la clé exacte de l'outil, par exemple: <tool>{"generate_image":"un chat roux mignon"}</tool>.`,
                `Pour générer une image, la forme correcte est la clé generate_image avec le prompt comme valeur principale.`,
                `Tu as accès au terminal PowerShell local: tu peux donc obtenir des informations système réelles de la machine.`,
                `Si un outil échoue 2 fois pour la même raison, arrête-toi et explique brièvement le blocage.`,
                ``,
                `[Contexte machine]`,
                `OS: Windows (${os})`,
                `RAM: ${hw.total_ram_gb.toFixed(1)} Go`,
                `CPU threads: ${hw.cpu_threads}`,
                `GPU: ${gpu}`,
                skillsList,
                memorySummary ? `\n[Résumé mémoire]\n${memorySummary}` : "",
                userProfile,
                ``,
                `Table des outils disponible:`,
                toolCatalog,
                ``,
                `Avant d'utiliser un outil dont le format t'est incertain, consulte sa doc détaillée:`,
                `- <tool>{"get_tool_doc":"cmd"}</tool>`,
                `- <tool>{"get_tool_doc":"write_file"}</tool>`,
                `- <tool>{"get_tool_doc":"generate_image"}</tool>`,
                `- <tool>{"get_tool_doc":"terminal"}</tool>`,
                `- <tool>{"get_tool_doc":"skill"}</tool>`,
                `Règle: index compact d'abord, doc détaillée seulement si nécessaire.`,
                `Règle supplémentaire: avant le PREMIER usage d'un outil dans une conversation, ou si tu hésites sur sa syntaxe exacte, appelle get_tool_doc puis utilise l'outil.`,
                `Ne devine pas le format JSON d'un outil si get_tool_doc peut le confirmer.`,
                ``,
                `Mode actuel: ${chatModeRef.current.toUpperCase()}`,
                chatModeRef.current === "ask"
                    ? `Mode ask: texte et ask_user uniquement, pas d'action sans request_agent_mode.`
                    : chatModeRef.current === "plan"
                      ? `Mode plan: explique brièvement avant une action importante et utilise ask_user si confirmation nécessaire.`
                      : `Mode agent: tu peux agir directement, étape par étape.`,
                deepThinkingEnabled
                    ? `Réfléchis avant de répondre, mais garde la réponse finale simple et directe.`
                    : `Réponse concise et directe.`,
                `### FIN SYSTEM OVERRIDE ###`,
            ]
                .filter(Boolean)
                .join("\n");
            setMachineContext(compactCtx);
            setIsContextReady(true);
        } catch {
            setIsContextReady(true); /* silencieux */
        }
    }, [chatModeRef, deepThinkingEnabled, isEnabled]);

    return { machineContext, setMachineContext, isContextReady, setIsContextReady, buildMachineContext };
}

