//! Gestion SQLite des configurations de modèles

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

// ─── Types RAG ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentChunkInput {
    pub page_num: i64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChunkResult {
    pub doc_id: i64,
    pub doc_name: String,
    pub page_num: i64,
    pub chunk_text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentMeta {
    pub id: i64,
    pub name: String,
    pub total_pages: i64,
    pub created_at: String,
}

// ─── Types Conversations ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MsgResult {
    pub conversation_id: i64,
    pub day_label: String,
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationItem {
    pub id: i64,
    pub title: String,
    pub model_name: String,
    pub created_at: String,
    pub message_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

pub struct DbState(pub Mutex<Connection>);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModelConfig {
    pub path: String,
    pub name: String,
    pub temperature: f64,
    pub context_window: i64,
    pub eval_batch_size: i64,
    #[serde(default)]
    pub flash_attention: bool,
    pub system_prompt: String,
    pub turbo_quant: String,
    pub mmproj_path: String,
    pub n_gpu_layers: i64,
    pub threads: i64,
    pub is_default: bool,
    /// JSON-encoded sampling settings (nullable, empty string = defaults)
    #[serde(default)]
    pub sampling_json: String,
    /// Chat template override : "" = auto, "jinja" = --jinja, "gemma", "llama3", etc.
    #[serde(default)]
    pub chat_template: String,
    /// Budget de reasoning llama.cpp : -1 = illimité, 0 = stop immédiat, N > 0 = budget
    #[serde(default)]
    pub reasoning_budget: i64,
}

/// Initialise la base SQLite dans le dossier de données de l'app
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

/// Liste tous les fichiers .gguf dans le dossier models/ (hors mmproj)
#[command]
pub fn list_model_files(app: AppHandle) -> Result<Vec<String>, String> {
    // Construire la liste des dossiers à scanner (production + dev)
    let mut search_dirs: Vec<std::path::PathBuf> = Vec::new();

    // Base dirs : resource_dir et exe dir, en supprimant le préfixe \\?\ si présent
    let mut base_dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        base_dirs.push(strip_path_unc(rd.clone()));
        base_dirs.push(rd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            base_dirs.push(strip_path_unc(ed.to_path_buf()));
            base_dirs.push(ed.to_path_buf());
        }
    }
    for base in &base_dirs {
        search_dirs.push(base.join("models"));
        search_dirs.push(base.clone()); // fichiers à la racine du bundle
                                        // Tauri transforme "../models/*" en "_up_/models/" dans l'installeur
        search_dirs.push(base.join("_up_").join("models"));
        search_dirs.push(base.join("_up_"));
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    search_dirs.push(cwd.join("models"));

    // En build debug : CARGO_MANIFEST_DIR est e:\CustomApp\src-tauri (compilé en dur)
    // → son parent = e:\CustomApp → models/ contient tous les modèles du projet
    #[cfg(debug_assertions)]
    {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(project_root) = manifest_dir.parent() {
            search_dirs.push(project_root.join("models"));
        }
    }

    // Accumuler tous les modèles uniques (par nom de fichier) de tous les dossiers
    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut all_files: Vec<String> = Vec::new();

    for models_dir in &search_dirs {
        println!("[db] scanning models dir: {}", models_dir.display());
        if !models_dir.exists() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(models_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let ext_ok = p
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("gguf"))
                .unwrap_or(false);
            if !ext_ok {
                continue;
            }
            let name = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if name.contains("mmproj") {
                continue;
            }
            if seen_names.insert(name.to_string()) {
                all_files.push(p.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    all_files.sort();
    Ok(all_files)
}

fn strip_path_unc(path: std::path::PathBuf) -> std::path::PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\\") {
        std::path::PathBuf::from(stripped.to_string())
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        std::path::PathBuf::from(stripped.to_string())
    } else {
        path
    }
}

/// Liste tous les fichiers mmproj (.gguf contenant "mmproj" dans le nom)
#[command]
pub fn list_mmproj_files(app: AppHandle) -> Result<Vec<String>, String> {
    let mut search_dirs: Vec<std::path::PathBuf> = Vec::new();
    let mut base_dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        base_dirs.push(strip_path_unc(rd.clone()));
        base_dirs.push(rd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            base_dirs.push(strip_path_unc(ed.to_path_buf()));
            base_dirs.push(ed.to_path_buf());
        }
    }
    for base in &base_dirs {
        search_dirs.push(base.join("models"));
        search_dirs.push(base.clone());
        search_dirs.push(base.join("_up_").join("models"));
        search_dirs.push(base.join("_up_"));
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    search_dirs.push(cwd.join("models"));

    #[cfg(debug_assertions)]
    {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(project_root) = manifest_dir.parent() {
            search_dirs.push(project_root.join("models"));
        }
    }

    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut all_files: Vec<String> = Vec::new();

    for models_dir in &search_dirs {
        if !models_dir.exists() {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(models_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let ext_ok = p
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("gguf"))
                .unwrap_or(false);
            if !ext_ok {
                continue;
            }
            let name = p
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if !name.contains("mmproj") {
                continue;
            }
            if seen_names.insert(name.to_string()) {
                all_files.push(p.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    all_files.sort();
    Ok(all_files)
}

/// Retourne toutes les configs de modèles sauvegardées
#[command]
pub fn get_all_model_configs(state: State<'_, DbState>) -> Result<Vec<ModelConfig>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT path, name, temperature, context_window, eval_batch_size, flash_attention, system_prompt, turbo_quant, mmproj_path, n_gpu_layers, threads, is_default, sampling_json, chat_template, reasoning_budget
             FROM model_configs ORDER BY is_default DESC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let result: Vec<ModelConfig> = stmt
        .query_map([], |row| {
            Ok(ModelConfig {
                path: row.get(0)?,
                name: row.get(1)?,
                temperature: row.get(2)?,
                context_window: row.get(3)?,
                eval_batch_size: row.get::<_, i64>(4).unwrap_or(512),
                flash_attention: row.get::<_, i64>(5).unwrap_or(0) != 0,
                system_prompt: row.get(6)?,
                turbo_quant: row.get(7)?,
                mmproj_path: row.get(8)?,
                n_gpu_layers: row.get(9)?,
                threads: row.get(10)?,
                is_default: row.get::<_, i64>(11)? != 0,
                sampling_json: row.get::<_, String>(12).unwrap_or_default(),
                chat_template: row.get::<_, String>(13).unwrap_or_default(),
                reasoning_budget: row.get::<_, i64>(14).unwrap_or(64),
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(result)
}

/// Sauvegarde (insert ou remplace) une configuration de modèle
#[command]
pub fn save_model_config(config: ModelConfig, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO model_configs
         (path, name, temperature, context_window, eval_batch_size, flash_attention, system_prompt, turbo_quant, mmproj_path, n_gpu_layers, threads, is_default, sampling_json, chat_template, reasoning_budget)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            config.path,
            config.name,
            config.temperature,
            config.context_window,
            config.eval_batch_size,
            config.flash_attention as i64,
            config.system_prompt,
            config.turbo_quant,
            config.mmproj_path,
            config.n_gpu_layers,
            config.threads,
            config.is_default as i64,
            config.sampling_json,
            config.chat_template,
            config.reasoning_budget
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Définit le modèle par défaut (réinitialise tous les autres)
#[command]
pub fn set_default_model(path: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("UPDATE model_configs SET is_default = 0", [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE model_configs SET is_default = 1 WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Retourne le modèle par défaut, ou null si aucun
#[command]
pub fn get_default_model(state: State<'_, DbState>) -> Result<Option<ModelConfig>, String> {
    let conn = state.0.lock().unwrap();
    match conn.query_row(
        "SELECT path, name, temperature, context_window, eval_batch_size, flash_attention, system_prompt, turbo_quant, mmproj_path, n_gpu_layers, threads, is_default, sampling_json, chat_template, reasoning_budget
         FROM model_configs WHERE is_default = 1 LIMIT 1",
        [],
        |row| {
            Ok(ModelConfig {
                path: row.get(0)?,
                name: row.get(1)?,
                temperature: row.get(2)?,
                context_window: row.get(3)?,
                eval_batch_size: row.get::<_, i64>(4).unwrap_or(512),
                flash_attention: row.get::<_, i64>(5).unwrap_or(0) != 0,
                system_prompt: row.get(6)?,
                turbo_quant: row.get(7)?,
                mmproj_path: row.get(8)?,
                n_gpu_layers: row.get(9)?,
                threads: row.get(10)?,
                is_default: true,
                sampling_json: row.get::<_, String>(12).unwrap_or_default(),
                chat_template: row.get::<_, String>(13).unwrap_or_default(),
                reasoning_budget: row.get::<_, i64>(14).unwrap_or(64),
            })
        },
    ) {
        Ok(config) => Ok(Some(config)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Supprime la config d'un modèle
#[command]
pub fn delete_model_config(path: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM model_configs WHERE path = ?1", params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Commandes RAG ────────────────────────────────────────────────────────────

/// Indexe un document (ses pages) dans la table document_chunks (stockage) et FTS5 (recherche).
/// Retourne l'id du document créé.
#[command]
pub fn store_document(
    name: String,
    chunks: Vec<DocumentChunkInput>,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    let total_pages = chunks.len() as i64;
    conn.execute(
        "INSERT INTO documents (name, total_pages) VALUES (?1, ?2)",
        params![name, total_pages],
    )
    .map_err(|e| e.to_string())?;
    let doc_id = conn.last_insert_rowid();

    for chunk in &chunks {
        // Stockage physique (table normale, SELECT fiable)
        conn.execute(
            "INSERT INTO document_chunks (doc_id, page_num, chunk_text) VALUES (?1, ?2, ?3)",
            params![doc_id, chunk.page_num, chunk.text],
        )
        .map_err(|e| e.to_string())?;
        // Index FTS5 (recherche par mots-clés seulement)
        conn.execute(
            "INSERT INTO document_chunks_fts (doc_id, page_num, chunk_text) VALUES (?1, ?2, ?3)",
            params![doc_id, chunk.page_num, chunk.text],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(doc_id)
}

/// Recherche les chunks les plus pertinents pour une requête dans les documents donnés.
/// Tente d'abord FTS5 MATCH ; si la requête est invalide ou sans résultat,
/// retourne automatiquement les premiers chunks du document (fallback fiable).
#[command]
pub fn search_chunks(
    query: String,
    doc_ids: Vec<i64>,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<ChunkResult>, String> {
    if doc_ids.is_empty() {
        return Ok(vec![]);
    }
    let conn = state.0.lock().unwrap();

    // ── Tentative FTS5 MATCH ─────────────────────────────────────────────────
    if !query.trim().is_empty() {
        // Sanitiser : garder uniquement les mots alphanumériques (unicode) de 2+ chars.
        // On retire les opérateurs FTS5 : " * ( ) - : ^ mais on garde lettres ET chiffres (ex: v1, api, 404).
        let safe_query: String = query
            .split_whitespace()
            .map(|w| {
                // Retirer les chars non-alphanumériques sauf apostrophe et slash (pour les chemins api/v1)
                w.chars()
                    .filter(|c| c.is_alphanumeric() || *c == '\'' || *c == '/')
                    .collect::<String>()
            })
            .filter(|w| w.chars().count() >= 2)
            .collect::<Vec<_>>()
            .join(" ");

        if !safe_query.is_empty() {
            let fts_placeholders: String = doc_ids
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 2))
                .collect::<Vec<_>>()
                .join(", ");

            let sql = format!(
                "SELECT CAST(f.doc_id AS INTEGER), d.name, CAST(f.page_num AS INTEGER), f.chunk_text
                 FROM document_chunks_fts f
                 JOIN documents d ON d.id = CAST(f.doc_id AS INTEGER)
                 WHERE document_chunks_fts MATCH ?1
                   AND CAST(f.doc_id AS INTEGER) IN ({})
                 ORDER BY rank
                 LIMIT {}",
                fts_placeholders, limit
            );

            if let Ok(mut stmt) = conn.prepare(&sql) {
                let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(safe_query)];
                for id in &doc_ids {
                    params_vec.push(Box::new(*id));
                }
                if let Ok(rows) = stmt.query_map(
                    rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
                    |row| {
                        Ok(ChunkResult {
                            doc_id: row.get(0)?,
                            doc_name: row.get(1)?,
                            page_num: row.get(2)?,
                            chunk_text: row.get(3)?,
                        })
                    },
                ) {
                    let results: Vec<ChunkResult> = rows.flatten().collect();
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
        }
    }

    // ── Fallback : table normale document_chunks (SELECT fiable, pas de FTS5) ─
    let per_doc = ((limit + doc_ids.len() - 1) / doc_ids.len()).max(2);
    let mut results: Vec<ChunkResult> = Vec::new();
    for doc_id in &doc_ids {
        let sql = format!(
            "SELECT c.doc_id, d.name, c.page_num, c.chunk_text
             FROM document_chunks c
             JOIN documents d ON d.id = c.doc_id
             WHERE c.doc_id = ?1
             ORDER BY c.page_num
             LIMIT {}",
            per_doc
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let chunks: Vec<ChunkResult> = stmt
                .query_map([doc_id], |row| {
                    Ok(ChunkResult {
                        doc_id: row.get(0)?,
                        doc_name: row.get(1)?,
                        page_num: row.get(2)?,
                        chunk_text: row.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .flatten()
                .collect();
            results.extend(chunks);
        }
    }
    Ok(results)
}

/// Récupère les chunks d'un document via la table normale document_chunks (fiable, sans FTS5).
/// Retourne les `limit` premiers chunks triés par numéro de page.
#[command]
pub fn get_document_chunks(
    doc_id: i64,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<ChunkResult>, String> {
    let conn = state.0.lock().unwrap();
    let sql = format!(
        "SELECT c.doc_id, d.name, c.page_num, c.chunk_text
         FROM document_chunks c
         JOIN documents d ON d.id = c.doc_id
         WHERE c.doc_id = ?1
         ORDER BY c.page_num
         LIMIT {}",
        limit
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([doc_id], |row| {
            Ok(ChunkResult {
                doc_id: row.get(0)?,
                doc_name: row.get(1)?,
                page_num: row.get(2)?,
                chunk_text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Liste tous les documents indexés
#[command]
pub fn list_documents(state: State<'_, DbState>) -> Result<Vec<DocumentMeta>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, total_pages, created_at FROM documents ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([], |row| {
            Ok(DocumentMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                total_pages: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Supprime un document et tous ses chunks de l'index FTS5
#[command]
pub fn delete_document(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM document_chunks_fts WHERE CAST(doc_id AS INTEGER) = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Commandes Conversations ───────────────────────────────────────────────────

/// Démarre une nouvelle conversation et retourne son id.
#[command]
pub fn start_conversation(model_name: String, state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO conversations (model_name) VALUES (?1)",
        params![model_name],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Sauvegarde un message dans une conversation.
/// Si c'est le premier message utilisateur, définit automatiquement le titre de la conversation.
#[command]
pub fn save_message(
    conversation_id: i64,
    role: String,
    content: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?1, ?2, ?3)",
        params![conversation_id, role, content],
    )
    .map_err(|e| e.to_string())?;
    // Auto-titre : premier message user → titre de la conv
    if role == "user" {
        let has_title: bool = conn
            .query_row(
                "SELECT title IS NOT NULL AND title != '' FROM conversations WHERE id = ?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !has_title {
            let title: String = content.chars().take(60).collect();
            conn.execute(
                "UPDATE conversations SET title = ?1 WHERE id = ?2",
                params![title, conversation_id],
            )
            .ok();
        }
    }
    Ok(())
}

/// Sauvegarde un message avec sa version compressée (Pepe-Compressor).
/// - `content`            : texte brut affiché dans l'UI
/// - `compressed_content` : version réduite envoyée au modèle / indexée pour le RAG  
/// - `meta_tag`           : résumé sémantique (ex: "[Erreur|Log: npm install failed]")
#[command]
pub fn save_message_compressed(
    conversation_id: i64,
    role: String,
    content: String,
    compressed_content: String,
    meta_tag: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, compressed_content, meta_tag)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, role, content, compressed_content, meta_tag],
    )
    .map_err(|e| e.to_string())?;
    // Auto-titre : premier message user → titre de la conv
    if role == "user" {
        let has_title: bool = conn
            .query_row(
                "SELECT title IS NOT NULL AND title != '' FROM conversations WHERE id = ?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !has_title {
            let title: String = content.chars().take(60).collect();
            conn.execute(
                "UPDATE conversations SET title = ?1 WHERE id = ?2",
                params![title, conversation_id],
            )
            .ok();
        }
    }
    Ok(())
}

/// Retourne les messages d'une conversation avec leur version compressée.
/// Utilisé par le RAG pour construire le contexte compact.
#[command]
pub fn get_compressed_messages(
    conversation_id: i64,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    // Utilise compressed_content si disponible, sinon content (rétro-compat)
    let mut stmt = conn
        .prepare(
            "SELECT conversation_id,
                    CASE
                        WHEN date(created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', created_at)
                    END,
                    role,
                    CASE WHEN compressed_content != '' THEN compressed_content ELSE content END
             FROM messages
             WHERE conversation_id = ?1
             ORDER BY id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id, limit as i64], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(rows)
}

/// Recherche dans les meta-tags des messages pour retrouver un contexte compressé.
/// Utilisé par le RAG sémantique pour répondre aux questions sur l'historique.
#[command]
pub fn search_meta_tags(
    query: String,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    let pattern = format!("%{}%", query.trim().to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT m.conversation_id,
                    strftime('%d/%m/%Y', m.created_at),
                    m.role,
                    CASE WHEN m.compressed_content != '' THEN m.compressed_content ELSE SUBSTR(m.content, 1, 300) END
             FROM messages m
             WHERE LOWER(m.meta_tag) LIKE ?1
                OR LOWER(m.compressed_content) LIKE ?1
             ORDER BY m.id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern, limit as i64], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(rows)
}
/// Inclut les 4 premiers messages de chaque conv so le LLM sait déjà de quoi on a parlé.
#[command]
pub fn get_conversations_summary(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
        .unwrap_or(0);

    if total == 0 {
        return Ok(String::new());
    }

    // 8 dernières conversations non-vides
    let mut stmt = conn
        .prepare(
            "SELECT c.id,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id)
             FROM conversations c
             WHERE (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) > 0
             ORDER BY c.id DESC
             LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let conv_ids: Vec<(i64, String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    if conv_ids.is_empty() {
        return Ok(String::new());
    }

    let mut lines = vec![format!(
        "[Mémoire — {} conversation(s) au total. Aperçu des plus récentes :]",
        total
    )];

    for (id, day_label, msg_count) in &conv_ids {
        lines.push(format!(
            "── Conv #{} — {} ({} messages) ──",
            id, day_label, msg_count
        ));

        let mut msg_stmt = conn
            .prepare(
                "SELECT role, SUBSTR(content, 1, 200) FROM messages
                 WHERE conversation_id = ?1
                 ORDER BY id ASC LIMIT 4",
            )
            .map_err(|e| e.to_string())?;

        let msgs: Vec<(String, String)> = msg_stmt
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        for (role, content) in &msgs {
            let label = if role == "user" { "👤" } else { "🤖" };
            let truncated: String = content.chars().take(150).collect();
            let display = if content.chars().count() > 150 {
                format!("{}…", truncated)
            } else {
                truncated
            };
            lines.push(format!("  {} {}", label, display));
        }
    }

    lines.push(String::new());
    lines.push("── Outils mémoire ──".to_string());
    lines.push(
        "  Tout parcourir (sans mot-clé) : <tool>{\"search_conversation\": \"*\"}</tool>"
            .to_string(),
    );
    lines.push(
        "  Conv complète par id          : <tool>{\"search_conversation\": \"#3\"}</tool>"
            .to_string(),
    );
    lines.push(
        "  Chercher un sujet             : <tool>{\"search_conversation\": \"python\"}</tool>"
            .to_string(),
    );

    Ok(lines.join("\n"))
}

/// Recherche dans les messages de toutes les conversations.
/// - Query vide ou "*"  → 5 convs récentes complètes
/// - "#N"              → tous les messages de la conversation N
/// - mot clé           → LIKE insensible à la casse
#[command]
pub fn search_conversation_messages(
    query: String,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    let q = query.trim();

    // ── Tout parcourir : query vide ou "*" ────────────────────────────────────
    if q.is_empty() || q == "*" {
        let mut stmt = conn
            .prepare(
                "SELECT m.conversation_id,
                        CASE
                            WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                            WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                            ELSE strftime('%d/%m/%Y', c.created_at)
                        END,
                        m.role, SUBSTR(m.content, 1, 200) as content
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                 WHERE m.id IN (
                     SELECT id FROM messages
                     WHERE conversation_id IN (
                         SELECT id FROM conversations
                         WHERE (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) > 0
                         ORDER BY id DESC LIMIT 3
                     )
                     ORDER BY conversation_id DESC, id ASC
                 )
                 ORDER BY m.conversation_id DESC, m.id ASC
                 LIMIT 18",
            )
            .map_err(|e| e.to_string())?;
        let results: Vec<MsgResult> = stmt
            .query_map([], |row| {
                Ok(MsgResult {
                    conversation_id: row.get(0)?,
                    day_label: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        return Ok(results);
    }

    // ── Par id : "#N" ─────────────────────────────────────────────────────────
    if let Some(id_str) = q.strip_prefix('#') {
        if let Ok(conv_id) = id_str.trim().parse::<i64>() {
            let mut stmt = conn
                .prepare(
                    "SELECT m.conversation_id,
                            CASE
                                WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                                WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                                ELSE strftime('%d/%m/%Y', c.created_at)
                            END,
                            m.role, m.content
                     FROM messages m
                     JOIN conversations c ON c.id = m.conversation_id
                     WHERE m.conversation_id = ?1
                     ORDER BY m.id ASC
                     LIMIT 60",
                )
                .map_err(|e| e.to_string())?;
            let results: Vec<MsgResult> = stmt
                .query_map([conv_id], |row| {
                    Ok(MsgResult {
                        conversation_id: row.get(0)?,
                        day_label: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .flatten()
                .collect();
            return Ok(results);
        }
    }

    // ── Par mot clé LIKE (insensible à la casse) ──────────────────────────────
    let pattern = format!("%{}%", q);
    let mut stmt = conn
        .prepare(
            "SELECT m.conversation_id,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END,
                    m.role,
                    SUBSTR(m.content, 1, 400) as content
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             WHERE LOWER(m.content) LIKE LOWER(?1)
             ORDER BY m.id DESC
             LIMIT 25",
        )
        .map_err(|e| e.to_string())?;
    let results: Vec<MsgResult> = stmt
        .query_map([&pattern], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Liste toutes les conversations ayant au moins un message, triées par id DESC.
#[command]
pub fn list_conversations(state: State<'_, DbState>) -> Result<Vec<ConversationItem>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT c.id,
                    COALESCE(NULLIF(c.title, ''), 'Nouvelle conversation') as title,
                    c.model_name,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        WHEN date(c.created_at) >= date('now', '-7 days') THEN '7 derniers jours'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END as created_at,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
             FROM conversations c
             WHERE message_count > 0
             ORDER BY c.id DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let results: Vec<ConversationItem> = stmt
        .query_map([], |row| {
            Ok(ConversationItem {
                id: row.get(0)?,
                title: row.get(1)?,
                model_name: row.get(2)?,
                created_at: row.get(3)?,
                message_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Charge tous les messages d'une conversation donnée.
#[command]
pub fn load_conversation_messages(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<Vec<ConversationMessage>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let results: Vec<ConversationMessage> = stmt
        .query_map([conversation_id], |row| {
            Ok(ConversationMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Supprime une conversation et tous ses messages (CASCADE via FK).
#[command]
pub fn delete_conversation(conversation_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Renomme une conversation (titre généré par le LLM).
#[command]
pub fn rename_conversation(
    conversation_id: i64,
    title: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2",
        params![title.trim(), conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime toutes les conversations et leurs messages.
#[command]
pub fn delete_all_conversations(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM messages", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM conversations", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sauvegarde ou met à jour la structure de projet d'une conversation.
#[command]
pub fn save_project_structure(
    conversation_id: i64,
    structure: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET project_structure = ?1 WHERE id = ?2",
        params![structure, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Retourne la structure de projet stockée pour une conversation.
#[command]
pub fn get_project_structure(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let result: String = conn
        .query_row(
            "SELECT COALESCE(project_structure, '') FROM conversations WHERE id = ?1",
            params![conversation_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    Ok(result)
}

/// Sauvegarde ou met à jour le plan (PLAN.md) d'une conversation.
#[command]
pub fn save_conversation_plan(
    conversation_id: i64,
    content: String,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET plan_content = ?1 WHERE id = ?2",
        params![content, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(format!(
        "✅ Plan sauvegardé pour la conversation #{}",
        conversation_id
    ))
}

/// Retourne le plan stocké pour une conversation.
#[command]
pub fn get_conversation_plan(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let result: String = conn
        .query_row(
            "SELECT COALESCE(plan_content, '') FROM conversations WHERE id = ?1",
            params![conversation_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    Ok(result)
}

// ─── Profil utilisateur (user_facts) ─────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserFact {
    pub key: String,
    pub value: String,
}

/// Retourne toutes les entrées du profil utilisateur.
#[command]
pub fn get_user_facts(state: State<'_, DbState>) -> Result<Vec<UserFact>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT key, value FROM user_facts ORDER BY key ASC")
        .map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([], |r| {
            Ok(UserFact {
                key: r.get(0)?,
                value: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Insère ou met à jour une entrée du profil utilisateur (upsert).
#[command]
pub fn set_user_fact(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO user_facts (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key.trim(), value.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime une entrée du profil utilisateur.
#[command]
pub fn delete_user_fact(key: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM user_facts WHERE key = ?1", params![key.trim()])
        .map_err(|e| e.to_string())?;
    Ok(())
}
