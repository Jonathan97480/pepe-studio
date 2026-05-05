"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const toolGroupResolver_1 = require("../src/lib/toolGroupResolver");
// --- Groupe "terminal" ---
(0, node_test_1.default)("getToolGroupId: cmd → terminal", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("cmd"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: get_hardware_info → terminal", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("get_hardware_info"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: terminal_exec → terminal (préfixe)", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("terminal_exec"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: terminal_start_interactive → terminal (préfixe)", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("terminal_start_interactive"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: create_terminal → terminal", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("create_terminal"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: list_terminals → terminal", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("list_terminals"), "terminal");
});
(0, node_test_1.default)("getToolGroupId: close_terminal → terminal", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("close_terminal"), "terminal");
});
// --- Groupe "images" ---
(0, node_test_1.default)("getToolGroupId: generate_image → images", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("generate_image"), "images");
});
(0, node_test_1.default)("getToolGroupId: read_image → images (priorité sur files)", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("read_image"), "images");
});
(0, node_test_1.default)("getToolGroupId: list_sd_models → images", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("list_sd_models"), "images");
});
(0, node_test_1.default)("getToolGroupId: save_image → images", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("save_image"), "images");
});
(0, node_test_1.default)("getToolGroupId: download_image → images", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("download_image"), "images");
});
// --- Groupe "files" ---
(0, node_test_1.default)("getToolGroupId: read_file → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("read_file"), "files");
});
(0, node_test_1.default)("getToolGroupId: write_file → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("write_file"), "files");
});
(0, node_test_1.default)("getToolGroupId: patch_file → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("patch_file"), "files");
});
(0, node_test_1.default)("getToolGroupId: analyze_folder → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("analyze_folder"), "files");
});
(0, node_test_1.default)("getToolGroupId: batch_rename → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("batch_rename"), "files");
});
(0, node_test_1.default)("getToolGroupId: list_folder_pdfs → files", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("list_folder_pdfs"), "files");
});
// --- Groupe "skills" ---
(0, node_test_1.default)("getToolGroupId: create_skill → skills", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("create_skill"), "skills");
});
(0, node_test_1.default)("getToolGroupId: run_skill → skills", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("run_skill"), "skills");
});
(0, node_test_1.default)("getToolGroupId: delete_skill → skills", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("delete_skill"), "skills");
});
// --- Groupes simples ---
(0, node_test_1.default)("getToolGroupId: http_request → http", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("http_request"), "http");
});
(0, node_test_1.default)("getToolGroupId: search_web → search_web", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("search_web"), "search_web");
});
(0, node_test_1.default)("getToolGroupId: scrape_url → scrape_url", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("scrape_url"), "scrape_url");
});
(0, node_test_1.default)("getToolGroupId: open_browser → browser", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("open_browser"), "browser");
});
(0, node_test_1.default)("getToolGroupId: start_dev_server → browser", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("start_dev_server"), "browser");
});
(0, node_test_1.default)("getToolGroupId: context7-search → context7", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("context7-search"), "context7");
});
(0, node_test_1.default)("getToolGroupId: context7-docs → context7", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("context7-docs"), "context7");
});
(0, node_test_1.default)("getToolGroupId: call_mcp_tool → mcp", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("call_mcp_tool"), "mcp");
});
(0, node_test_1.default)("getToolGroupId: search_conversation → memory", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("search_conversation"), "memory");
});
(0, node_test_1.default)("getToolGroupId: get_plan → planning", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("get_plan"), "planning");
});
(0, node_test_1.default)("getToolGroupId: set_todo → planning", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("set_todo"), "planning");
});
(0, node_test_1.default)("getToolGroupId: save_fact → profile", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("save_fact"), "profile");
});
// --- Outils système (null) ---
(0, node_test_1.default)("getToolGroupId: ask_user → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("ask_user"), null);
});
(0, node_test_1.default)("getToolGroupId: set_mode → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("set_mode"), null);
});
(0, node_test_1.default)("getToolGroupId: request_agent_mode → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("request_agent_mode"), null);
});
(0, node_test_1.default)("getToolGroupId: get_tool_doc → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("get_tool_doc"), null);
});
(0, node_test_1.default)("getToolGroupId: outil inconnu → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)("outil_inexistant"), null);
});
(0, node_test_1.default)("getToolGroupId: chaîne vide → null", () => {
    strict_1.default.equal((0, toolGroupResolver_1.getToolGroupId)(""), null);
});
