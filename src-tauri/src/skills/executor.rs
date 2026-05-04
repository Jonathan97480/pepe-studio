//! Exécution des skills : PS1, HTTP, Python, Node.js, composite.
//! Sécurité : validation syntaxique PS1 basique, blocklist cmdlets dangereux.

use std::fs;
use tauri::{command, AppHandle};

use super::manager::{
    apply_headers, build_request, execute_http, resolve_url, sanitize_name, skills_dir,
    substitute_url_params, CompositeSkillConfig, HttpSkillConfig,
};

// ── Sécurité PowerShell : blocklist de cmdlets dangereux ─────────────────────

/// Vérifie qu'un script PS1 ne contient pas de cmdlets ou patterns dangereux.
/// Retourne une erreur descriptive si un pattern interdit est détecté.
pub fn validate_ps1_safety(content: &str) -> Result<(), String> {
    // Patterns dangereux (insensible à la casse)
    let dangerous: &[&str] = &[
        "format-volume",
        "clear-disk",
        "initialize-disk",
        "remove-partition",
        "set-partition",
        "invoke-expression", // iex
        "iex ",
        "invoke-webrequest", // download + exec
        ". (",               // dot-sourcing d'expression dynamique
        "& (",               // call operator sur expression dynamique
        "[system.reflection.assembly]::loadfrom",
        "[system.reflection.assembly]::loadfile",
        "add-type -assemblyname",
        "[runtime.interopservices", // P/Invoke non supervisé
        "net.webclient",            // download sans proxy Tauri
        "downloadstring(",
        "downloadfile(",
        "start-process", // lancement de processus arbitraire
        "reg add",
        "reg delete",
        "regedit",
        "bcdedit",
        "schtasks /create",
    ];

    let lower = content.to_lowercase();
    for pattern in dangerous {
        if lower.contains(pattern) {
            return Err(format!(
                "Script PS1 refuse : cmdlet/pattern dangereux detecte : '{}'. \
                 Simplifie le script ou utilise une alternative sure.",
                pattern
            ));
        }
    }
    Ok(())
}

// ── Implémentation interne (réentrante pour composites) ───────────────────────

/// Exécute un skill. `depth` limite la récursion composite à 5 niveaux.
pub fn run_skill_impl(
    app: &AppHandle,
    name: String,
    args: Option<String>,
    depth: u8,
) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(app);
    let skills_dir_str = dir.to_string_lossy().to_string();
    let composite_path = dir.join(format!("{}.composite.json", safe_name));
    let http_path = dir.join(format!("{}.http.json", safe_name));
    let ps1_path = dir.join(format!("{}.ps1", safe_name));
    let py_path = dir.join(format!("{}.py", safe_name));
    let js_path = dir.join(format!("{}.js", safe_name));

    // ── Skill composite ───────────────────────────────────────────────────────
    if composite_path.exists() {
        if depth >= 5 {
            return Err("Skill composite : profondeur maximale atteinte (5 niveaux)".into());
        }
        let raw = fs::read_to_string(&composite_path).map_err(|e| e.to_string())?;
        let cfg: CompositeSkillConfig =
            serde_json::from_str(&raw).map_err(|e| format!("Skill composite corrompu : {e}"))?;
        let total = cfg.steps.len();
        let mut last_output = String::new();
        let mut step_summaries: Vec<(String, String)> = Vec::new();
        let mut all_outputs: Vec<String> = Vec::new();
        for (i, step) in cfg.steps.iter().enumerate() {
            let step_args = if step.chain.unwrap_or(false) && i > 0 {
                if last_output.is_empty() {
                    None
                } else {
                    Some(last_output.chars().take(2000).collect::<String>())
                }
            } else {
                step.args.clone()
            };
            match run_skill_impl(app, step.skill.clone(), step_args, depth + 1) {
                Ok(out) => {
                    let preview: String = out.chars().take(120).collect();
                    let preview = if out.len() > 120 {
                        format!("{}...", preview)
                    } else {
                        preview
                    };
                    step_summaries.push((step.skill.clone(), preview.clone()));
                    last_output = out.clone();
                    all_outputs.push(format!(
                        "[etape {}/{} OK : {}]\n{}",
                        i + 1,
                        total,
                        step.skill,
                        out
                    ));
                }
                Err(e) => {
                    if cfg.continue_on_error.unwrap_or(false) {
                        all_outputs.push(format!(
                            "[etape {}/{} ERREUR : {}]\n{}",
                            i + 1,
                            total,
                            step.skill,
                            e
                        ));
                        step_summaries.push((
                            step.skill.clone(),
                            format!("ERR {}", &e.chars().take(80).collect::<String>()),
                        ));
                    } else {
                        let succeeded_block = if step_summaries.is_empty() {
                            "  (aucune etape precedente)".to_string()
                        } else {
                            step_summaries
                                .iter()
                                .enumerate()
                                .map(|(j, (sname, preview))| {
                                    format!("  etape {} '{}' OK -- {}", j + 1, sname, preview)
                                })
                                .collect::<Vec<_>>()
                                .join("\n")
                        };
                        return Err(format!(
                            "Etape {}/{} '{}' echouee :\n  Erreur : {}\n\nEtapes reussies avant l'echec :\n{}",
                            i + 1, total, step.skill, e, succeeded_block
                        ));
                    }
                }
            }
        }
        return Ok(all_outputs.join("\n---\n"));
    }

    // ── Skill HTTP ────────────────────────────────────────────────────────────
    if http_path.exists() {
        let raw = fs::read_to_string(&http_path).map_err(|e| e.to_string())?;
        let cfg: HttpSkillConfig =
            serde_json::from_str(&raw).map_err(|e| format!("Skill HTTP corrompu : {e}"))?;
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Erreur client HTTP : {e}"))?;

        if let Some(ref routes) = cfg.routes {
            let args_val: serde_json::Value = args
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(serde_json::json!({}));
            let action = args_val
                .get("action")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    let mut av: Vec<&str> = routes.keys().map(|s| s.as_str()).collect();
                    av.sort();
                    format!(
                        "Parametre 'action' manquant. Actions disponibles : {}",
                        av.join(", ")
                    )
                })?;
            let route = routes.get(action).ok_or_else(|| {
                let mut av: Vec<&str> = routes.keys().map(|s| s.as_str()).collect();
                av.sort();
                format!(
                    "Action '{}' introuvable. Disponibles : {}",
                    action,
                    av.join(", ")
                )
            })?;
            let resolved = resolve_url(cfg.base_url.as_deref(), &route.url)?;
            let full_url = substitute_url_params(&resolved, &args_val);
            let req = build_request(&client, &route.method, &full_url)?;
            let req = apply_headers(req, &cfg.headers);
            let body = args_val
                .get("body")
                .and_then(|v| v.as_str())
                .or_else(|| route.default_body.as_deref());
            return execute_http(req, body);
        }

        let method = cfg.method.as_deref().unwrap_or("GET");
        let raw_url = cfg.url.as_deref().ok_or("Skill HTTP : url manquante")?;
        let full_url = resolve_url(cfg.base_url.as_deref(), raw_url)?;
        let req = build_request(&client, method, &full_url)?;
        let req = apply_headers(req, &cfg.headers);
        let body = args
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| cfg.default_body.as_deref().filter(|s| !s.trim().is_empty()));
        return execute_http(req, body);
    }

    // ── Skill Python ──────────────────────────────────────────────────────────
    if py_path.exists() {
        let path_str = py_path.to_string_lossy().to_string();
        #[cfg(target_os = "windows")]
        let python_bin = "python";
        #[cfg(not(target_os = "windows"))]
        let python_bin = "python3";

        let mut cmd_args: Vec<String> = vec![path_str];
        if let Some(a) = args.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd_args.extend(a.split_whitespace().map(|s| s.to_string()));
        }

        #[cfg(target_os = "windows")]
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new(python_bin)
                .args(&cmd_args)
                .env("PEPE_SKILLS_DIR", &skills_dir_str)
                .creation_flags(0x08000000)
                .output()
                .map_err(|e| {
                    format!(
                        "Python introuvable : {e}. Assure-toi que Python est installe dans le PATH."
                    )
                })?
        };
        #[cfg(not(target_os = "windows"))]
        let output = std::process::Command::new(python_bin)
            .args(&cmd_args)
            .env("PEPE_SKILLS_DIR", &skills_dir_str)
            .output()
            .map_err(|e| format!("Python introuvable : {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return if !stdout.is_empty() {
            Ok(if stdout.len() > 4000 {
                format!("{}...\n[tronque, {} chars]", &stdout[..4000], stdout.len())
            } else {
                stdout
            })
        } else if !stderr.is_empty() {
            Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
        } else {
            Ok("(aucune sortie)".to_string())
        };
    }

    // ── Skill Node.js ─────────────────────────────────────────────────────────
    if js_path.exists() {
        let path_str = js_path.to_string_lossy().to_string();
        let mut cmd_args: Vec<String> = vec![path_str];
        if let Some(a) = args.as_deref().filter(|s| !s.trim().is_empty()) {
            cmd_args.extend(a.split_whitespace().map(|s| s.to_string()));
        }

        #[cfg(target_os = "windows")]
        let output = {
            use std::os::windows::process::CommandExt;
            std::process::Command::new("node")
                .args(&cmd_args)
                .env("PEPE_SKILLS_DIR", &skills_dir_str)
                .creation_flags(0x08000000)
                .output()
                .map_err(|e| {
                    format!("Node.js introuvable : {e}. Assure-toi que Node.js est dans le PATH.")
                })?
        };
        #[cfg(not(target_os = "windows"))]
        let output = std::process::Command::new("node")
            .args(&cmd_args)
            .env("PEPE_SKILLS_DIR", &skills_dir_str)
            .output()
            .map_err(|e| format!("Node.js introuvable : {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return if !stdout.is_empty() {
            Ok(if stdout.len() > 4000 {
                format!("{}...\n[tronque, {} chars]", &stdout[..4000], stdout.len())
            } else {
                stdout
            })
        } else if !stderr.is_empty() {
            Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
        } else {
            Ok("(aucune sortie)".to_string())
        };
    }

    // ── Skill PS1 ─────────────────────────────────────────────────────────────
    if !ps1_path.exists() {
        return Err(format!("Skill '{}' introuvable", safe_name));
    }

    // Validation de sécurité avant exécution
    let ps1_content = fs::read_to_string(&ps1_path).map_err(|e| e.to_string())?;
    validate_ps1_safety(&ps1_content)?;

    let path_str = ps1_path.to_string_lossy().to_string();
    let cmd = if let Some(a) = args.as_deref().filter(|s| !s.trim().is_empty()) {
        format!("& '{}' {}", path_str, a)
    } else {
        format!("& '{}'", path_str)
    };

    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &cmd])
            .env("PEPE_SKILLS_DIR", &skills_dir_str)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| e.to_string())?
    };

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(["-c", &cmd])
        .env("PEPE_SKILLS_DIR", &skills_dir_str)
        .output()
        .map_err(|e| e.to_string())?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        Ok(if stdout.len() > 4000 {
            format!("{}...\n[tronque, {} chars]", &stdout[..4000], stdout.len())
        } else {
            stdout
        })
    } else if !stderr.is_empty() {
        Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
    } else {
        Ok("(aucune sortie)".to_string())
    }
}

// ─── Commande Tauri ───────────────────────────────────────────────────────────

#[command]
pub fn run_skill(app: AppHandle, name: String, args: Option<String>) -> Result<String, String> {
    run_skill_impl(&app, name, args, 0)
}
