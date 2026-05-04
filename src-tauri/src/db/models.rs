//! Gestion des configurations de modèles (CRUD SQLite) et découverte des fichiers .gguf.

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle, State};

use super::DbState;

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
