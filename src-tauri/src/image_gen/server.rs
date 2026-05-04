//! Serveur sd-server.exe persistant : état, démarrage, health check.

use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::AppHandle;

use super::helpers::{resolve_binary, SD_SERVER_PORT};

// ─── État ──────────────────────────────────────────────────────────────────────

pub struct SdServerState {
    pub(super) child: Mutex<Option<std::process::Child>>,
    pub(super) model_path: Mutex<Option<String>>,
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
    pub fn stop_sync(&self) {
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

// ─── Démarrage/réutilisation du serveur ────────────────────────────────────────

pub fn ensure_sd_server(
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
