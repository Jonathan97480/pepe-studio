//! Wrapper Rust pour lancer llama-server et communiquer via HTTP/SSE avec le frontend Tauri

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{command, AppHandle, Manager, State};

pub struct LlamaState {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
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

    /// Met à jour le child et le port après un spawn externe (thread-safe).
    pub fn set_child_and_port(&self, child: std::process::Child, port: u16) {
        *self.child.lock().unwrap() = Some(child);
        // Le port sera mis à jour une fois le serveur prêt (via set_port)
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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: serde_json::Value, // String ou tableau [{type,text},{type,image_url}] pour le multimodal
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LlamaLogs {
    pub stdout_path: String,
    pub stderr_path: String,
    pub stdout: String,
    pub stderr: String,
}

const SERVER_PORT: u16 = 8765;

/// Supprime le préfixe \\?\  que Tauri/Windows peut ajouter aux chemins longs.
/// Ce préfixe peut empêcher .exists() de fonctionner sur certains systèmes.
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

/// Retourne toutes les variantes d'un répertoire base à vérifier (avec/sans préfixe UNC).
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

    // 1. Chemin absolu fourni directement
    if requested.is_absolute() {
        candidates.push(requested.to_path_buf());
        candidates.push(strip_unc_prefix(requested.to_path_buf()));
    }

    // 2. App bundlée : resource_dir + current_exe dir (couvre les variantes \\?\)
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
        // Tauri transforme "../models/*" en "_up_/models/" dans l'installeur
        candidates.push(base.join("_up_").join("models").join(file_name));
        candidates.push(base.join("_up_").join(file_name));
    }

    // 3. Fallback développement : chemins relatifs
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
            return Ok(candidate
                .canonicalize()
                .unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err(format!("Le modèle '{}' est introuvable", model_path))
}

fn resolve_llama_server_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. App bundlée : resource_dir et current_exe dir, avec/sans préfixe \\?\
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
        // Tauri transforme "../llama.cpp/*" en "_up_/llama.cpp/" dans l'installeur
        candidates.push(base.join("_up_").join("llama.cpp").join("llama-server.exe"));
        candidates.push(base.join("_up_").join("llama.cpp").join("llama-server"));
        candidates.push(base.join("_up_").join("llama-server.exe"));
        candidates.push(base.join("_up_").join("llama-server"));
    }

    // 2. Fallback développement : chemins relatifs au répertoire courant
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
            return Ok(candidate
                .canonicalize()
                .unwrap_or_else(|_| candidate.clone()));
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

fn llama_log_paths(app: &AppHandle) -> (PathBuf, PathBuf) {
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

fn read_log_tail(path: &Path, max_lines: usize) -> String {
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
    // Laisser le temps aux processus de se terminer
    std::thread::sleep(Duration::from_millis(300));

    // Arrêter le serveur précédent géré par cet état
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
            // Forme "--n-gpu-layers=N"
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
    // Répertoire du binaire pour que Windows trouve les DLLs (ggml-base.dll, llama.dll, etc.)
    let server_dir = server_binary
        .parent()
        .unwrap_or(std::path::Path::new("."))
        .to_path_buf();

    // Mémoriser les paramètres pour pouvoir relancer après génération SD
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
        .current_dir(&server_dir) // Garantit que les DLLs adjacentes (ggml-base.dll, etc.) sont trouvées
        .stdout(Stdio::from(stdout_log))
        .stderr(Stdio::from(stderr_log))
        .stdin(Stdio::null());

    // Masquer la fenêtre console sur Windows
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

        // Vérifier que le processus est encore vivant (non-bloquant)
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

/// Retourne true si llama-server est en cours d'exécution (port actif).
#[command]
pub fn is_llama_running(state: State<'_, LlamaState>) -> bool {
    state.port.lock().unwrap().is_some()
}

/// Arrête le serveur llama à la fermeture de l’app.
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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SamplingParams {
    pub top_p: Option<f64>,
    pub top_k: Option<i64>,
    pub penalty_last_n: Option<i64>,
    pub repeat_penalty: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
    pub mirostat: Option<i64>,
    pub mirostat_tau: Option<f64>,
    pub mirostat_eta: Option<f64>,
    pub min_p: Option<f64>,
    pub typical_p: Option<f64>,
    pub dyna_temp_range: Option<f64>,
    pub dyna_temp_exponent: Option<f64>,
    pub xtc_probability: Option<f64>,
    pub xtc_threshold: Option<f64>,
    pub top_n_sigma: Option<f64>,
    pub dry_multiplier: Option<f64>,
    pub dry_base: Option<f64>,
    pub dry_allowed_length: Option<i64>,
    pub dry_penalty_last_n: Option<i64>,
    pub dry_sequence_breakers: Option<String>,
}

#[command]
pub async fn send_llama_prompt(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    prompt_id: String,
    temperature: f64,
    max_tokens: Option<i64>,
    sampling: Option<SamplingParams>,
    thinking_enabled: Option<bool>,
    state: State<'_, LlamaState>,
) -> Result<serde_json::Value, String> {
    let port = state.port.lock().unwrap().ok_or_else(|| {
        "Aucun serveur llama démarré. Veuillez charger le modèle d'abord.".to_string()
    })?;

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);

    // Limiter la génération pour éviter les boucles infinies (thinking dégénéré, etc.)
    let effective_max_tokens = max_tokens.filter(|&v| v > 0).unwrap_or(8192);

    let s = sampling.unwrap_or_default();

    let mut body = serde_json::json!({
        "model": "local",
        "messages": messages,
        "stream": true,
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
        "frequency_penalty": s.frequency_penalty.unwrap_or(0.5),
        "presence_penalty": s.presence_penalty.unwrap_or(0.3),
        "repeat_penalty": s.repeat_penalty.unwrap_or(1.1),
        "top_p": s.top_p.unwrap_or(0.95),
        "top_k": s.top_k.unwrap_or(40),
        "min_p": s.min_p.unwrap_or(0.05),
        "typical_p": s.typical_p.unwrap_or(1.0),
    });

    // Conditionally add optional llama.cpp params
    let obj = body.as_object_mut().unwrap();

    if let Some(v) = s.penalty_last_n {
        obj.insert("penalty_last_n".into(), serde_json::json!(v));
    }
    if let Some(v) = s.mirostat {
        if v > 0 {
            obj.insert("mirostat".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.mirostat_tau {
        obj.insert("mirostat_tau".into(), serde_json::json!(v));
    }
    if let Some(v) = s.mirostat_eta {
        obj.insert("mirostat_eta".into(), serde_json::json!(v));
    }
    if let Some(v) = s.dyna_temp_range {
        if v > 0.0 {
            obj.insert("dynatemp_range".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.dyna_temp_exponent {
        obj.insert("dynatemp_exponent".into(), serde_json::json!(v));
    }
    if let Some(v) = s.xtc_probability {
        if v > 0.0 {
            obj.insert("xtc_probability".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.xtc_threshold {
        obj.insert("xtc_threshold".into(), serde_json::json!(v));
    }
    if let Some(v) = s.top_n_sigma {
        if v >= 0.0 {
            obj.insert("top_n_sigma".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.dry_multiplier {
        if v > 0.0 {
            obj.insert("dry_multiplier".into(), serde_json::json!(v));
            obj.insert(
                "dry_base".into(),
                serde_json::json!(s.dry_base.unwrap_or(1.75)),
            );
            obj.insert(
                "dry_allowed_length".into(),
                serde_json::json!(s.dry_allowed_length.unwrap_or(2)),
            );
            if let Some(pln) = s.dry_penalty_last_n {
                obj.insert("dry_penalty_last_n".into(), serde_json::json!(pln));
            }
            if let Some(ref breakers) = s.dry_sequence_breakers {
                let parsed: Vec<String> = breakers
                    .split(',')
                    .map(|b| b.trim().trim_matches('"').to_string())
                    .filter(|b| !b.is_empty())
                    .collect();
                if !parsed.is_empty() {
                    obj.insert("dry_sequence_breakers".into(), serde_json::json!(parsed));
                }
            }
        }
    }

    // Thinking: enabled by default (llama.cpp uses "think" field)
    if thinking_enabled == Some(false) {
        obj.insert("think".into(), serde_json::json!(false));
    } else {
        obj.insert("think".into(), serde_json::json!(true));
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erreur requête llama-server: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Erreur serveur llama ({}): {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Connexion interrompue avec le serveur llama: {}", e);
                let _ = app.emit_all(
                    "llama-error",
                    serde_json::json!({
                        "prompt_id": prompt_id,
                        "error": err_msg,
                    }),
                );
                return Err(err_msg);
            }
        };
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // Traiter toutes les lignes complètes dans le buffer
        loop {
            match buffer.find('\n') {
                None => break,
                Some(newline_pos) => {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if !line.starts_with("data: ") {
                        continue;
                    }

                    let data = &line[6..];

                    if data == "[DONE]" {
                        let _ = app.emit_all(
                            "llama-done",
                            serde_json::json!({
                                "prompt_id": prompt_id,
                                "done": true,
                            }),
                        );
                        return Ok(serde_json::json!({ "done": true }));
                    }

                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        // Contenu de réflexion (thinking models: deepseek, gemma thinking, etc.)
                        if let Some(thinking) =
                            parsed["choices"][0]["delta"]["reasoning_content"].as_str()
                        {
                            if !thinking.is_empty() {
                                let _ = app.emit_all(
                                    "llama-stream",
                                    serde_json::json!({
                                        "prompt_id": prompt_id,
                                        "chunk": thinking,
                                        "is_thinking": true,
                                    }),
                                );
                            }
                        }
                        // Contenu normal
                        if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                let _ = app.emit_all(
                                    "llama-stream",
                                    serde_json::json!({
                                        "prompt_id": prompt_id,
                                        "chunk": content,
                                        "is_thinking": false,
                                    }),
                                );
                            }
                        }
                        if parsed["choices"][0]["finish_reason"].as_str() == Some("stop") {
                            // Extraire les timings du dernier chunk
                            let meta: Option<String> = {
                                let timings = &parsed["timings"];
                                if timings.is_object() {
                                    let gen_tps = timings["predicted_per_second"].as_f64();
                                    let prompt_tps = timings["prompt_per_second"].as_f64();
                                    match (prompt_tps, gen_tps) {
                                        (Some(p), Some(g)) => Some(format!(
                                            "Prompt: {:.1} t/s | Génération: {:.1} t/s",
                                            p, g
                                        )),
                                        (None, Some(g)) => {
                                            Some(format!("Génération: {:.1} t/s", g))
                                        }
                                        _ => None,
                                    }
                                } else {
                                    None
                                }
                            };
                            // Extraire l'usage des tokens (prompt_tokens) si présent
                            let prompt_tokens = parsed["usage"]["prompt_tokens"].as_u64();
                            let _ = app.emit_all(
                                "llama-done",
                                serde_json::json!({
                                    "prompt_id": prompt_id,
                                    "done": true,
                                    "meta": meta,
                                    "prompt_tokens": prompt_tokens,
                                }),
                            );
                            return Ok(serde_json::json!({ "done": true }));
                        }
                        // Certaines versions de llama-server envoient usage dans un chunk séparé
                        // sans finish_reason → on stocke pour l'émettre au prochain llama-done
                        if parsed["usage"].is_object()
                            && parsed["choices"].as_array().map_or(true, |c| c.is_empty())
                        {
                            let prompt_tokens = parsed["usage"]["prompt_tokens"].as_u64();
                            let _ = app.emit_all(
                                "llama-usage",
                                serde_json::json!({
                                    "prompt_id": prompt_id,
                                    "prompt_tokens": prompt_tokens,
                                }),
                            );
                        }
                    }
                }
            }
        }
    }

    // Fin du stream sans [DONE] explicite — vérifier si le serveur est encore vivant
    let health_url = format!("http://127.0.0.1:{}/health", SERVER_PORT);
    let health_client = reqwest::Client::builder()
        .timeout(Duration::from_millis(2000))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match health_client.get(&health_url).send().await {
        Ok(r) if r.status().is_success() => {
            // Serveur toujours vivant — génération terminée normalement
            let _ = app.emit_all(
                "llama-done",
                serde_json::json!({
                    "prompt_id": prompt_id,
                    "done": true,
                    "meta": null,
                }),
            );
        }
        _ => {
            // Serveur mort — crash probable (OOM, SIGSEGV, modèle incompatible)
            let _ = app.emit_all("llama-error", serde_json::json!({
                "prompt_id": prompt_id,
                "error": "Le serveur llama-server s'est arrêté de façon inattendue. Rechargez le modèle (mémoire insuffisante ou crash).",
            }));
        }
    }
    Ok(serde_json::json!({ "done": true }))
}
