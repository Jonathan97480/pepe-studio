//! Gestion des sessions PTY interactives (ConPTY sur Windows, openpty sur Unix).
//! Les commandes de ce module pilotent des processus longs / interactifs :
//! SSH, REPL, outils TUI…
//!
//! La sortie brute (avec séquences ANSI) est émise en temps réel via l'event
//! Tauri "terminal-output" { terminal_id, text } → xterm.js côté frontend.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{command, AppHandle, Manager, State};

use crate::terminal_manager::TerminalManagerState;
use crate::terminal_parser::parse_command;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalOutputEvent {
    pub terminal_id: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalDoneEvent {
    pub terminal_id: String,
    pub exit_code: Option<i32>,
}

// ─── État PTY ─────────────────────────────────────────────────────────────────

pub struct PtySession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    pub killer: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>>,
}

pub struct InteractiveState(pub Arc<Mutex<HashMap<String, PtySession>>>);

impl Default for InteractiveState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

fn now_str() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Lance un processus dans un vrai PTY (ConPTY sur Windows, openpty sur Unix).
/// La sortie brute (avec séquences ANSI) est émise en temps réel via l'event
/// "terminal-output" { terminal_id, text } → xterm.js côté frontend.
/// L'utilisateur et l'IA peuvent envoyer du texte via terminal_send_stdin.
#[command]
pub fn terminal_start_interactive(
    terminal_id: String,
    command: String,
    app: AppHandle,
    term_state: State<'_, TerminalManagerState>,
    int_state: State<'_, InteractiveState>,
) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("Commande vide".into());
    }

    let current_cwd = {
        let map = term_state.0.lock().unwrap();
        match map.get(&terminal_id) {
            Some(s) => {
                if s.is_running {
                    return Err("Un processus est déjà en cours dans ce terminal.".into());
                }
                s.cwd.clone()
            }
            None => return Err(format!("Terminal '{}' introuvable.", terminal_id)),
        }
    };

    // ── Créer le PTY ────────────────────────────────────────────────────────
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 220,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Échec création PTY : {}", e))?;

    // ── Construire la commande ───────────────────────────────────────────────
    let (prog, args) = parse_command(command.trim());
    let mut cmd_builder = CommandBuilder::new(&prog);
    for arg in &args {
        cmd_builder.arg(arg);
    }
    cmd_builder.cwd(&current_cwd);

    // ── Spawn via le slave du PTY ────────────────────────────────────────────
    let child = pair
        .slave
        .spawn_command(cmd_builder)
        .map_err(|e| format!("Impossible de lancer '{}' : {}", prog, e))?;
    drop(pair.slave); // slave libéré après spawn

    let killer = child.clone_killer();
    let pty_reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("PTY reader : {}", e))?;
    let pty_writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("PTY writer : {}", e))?;

    let writer_arc: Arc<Mutex<Box<dyn Write + Send>>> = Arc::new(Mutex::new(pty_writer));
    let master_arc: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>> =
        Arc::new(Mutex::new(pair.master));
    let killer_arc: Arc<Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>> =
        Arc::new(Mutex::new(killer));

    // ── Marquer la session en cours ──────────────────────────────────────────
    {
        let mut map = term_state.0.lock().unwrap();
        if let Some(s) = map.get_mut(&terminal_id) {
            s.is_running = true;
            s.live_command = Some(command.clone());
            s.live_output = String::new();
        }
    }

    // ── Stocker dans InteractiveState ────────────────────────────────────────
    int_state.0.lock().unwrap().insert(
        terminal_id.clone(),
        PtySession {
            writer: Arc::clone(&writer_arc),
            master: Arc::clone(&master_arc),
            killer: Arc::clone(&killer_arc),
        },
    );

    let term_arc = Arc::clone(&term_state.0);
    let int_arc = Arc::clone(&int_state.0);
    let mut child = child;

    // ── Thread lecture PTY → events ──────────────────────────────────────────
    {
        let tid = terminal_id.clone();
        let app_out = app.clone();
        let tarc = Arc::clone(&term_arc);
        let mut reader = pty_reader;
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let text = String::from_utf8_lossy(&buf[..n]).to_string();
                        if let Some(s) = tarc.lock().unwrap().get_mut(&tid) {
                            s.live_output.push_str(&text);
                            // Garder les 100 Ko les plus récents pour l'IA
                            if s.live_output.len() > 102_400 {
                                let keep = s.live_output.len() - 81_920;
                                s.live_output = s.live_output[keep..].to_string();
                            }
                        }
                        let _ = app_out.emit_all(
                            "terminal-output",
                            TerminalOutputEvent {
                                terminal_id: tid.clone(),
                                text,
                            },
                        );
                    }
                }
            }
        });
    }

    // ── Thread attente fin processus ─────────────────────────────────────────
    {
        let tid = terminal_id.clone();
        thread::spawn(move || {
            let exit_code = match child.wait() {
                Ok(status) => Some(if status.success() {
                    0i32
                } else {
                    status.exit_code() as i32
                }),
                Err(_) => None,
            };
            int_arc.lock().unwrap().remove(&tid);
            {
                let mut map = term_arc.lock().unwrap();
                if let Some(s) = map.get_mut(&tid) {
                    let live_cmd = s.live_command.take().unwrap_or_default();
                    s.is_running = false;
                    s.history.push(crate::terminal_manager::TerminalEntry {
                        command: live_cmd,
                        output: format!("[session terminée — code: {:?}]", exit_code),
                        timestamp: now_str(),
                    });
                    if s.history.len() > 100 {
                        s.history.remove(0);
                    }
                }
            }
            let _ = app.emit_all(
                "terminal-done",
                TerminalDoneEvent {
                    terminal_id: tid,
                    exit_code,
                },
            );
        });
    }

    Ok(())
}

/// Envoie des données brutes au PTY (stdin du processus).
/// ⚠️ Pas d'ajout automatique de \n — le caller doit l'inclure si nécessaire.
/// Pour un mot de passe : envoyer "monpassword\n".
/// Pour Ctrl+C : envoyer "\x03".
#[command]
pub fn terminal_send_stdin(
    terminal_id: String,
    input: String,
    int_state: State<'_, InteractiveState>,
) -> Result<(), String> {
    let int = int_state.0.lock().unwrap();
    match int.get(&terminal_id) {
        Some(session) => {
            let mut writer = session.writer.lock().unwrap();
            writer
                .write_all(input.as_bytes())
                .map_err(|e| format!("Erreur stdin : {}", e))?;
            writer
                .flush()
                .map_err(|e| format!("Erreur flush : {}", e))?;
            Ok(())
        }
        None => Err(format!(
            "Aucun processus interactif actif pour le terminal '{}'.",
            terminal_id
        )),
    }
}

/// Redimensionne le PTY (synchronise avec la taille de la fenêtre xterm.js).
#[command]
pub fn terminal_pty_resize(
    terminal_id: String,
    rows: u16,
    cols: u16,
    int_state: State<'_, InteractiveState>,
) -> Result<(), String> {
    let int = int_state.0.lock().unwrap();
    match int.get(&terminal_id) {
        Some(session) => session
            .master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize PTY : {}", e)),
        None => Ok(()), // ignore si pas de PTY actif
    }
}

/// Tue le processus interactif en cours dans un terminal.
#[command]
pub fn terminal_kill_interactive(
    terminal_id: String,
    int_state: State<'_, InteractiveState>,
) -> Result<(), String> {
    let int = int_state.0.lock().unwrap();
    match int.get(&terminal_id) {
        Some(session) => {
            let _ = session.killer.lock().unwrap().kill();
            Ok(())
        }
        None => Err(format!(
            "Aucun processus interactif actif pour le terminal '{}'.",
            terminal_id
        )),
    }
}
