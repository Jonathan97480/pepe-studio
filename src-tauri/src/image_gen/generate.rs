//! Commandes Tauri : generate_image et list_sd_models.

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{command, AppHandle, Manager, State};

use crate::llama_sidecar::LlamaState;

use super::helpers::{
    base_dirs, has_enough_free_vram, images_output_dir, resolve_binary, resolve_dimensions,
    resolve_sd_model, run_optional_upscale, ImageGenResult, DEFAULT_NEGATIVE_PROMPT,
};
use super::server::{ensure_sd_server, SdServerState};

// ─── Commandes ─────────────────────────────────────────────────────────────────

/// Génère une image avec stable-diffusion.cpp.
/// Si llama-server tourne sur GPU et VRAM insuffisante, il est arrêté avant génération.
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

    // Décision coexistence LLM + SD
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

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let out_file = out_dir.join(format!("image_{}.png", timestamp));
    let preview_file = out_dir.join(format!("preview_{}.png", timestamp));

    // Option sd-server.exe (modèle maintenu en VRAM)
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

    // Mode sd.exe (process unique)
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
        cmd.creation_flags(0x08000000);
    }

    println!("[image_gen] lancement sd.exe : {:?}", cmd);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Erreur lancement sd.exe : {}", e))?;

    // Diffuse des aperçus intermédiaires pendant l'inférence
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
                        let _ =
                            app.emit_all("sd-preview", serde_json::json!({ "data_url": data_url }));
                    }
                }
                last_preview_mtime = modified;
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    };
    let _ = app.emit_all("sd-preview-done", serde_json::json!({}));
    let _ = fs::remove_file(&preview_file);

    // Relancer llama-server en arrière-plan si on l'avait arrêté
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

    let (final_path, upscaled) =
        run_optional_upscale(&app, &out_dir, &out_file, timestamp, upscale);
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
