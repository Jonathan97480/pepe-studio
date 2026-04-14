//! Gestionnaire de terminaux persistants avec support interactif.
//! - terminal_exec              : commandes courtes non-interactives (≤ 30 s)
//! - terminal_start_interactive : processus longs/interactifs (SSH, REPL…)
//!   Émet les events Tauri "terminal-output" { terminal_id, text }
//!                        et  "terminal-done"  { terminal_id, exit_code }

use chrono::Local;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{command, AppHandle, Manager, State};

const CWD_MARKER: &str = "###PEPESTUDIO_CWD###";

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

// ─── État interne ─────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct TerminalSession {
    id: String,
    name: String,
    cwd: String,
    history: Vec<TerminalEntry>,
    is_running: bool,
    live_command: Option<String>,
    live_output: String,
}

// NOTE : Arc<Mutex<…>> pour pouvoir cloner le pointeur dans les threads
// sans dépendre de la durée de vie de State<'_>.
pub struct TerminalManagerState(pub Arc<Mutex<HashMap<String, TerminalSession>>>);

impl Default for TerminalManagerState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// ─── État des processus interactifs (PTY réel) ─────────────────────────────────

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

/// Parse une chaîne de commande en (programme, args).
/// Gère les guillemets simples et doubles.
fn parse_command(cmd: &str) -> (String, Vec<String>) {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_double = false;
    let mut in_single = false;

    for ch in cmd.chars() {
        match ch {
            '"' if !in_single => in_double = !in_double,
            '\'' if !in_double => in_single = !in_single,
            ' ' | '\t' if !in_double && !in_single => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    if tokens.is_empty() {
        return (cmd.to_string(), vec![]);
    }
    let prog = tokens.remove(0);
    (prog, tokens)
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
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::time::{Duration, Instant};

    // Forcer UTF-8 pour que les caractères accentués (French) ne soient pas corrompus.
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
            Ok(Some(_)) => break, // processus terminé normalement
            Ok(None) if start.elapsed() >= timeout => {
                let _ = child.kill();
                return "[Timeout 30s] ⏱️ La commande n'a pas répondu. \
                        Les commandes interactives (ssh, telnet, ftp…) \
                        ne sont pas supportées — elles bloquent le terminal. \
                        Utilisez plutôt : ssh user@host \"commande\" \
                        pour exécuter une commande distante sans session interactive."
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
    use std::io::Read;
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
                return "[Timeout 30s] ⏱️ La commande n'a pas répondu. \
                        Les commandes interactives (ssh, telnet, ftp…) \
                        ne sont pas supportées — elles bloquent le terminal. \
                        Utilisez plutôt : ssh user@host \"commande\" \
                        pour exécuter une commande distante sans session interactive."
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

/// Extrait le nouveau cwd du marqueur et retourne (sortie nettoyée, nouveau_cwd).
fn extract_cwd(raw: &str, fallback: &str) -> (String, String) {
    let mut new_cwd = fallback.to_string();
    let mut clean: Vec<&str> = Vec::new();
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix(CWD_MARKER) {
            let c = rest.trim().to_string();
            if !c.is_empty() {
                new_cwd = c;
            }
        } else {
            clean.push(line);
        }
    }
    while clean.last().map(|l| l.trim().is_empty()).unwrap_or(false) {
        clean.pop();
    }
    let output = if clean.is_empty() {
        "(aucune sortie)".to_string()
    } else {
        clean.join("\n")
    };
    (output, new_cwd)
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Crée un nouveau terminal persistant.
/// `name` : nom affiché (optionnel, auto-généré sinon).
/// `cwd`  : répertoire initial — OBLIGATOIRE pour les projets utilisateur.
///          Refusé si absent OU si le chemin appartient à l'application elle-même.
#[command]
pub fn create_terminal(
    name: Option<String>,
    cwd: Option<String>,
    state: State<'_, TerminalManagerState>,
) -> Result<TerminalInfo, String> {
    // cwd obligatoire — ne jamais hériter du cwd du processus Tauri (= E:\CustomApp)
    let raw_cwd = match cwd {
        Some(ref c) if !c.trim().is_empty() => c.trim().to_string(),
        _ => return Err(
            "❌ cwd obligatoire : tu dois fournir le chemin absolu du dossier de destination.\n\
             Exemple : {\"create_terminal\": \"mon-projet\", \"cwd\": \"E:/MesProjets/mon-projet\"}\n\
             Ne jamais omettre cwd — le répertoire par défaut est celui de l'application, pas le bon."
                .to_string()
        ),
    };

    // Bloquer uniquement si le chemin demandé EST le dossier de l'application elle-même
    // (ou un sous-dossier direct), pas juste parce qu'il contient un mot-clé.
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
        // Bloquer si le chemin demandé = dossier bloqué ou sous-dossier direct de celui-ci
        if normalized == *blocked || normalized.starts_with(&format!("{}/", blocked)) {
            return Err(format!(
                "❌ INTERDIT : le terminal pointerait sur le dossier de l'application elle-même ({}).\n\
                 Tu dois créer le projet dans un autre dossier (ex: E:/MesProjets/mon-projet).\n\
                 Ne JAMAIS utiliser le dossier CustomApp / PepeStudio pour un projet utilisateur.",
                raw_cwd
            ));
        }
    }

    let id = gen_id();
    let count = state.0.lock().unwrap().len();
    let display_name = name.unwrap_or_else(|| format!("Terminal {}", count + 1));

    // Vérifier que le chemin existe (ou le créer si possible)
    let check = run_ps(&("Test-Path \"".to_string() + &raw_cwd.replace('"', "`\"") + "\""));
    let initial_cwd = if check.trim() == "True" {
        raw_cwd.clone()
    } else {
        // Essayer de créer le dossier automatiquement
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
                "❌ Le dossier '{}' n'existe pas et n'a pas pu être créé. Vérifie le chemin.",
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

/// Détecte les commandes qui nécessitent terminal_start_interactive.
fn requires_interactive(cmd: &str) -> Option<&'static str> {
    let first = cmd
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_lowercase();
    let bin = first.split(['/', '\\']).last().unwrap_or(&first);
    match bin {
        "ssh" | "telnet" | "ftp" | "sftp" => Some(
            "⚠️ Cette commande requiert un terminal interactif.\n\
             Utilise terminal_start_interactive (pas terminal_exec) pour SSH et autres sessions interactives.\n\
             L'utilisateur pourra saisir son mot de passe / ses commandes directement dans l'interface.",
        ),
        "top" | "htop" | "btop" => Some(
            "❌ Moniteurs interactifs non supportés. Utilisez Get-Process (PowerShell) ou ps aux.",
        ),
        "vim" | "vi" | "nano" | "emacs" | "less" | "more" => Some(
            "❌ Éditeurs/pagers interactifs non supportés. Utilisez l'outil 'files' pour lire/écrire des fichiers.",
        ),
        "python" | "python3" | "node" | "irb" | "php" | "lua" => {
            if cmd.trim().split_whitespace().nth(1).is_none() {
                Some("⚠️ REPL interactif — utilise terminal_start_interactive ou passe un fichier/-c en argument.")
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Exécute une commande dans un terminal existant en maintenant le cwd.
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
    // Bloquer les commandes interactives avant même de les lancer
    if let Some(msg) = requires_interactive(&command) {
        return Err(msg.into());
    }

    let current_cwd = {
        let map = state.0.lock().unwrap();
        match map.get(&terminal_id) {
            Some(s) => {
                if s.is_running {
                    return Err(
                        "Un processus interactif est déjà en cours dans ce terminal. \
                         Attendez qu'il se termine ou créez un autre terminal."
                            .into(),
                    );
                }
                s.cwd.clone()
            }
            None => {
                return Err(format!(
                    "Terminal '{}' introuvable. Liste les terminaux avec list_terminals.",
                    terminal_id
                ))
            }
        }
    };

    // Construire la commande complète (string concatenation pour éviter les
    // problèmes de format! avec des accolades dans `command`)
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
            "{}…\n[tronqué — {} chars au total]",
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
        Ok(format!(
            "✅ Terminal '{}' fermé et retiré de la liste.",
            terminal_id
        ))
    } else {
        Err(format!("Terminal '{}' introuvable.", terminal_id))
    }
}

/// Retourne l'historique complet des commandes d'un terminal.
/// Si un processus interactif est en cours, une entrée « live » est ajoutée en dernier.
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
                    s.history.push(TerminalEntry {
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

/// Redimensionne le PTY (syncronise avec la taille de la fenêtre xterm.js).
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
