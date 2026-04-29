//! Génération d'images via stable-diffusion.cpp + upscale optionnel via Real-ESRGAN

use crate::llama_sidecar::LlamaState;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager, State};

const DEFAULT_NEGATIVE_PROMPT: &str =
    "lowres, blurry, bad anatomy, bad hands, missing hands, extra fingers, too many fingers, fused fingers, mutated hands, deformed, disfigured, ugly, gross proportions, bad face, disfigured face, poorly drawn face, distorted face, mutation, duplicate, multiple people, multiple faces, cloned face, extra heads, extra persons, crowd, out of frame, cropped, worst quality, low quality, jpeg artifacts, artifacts, glitch, noise, distortion, chromatic aberration, color bleeding, pixelated, oversaturated, text, watermark, logo, signature";
const SD_SERVER_PORT: u16 = 12711;

pub struct SdServerState {
    child: Mutex<Option<std::process::Child>>,
    model_path: Mutex<Option<String>>,
}

impl Default for SdServerState {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            model_path: Mutex::new(None),
        }
    }
}

impl SdServerState {
    fn stop_sync(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        *self.model_path.lock().unwrap() = None;
    }
}

pub fn cleanup_sd_server(state: &SdServerState) {
    state.stop_sync();
}

// ─── Helpers chemin ──────────────────────────────────────────────────────────

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

fn base_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        let s = strip_unc_prefix(rd.clone());
        dirs.push(rd);
        if s != dirs[dirs.len() - 1] {
            dirs.push(s);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            let p = ed.to_path_buf();
            let s = strip_unc_prefix(p.clone());
            dirs.push(p);
            if s != dirs[dirs.len() - 1] {
                dirs.push(s);
            }
        }
    }
    dirs
}

fn resolve_binary(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    for base in base_dirs(app) {
        candidates.push(base.join(name));
        candidates.push(base.join("llama.cpp").join(name));
        candidates.push(base.join("_up_").join("llama.cpp").join(name));
        candidates.push(base.join("_up_").join(name));
    }
    candidates.push(cwd.join("llama.cpp").join(name));
    candidates.push(cwd.join(name));
    candidates.push(Path::new("llama.cpp").join(name).to_path_buf());

    for c in &candidates {
        if c.exists() {
            return Ok(c.canonicalize().unwrap_or_else(|_| c.clone()));
        }
    }
    Err(format!("Binaire '{}' introuvable dans llama.cpp/", name))
}

fn resolve_sd_model(app: &AppHandle, model: Option<&str>) -> Result<PathBuf, String> {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    for base in base_dirs(app) {
        search_dirs.push(base.join("models").join("sd"));
        search_dirs.push(base.join("models"));
        search_dirs.push(base.join("_up_").join("models").join("sd"));
        search_dirs.push(base.join("_up_").join("models"));
    }
    search_dirs.push(cwd.join("models").join("sd"));
    search_dirs.push(cwd.join("models"));

    if let Some(name) = model {
        let p = Path::new(name);
        // Chemin absolu fourni directement
        if p.is_absolute() && p.exists() {
            return Ok(p.to_path_buf());
        }
        for dir in &search_dirs {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Ok(candidate.canonicalize().unwrap_or(candidate));
            }
        }
        // Le modèle demandé n'existe pas (souvent halluciné par le LLM) :
        // on retente en auto-détection au lieu d'échouer immédiatement.
        println!(
            "[image_gen] modèle SD demandé introuvable: '{}', fallback auto-détection",
            name
        );
    }

    // Auto-détection : premier .safetensors ou .ckpt trouvé
    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(ext) = p.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if ext == "safetensors" || ext == "ckpt" {
                        return Ok(p);
                    }
                }
            }
        }
    }
    Err("Aucun modèle SD trouvé dans models/sd/ ou models/. Placez un fichier .safetensors dans models/sd/".into())
}

fn images_output_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let dir = base.join("images");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn ensure_sd_server(
    app: &AppHandle,
    state: &SdServerState,
    model_path: &Path,
) -> Result<String, String> {
    let base_url = format!("http://127.0.0.1:{}", SD_SERVER_PORT);

    let same_model_running = {
        let model_guard = state.model_path.lock().unwrap();
        let child_guard = state.child.lock().unwrap();
        let model = model_path.to_string_lossy().to_string();
        child_guard.is_some() && model_guard.as_deref() == Some(model.as_str())
    };

    if same_model_running {
        let health = reqwest::blocking::get(format!("{}/sdcpp/v1/capabilities", base_url));
        if let Ok(resp) = health {
            if resp.status().is_success() {
                return Ok(base_url);
            }
        }
    }

    state.stop_sync();

    let server_bin = resolve_binary(app, "sd-server.exe")?;
    let server_dir = server_bin.parent().unwrap_or(Path::new(".")).to_path_buf();

    let mut cmd = Command::new(&server_bin);
    cmd.arg("-m")
        .arg(model_path)
        .arg("--listen-ip")
        .arg("127.0.0.1")
        .arg("--listen-port")
        .arg(SD_SERVER_PORT.to_string())
        .arg("--mmap")
        .current_dir(server_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Impossible de démarrer sd-server.exe: {}", e))?;

    {
        *state.child.lock().unwrap() = Some(child);
        *state.model_path.lock().unwrap() = Some(model_path.to_string_lossy().to_string());
    }

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    while std::time::Instant::now() < deadline {
        let health = reqwest::blocking::get(format!("{}/sdcpp/v1/capabilities", base_url));
        if let Ok(resp) = health {
            if resp.status().is_success() {
                return Ok(base_url);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    Err("sd-server.exe a démarré mais ne répond pas à l'API".into())
}

fn run_optional_upscale(
    app: &AppHandle,
    out_dir: &Path,
    out_file: &Path,
    timestamp: u128,
    upscale: bool,
) -> (PathBuf, bool) {
    let mut final_path = out_file.to_path_buf();
    let mut upscaled = false;

    if upscale {
        match resolve_binary(app, "realesrgan-ncnn-vulkan.exe") {
            Ok(esr_bin) => {
                let esr_dir = esr_bin.parent().unwrap_or(Path::new(".")).to_path_buf();
                let upscaled_file = out_dir.join(format!("image_{}_4x.png", timestamp));
                let mut esr_cmd = Command::new(&esr_bin);
                esr_cmd
                    .arg("-i")
                    .arg(out_file)
                    .arg("-o")
                    .arg(&upscaled_file)
                    .arg("-n")
                    .arg("realesrgan-x4plus")
                    .current_dir(&esr_dir)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .stdin(Stdio::null());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    esr_cmd.creation_flags(0x08000000);
                }

                if let Ok(st) = esr_cmd.status() {
                    if st.success() && upscaled_file.exists() {
                        final_path = upscaled_file;
                        upscaled = true;
                    }
                }
            }
            Err(_) => {
                // Pas d'upscaler : image de base conservée.
            }
        }
    }

    (final_path, upscaled)
}

/// VRAM estimée nécessaire pour sd.exe SD 1.5 à 512px (marge incluse), en MB.
const SD_VRAM_REQUIRED_MB: u64 = 2800;
/// Marge de sécurité supplémentaire pour éviter les crashs TDR.
const SD_VRAM_SAFETY_MARGIN_MB: u64 = 300;

/// Interroge nvidia-smi pour connaître la VRAM libre sur le GPU 0.
/// Retourne None si nvidia-smi n'est pas disponible ou l'appel échoue.
#[cfg(target_os = "windows")]
fn query_free_vram_mb() -> Option<u64> {
    use std::os::windows::process::CommandExt;
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=memory.free", "--format=csv,noheader,nounits"])
        .creation_flags(0x08000000)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines().next()?.trim().parse::<u64>().ok()
}

#[cfg(not(target_os = "windows"))]
fn query_free_vram_mb() -> Option<u64> {
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=memory.free", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines().next()?.trim().parse::<u64>().ok()
}

/// Vérifie s'il y a assez de VRAM libre pour faire tourner SD en parallèle du LLM.
fn has_enough_free_vram() -> bool {
    match query_free_vram_mb() {
        Some(free_mb) => {
            let needed = SD_VRAM_REQUIRED_MB + SD_VRAM_SAFETY_MARGIN_MB;
            println!(
                "[image_gen] VRAM libre : {} MB, nécessaire : {} MB → coexistence {}",
                free_mb,
                needed,
                if free_mb >= needed {
                    "OK"
                } else {
                    "IMPOSSIBLE"
                }
            );
            free_mb >= needed
        }
        None => {
            println!("[image_gen] nvidia-smi indisponible → mode stop/restart par défaut");
            false
        }
    }
}

// ─── Commandes Tauri ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImageGenResult {
    pub path: String,
    pub upscaled: bool,
    /// True si llama-server a été arrêté pour libérer la VRAM — le frontend doit le relancer
    pub llama_was_stopped: bool,
}

fn parse_aspect_ratio(aspect_ratio: Option<&str>) -> Option<(u32, u32)> {
    let raw = aspect_ratio?.trim().to_lowercase();
    if raw.is_empty() {
        return None;
    }

    if raw == "square" {
        return Some((1, 1));
    }
    if raw == "landscape" {
        return Some((16, 9));
    }
    if raw == "portrait" {
        return Some((9, 16));
    }

    let parts: Vec<&str> = raw
        .split(|c| c == ':' || c == '/' || c == 'x')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();

    if parts.len() != 2 {
        return None;
    }

    let w = parts[0].parse::<u32>().ok()?;
    let h = parts[1].parse::<u32>().ok()?;
    if w == 0 || h == 0 {
        return None;
    }

    Some((w, h))
}

fn normalize_dim(value: u32, min: u32, max: u32) -> u32 {
    let clamped = value.clamp(min, max);
    // sd.cpp supporte mieux des tailles paires; on arrondit au multiple de 8 le plus proche.
    let rounded = ((clamped + 4) / 8) * 8;
    rounded.clamp(min, max)
}

fn resolve_dimensions(
    width: Option<u32>,
    height: Option<u32>,
    aspect_ratio: Option<&str>,
) -> (u32, u32) {
    const MIN_DIM: u32 = 256;
    const MAX_DIM: u32 = 768;
    const DEFAULT_DIM: u32 = 512;

    let ratio = parse_aspect_ratio(aspect_ratio);

    let (raw_w, raw_h) = match (width, height, ratio) {
        (Some(w), Some(h), _) => (w, h),
        (Some(w), None, Some((rw, rh))) => {
            let h = ((w as f64) * (rh as f64) / (rw as f64)).round().max(1.0) as u32;
            (w, h)
        }
        (None, Some(h), Some((rw, rh))) => {
            let w = ((h as f64) * (rw as f64) / (rh as f64)).round().max(1.0) as u32;
            (w, h)
        }
        (None, None, Some((rw, rh))) => {
            if rw >= rh {
                let h = ((MAX_DIM as f64) * (rh as f64) / (rw as f64))
                    .round()
                    .max(1.0) as u32;
                (MAX_DIM, h)
            } else {
                let w = ((MAX_DIM as f64) * (rw as f64) / (rh as f64))
                    .round()
                    .max(1.0) as u32;
                (w, MAX_DIM)
            }
        }
        (Some(w), None, None) => (w, DEFAULT_DIM),
        (None, Some(h), None) => (DEFAULT_DIM, h),
        (None, None, None) => (DEFAULT_DIM, DEFAULT_DIM),
    };

    (
        normalize_dim(raw_w, MIN_DIM, MAX_DIM),
        normalize_dim(raw_h, MIN_DIM, MAX_DIM),
    )
}

/// Génère une image avec stable-diffusion.cpp.
/// Si llama-server tourne sur GPU, il est arrêté avant la génération pour libérer la VRAM
/// (évite le crash TDR Windows / écran noir). Un événement Tauri "llama-restart-needed"
/// est émis après la génération pour que le frontend relance le LLM automatiquement.
#[command]
pub fn generate_image(
    prompt: String,
    negative_prompt: Option<String>,
    aspect_ratio: Option<String>,
    steps: Option<u32>,
    cfg_scale: Option<f32>,
    sampler: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    model: Option<String>,
    upscale: bool,
    seed: Option<i64>,
    llama_state: State<'_, LlamaState>,
    sd_server_state: State<'_, SdServerState>,
    app: AppHandle,
) -> Result<ImageGenResult, String> {
    let sd_bin = resolve_binary(&app, "sd.exe")?;
    let sd_dir = sd_bin.parent().unwrap_or(Path::new(".")).to_path_buf();
    let model_path = resolve_sd_model(&app, model.as_deref())?;
    let out_dir = images_output_dir(&app);
    let (safe_width, safe_height) = resolve_dimensions(width, height, aspect_ratio.as_deref());
    let safe_steps = steps.unwrap_or(35).clamp(10, 50);
    let safe_cfg_scale = cfg_scale.unwrap_or(7.5_f32).clamp(1.0_f32, 20.0_f32);
    let effective_sampler = sampler.as_deref().unwrap_or("euler_a");

    // ── Décision coexistence LLM + SD ────────────────────────────────────────
    // Si llama-server utilise le GPU, on vérifie la VRAM libre :
    //   • Assez de VRAM libre (≥ 3.1 GB) → coexistence, pas besoin d'arrêter llama
    //   • Pas assez → on arrête llama pour libérer la VRAM (comportement précédent)
    let llama_was_stopped = if llama_state.is_gpu_active() {
        if has_enough_free_vram() {
            println!("[image_gen] VRAM suffisante → coexistence LLM + SD (llama-server maintenu)");
            false
        } else {
            println!("[image_gen] VRAM insuffisante → arrêt llama-server pour libérer la VRAM");
            llama_state.stop_sync();
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/IM", "llama-server.exe"])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
            println!("[image_gen] llama-server arrêté — VRAM libérée");
            true
        }
    } else {
        false
    };

    // Nom de fichier unique horodaté
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out_file = out_dir.join(format!("image_{}.png", timestamp));
    let preview_file = out_dir.join(format!("preview_{}.png", timestamp));

    // Option 2 : backend persistant sd-server.exe (modèle gardé en VRAM)
    // Activé quand le binaire est disponible ET qu'on n'a pas dû arrêter llama pour VRAM.
    if !llama_was_stopped && resolve_binary(&app, "sd-server.exe").is_ok() {
        let server_url = ensure_sd_server(&app, &sd_server_state, &model_path)?;
        let effective_negative_prompt = negative_prompt
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_NEGATIVE_PROMPT);

        let payload = serde_json::json!({
            "prompt": prompt,
            "negative_prompt": effective_negative_prompt,
            "clip_skip": 2,
            "width": safe_width,
            "height": safe_height,
            "seed": seed.unwrap_or(-1),
            "strength": 0.75,
            "batch_count": 1,
            "sample_params": {
                "sample_method": effective_sampler,
                "sample_steps": safe_steps,
                "scheduler": "discrete",
                "eta": 1.0,
                "shifted_timestep": 0,
                "flow_shift": 0.0,
                "guidance": {
                    "txt_cfg": safe_cfg_scale,
                    "img_cfg": safe_cfg_scale,
                    "distilled_guidance": 3.5,
                    "slg": {
                        "layers": [7, 8, 9],
                        "layer_start": 0.01,
                        "layer_end": 0.2,
                        "scale": 0.0
                    }
                }
            },
            "output_format": "png"
        });

        let submit_resp = reqwest::blocking::Client::new()
            .post(format!("{}/sdcpp/v1/img_gen", server_url))
            .json(&payload)
            .send()
            .map_err(|e| format!("Erreur HTTP sd-server submit: {}", e))?;

        if !submit_resp.status().is_success() {
            return Err(format!(
                "sd-server submit échoué (HTTP {})",
                submit_resp.status()
            ));
        }

        let submit_json: serde_json::Value = submit_resp
            .json()
            .map_err(|e| format!("Réponse sd-server invalide: {}", e))?;
        let poll_url = submit_json
            .get("poll_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "sd-server: poll_url manquant".to_string())?;

        let poll_full = if poll_url.starts_with("http") {
            poll_url.to_string()
        } else {
            format!("{}{}", server_url, poll_url)
        };

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(360);
        let mut b64_image: Option<String> = None;
        while std::time::Instant::now() < deadline {
            let job_resp = reqwest::blocking::get(&poll_full)
                .map_err(|e| format!("Erreur HTTP sd-server poll: {}", e))?;
            if !job_resp.status().is_success() {
                return Err(format!(
                    "sd-server poll échoué (HTTP {})",
                    job_resp.status()
                ));
            }

            let job_json: serde_json::Value = job_resp
                .json()
                .map_err(|e| format!("JSON job invalide: {}", e))?;

            match job_json
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
            {
                "completed" => {
                    b64_image = job_json
                        .get("result")
                        .and_then(|v| v.get("images"))
                        .and_then(|v| v.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|v| v.get("b64_json"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    if let Some(ref b64_final) = b64_image {
                        let data_url = format!("data:image/png;base64,{}", b64_final);
                        let _ = app.emit_all(
                            "sd-preview",
                            serde_json::json!({ "data_url": data_url, "progress": 100 }),
                        );
                    } else {
                        let _ = app.emit_all("sd-preview", serde_json::json!({ "progress": 100 }));
                    }
                    break;
                }
                "failed" | "cancelled" => {
                    let err_msg = job_json
                        .get("error")
                        .and_then(|v| v.get("message"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("job failed")
                        .to_string();
                    return Err(format!("sd-server job: {}", err_msg));
                }
                _ => {
                    // Émettre la progression en temps réel (certains serveurs renvoient 0..1, d'autres 0..100)
                    let status = job_json
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let raw_progress = job_json
                        .get("progress")
                        .or_else(|| job_json.get("state").and_then(|v| v.get("progress")))
                        .and_then(|v| v.as_f64());
                    let progress = if let Some(p) = raw_progress {
                        if p <= 1.0 {
                            (p * 100.0).round().clamp(0.0, 100.0) as u32
                        } else {
                            p.round().clamp(0.0, 100.0) as u32
                        }
                    } else if status.contains("queue") {
                        5
                    } else if status.contains("run") || status.contains("process") {
                        35
                    } else {
                        0
                    };

                    // Certaines versions du serveur retournent une image de prévisualisation
                    let preview_b64 =
                        job_json
                            .get("preview")
                            .and_then(|v| v.as_str())
                            .or_else(|| {
                                job_json
                                    .get("images")
                                    .and_then(|v| v.as_array())
                                    .and_then(|arr| arr.first())
                                    .and_then(|v| v.get("b64_json"))
                                    .and_then(|v| v.as_str())
                            });
                    if let Some(b64_prev) = preview_b64 {
                        let data_url = format!("data:image/png;base64,{}", b64_prev);
                        let _ = app.emit_all(
                            "sd-preview",
                            serde_json::json!({ "data_url": data_url, "progress": progress }),
                        );
                    } else {
                        let _ =
                            app.emit_all("sd-preview", serde_json::json!({ "progress": progress }));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(250));
                }
            }
        }

        let _ = app.emit_all("sd-preview-done", serde_json::json!({}));
        let b64 = b64_image.ok_or_else(|| "sd-server timeout ou image absente".to_string())?;
        let bytes = BASE64_STANDARD
            .decode(b64)
            .map_err(|e| format!("Décodage image sd-server échoué: {}", e))?;
        fs::write(&out_file, bytes).map_err(|e| format!("Écriture image échouée: {}", e))?;

        let (final_path, upscaled) =
            run_optional_upscale(&app, &out_dir, &out_file, timestamp, upscale);
        return Ok(ImageGenResult {
            path: final_path.to_string_lossy().to_string(),
            upscaled,
            llama_was_stopped: false,
        });
    }

    let mut cmd = Command::new(&sd_bin);
    cmd.arg("-m")
        .arg(&model_path)
        .arg("-p")
        .arg(&prompt)
        .arg("-o")
        .arg(&out_file)
        .arg("-W")
        .arg(safe_width.to_string())
        .arg("-H")
        .arg(safe_height.to_string())
        .arg("--steps")
        .arg(safe_steps.to_string())
        .arg("--cfg-scale")
        .arg(format!("{:.1}", safe_cfg_scale))
        .arg("--sampling-method")
        .arg(effective_sampler)
        .arg("--clip-skip")
        .arg("2")
        .arg("--mmap")
        .arg("--preview")
        .arg("tae")
        .arg("--preview-path")
        .arg(&preview_file)
        .arg("--preview-interval")
        .arg("2")
        .current_dir(&sd_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    let effective_negative_prompt = negative_prompt
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_NEGATIVE_PROMPT);
    cmd.arg("-n").arg(effective_negative_prompt);
    if let Some(s) = seed {
        cmd.arg("-s").arg(s.to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    println!("[image_gen] lancement sd.exe : {:?}", cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Erreur lancement sd.exe : {}", e))?;

    // Diffuse des aperçus intermédiaires pendant l'inférence pour affichage temps réel dans le chat.
    let mut last_preview_mtime: Option<std::time::SystemTime> = None;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("Erreur attente sd.exe : {}", e))?
        {
            break status;
        }

        if let Ok(meta) = fs::metadata(&preview_file) {
            let modified = meta.modified().ok();
            let should_emit = match (modified, last_preview_mtime) {
                (Some(curr), Some(prev)) => curr > prev,
                (Some(_), None) => true,
                _ => false,
            };

            if should_emit {
                if let Ok(bytes) = fs::read(&preview_file) {
                    if !bytes.is_empty() {
                        let data_url =
                            format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes));
                        let _ = app.emit_all(
                            "sd-preview",
                            serde_json::json!({
                                "data_url": data_url,
                            }),
                        );
                    }
                }
                last_preview_mtime = modified;
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    };
    let _ = app.emit_all("sd-preview-done", serde_json::json!({}));
    let _ = fs::remove_file(&preview_file);

    // ── Relancer llama-server en arrière-plan si on l'avait arrêté ──────────
    if llama_was_stopped {
        let app_bg = app.clone();
        std::thread::spawn(move || {
            let state = app_bg.state::<LlamaState>();
            let binary = state.last_binary.lock().unwrap().clone();
            let model = state.last_model_resolved.lock().unwrap().clone();
            let params = state.last_params.lock().unwrap().clone();
            let server_dir = state.last_server_dir.lock().unwrap().clone();

            if let (Some(binary), Some(model), Some(params), Some(server_dir)) =
                (binary, model, params, server_dir)
            {
                // Attendre que sd.exe libère bien la VRAM
                std::thread::sleep(std::time::Duration::from_secs(2));
                println!("[image_gen] relance llama-server en arrière-plan...");

                let mut cmd = Command::new(&binary);
                cmd.arg("-m")
                    .arg(&model)
                    .arg("--host")
                    .arg("127.0.0.1")
                    .arg("--port")
                    .arg("8765")
                    .args(&params)
                    .current_dir(&server_dir)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .stdin(Stdio::null());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000);
                }

                match cmd.spawn() {
                    Ok(child) => {
                        state.set_child_and_port(child, 8765);
                        // Health check via TCP pour savoir quand le serveur est prêt
                        let deadline =
                            std::time::Instant::now() + std::time::Duration::from_secs(300);
                        loop {
                            if std::time::Instant::now() > deadline {
                                break;
                            }
                            std::thread::sleep(std::time::Duration::from_secs(2));
                            if std::net::TcpStream::connect("127.0.0.1:8765").is_ok() {
                                state.set_port(8765);
                                println!("[image_gen] llama-server prêt — port 8765");
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        println!("[image_gen] échec relance llama-server: {}", e);
                    }
                }
            }
        });
    }

    if !status.success() {
        return Err(format!("sd.exe a échoué (code {:?})", status.code()));
    }
    if !out_file.exists() {
        return Err("sd.exe s'est terminé sans générer de fichier image".into());
    }

    // ── Upscale optionnel ────────────────────────────────────────────────────
    let mut final_path = out_file.clone();
    let mut upscaled = false;

    if upscale {
        match resolve_binary(&app, "realesrgan-ncnn-vulkan.exe") {
            Ok(esr_bin) => {
                let esr_dir = esr_bin.parent().unwrap_or(Path::new(".")).to_path_buf();
                let upscaled_file = out_dir.join(format!("image_{}_4x.png", timestamp));
                let mut esr_cmd = Command::new(&esr_bin);
                esr_cmd
                    .arg("-i")
                    .arg(&out_file)
                    .arg("-o")
                    .arg(&upscaled_file)
                    .arg("-n")
                    .arg("realesrgan-x4plus")
                    .current_dir(&esr_dir)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .stdin(Stdio::null());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    esr_cmd.creation_flags(0x08000000);
                }

                println!("[image_gen] lancement Real-ESRGAN : {:?}", esr_cmd);
                if let Ok(s) = esr_cmd.status() {
                    if s.success() && upscaled_file.exists() {
                        final_path = upscaled_file;
                        upscaled = true;
                    }
                }
            }
            Err(e) => {
                println!(
                    "[image_gen] Real-ESRGAN introuvable, upscale ignoré : {}",
                    e
                );
            }
        }
    }

    Ok(ImageGenResult {
        path: final_path.to_string_lossy().to_string(),
        upscaled,
        llama_was_stopped,
    })
}

/// Liste les modèles SD disponibles (.safetensors, .ckpt) dans models/sd/ et models/
#[command]
pub fn list_sd_models(app: AppHandle) -> Vec<String> {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    for base in base_dirs(&app) {
        search_dirs.push(base.join("models").join("sd"));
        search_dirs.push(base.join("models"));
        search_dirs.push(base.join("_up_").join("models").join("sd"));
        search_dirs.push(base.join("_up_").join("models"));
    }
    search_dirs.push(cwd.join("models").join("sd"));
    search_dirs.push(cwd.join("models"));

    let mut results = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for dir in &search_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if let Some(ext) = p.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if ext == "safetensors" || ext == "ckpt" {
                        let s = p.to_string_lossy().to_string();
                        if seen.insert(s.clone()) {
                            results.push(s);
                        }
                    }
                }
            }
        }
    }
    results
}
