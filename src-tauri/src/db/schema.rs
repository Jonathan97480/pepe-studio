//! Initialisation du schéma SQLite et toutes les migrations incrémentales.

use rusqlite::Connection;
use tauri::AppHandle;

/// Initialise la base SQLite dans le dossier de données de l'app.
/// Crée toutes les tables et applique les migrations (idempotentes via ALTER … .ok()).
pub fn init_db(app: &AppHandle) -> Connection {
    let data_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    std::fs::create_dir_all(&data_dir).ok();
    let db_path = data_dir.join("models.db");
    println!("[db] opening SQLite at {}", db_path.display());
    let conn = Connection::open(&db_path).expect("Impossible d'ouvrir la base de données");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS model_configs (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            temperature REAL NOT NULL DEFAULT 0.9,
            context_window INTEGER NOT NULL DEFAULT 4096,
            system_prompt TEXT NOT NULL DEFAULT '',
            turbo_quant TEXT NOT NULL DEFAULT 'none',
            is_default INTEGER NOT NULL DEFAULT 0
        );",
    )
    .expect("Impossible de créer la table");
    // Migration : ajouter mmproj_path si absent
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN mmproj_path TEXT NOT NULL DEFAULT '';",
    )
    .ok();
    // Migration : ajouter n_gpu_layers et threads si absents
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN n_gpu_layers INTEGER NOT NULL DEFAULT 0;",
    )
    .ok();
    conn.execute_batch("ALTER TABLE model_configs ADD COLUMN threads INTEGER NOT NULL DEFAULT -1;")
        .ok();
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN eval_batch_size INTEGER NOT NULL DEFAULT 512;",
    )
    .ok();
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN flash_attention INTEGER NOT NULL DEFAULT 0;",
    )
    .ok();
    // Migration : ajouter sampling_json pour les paramètres de sampling par modèle
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN sampling_json TEXT NOT NULL DEFAULT '';",
    )
    .ok();
    // Migration : ajouter chat_template pour l'override du chat template llama.cpp
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN chat_template TEXT NOT NULL DEFAULT '';",
    )
    .ok();
    conn.execute_batch(
        "ALTER TABLE model_configs ADD COLUMN reasoning_budget INTEGER NOT NULL DEFAULT 64;",
    )
    .ok();

    // Tables RAG : documents + FTS5 pour la recherche sémantique
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            total_pages INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            page_num INTEGER NOT NULL,
            chunk_text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(doc_id, page_num);
        CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts
            USING fts5(doc_id UNINDEXED, page_num UNINDEXED, chunk_text, tokenize='unicode61');",
    )
    .expect("Impossible de créer les tables RAG");

    // Tables de persistance des conversations
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            image_path TEXT,
            display_only INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .expect("Impossible de créer les tables conversations");
    // Migration : ajouter title si absent
    conn.execute_batch("ALTER TABLE conversations ADD COLUMN title TEXT;")
        .ok();

    // Migration Pepe-Compressor : stockage double-face (contenu brut + compressé + meta-tag)
    conn.execute_batch(
        "ALTER TABLE messages ADD COLUMN compressed_content TEXT NOT NULL DEFAULT '';",
    )
    .ok();
    conn.execute_batch("ALTER TABLE messages ADD COLUMN meta_tag TEXT NOT NULL DEFAULT '';")
        .ok();
    conn.execute_batch("ALTER TABLE messages ADD COLUMN image_path TEXT;")
        .ok();
    conn.execute_batch("ALTER TABLE messages ADD COLUMN display_only INTEGER NOT NULL DEFAULT 0;")
        .ok();

    // Migration : ajouter project_structure pour stocker la structure du projet par conversation
    conn.execute_batch(
        "ALTER TABLE conversations ADD COLUMN project_structure TEXT NOT NULL DEFAULT '';",
    )
    .ok();

    // Migration : ajouter plan_content pour stocker le PLAN.md par conversation
    conn.execute_batch(
        "ALTER TABLE conversations ADD COLUMN plan_content TEXT NOT NULL DEFAULT '';",
    )
    .ok();

    // Table profil utilisateur
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS user_facts (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )
    .expect("Impossible de créer la table user_facts");

    conn
}
