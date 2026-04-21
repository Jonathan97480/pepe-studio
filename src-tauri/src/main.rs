#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod db;
mod dev_server;
mod http_client;
mod hw_info;
mod llama_sidecar;
mod mcp;
mod model_metadata;
mod scraper;
mod search;
mod skills;
mod terminal_manager;

use db::{
    delete_all_conversations, delete_conversation, delete_document, delete_model_config,
    delete_user_fact, get_all_model_configs, get_compressed_messages, get_conversation_plan,
    get_conversations_summary, get_default_model, get_document_chunks, get_project_structure,
    get_user_facts, init_db, list_conversations, list_documents, list_mmproj_files,
    list_model_files, load_conversation_messages, rename_conversation, save_conversation_plan,
    save_message, save_message_compressed, save_model_config, save_project_structure,
    search_chunks, search_conversation_messages, search_meta_tags, set_default_model,
    set_user_fact, start_conversation, store_document, DbState,
};
use dev_server::{
    get_browser_errors, get_dev_server_info, start_dev_server, stop_dev_server, DevServerState,
};
use http_client::http_request;
use hw_info::{
    batch_rename_files, download_image, get_hardware_info, list_folder_pdfs, patch_file,
    read_file_content, read_pdf_batch, read_pdf_bytes, run_shell_command, save_image, write_file,
};
use llama_sidecar::{cleanup_llama, send_llama_prompt, start_llama, stop_llama, LlamaState};
use mcp::{
    call_mcp_tool, cleanup_all_mcp_servers, create_mcp_server, list_mcp_servers, start_mcp_server,
    stop_mcp_server, McpState,
};
use model_metadata::inspect_model_metadata;
use scraper::scrape_url;
use search::search_web;
use skills::{
    create_skill, delete_skill, get_plan, list_skills, patch_skill, read_skill, run_skill,
    save_plan,
};
use std::sync::Mutex;
use tauri::Manager;
use terminal_manager::{
    close_terminal, create_terminal, get_terminal_history, list_terminals, terminal_exec,
    terminal_kill_interactive, terminal_pty_resize, terminal_send_stdin,
    terminal_start_interactive, InteractiveState, TerminalManagerState,
};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let conn = init_db(&app.handle());
            app.manage(DbState(Mutex::new(conn)));
            app.manage(McpState::default());
            app.manage(DevServerState::default());
            app.manage(TerminalManagerState::default());
            app.manage(InteractiveState::default());
            Ok(())
        })
        .manage(LlamaState::default())
        .on_window_event(|event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                let app = event.window().app_handle();
                cleanup_llama(&app.state::<LlamaState>());
                cleanup_all_mcp_servers(&app.state::<McpState>());
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_llama,
            stop_llama,
            send_llama_prompt,
            list_model_files,
            list_mmproj_files,
            get_all_model_configs,
            save_model_config,
            set_default_model,
            get_default_model,
            delete_model_config,
            store_document,
            search_chunks,
            list_documents,
            delete_document,
            get_document_chunks,
            get_hardware_info,
            inspect_model_metadata,
            run_shell_command,
            write_file,
            patch_file,
            read_file_content,
            read_pdf_bytes,
            list_folder_pdfs,
            batch_rename_files,
            read_pdf_batch,
            save_image,
            download_image,
            http_request,
            scrape_url,
            search_web,
            create_skill,
            list_skills,
            read_skill,
            run_skill,
            delete_skill,
            patch_skill,
            save_plan,
            get_plan,
            start_conversation,
            save_message,
            save_message_compressed,
            get_compressed_messages,
            search_meta_tags,
            get_conversations_summary,
            search_conversation_messages,
            list_conversations,
            load_conversation_messages,
            delete_conversation,
            rename_conversation,
            delete_all_conversations,
            get_user_facts,
            set_user_fact,
            delete_user_fact,
            save_project_structure,
            get_project_structure,
            save_conversation_plan,
            get_conversation_plan,
            create_mcp_server,
            start_mcp_server,
            call_mcp_tool,
            list_mcp_servers,
            stop_mcp_server,
            start_dev_server,
            stop_dev_server,
            get_browser_errors,
            get_dev_server_info,
            create_terminal,
            terminal_exec,
            terminal_start_interactive,
            terminal_send_stdin,
            terminal_kill_interactive,
            terminal_pty_resize,
            list_terminals,
            close_terminal,
            get_terminal_history,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de Tauri");
}
