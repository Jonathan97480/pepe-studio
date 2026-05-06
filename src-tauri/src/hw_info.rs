//! Détection du matériel : RAM, CPU, GPU/VRAM
//! Utilisé pour la configuration automatique de llama-server.
//!
//! Les fonctions fichiers, shell et média ont été extraites dans :
//!   - `file_ops`  : read_file_content, write_file, patch_file, list_folder_*, batch_rename_files, read_pdf_bytes
//!   - `shell_ops` : run_shell_command
//!   - `media`     : read_image*, read_pdf_batch, save_image*, download_image, delete_generated_image

use serde::Serialize;
use sysinfo::System;
use tauri::command;

// ── Re-exports plats — main.rs reste inchangé ─────────────────────────────────
pub use crate::file_ops::{
    batch_rename_files, list_folder_files, list_folder_images, list_folder_pdfs, patch_file,
    read_file_content, read_pdf_bytes, write_file, BatchRenameItem,
};
pub use crate::media::{
    delete_generated_image, download_image, read_image, read_image_batch, read_pdf_batch,
    save_image, save_image_as,
};
pub use crate::shell_ops::run_shell_command;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct HardwareInfo {
    pub total_ram_gb: f64,
    pub cpu_threads: usize,
    pub gpu_name: String,
    pub gpu_vram_gb: f64,
    pub has_dedicated_gpu: bool,
}

// ── GPU detection ─────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn detect_gpu() -> (String, f64, bool) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let nsmi = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .creation_flags(0x08000000)
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

    let output = Command::new("wmic")
        .args([
            "path",
            "Win32_VideoController",
            "get",
            "Name,AdapterRAM",
            "/format:csv",
        ])
        .creation_flags(0x08000000)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            let mut best_vram: u64 = 0;
            let mut best_name = String::new();

            for line in text.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() < 3 {
                    continue;
                }
                let vram_str = parts[1].trim();
                let name = parts[2].trim().to_string();
                if name.is_empty() || name == "Name" {
                    continue;
                }
                let lower = name.to_lowercase();
                let is_integrated = (lower.contains("intel") && lower.contains("uhd"))
                    || lower.contains("iris")
                    || lower.contains("integrated");

                if let Ok(vram_bytes) = vram_str.parse::<u64>() {
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

// ── Commande Tauri ─────────────────────────────────────────────────────────────

#[command]
pub fn get_hardware_info() -> Result<HardwareInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_gb = sys.total_memory() as f64 / 1_073_741_824.0;
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
