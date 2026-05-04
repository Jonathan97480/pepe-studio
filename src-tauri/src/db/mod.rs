//! Module db — accès SQLite.
//!
//! Sous-modules :
//!   - `schema`        : `init_db` + toutes les migrations
//!   - `models`        : `ModelConfig`, CRUD model_configs, découverte fichiers .gguf
//!   - `documents`     : RAG (documents, document_chunks, FTS5)
//!   - `conversations` : conversations, messages, user_facts

pub mod conversations;
pub mod documents;
pub mod models;
pub mod schema;

use rusqlite::Connection;
use std::sync::Mutex;

/// État partagé Tauri contenant la connexion SQLite.
pub struct DbState(pub Mutex<Connection>);

// ── Re-exports plats — main.rs reste inchangé ─────────────────────────────────

pub use conversations::{
    delete_all_conversations, delete_conversation, delete_image_message, delete_user_fact,
    get_compressed_messages, get_conversation_plan, get_conversations_summary, get_project_structure,
    get_user_facts, list_conversations, load_conversation_messages, rename_conversation,
    save_conversation_plan, save_message, save_message_compressed, save_project_structure,
    search_conversation_messages, search_meta_tags, set_user_fact, start_conversation,
    ConversationItem, ConversationMessage, MsgResult, UserFact,
};

pub use documents::{
    delete_document, get_document_chunks, list_documents, search_chunks, store_document,
    ChunkResult, DocumentChunkInput, DocumentMeta,
};

pub use models::{
    delete_model_config, get_all_model_configs, get_default_model, list_mmproj_files,
    list_model_files, save_model_config, set_default_model, ModelConfig,
};

pub use schema::init_db;
