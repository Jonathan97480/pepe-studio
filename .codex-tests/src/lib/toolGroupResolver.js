"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getToolGroupId = getToolGroupId;
/**
 * Résout l'identifiant de groupe d'un outil à partir de son ID.
 *
 * Les groupes correspondent aux catégories de permissions de l'interface
 * (ex: "terminal", "files", "images"…). Retourne null si l'outil n'appartient
 * à aucun groupe contrôlé (outils système toujours autorisés).
 */
function getToolGroupId(id) {
    // Terminal & shell
    if (id.startsWith("terminal") ||
        id === "cmd" ||
        id === "list_terminals" ||
        id === "get_terminal_history" ||
        id === "close_terminal" ||
        id === "create_terminal" ||
        id === "get_hardware_info")
        return "terminal";
    // Images & génération
    if ([
        "read_image",
        "read_image_batch",
        "list_folder_images",
        "save_image",
        "download_image",
        "generate_image",
        "list_sd_models",
    ].includes(id))
        return "images";
    // Fichiers
    if (id.startsWith("read_") ||
        id === "analyze_folder" ||
        id === "write_file" ||
        id === "patch_file" ||
        id === "batch_rename" ||
        id === "list_folder_pdfs" ||
        id === "list_folder_files" ||
        id === "list_folder_images")
        return "files";
    // Skills
    if (id.includes("skill"))
        return "skills";
    // HTTP direct
    if (id === "http_request")
        return "http";
    // Recherche web
    if (id === "search_web")
        return "search_web";
    // Scraping
    if (id === "scrape_url")
        return "scrape_url";
    // Navigateur / serveur dev
    if (["open_browser", "start_dev_server", "stop_dev_server", "get_browser_errors", "get_dev_server_info"].includes(id))
        return "browser";
    // Context7 (documentation)
    if (["context7-search", "context7-docs"].includes(id))
        return "context7";
    // MCP
    if (["create_mcp_server", "start_mcp_server", "call_mcp_tool", "list_mcp_servers"].includes(id))
        return "mcp";
    // Mémoire conversations
    if (id === "search_conversation")
        return "memory";
    // Planification
    if (["get_plan", "save_plan", "set_todo", "check_todo"].includes(id))
        return "planning";
    // Profil utilisateur
    if (id === "save_fact")
        return "profile";
    return null;
}
