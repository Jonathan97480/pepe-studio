//! Système de logs par session.
//! Un fichier de log est créé à chaque démarrage dans APPDATA/pepe-studio/logs/.
//! Format : session_YYYY-MM-DD_HH-mm-ss.log

use chrono::Local;
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::sync::Mutex;
use tauri::AppHandle;

#[derive(Debug)]
pub struct AppLogger {
    log_dir: std::path::PathBuf,
    log_file_path: std::path::PathBuf,
    writer: Mutex<std::io::BufWriter<File>>,
}

impl AppLogger {
    pub fn new(app: &AppHandle) -> Self {
        let data_dir = app
            .path_resolver()
            .app_data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."));

        let log_dir = data_dir.join("logs");
        let _ = fs::create_dir_all(&log_dir);

        let session_name = Local::now()
            .format("session_%Y-%m-%d_%H-%M-%S.log")
            .to_string();
        let log_file_path = log_dir.join(&session_name);

        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file_path)
            .unwrap_or_else(|e| {
                panic!(
                    "Impossible de créer le fichier de log {}: {}",
                    log_file_path.display(),
                    e
                )
            });

        let writer = Mutex::new(std::io::BufWriter::with_capacity(8192, file));

        let logger = Self {
            log_dir,
            log_file_path,
            writer,
        };

        logger.write("INFO", "app", "Pepe-Studio session démarrée");

        // Purger les anciens logs (> 30 sessions)
        logger.purge_old_sessions(30);

        logger
    }

    fn write(&self, level: &str, source: &str, message: &str) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
        let line = format!("[{}] [{}] [{}] {}\n", timestamp, level, source, message);

        if let Ok(mut w) = self.writer.lock() {
            let _ = w.write_all(line.as_bytes());
            let _ = w.flush();
        }
    }

    fn purge_old_sessions(&self, keep_count: usize) {
        let Ok(entries) = fs::read_dir(&self.log_dir) else {
            return;
        };

        let mut sessions: Vec<std::path::PathBuf> = entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "log")
                    .unwrap_or(false)
                    && e.file_name().to_string_lossy().starts_with("session_")
            })
            .map(|e| e.path())
            .collect();

        sessions.sort();

        let to_remove = sessions.len().saturating_sub(keep_count);
        for path in sessions.into_iter().take(to_remove) {
            let _ = fs::remove_file(&path);
        }
    }

    pub fn log_entry(&self, level: String, source: String, message: String) {
        self.write(&level, &source, &message);
    }

    pub fn get_current_log_path(&self) -> String {
        self.log_file_path.to_string_lossy().replace('\\', "/")
    }

    pub fn list_log_sessions(&self) -> Vec<String> {
        let Ok(entries) = fs::read_dir(&self.log_dir) else {
            return vec![];
        };

        let mut sessions: Vec<String> = entries
            .flatten()
            .filter(|e| {
                e.path()
                    .extension()
                    .map(|ext| ext == "log")
                    .unwrap_or(false)
                    && e.file_name().to_string_lossy().starts_with("session_")
            })
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        sessions.sort();
        sessions.reverse();
        sessions
    }

    pub fn read_log_session(&self, filename: String, max_lines: usize) -> Result<String, String> {
        // Sécurité : n'accepter que les noms de fichier session_*.log
        if !filename.starts_with("session_")
            || !filename.ends_with(".log")
            || filename.contains("..")
            || filename.contains('/')
            || filename.contains('\\')
        {
            return Err("Nom de fichier invalide".into());
        }

        let path = self.log_dir.join(&filename);
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Fichier introuvable : {}", e))?;

        let lines: Vec<&str> = content.lines().collect();
        let start = lines.len().saturating_sub(max_lines);
        Ok(lines[start..].join("\n"))
    }
}

// ── Commandes Tauri ──────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct LogSessionInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn app_log(logger: tauri::State<AppLogger>, level: String, source: String, message: String) {
    logger.log_entry(level, source, message);
}

#[tauri::command]
pub fn get_current_log_path(logger: tauri::State<AppLogger>) -> String {
    logger.get_current_log_path()
}

#[tauri::command]
pub fn list_log_sessions(logger: tauri::State<AppLogger>) -> Vec<LogSessionInfo> {
    let data_dir = logger.log_dir.clone();
    logger
        .list_log_sessions()
        .into_iter()
        .map(|filename| {
            let path = data_dir.join(&filename);
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            LogSessionInfo {
                path: path.to_string_lossy().replace('\\', "/"),
                filename,
                size_bytes: size,
            }
        })
        .collect()
}

#[tauri::command]
pub fn read_log_session(
    logger: tauri::State<AppLogger>,
    filename: String,
    max_lines: Option<usize>,
) -> Result<String, String> {
    logger.read_log_session(filename, max_lines.unwrap_or(500))
}
