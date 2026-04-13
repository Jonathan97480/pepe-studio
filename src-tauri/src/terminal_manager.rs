//! Gestionnaire de terminaux persistants.
//! Chaque terminal conserve son répertoire courant (cwd) entre les appels.
//! L'exécution est sans état de processus : on préfixe chaque commande par
//! `Set-Location "cwd"` et on capture le nouveau cwd via un marqueur de fin.

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use tauri::{command, State};

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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TerminalExecResult {
    pub terminal_id: String,
    pub output: String,
    pub new_cwd: String,
}

// ─── État interne ─────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub(crate) struct TerminalSession {
    id: String,
    name: String,
    cwd: String,
    history: Vec<TerminalEntry>,
}

pub struct TerminalManagerState(pub Mutex<HashMap<String, TerminalSession>>);

impl Default for TerminalManagerState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
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
    // Forcer UTF-8 pour que les caractères accentués (French) ne soient pas corrompus.
    let utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                       $OutputEncoding = [System.Text.Encoding]::UTF8; ";
    let full_cmd = format!("{}{}", utf8_prefix, cmd);
    match Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &full_cmd])
        .creation_flags(0x08000000)
        .output()
    {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if !stdout.is_empty() {
                stdout
            } else if !stderr.is_empty() {
                format!("[stderr] {}", stderr)
            } else {
                "(aucune sortie)".into()
            }
        }
        Err(e) => format!("[Erreur] {}", e),
    }
}

#[cfg(not(target_os = "windows"))]
fn run_ps(cmd: &str) -> String {
    match Command::new("sh").args(["-c", cmd]).output() {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            if !stdout.is_empty() {
                stdout
            } else if !stderr.is_empty() {
                format!("[stderr] {}", stderr)
            } else {
                "(aucune sortie)".into()
            }
        }
        Err(e) => format!("[Erreur] {}", e),
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
        },
    );

    Ok(TerminalInfo {
        id,
        name: display_name,
        cwd: initial_cwd,
        entry_count: 0,
    })
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

    let current_cwd = {
        let map = state.0.lock().unwrap();
        match map.get(&terminal_id) {
            Some(s) => s.cwd.clone(),
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
            entry_count: s.history.len(),
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
#[command]
pub fn get_terminal_history(
    terminal_id: String,
    state: State<'_, TerminalManagerState>,
) -> Result<Vec<TerminalEntry>, String> {
    let map = state.0.lock().unwrap();
    match map.get(&terminal_id) {
        Some(s) => Ok(s.history.clone()),
        None => Err(format!("Terminal '{}' introuvable.", terminal_id)),
    }
}
