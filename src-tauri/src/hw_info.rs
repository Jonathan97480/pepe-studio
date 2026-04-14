//! Détection du matériel : RAM, CPU, GPU/VRAM
//! Utilisé pour la configuration automatique de llama-server.

use serde::Serialize;
use sysinfo::System;
use tauri::{command, AppHandle};

#[derive(Serialize, Clone, Debug)]
pub struct HardwareInfo {
    pub total_ram_gb: f64,
    pub cpu_threads: usize, // threads logiques disponibles
    pub gpu_name: String,
    pub gpu_vram_gb: f64,
    pub has_dedicated_gpu: bool,
}

/// Détecte la VRAM GPU via wmic (Windows) ou nvidia-smi/rocm-smi (Linux).
#[cfg(target_os = "windows")]
fn detect_gpu() -> (String, f64, bool) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // ── 1. nvidia-smi (VRAM réelle, sans la limite uint32 de wmic ~4 Go) ─────
    let nsmi = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    if let Ok(out) = nsmi {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.splitn(2, ',').collect();
                if parts.len() >= 2 {
                    let name = parts[0].trim().to_string();
                    if let Ok(vram_mb) = parts[1].trim().parse::<f64>() {
                        let vram_gb = vram_mb / 1024.0;
                        if !name.is_empty() && vram_gb > 0.5 {
                            return (name, vram_gb, true);
                        }
                    }
                }
            }
        }
    }

    // ── 2. Fallback wmic (AdapterRAM = uint32 → plafonné à ~4 Go) ────────────
    let output = Command::new("wmic")
        .args([
            "path",
            "Win32_VideoController",
            "get",
            "Name,AdapterRAM",
            "/format:csv",
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut best_vram: u64 = 0;
            let mut best_name = String::new();

            for line in text.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                // Format CSV: Node,AdapterRAM,Name
                if parts.len() < 3 {
                    continue;
                }
                let vram_str = parts[1].trim();
                let name = parts[2].trim().to_string();
                if name.is_empty() || name == "Name" {
                    continue;
                }
                // Ignorer les GPU intégrés Intel/UHD si un dédié existe déjà
                let lower = name.to_lowercase();
                let is_integrated = lower.contains("intel") && lower.contains("uhd")
                    || lower.contains("iris")
                    || lower.contains("integrated");

                if let Ok(vram_bytes) = vram_str.parse::<u64>() {
                    // Préférer les GPU dédiés (> 1 GB VRAM) aux intégrés
                    if vram_bytes > best_vram && (!is_integrated || best_vram == 0) {
                        best_vram = vram_bytes;
                        best_name = name;
                    }
                }
            }

            let vram_gb = best_vram as f64 / 1_073_741_824.0;
            let has_gpu = !best_name.is_empty() && vram_gb > 0.5;
            (best_name, vram_gb, has_gpu)
        }
        _ => (String::new(), 0.0, false),
    }
}

#[cfg(not(target_os = "windows"))]
fn detect_gpu() -> (String, f64, bool) {
    // Linux : essayer nvidia-smi
    use std::process::Command;
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 2 {
                    let name = parts[0].trim().to_string();
                    if let Ok(vram_mb) = parts[1].trim().parse::<f64>() {
                        let vram_gb = vram_mb / 1024.0;
                        return (name, vram_gb, true);
                    }
                }
            }
            (String::new(), 0.0, false)
        }
        _ => (String::new(), 0.0, false),
    }
}

#[command]
pub fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;

    // Threads logiques (ce que l'OS expose)
    let cpu_threads = sys.cpus().len().max(1);

    let (gpu_name, gpu_vram_gb, has_dedicated_gpu) = detect_gpu();

    Ok(HardwareInfo {
        total_ram_gb,
        cpu_threads,
        gpu_name,
        gpu_vram_gb,
        has_dedicated_gpu,
    })
}

/// Exécute une commande shell (PowerShell sur Windows, sh sur Linux/macOS).
/// Retourne stdout, ou stderr si stdout est vide.
/// Les commandes interactives (ssh, telnet…) sont bloquées — utilise terminal_start_interactive.
#[command]
pub fn run_shell_command(command: String) -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    if command.trim().is_empty() {
        return Err("Commande vide".into());
    }
    if command.len() > 2000 {
        return Err("Commande trop longue (max 2000 chars)".into());
    }

    // ── Bloquer les commandes interactives qui gèleraient l'application ──────
    let first_word = command
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    let bin = first_word.split(['/', '\\']).last().unwrap_or(&first_word);
    match bin {
        "ssh" | "telnet" | "ftp" | "sftp" => {
            return Err(
                "⚠️ Commande interactive détectée — utilise terminal_start_interactive.\n\
                 Format : <tool>{\"terminal_start_interactive\": \"ssh user@host\", \"terminal_id\": \"<id>\"}</tool>\n\
                 Crée d'abord un terminal avec create_terminal si tu n'en as pas.\n\
                 L'utilisateur verra la sortie en temps réel et pourra saisir son mot de passe."
                    .into(),
            );
        }
        "vim" | "vi" | "nano" | "emacs" | "less" | "more" | "top" | "htop" | "btop" => {
            return Err(
                "❌ Commande interactive non supportée dans cmd. \
                 Utilise l'outil 'files' (write_file/read_file) ou Get-Process pour les moniteurs."
                    .into(),
            );
        }
        _ => {}
    }

    // ── Spawn avec timeout 60 s ───────────────────────────────────────────────
    #[cfg(target_os = "windows")]
    let mut child = {
        use std::os::windows::process::CommandExt;
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", command.trim()])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?
    };

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .args(["-c", command.trim()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let timeout = Duration::from_secs(60);
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                return Err(
                    "[Timeout 60s] La commande n'a pas répondu. \
                     Si c'est une commande interactive (ssh, repl…) utilise terminal_start_interactive."
                        .into(),
                );
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }

    let mut stdout = String::new();
    let mut stderr = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr);
    }
    let stdout = stdout.trim().to_string();
    let stderr = stderr.trim().to_string();

    if !stdout.is_empty() {
        if stdout.len() > 4000 {
            Ok(format!(
                "{}...\n[tronqué, {} chars au total]",
                &stdout[..4000],
                stdout.len()
            ))
        } else {
            Ok(stdout)
        }
    } else if !stderr.is_empty() {
        Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
    } else {
        Ok("(aucune sortie)".to_string())
    }
}

/// Lit le contenu d'un fichier sur le disque.
#[command]
pub fn read_file_content(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    // Limiter à 500 Ko pour éviter de saturer le contexte LLM
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 512 * 1024 {
        return Err(format!(
            "Fichier trop volumineux ({} Ko) — limite 512 Ko",
            metadata.len() / 1024
        ));
    }
    std::fs::read_to_string(p).map_err(|e| format!("Erreur lecture : {}", e))
}

/// Écrit (ou écrase) un fichier sur le disque.
/// Le chemin peut être absolu ou relatif au répertoire courant.
/// Crée les dossiers parents si nécessaire.
#[command]
pub fn write_file(path: String, content: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(p, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!(
        "Fichier écrit : {} ({} octets)",
        path,
        content.len()
    ))
}

/// Applique un Search & Replace exact dans un fichier existant.
/// `search` doit apparaître exactement une fois (0 → erreur, 2+ → ambigu).
/// Idéal pour les petites modifications sans réécrire tout le fichier.
#[command]
pub fn patch_file(path: String, search: String, replace: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    if search.is_empty() {
        return Err("Le bloc SEARCH ne peut pas être vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let occurrences = content.matches(search.as_str()).count();
    match occurrences {
        0 => return Err(format!(
            "Bloc SEARCH introuvable dans '{}'. Le texte doit correspondre exactement (espaces et retours à la ligne inclus).",
            path
        )),
        2.. => return Err(format!(
            "Bloc SEARCH ambigu dans '{}' : {} occurrences trouvées. Ajoutez plus de contexte pour le rendre unique.",
            path, occurrences
        )),
        _ => {}
    }
    let patched = content.replacen(search.as_str(), replace.as_str(), 1);
    std::fs::write(p, patched.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!(
        "Fichier patché : {} ({} octets)",
        path,
        patched.len()
    ))
}

/// Lit un fichier PDF et retourne ses octets encodés en base64.
/// Permet au frontend (pdfjs) d'extraire le texte côté JS.
#[command]
pub fn read_pdf_bytes(path: String) -> Result<String, String> {
    use base64::Engine;
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    let lower = path.to_lowercase();
    if !lower.ends_with(".pdf") {
        return Err("Le fichier doit être un PDF (.pdf)".into());
    }
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    // Limite 50 Mo pour les PDFs
    if metadata.len() > 50 * 1024 * 1024 {
        return Err(format!(
            "PDF trop volumineux ({} Mo) — limite 50 Mo",
            metadata.len() / 1_048_576
        ));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Erreur lecture : {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Liste tous les fichiers PDF dans un dossier (non-récursif par défaut).
/// Si `recursive` est true, parcourt les sous-dossiers également.
#[command]
pub fn list_folder_pdfs(folder: String, recursive: Option<bool>) -> Result<Vec<String>, String> {
    if folder.trim().is_empty() {
        return Err("Chemin de dossier vide".into());
    }
    let p = std::path::Path::new(&folder);
    if !p.exists() {
        return Err(format!("Dossier introuvable : {}", folder));
    }
    if !p.is_dir() {
        return Err(format!("Ce chemin n'est pas un dossier : {}", folder));
    }
    let deep = recursive.unwrap_or(false);
    let mut results: Vec<String> = Vec::new();
    collect_pdfs(p, deep, &mut results)?;
    results.sort();
    Ok(results)
}

fn collect_pdfs(
    dir: &std::path::Path,
    recursive: bool,
    out: &mut Vec<String>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_pdfs(&path, true, out)?;
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "pdf" {
                    out.push(path.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    Ok(())
}

// ─── Lecture batch de PDFs (base64) ──────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct PdfBatchItem {
    pub path: String,
    pub base64: Option<String>,
    pub error: Option<String>,
}

/// Lit une liste de fichiers PDF et retourne leurs octets encodés en base64.
/// Les fichiers sont lus en parallèle (threads Rayon non disponibles en Tauri basique,
/// donc séquentiel mais regroupé en un seul aller-retour IPC).
#[command]
pub fn read_pdf_batch(paths: Vec<String>) -> Vec<PdfBatchItem> {
    use base64::Engine;
    paths
        .into_iter()
        .map(|path| {
            let p = std::path::Path::new(&path);
            if !p.exists() {
                return PdfBatchItem {
                    path,
                    base64: None,
                    error: Some("Fichier introuvable".to_string()),
                };
            }
            let lower = path.to_lowercase();
            if !lower.ends_with(".pdf") {
                return PdfBatchItem {
                    path,
                    base64: None,
                    error: Some("Ce n'est pas un fichier PDF".to_string()),
                };
            }
            match std::fs::metadata(p) {
                Ok(m) if m.len() > 50 * 1024 * 1024 => PdfBatchItem {
                    path,
                    base64: None,
                    error: Some(format!("PDF trop volumineux ({} Mo)", m.len() / 1_048_576)),
                },
                Ok(_) => match std::fs::read(p) {
                    Ok(bytes) => PdfBatchItem {
                        path,
                        base64: Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
                        error: None,
                    },
                    Err(e) => PdfBatchItem {
                        path,
                        base64: None,
                        error: Some(e.to_string()),
                    },
                },
                Err(e) => PdfBatchItem {
                    path,
                    base64: None,
                    error: Some(e.to_string()),
                },
            }
        })
        .collect()
}

// ─── Renommage en lot ─────────────────────────────────────────────────────────

use serde::Deserialize;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BatchRenameItem {
    pub from: String,
    pub to: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BatchRenameResult {
    pub from: String,
    pub to: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Renomme plusieurs fichiers en une seule opération.
/// `to` peut être un nom de fichier simple (même dossier que `from`) ou un chemin absolu.
#[command]
pub fn batch_rename_files(renames: Vec<BatchRenameItem>) -> Vec<BatchRenameResult> {
    renames
        .into_iter()
        .map(|item| {
            let from_path = std::path::Path::new(&item.from);
            if !from_path.exists() {
                return BatchRenameResult {
                    from: item.from,
                    to: item.to,
                    success: false,
                    error: Some("Fichier source introuvable".to_string()),
                };
            }
            let to_path = std::path::Path::new(&item.to);
            let dest = if to_path.is_absolute() || item.to.contains('/') || item.to.contains('\\') {
                to_path.to_path_buf()
            } else {
                let parent = from_path.parent().unwrap_or(std::path::Path::new("."));
                parent.join(&item.to)
            };
            match std::fs::rename(&item.from, &dest) {
                Ok(_) => BatchRenameResult {
                    from: item.from,
                    to: dest.to_string_lossy().replace('\\', "/"),
                    success: true,
                    error: None,
                },
                Err(e) => BatchRenameResult {
                    from: item.from,
                    to: item.to,
                    success: false,
                    error: Some(e.to_string()),
                },
            }
        })
        .collect()
}

/// Sauvegarde une image encodée en base64 (data URL) sur le disque.
/// Retourne le chemin absolu, le dataUrl et le nom du fichier.
#[command]
pub fn save_image(
    app: AppHandle,
    data_url: String,
    filename: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::Engine;

    // Décoder le data URL: "data:image/png;base64,iVBORw0..."
    let (mime, b64_data) = if let Some(rest) = data_url.strip_prefix("data:") {
        let parts: Vec<&str> = rest.splitn(2, ";base64,").collect();
        if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            return Err("Format data URL invalide — attendu : data:<mime>;base64,<data>".into());
        }
    } else {
        return Err("Le data_url doit commencer par 'data:'".into());
    };

    let ext = mime
        .split('/')
        .nth(1)
        .unwrap_or("png")
        .split('+')
        .next()
        .unwrap_or("png");
    let fname = filename.unwrap_or_else(|| {
        format!(
            "image_{}.{}",
            chrono::Local::now().format("%Y%m%d_%H%M%S"),
            ext
        )
    });

    let images_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pepe-studio")
        .join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let path = images_dir.join(&fname);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data.as_bytes())
        .map_err(|e| format!("Erreur décodage base64 : {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "dataUrl": data_url,
        "filename": fname,
    }))
}

/// Télécharge une image depuis une URL HTTP et la sauvegarde sur le disque.
/// Retourne le chemin absolu + dataUrl pour affichage inline dans le chat.
#[command]
pub fn download_image(
    app: AppHandle,
    url: String,
    filename: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::Engine;
    use reqwest::blocking::Client;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (compatible; PepeStudio/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("Erreur téléchargement : {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Erreur HTTP {} pour : {}", resp.status(), url));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();

    let ext = content_type
        .split('/')
        .nth(1)
        .unwrap_or("png")
        .split('+')
        .next()
        .unwrap_or("png");

    let fname = filename.unwrap_or_else(|| {
        // Tenter d'extraire le nom depuis l'URL
        url.split('/')
            .last()
            .and_then(|s| s.split('?').next())
            .filter(|s| !s.is_empty() && s.contains('.'))
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                format!(
                    "image_{}.{}",
                    chrono::Local::now().format("%Y%m%d_%H%M%S"),
                    ext
                )
            })
    });

    let images_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pepe-studio")
        .join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    let path = images_dir.join(&fname);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", content_type, b64);

    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "dataUrl": data_url,
        "filename": fname,
    }))
}
