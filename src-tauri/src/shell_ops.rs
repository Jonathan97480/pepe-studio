//! Exécution de commandes shell (PowerShell sur Windows, sh sur Linux/macOS).
//! Bloque les commandes interactives et applique un timeout de 60 s.

use tauri::command;

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
