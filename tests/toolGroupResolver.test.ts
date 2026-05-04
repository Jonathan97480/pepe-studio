import test from "node:test";
import assert from "node:assert/strict";
import { getToolGroupId } from "../src/lib/toolGroupResolver";

// --- Groupe "terminal" ---
test("getToolGroupId: cmd → terminal", () => {
    assert.equal(getToolGroupId("cmd"), "terminal");
});

test("getToolGroupId: get_hardware_info → terminal", () => {
    assert.equal(getToolGroupId("get_hardware_info"), "terminal");
});

test("getToolGroupId: terminal_exec → terminal (préfixe)", () => {
    assert.equal(getToolGroupId("terminal_exec"), "terminal");
});

test("getToolGroupId: terminal_start_interactive → terminal (préfixe)", () => {
    assert.equal(getToolGroupId("terminal_start_interactive"), "terminal");
});

test("getToolGroupId: create_terminal → terminal", () => {
    assert.equal(getToolGroupId("create_terminal"), "terminal");
});

test("getToolGroupId: list_terminals → terminal", () => {
    assert.equal(getToolGroupId("list_terminals"), "terminal");
});

test("getToolGroupId: close_terminal → terminal", () => {
    assert.equal(getToolGroupId("close_terminal"), "terminal");
});

// --- Groupe "images" ---
test("getToolGroupId: generate_image → images", () => {
    assert.equal(getToolGroupId("generate_image"), "images");
});

test("getToolGroupId: read_image → images (priorité sur files)", () => {
    assert.equal(getToolGroupId("read_image"), "images");
});

test("getToolGroupId: list_sd_models → images", () => {
    assert.equal(getToolGroupId("list_sd_models"), "images");
});

test("getToolGroupId: save_image → images", () => {
    assert.equal(getToolGroupId("save_image"), "images");
});

test("getToolGroupId: download_image → images", () => {
    assert.equal(getToolGroupId("download_image"), "images");
});

// --- Groupe "files" ---
test("getToolGroupId: read_file → files", () => {
    assert.equal(getToolGroupId("read_file"), "files");
});

test("getToolGroupId: write_file → files", () => {
    assert.equal(getToolGroupId("write_file"), "files");
});

test("getToolGroupId: patch_file → files", () => {
    assert.equal(getToolGroupId("patch_file"), "files");
});

test("getToolGroupId: analyze_folder → files", () => {
    assert.equal(getToolGroupId("analyze_folder"), "files");
});

test("getToolGroupId: batch_rename → files", () => {
    assert.equal(getToolGroupId("batch_rename"), "files");
});

test("getToolGroupId: list_folder_pdfs → files", () => {
    assert.equal(getToolGroupId("list_folder_pdfs"), "files");
});

// --- Groupe "skills" ---
test("getToolGroupId: create_skill → skills", () => {
    assert.equal(getToolGroupId("create_skill"), "skills");
});

test("getToolGroupId: run_skill → skills", () => {
    assert.equal(getToolGroupId("run_skill"), "skills");
});

test("getToolGroupId: delete_skill → skills", () => {
    assert.equal(getToolGroupId("delete_skill"), "skills");
});

// --- Groupes simples ---
test("getToolGroupId: http_request → http", () => {
    assert.equal(getToolGroupId("http_request"), "http");
});

test("getToolGroupId: search_web → search_web", () => {
    assert.equal(getToolGroupId("search_web"), "search_web");
});

test("getToolGroupId: scrape_url → scrape_url", () => {
    assert.equal(getToolGroupId("scrape_url"), "scrape_url");
});

test("getToolGroupId: open_browser → browser", () => {
    assert.equal(getToolGroupId("open_browser"), "browser");
});

test("getToolGroupId: start_dev_server → browser", () => {
    assert.equal(getToolGroupId("start_dev_server"), "browser");
});

test("getToolGroupId: context7-search → context7", () => {
    assert.equal(getToolGroupId("context7-search"), "context7");
});

test("getToolGroupId: context7-docs → context7", () => {
    assert.equal(getToolGroupId("context7-docs"), "context7");
});

test("getToolGroupId: call_mcp_tool → mcp", () => {
    assert.equal(getToolGroupId("call_mcp_tool"), "mcp");
});

test("getToolGroupId: search_conversation → memory", () => {
    assert.equal(getToolGroupId("search_conversation"), "memory");
});

test("getToolGroupId: get_plan → planning", () => {
    assert.equal(getToolGroupId("get_plan"), "planning");
});

test("getToolGroupId: set_todo → planning", () => {
    assert.equal(getToolGroupId("set_todo"), "planning");
});

test("getToolGroupId: save_fact → profile", () => {
    assert.equal(getToolGroupId("save_fact"), "profile");
});

// --- Outils système (null) ---
test("getToolGroupId: ask_user → null", () => {
    assert.equal(getToolGroupId("ask_user"), null);
});

test("getToolGroupId: set_mode → null", () => {
    assert.equal(getToolGroupId("set_mode"), null);
});

test("getToolGroupId: request_agent_mode → null", () => {
    assert.equal(getToolGroupId("request_agent_mode"), null);
});

test("getToolGroupId: get_tool_doc → null", () => {
    assert.equal(getToolGroupId("get_tool_doc"), null);
});

test("getToolGroupId: outil inconnu → null", () => {
    assert.equal(getToolGroupId("outil_inexistant"), null);
});

test("getToolGroupId: chaîne vide → null", () => {
    assert.equal(getToolGroupId(""), null);
});
