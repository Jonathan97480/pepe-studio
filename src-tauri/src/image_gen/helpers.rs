//! Helpers chemin, résolution des binaires et modèles SD, dimensions, VRAM.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

// ─── Constantes ────────────────────────────────────────────────────────────────

pub const DEFAULT_NEGATIVE_PROMPT: &str =
    "lowres, blurry, bad anatomy, bad hands, missing hands, extra fingers, too many fingers, fused fingers, mutated hands, deformed, disfigured, ugly, gross proportions, bad face, disfigured face, poorly drawn face, distorted face, mutation, duplicate, multiple people, multiple faces, cloned face, extra heads, extra persons, crowd, out of frame, cropped, worst quality, low quality, jpeg artifacts, artifacts, glitch, noise, distortion, chromatic aberration, color bleeding, pixelated, oversaturated, text, watermark, logo, signature";

pub const SD_SERVER_PORT: u16 = 12711;

/// VRAM estimée nécessaire pour sd.exe SD 1.5 à 512px (marge incluse), en MB.
pub const SD_VRAM_REQUIRED_MB: u64 = 2800;
/// Marge de sécurité supplémentaire pour éviter les crashs TDR.
pub const SD_VRAM_SAFETY_MARGIN_MB: u64 = 300;

// ─── Types publics ─────────────────────────────────────────────────────────────

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ImageGenResult {
    pub path: String,
    pub upscaled: bool,
    /// True si llama-server a été arrêté pour libérer la VRAM — le frontend doit le relancer
    pub llama_was_stopped: bool,
}

// ─── Helpers chemin ────────────────────────────────────────────────────────────

pub fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\\") {
        PathBuf::from(stripped.to_string())
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped.to_string())
    } else {
        path
    }
}

pub fn base_dirs(app: &AppHandle) -> Vec<PathBuf> {
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

pub fn resolve_binary(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
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

pub fn resolve_sd_model(app: &AppHandle, model: Option<&str>) -> Result<PathBuf, String> {
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
        if p.is_absolute() && p.exists() {
            return Ok(p.to_path_buf());
        }
        for dir in &search_dirs {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Ok(candidate.canonicalize().unwrap_or(candidate));
            }
        }
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

pub fn images_output_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let dir = base.join("images");
    let _ = fs::create_dir_all(&dir);
    dir
}

// ─── VRAM ──────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub fn query_free_vram_mb() -> Option<u64> {
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
pub fn query_free_vram_mb() -> Option<u64> {
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

pub fn has_enough_free_vram() -> bool {
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

// ─── Dimensions ────────────────────────────────────────────────────────────────

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
    let rounded = ((clamped + 4) / 8) * 8;
    rounded.clamp(min, max)
}

pub fn resolve_dimensions(
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

// ─── Upscale ───────────────────────────────────────────────────────────────────

pub fn run_optional_upscale(
    app: &AppHandle,
    out_dir: &Path,
    out_file: &Path,
    timestamp: u128,
    upscale: bool,
) -> (PathBuf, bool) {
    use std::process::Stdio;

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
            Err(_) => {}
        }
    }

    (final_path, upscaled)
}
