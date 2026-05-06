//! Gestionnaire de terminaux persistants — sessions, historique, commandes non-interactives.
//!
//! Les sous-modules associés :
//!   - `terminal_parser` : parse_command, requires_interactive, extract_cwd, CWD_MARKER
//!   - `terminal_pty`    : PtySession, InteractiveState, terminal_start_interactive,
//!                         terminal_send_stdin, terminal_pty_resize, terminal_kill_interactive

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{command, State};

use crate::terminal_parser::{extract_cwd, requires_interactive, CWD_MARKER};

pub use crate::terminal_pty::{
    terminal_kill_interactive, terminal_pty_resize, terminal_send_stdin,
    terminal_start_interactive, InteractiveState,
};

// ─── Types publics ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalEntry {
    pub command: String,
    pub output: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalInfo {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub entry_count: usize,
    pub is_running: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalExecResult {
    pub terminal_id: String,
    pub output: String,
    pub new_cwd: String,
}

// ─── État interne ─────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct TerminalSession {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub history: Vec<TerminalEntry>,
    pub is_running: bool,
    pub live_command: Option<String>,
    pub live_output: String,
}

pub struct TerminalManagerState(pub Arc<Mutex<HashMap<String, TerminalSession>>>);

impl Default for TerminalManagerState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("term-{}", ms)
}

fn now_str() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

#[cfg(target_os = "windows")]
fn run_ps(cmd: &str) -> String {
    use std::os::windows::process::CommandExt;
    use std::time::{Duration, Instant};

    let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                       $OutputEncoding = [System.Text.Encoding]::UTF8; ";
    let full_cmd = format!("{}{}", utf8_prefix, cmd);
    let mut child = match Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &full_cmd])
        .creation_flags(0x08000000)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return format!("[Erreur] {}", e),
    };

    let timeout = Duration::from_secs(30);
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                return "[Timeout 30s] La commande n'a pas repondu. \
                        Les commandes interactives (ssh, telnet, ftp...) \
                        ne sont pas supportees -- elles bloquent le terminal. \
                        Utilisez plutot : ssh user@host \"commande\" \
                        pour executer une commande distante sans session interactive."
                    .into();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return format!("[Erreur] {}", e),
        }
    }

    let mut stdout = String::new();
    let mut stderr_str = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr_str);
    }
    let stdout = stdout.trim().to_string();
    let stderr_str = stderr_str.trim().to_string();
    if !stdout.is_empty() {
        stdout
    } else if !stderr_str.is_empty() {
        format!("[stderr] {}", stderr_str)
    } else {
        "(aucune sortie)".into()
    }
}

#[cfg(not(target_os = "windows"))]
fn run_ps(cmd: &str) -> String {
    use std::time::{Duration, Instant};

    let mut child = match Command::new("sh")
        .args(["-c", cmd])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return format!("[Erreur] {}", e),
    };

    let timeout = Duration::from_secs(30);
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                return "[Timeout 30s] La commande n'a pas repondu.".into();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return format!("[Erreur] {}", e),
        }
    }

    let mut stdout = String::new();
    let mut stderr_str = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut stdout);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut stderr_str);
    }
    let stdout = stdout.trim().to_string();
    let stderr_str = stderr_str.trim().to_string();
    if !stdout.is_empty() {
        stdout
    } else if !stderr_str.is_empty() {
        format!("[stderr] {}", stderr_str)
    } else {
        "(aucune sortie)".into()
    }
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Cree un nouveau terminal persistant.
#[command]
pub fn create_terminal(
    name: Option<String>,
    cwd: Option<String>,
    state: State<'_, TerminalManagerState>,
) -> Result<TerminalInfo, String> {
    let raw_cwd = match cwd {
        Some(ref c) if !c.trim().is_empty() => c.trim().to_string(),
        _ => return Err(
            "cwd obligatoire : tu dois fournir le chemin absolu du dossier de destination.\n\
             Exemple : {\"create_terminal\": \"mon-projet\", \"cwd\": \"E:/MesProjets/mon-projet\"}\n\
             Ne jamais omettre cwd."
                .to_string()
        ),
    };

    let normalized = raw_cwd.replace('\\', "/").to_lowercase();
    let app_dir = std::env::current_exe().ok().and_then(|p| {
        p.parent()
            .map(|d| d.to_string_lossy().replace('\\', "/").to_lowercase())
    });
    let manifest_dir =
        option_env!("CARGO_MANIFEST_DIR").map(|d| d.replace('\\', "/").to_lowercase());

    let blocked_dirs: Vec<String> = [app_dir, manifest_dir]
        .into_iter()
        .flatten()
        .filter(|d| !d.is_empty())
        .collect();

    for blocked in &blocked_dirs {
        if normalized == *blocked || normalized.starts_with(&format!("{}/", blocked)) {
            return Err(format!(
                "INTERDIT : le terminal pointerait sur le dossier de l'application ({}).\n\
                 Cree le projet dans un autre dossier.",
                raw_cwd
            ));
        }
    }

    let id = gen_id();
    let count = state.0.lock().unwrap().len();
    let display_name = name.unwrap_or_else(|| format!("Terminal {}", count + 1));

    let check = run_ps(&("Test-Path \"".to_string() + &raw_cwd.replace('"', "`\"") + "\""));
    let initial_cwd = if check.trim() == "True" {
        raw_cwd.clone()
    } else {
        let mk = run_ps(
            &("New-Item -ItemType Directory -Force \"".to_string()
                + &raw_cwd.replace('"', "`\"")
                + "\" | Out-Null; Test-Path \""
                + &raw_cwd.replace('"', "`\"")
                + "\""),
        );
        if mk.trim() == "True" {
            raw_cwd.clone()
        } else {
            return Err(format!(
                "Le dossier '{}' n'existe pas et n'a pas pu etre cree.",
                raw_cwd
            ));
        }
    };

    state.0.lock().unwrap().insert(
        id.clone(),
        TerminalSession {
            id: id.clone(),
            name: display_name.clone(),
            cwd: initial_cwd.clone(),
            history: Vec::new(),
            is_running: false,
            live_command: None,
            live_output: String::new(),
        },
    );

    Ok(TerminalInfo {
        id,
        name: display_name,
        cwd: initial_cwd,
        entry_count: 0,
        is_running: false,
    })
}

/// Execute une commande dans un terminal existant en maintenant le cwd.
#[command]
pub fn terminal_exec(
    terminal_id: String,
    command: String,
    state: State<'_, TerminalManagerState>,
) -> Result<TerminalExecResult, String> {
    if command.trim().is_empty() {
        return Err("Commande vide".into());
    }
    if command.len() > 4000 {
        return Err("Commande trop longue (max 4 000 chars)".into());
    }
    if let Some(msg) = requires_interactive(&command) {
        return Err(msg.into());
    }

    let current_cwd = {
        let map = state.0.lock().unwrap();
        match map.get(&terminal_id) {
            Some(s) => {
                if s.is_running {
                    return Err(
                        "Un processus interactif est deja en cours dans ce terminal.".into(),
                    );
                }
                s.cwd.clone()
            }
            None => return Err(format!("Terminal '{}' introuvable.", terminal_id)),
        }
    };

    let cwd_escaped = current_cwd.replace('"', "`\"");

    #[cfg(target_os = "windows")]
    let full_cmd = String::from("$ErrorActionPreference = 'Continue'; Set-Location \"")
        + &cwd_escaped
        + "\" -ErrorAction SilentlyContinue; "
        + command.trim()
        + "; Write-Output (\""
        + CWD_MARKER
        + "\" + (Get-Location).Path)";

    #[cfg(not(target_os = "windows"))]
    let full_cmd = String::from("cd \"")
        + &cwd_escaped.replace('"', "\\\"")
        + "\" 2>/dev/null; "
        + command.trim()
        + "; echo \""
        + CWD_MARKER
        + "$(pwd)\"";

    let raw = run_ps(&full_cmd);
    let (clean_output, new_cwd) = extract_cwd(&raw, &current_cwd);

    let display_output = if clean_output.len() > 4000 {
        format!(
            "{}...\n[tronque -- {} chars au total]",
            &clean_output[..4000],
            clean_output.len()
        )
    } else {
        clean_output.clone()
    };

    {
        let mut map = state.0.lock().unwrap();
        if let Some(session) = map.get_mut(&terminal_id) {
            session.cwd = new_cwd.clone();
            session.history.push(TerminalEntry {
                command: command.clone(),
                output: display_output,
                timestamp: now_str(),
            });
            if session.history.len() > 100 {
                session.history.remove(0);
            }
        }
    }

    Ok(TerminalExecResult {
        terminal_id,
        output: clean_output,
        new_cwd,
    })
}

/// Liste tous les terminaux ouverts.
#[command]
pub fn list_terminals(state: State<'_, TerminalManagerState>) -> Vec<TerminalInfo> {
    let map = state.0.lock().unwrap();
    let mut list: Vec<TerminalInfo> = map
        .values()
        .map(|s| TerminalInfo {
            id: s.id.clone(),
            name: s.name.clone(),
            cwd: s.cwd.clone(),
            entry_count: s.history.len() + if s.is_running { 1 } else { 0 },
            is_running: s.is_running,
        })
        .collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}

/// Ferme un terminal et le retire de la liste.
#[command]
pub fn close_terminal(
    terminal_id: String,
    state: State<'_, TerminalManagerState>,
) -> Result<String, String> {
    let removed = state.0.lock().unwrap().remove(&terminal_id);
    if removed.is_some() {
        Ok(format!("Terminal '{}' ferme.", terminal_id))
    } else {
        Err(format!("Terminal '{}' introuvable.", terminal_id))
    }
}

/// Retourne l'historique complet des commandes d'un terminal.
#[command]
pub fn get_terminal_history(
    terminal_id: String,
    state: State<'_, TerminalManagerState>,
) -> Result<Vec<TerminalEntry>, String> {
    let map = state.0.lock().unwrap();
    match map.get(&terminal_id) {
        Some(s) => {
            let mut hist = s.history.clone();
            if s.is_running {
                hist.push(TerminalEntry {
                    command: s.live_command.clone().unwrap_or_default(),
                    output: s.live_output.clone(),
                    timestamp: now_str(),
                });
            }
            Ok(hist)
        }
        None => Err(format!("Terminal '{}' introuvable.", terminal_id)),
    }
}
