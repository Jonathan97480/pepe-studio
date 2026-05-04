//! Lifecycle du serveur llama-server : spawn, healthcheck, arrêt, logs.

use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle, Manager, State};

// ─── État partagé ─────────────────────────────────────────────────────────────

pub struct LlamaState {
    pub(super) child: Mutex<Option<Child>>,
    pub(super) port: Mutex<Option<u16>>,
    pub n_gpu_layers: Mutex<i32>,
    /// Derniers paramètres de lancement (pour relancer après génération SD)
    pub last_binary: Mutex<Option<PathBuf>>,
    pub last_server_dir: Mutex<Option<PathBuf>>,
    pub last_model_resolved: Mutex<Option<String>>,
    pub last_params: Mutex<Option<Vec<String>>>,
}

impl Default for LlamaState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            n_gpu_layers: Mutex::new(0),
            last_binary: Mutex::new(None),
            last_server_dir: Mutex::new(None),
            last_model_resolved: Mutex::new(None),
            last_params: Mutex::new(None),
        }
    }
}

impl LlamaState {
    /// Arrête le processus enfant et réinitialise le port (thread-safe, sync).
    pub fn stop_sync(&self) {
        *self.port.lock().unwrap() = None;
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Met à jour le child après un spawn externe (thread-safe).
    pub fn set_child_and_port(&self, child: std::process::Child, port: u16) {
        *self.child.lock().unwrap() = Some(child);
        let _ = port; // ignoré intentionnellement ici
    }

    /// Marque le serveur comme disponible sur un port donné.
    pub fn set_port(&self, port: u16) {
        *self.port.lock().unwrap() = Some(port);
    }

    /// Retourne true si llama-server tourne ET utilise le GPU (n_gpu_layers > 0)
    pub fn is_gpu_active(&self) -> bool {
        let port_active = self.port.lock().unwrap().is_some();
        let layers = *self.n_gpu_layers.lock().unwrap();
        port_active && layers != 0
    }

    /// Retourne le port actif ou None.
    pub fn active_port(&self) -> Option<u16> {
        *self.port.lock().unwrap()
    }
}

// ─── Types publics ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LlamaLogs {
    pub stdout_path: String,
    pub stderr_path: String,
    pub stdout: String,
    pub stderr: String,
}

// ─── Constantes ────────────────────────────────────────────────────────────────

pub const SERVER_PORT: u16 = 8765;

// ─── Helpers chemin ────────────────────────────────────────────────────────────

/// Supprime le préfixe \\?\ que Tauri/Windows peut ajouter aux chemins longs.
fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\\") {
        PathBuf::from(stripped.to_string())
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped.to_string())
    } else {
        path
    }
}

fn dir_candidates(base: PathBuf) -> Vec<PathBuf> {
    let stripped = strip_unc_prefix(base.clone());
    if stripped == base {
        vec![base]
    } else {
        vec![base, stripped]
    }
}

fn resolve_model_path(app: &AppHandle, model_path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(model_path);
    let file_name = requested.file_name().unwrap_or_default();
    let mut candidates = Vec::new();

    if requested.is_absolute() {
        candidates.push(requested.to_path_buf());
        candidates.push(strip_unc_prefix(requested.to_path_buf()));
    }

    let mut base_dirs: Vec<PathBuf> = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        base_dirs.extend(dir_candidates(rd));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            base_dirs.extend(dir_candidates(ed.to_path_buf()));
        }
    }
    for base in &base_dirs {
        candidates.push(base.join(file_name));
        candidates.push(base.join("models").join(file_name));
        candidates.push(base.join("_up_").join("models").join(file_name));
        candidates.push(base.join("_up_").join(file_name));
    }

    if !requested.is_absolute() {
        candidates.push(requested.to_path_buf());
        candidates.push(Path::new("..").join(requested));
        candidates.push(Path::new("src-tauri").join(requested));
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    candidates.push(cwd.join("models").join(file_name));

    for candidate in &candidates {
        println!(
            "[llama_sidecar] checking model candidate: {}",
            candidate.display()
        );
        if candidate.exists() {
            return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err(format!("Le modèle '{}' est introuvable", model_path))
}

fn resolve_llama_server_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    let mut base_dirs: Vec<PathBuf> = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        base_dirs.extend(dir_candidates(rd));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            base_dirs.extend(dir_candidates(ed.to_path_buf()));
        }
    }
    for base in &base_dirs {
        candidates.push(base.join("llama-server.exe"));
        candidates.push(base.join("llama-server"));
        candidates.push(base.join("llama.cpp").join("llama-server.exe"));
        candidates.push(base.join("llama.cpp").join("llama-server"));
        candidates.push(base.join("_up_").join("llama.cpp").join("llama-server.exe"));
        candidates.push(base.join("_up_").join("llama.cpp").join("llama-server"));
        candidates.push(base.join("_up_").join("llama-server.exe"));
        candidates.push(base.join("_up_").join("llama-server"));
    }

    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    candidates.push(Path::new("llama.cpp/llama-server.exe").to_path_buf());
    candidates.push(Path::new("llama.cpp/llama-server").to_path_buf());
    candidates.push(cwd.join("llama.cpp").join("llama-server.exe"));
    candidates.push(cwd.join("llama.cpp").join("llama-server"));
    candidates.push(cwd.join("../llama.cpp").join("llama-server.exe"));
    candidates.push(cwd.join("../llama.cpp").join("llama-server"));
    candidates.push(Path::new("./bin/llama-server.exe").to_path_buf());
    candidates.push(Path::new("./bin/llama-server").to_path_buf());
    candidates.push(Path::new("../bin/llama-server.exe").to_path_buf());
    candidates.push(Path::new("../bin/llama-server").to_path_buf());
    candidates.push(cwd.join("llama.cpp/llama-server"));
    candidates.push(cwd.join("../llama.cpp/llama-server.exe"));
    candidates.push(cwd.join("../llama.cpp/llama-server"));

    for candidate in &candidates {
        println!(
            "[llama_sidecar] checking server binary: {}",
            candidate.display()
        );
        if candidate.exists() {
            return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err(format!(
        "Le binaire llama-server est introuvable. Recherché dans: {}",
        candidates
            .iter()
            .map(|c| c.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

// ─── Logs ──────────────────────────────────────────────────────────────────────

pub(super) fn llama_log_paths(app: &AppHandle) -> (PathBuf, PathBuf) {
    let data_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let _ = fs::create_dir_all(&data_dir);
    (
        data_dir.join("llama-server.stdout.log"),
        data_dir.join("llama-server.stderr.log"),
    )
}

pub(super) fn read_log_tail(path: &Path, max_lines: usize) -> String {
    let Ok(content) = fs::read_to_string(path) else {
        return String::new();
    };
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn build_startup_error(app: &AppHandle, headline: &str) -> String {
    let (stdout_path, stderr_path) = llama_log_paths(app);
    let stderr_tail = read_log_tail(&stderr_path, 80);
    let stdout_tail = read_log_tail(&stdout_path, 40);

    let mut message = String::from(headline);
    if !stderr_tail.is_empty() {
        message.push_str("\n\n[llama-server stderr]\n");
        message.push_str(&stderr_tail);
    }
    if !stdout_tail.is_empty() {
        message.push_str("\n\n[llama-server stdout]\n");
        message.push_str(&stdout_tail);
    }
    message.push_str(&format!(
        "\n\nLogs complets:\nstdout: {}\nstderr: {}",
        stdout_path.display(),
        stderr_path.display()
    ));
    message
}

// ─── Commandes Tauri ───────────────────────────────────────────────────────────

#[command]
pub async fn start_llama(
    model_path: String,
    params: Vec<String>,
    state: State<'_, LlamaState>,
    app: AppHandle,
) -> Result<String, String> {
    println!(
        "[llama_sidecar] start_llama called with model_path={}",
        model_path
    );

    // Tuer TOUTES les instances llama-server existantes (évite les processus fantômes)
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "llama-server.exe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        println!("[llama_sidecar] taskkill llama-server.exe done");
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill")
            .args(["-9", "-f", "llama-server"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    std::thread::sleep(Duration::from_millis(300));

    {
        let mut port_lock = state.port.lock().unwrap();
        *port_lock = None;
    }
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    // Extraire le nombre de couches GPU depuis les params (-ngl / --n-gpu-layers)
    {
        let mut ngl: i32 = 0;
        let params_vec: Vec<&str> = params.iter().map(|s| s.as_str()).collect();
        let ngl_keys = ["-ngl", "--n-gpu-layers", "--gpu-layers"];
        for i in 0..params_vec.len() {
            if ngl_keys.contains(&params_vec[i]) {
                if let Some(val) = params_vec.get(i + 1) {
                    ngl = val.parse().unwrap_or(0);
                }
            }
            for key in &ngl_keys {
                if params_vec[i].starts_with(&format!("{}=", key)) {
                    let val = params_vec[i].splitn(2, '=').nth(1).unwrap_or("0");
                    ngl = val.parse().unwrap_or(0);
                }
            }
        }
        *state.n_gpu_layers.lock().unwrap() = ngl;
        println!("[llama_sidecar] n_gpu_layers stocké : {}", ngl);
    }

    let resolved = resolve_model_path(&app, &model_path)?;
    let resolved_str = resolved.to_string_lossy().to_string();
    let server_binary = resolve_llama_server_binary(&app)?;
    let server_dir = server_binary
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();

    *state.last_binary.lock().unwrap() = Some(server_binary.clone());
    *state.last_server_dir.lock().unwrap() = Some(server_dir.clone());
    *state.last_model_resolved.lock().unwrap() = Some(resolved_str.clone());
    *state.last_params.lock().unwrap() = Some(params.clone());

    let (stdout_log_path, stderr_log_path) = llama_log_paths(&app);
    let _ = fs::write(&stdout_log_path, "");
    let _ = fs::write(&stderr_log_path, "");
    let stdout_log = File::create(&stdout_log_path)
        .map_err(|e| format!("Impossible de créer le log stdout llama-server: {}", e))?;
    let stderr_log = File::create(&stderr_log_path)
        .map_err(|e| format!("Impossible de créer le log stderr llama-server: {}", e))?;

    let mut command = Command::new(&server_binary);
    command
        .arg("-m")
        .arg(&resolved_str)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(SERVER_PORT.to_string())
        .args(&params)
        .current_dir(&server_dir)
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log))
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    println!("[llama_sidecar] spawning llama-server: {:?}", command);

    let child = command
        .spawn()
        .map_err(|e| format!("Erreur lancement llama-server: {}", e))?;

    *state.child.lock().unwrap() = Some(child);

    // Attendre que le serveur soit prêt (health check)
    let health_url = format!("http://127.0.0.1:{}/health", SERVER_PORT);
    let client = reqwest::Client::new();
    let timeout = Instant::now() + Duration::from_secs(240);

    println!("[llama_sidecar] en attente du serveur sur {}", health_url);
    loop {
        if Instant::now() > timeout {
            return Err(build_startup_error(
                &app,
                "Timeout: le serveur llama n'a pas démarré dans les délais (240s)",
            ));
        }

        {
            let mut child_lock = state.child.lock().unwrap();
            if let Some(ref mut child) = *child_lock {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        drop(child_lock);
                        return Err(build_startup_error(
                            &app,
                            &format!(
                                "llama-server s'est arrêté prématurément (code: {:?}). Modèle incompatible ou mémoire insuffisante.",
                                status.code()
                            ),
                        ));
                    }
                    _ => {}
                }
            }
        }

        match client.get(&health_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                println!("[llama_sidecar] serveur prêt!");
                break;
            }
            _ => {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    }

    *state.port.lock().unwrap() = Some(SERVER_PORT);
    Ok(format!("Serveur llama démarré sur le port {}", SERVER_PORT))
}

#[command]
pub fn get_llama_logs(app: AppHandle) -> Result<LlamaLogs, String> {
    let (stdout_path, stderr_path) = llama_log_paths(&app);
    Ok(LlamaLogs {
        stdout_path: stdout_path.display().to_string(),
        stderr_path: stderr_path.display().to_string(),
        stdout: read_log_tail(&stdout_path, 120),
        stderr: read_log_tail(&stderr_path, 200),
    })
}

#[command]
pub fn is_llama_running(state: State<'_, LlamaState>) -> bool {
    state.port.lock().unwrap().is_some()
}

/// Arrête le serveur llama à la fermeture de l'app.
pub fn cleanup_llama(state: &LlamaState) {
    *state.port.lock().unwrap() = None;
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[command]
pub async fn stop_llama(state: State<'_, LlamaState>) -> Result<String, String> {
    println!("[llama_sidecar] stop_llama called");
    *state.port.lock().unwrap() = None;
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok("Serveur llama arrêté".into())
}
