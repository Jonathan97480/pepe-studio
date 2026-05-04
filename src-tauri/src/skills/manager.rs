//! Types, helpers et commandes CRUD des skills.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle};

// ─── Types publics ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub skill_type: String,
}

/// Une route individuelle dans un skill HTTP multi-actions.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RouteConfig {
    pub method: String,
    pub url: String,
    pub default_body: Option<String>,
}

/// Config d'un skill HTTP stockée en JSON.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct HttpSkillConfig {
    pub description: String,
    pub headers: Option<String>,
    pub created_at: String,
    pub base_url: Option<String>,
    pub method: Option<String>,
    pub url: Option<String>,
    pub default_body: Option<String>,
    pub routes: Option<HashMap<String, RouteConfig>>,
}

/// Etape d'un skill composite.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompositeStep {
    pub skill: String,
    pub args: Option<String>,
    pub chain: Option<bool>,
}

/// Config d'un skill composite.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompositeSkillConfig {
    pub description: String,
    pub created_at: String,
    pub steps: Vec<CompositeStep>,
    pub continue_on_error: Option<bool>,
}

// ─── Helpers publics ──────────────────────────────────────────────────────────

pub fn skills_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("skills");
    fs::create_dir_all(&dir).ok();
    dir
}

pub fn sanitize_name(name: &str) -> Result<String, String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if clean.is_empty() || clean.len() > 64 {
        return Err("Nom de skill invalide (1-64 chars alphanumerique/-/_)".into());
    }
    Ok(clean)
}

/// Résout une URL : absolue → retournée telle quelle, relative → concaténée à base_url.
pub fn resolve_url(base_url: Option<&str>, path: &str) -> Result<String, String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(path.to_owned());
    }
    if path.starts_with('/') {
        if let Some(base) = base_url.filter(|s| !s.trim().is_empty()) {
            return Ok(format!("{}{}", base.trim_end_matches('/'), path));
        }
        return Err(format!(
            "URL relative '{}' requiert un champ 'base_url' au niveau du skill",
            path
        ));
    }
    Err(format!(
        "URL invalide '{}' : doit commencer par http://, https:// ou / (chemin relatif avec base_url)",
        path
    ))
}

pub fn apply_headers(
    mut req: reqwest::blocking::RequestBuilder,
    headers: &Option<String>,
) -> reqwest::blocking::RequestBuilder {
    if let Some(h) = headers {
        for line in h.lines() {
            if let Some((k, v)) = line.split_once(':') {
                let k = k.trim();
                let v = v.trim();
                if !k.is_empty() {
                    req = req.header(k, v);
                }
            }
        }
    }
    req
}

/// Substitue les paramètres {param} dans une URL depuis un objet JSON.
pub fn substitute_url_params(url: &str, args: &serde_json::Value) -> String {
    let mut result = url.to_owned();
    if let Some(map) = args.as_object() {
        for (key, val) in map {
            if key == "action" || key == "body" {
                continue;
            }
            let placeholder = format!("{{{}}}", key);
            let replacement = match val {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => continue,
            };
            result = result.replace(&placeholder, &replacement);
        }
    }
    result
}

pub fn build_request(
    client: &reqwest::blocking::Client,
    method: &str,
    url: &str,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    match method.trim().to_uppercase().as_str() {
        "GET" => Ok(client.get(url)),
        "POST" => Ok(client.post(url)),
        "PUT" => Ok(client.put(url)),
        "DELETE" => Ok(client.delete(url)),
        "PATCH" => Ok(client.patch(url)),
        other => Err(format!("Methode HTTP non supportee : {other}")),
    }
}

pub fn execute_http(
    req: reqwest::blocking::RequestBuilder,
    body: Option<&str>,
) -> Result<String, String> {
    let req = if let Some(b) = body.filter(|s| !s.trim().is_empty()) {
        req.body(b.to_owned())
    } else {
        req
    };
    let response = req
        .send()
        .map_err(|e| format!("Erreur reseau : {e}"))?;
    let status = response.status().as_u16();
    let body_text = response
        .text()
        .map_err(|e| format!("Erreur lecture reponse : {e}"))?;
    const MAX_BODY: usize = 4000;
    let truncated = if body_text.len() > MAX_BODY {
        format!(
            "{}\n... [tronque a {} chars]",
            &body_text[..MAX_BODY],
            body_text.len()
        )
    } else {
        body_text
    };
    Ok(format!("HTTP {status}\n{truncated}"))
}

// ─── Commandes CRUD ───────────────────────────────────────────────────────────

#[command]
pub fn create_skill(
    app: AppHandle,
    name: String,
    description: String,
    content: String,
    skill_type: Option<String>,
    method: Option<String>,
    url: Option<String>,
    headers_template: Option<String>,
    default_body: Option<String>,
    base_url: Option<String>,
    routes: Option<String>,
) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(&app);
    let now = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    if skill_type.as_deref() == Some("http") {
        let parsed_routes: Option<HashMap<String, RouteConfig>> =
            if let Some(r) = routes.as_deref().filter(|s| !s.trim().is_empty()) {
                Some(serde_json::from_str(r).map_err(|e| format!("routes JSON invalide : {e}"))?)
            } else {
                None
            };

        if let Some(ref prt) = parsed_routes {
            if prt.is_empty() {
                return Err("routes ne peut pas etre vide".into());
            }
            for (action, route) in prt {
                resolve_url(base_url.as_deref(), &route.url)
                    .map_err(|e| format!("Route '{}' : {}", action, e))?;
                if !["GET", "POST", "PUT", "DELETE", "PATCH"]
                    .contains(&route.method.trim().to_uppercase().as_str())
                {
                    return Err(format!(
                        "Route '{}' : methode invalide : {}",
                        action, route.method
                    ));
                }
            }
        } else {
            let m = method
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .ok_or("skill_type=http requiert 'method' ou 'routes'")?;
            let u = url
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .ok_or("skill_type=http requiert 'url' ou 'routes'")?;
            resolve_url(base_url.as_deref(), u)?;
            let m_upper = m.to_uppercase();
            if !["GET", "POST", "PUT", "DELETE", "PATCH"].contains(&m_upper.as_str()) {
                return Err(format!("Methode HTTP non supportee : {m_upper}"));
            }
        }

        let nb_routes = parsed_routes.as_ref().map(|r| r.len());
        let config = HttpSkillConfig {
            description: description.replace('\n', " "),
            headers: headers_template.filter(|s| !s.trim().is_empty()),
            created_at: now,
            base_url: base_url.filter(|s| !s.trim().is_empty()),
            method: method
                .filter(|s| !s.trim().is_empty())
                .map(|m| m.trim().to_uppercase()),
            url: url.filter(|s| !s.trim().is_empty()),
            default_body: default_body.filter(|s| !s.trim().is_empty()),
            routes: parsed_routes,
        };
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.http.json", safe_name));
        fs::write(&path, json).map_err(|e| e.to_string())?;
        let mode = nb_routes
            .map(|n| format!("{n} actions"))
            .unwrap_or_else(|| "single endpoint".into());
        return Ok(format!(
            "Skill HTTP '{}' sauvegarde ({}) dans {}",
            safe_name,
            mode,
            path.display()
        ));
    }

    if skill_type.as_deref() == Some("composite") {
        if content.trim().is_empty() {
            return Err(
                "skill_type=composite requiert 'content' (JSON array de steps)".into(),
            );
        }
        #[derive(Deserialize)]
        struct CompositeInput {
            steps: Vec<CompositeStep>,
            continue_on_error: Option<bool>,
        }
        let (steps, continue_on_error) = if content.trim_start().starts_with('[') {
            let s: Vec<CompositeStep> = serde_json::from_str(&content).map_err(|e| {
                format!("content invalide pour composite (doit etre JSON array) : {e}")
            })?;
            (s, None)
        } else {
            let obj: CompositeInput = serde_json::from_str(&content)
                .map_err(|e| format!("content invalide pour composite : {e}"))?;
            (obj.steps, obj.continue_on_error)
        };
        if steps.is_empty() {
            return Err("Un skill composite doit avoir au moins 1 etape".into());
        }
        if steps.len() > 20 {
            return Err("Un skill composite ne peut pas avoir plus de 20 etapes".into());
        }
        for (i, step) in steps.iter().enumerate() {
            sanitize_name(&step.skill)
                .map_err(|e| format!("Etape {} : skill '{}' invalide : {}", i + 1, step.skill, e))?;
        }
        let nb = steps.len();
        let config = CompositeSkillConfig {
            description: description.replace('\n', " "),
            created_at: now,
            steps,
            continue_on_error,
        };
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.composite.json", safe_name));
        fs::write(&path, json).map_err(|e| e.to_string())?;
        return Ok(format!(
            "Skill composite '{}' sauvegarde ({} etape(s)) dans {}",
            safe_name,
            nb,
            path.display()
        ));
    }

    if skill_type.as_deref() == Some("python") {
        if content.len() > 64_000 {
            return Err("Contenu trop long (max 64 KB)".into());
        }
        let path = dir.join(format!("{}.py", safe_name));
        let full_content = format!(
            "# Skill: {}\n# Description: {}\n# Cree: {}\n\n{}",
            safe_name,
            description.replace('\n', " "),
            now,
            content
        );
        fs::write(&path, full_content).map_err(|e| e.to_string())?;
        return Ok(format!(
            "Skill Python '{}' sauvegarde dans {}",
            safe_name,
            path.display()
        ));
    }

    if skill_type.as_deref() == Some("nodejs") {
        if content.len() > 64_000 {
            return Err("Contenu trop long (max 64 KB)".into());
        }
        let path = dir.join(format!("{}.js", safe_name));
        let full_content = format!(
            "// Skill: {}\n// Description: {}\n// Cree: {}\n\n{}",
            safe_name,
            description.replace('\n', " "),
            now,
            content
        );
        fs::write(&path, full_content).map_err(|e| e.to_string())?;
        return Ok(format!(
            "Skill Node.js '{}' sauvegarde dans {}",
            safe_name,
            path.display()
        ));
    }

    // Skill PS1 (défaut)
    if content.len() > 64_000 {
        return Err("Contenu trop long (max 64 KB)".into());
    }
    let path = dir.join(format!("{}.ps1", safe_name));
    let full_content = format!(
        "# Skill: {}\n# Description: {}\n# Cree: {}\n\n{}",
        safe_name,
        description.replace('\n', " "),
        now,
        content
    );
    fs::write(&path, full_content).map_err(|e| e.to_string())?;
    Ok(format!(
        "Skill PS1 '{}' sauvegarde dans {}",
        safe_name,
        path.display()
    ))
}

#[command]
pub fn list_skills(app: AppHandle) -> Result<Vec<SkillMeta>, String> {
    let dir = skills_dir(&app);
    let mut skills = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        if ext == "ps1" {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("# Description: ") {
                    description = d.trim().to_string();
                }
                if let Some(c) = line.strip_prefix("# Cree: ") {
                    created_at = c.trim().to_string();
                }
            }
            skills.push(SkillMeta {
                name,
                description,
                created_at,
                skill_type: "ps1".into(),
            });
        } else if path
            .to_str()
            .map(|s| s.ends_with(".http.json"))
            .unwrap_or(false)
        {
            let file_name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let name = file_name.trim_end_matches(".http.json").to_string();
            if name.is_empty() {
                continue;
            }
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let (description, created_at) =
                if let Ok(cfg) = serde_json::from_str::<HttpSkillConfig>(&raw) {
                    let base = cfg.base_url.as_deref().unwrap_or("");
                    let desc = if let Some(ref routes) = cfg.routes {
                        let mut actions: Vec<&str> =
                            routes.keys().map(|s| s.as_str()).collect();
                        actions.sort();
                        let base_info = if !base.is_empty() {
                            format!(" (base: {})", base)
                        } else {
                            String::new()
                        };
                        format!(
                            "{}{} | Actions: {}",
                            cfg.description,
                            base_info,
                            actions.join(", ")
                        )
                    } else {
                        cfg.description.clone()
                    };
                    (desc, cfg.created_at)
                } else {
                    (String::new(), String::new())
                };
            skills.push(SkillMeta {
                name,
                description,
                created_at,
                skill_type: "http".into(),
            });
        } else if ext == "py" {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("# Description: ") {
                    description = d.trim().to_string();
                }
                if let Some(c) = line.strip_prefix("# Cree: ") {
                    created_at = c.trim().to_string();
                }
            }
            skills.push(SkillMeta {
                name,
                description,
                created_at,
                skill_type: "python".into(),
            });
        } else if ext == "js" {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("// Description: ") {
                    description = d.trim().to_string();
                }
                if let Some(c) = line.strip_prefix("// Cree: ") {
                    created_at = c.trim().to_string();
                }
            }
            skills.push(SkillMeta {
                name,
                description,
                created_at,
                skill_type: "nodejs".into(),
            });
        } else if path
            .to_str()
            .map(|s| s.ends_with(".composite.json"))
            .unwrap_or(false)
        {
            let file_name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("");
            let name = file_name.trim_end_matches(".composite.json").to_string();
            if name.is_empty() {
                continue;
            }
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let (description, created_at) =
                if let Ok(cfg) = serde_json::from_str::<CompositeSkillConfig>(&raw) {
                    let step_names: Vec<&str> =
                        cfg.steps.iter().map(|s| s.skill.as_str()).collect();
                    (
                        format!(
                            "{} | Etapes: {}",
                            cfg.description,
                            step_names.join(" -> ")
                        ),
                        cfg.created_at,
                    )
                } else {
                    (String::new(), String::new())
                };
            skills.push(SkillMeta {
                name,
                description,
                created_at,
                skill_type: "composite".into(),
            });
        }
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

#[command]
pub fn read_skill(app: AppHandle, name: String) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(&app);
    let ps1 = dir.join(format!("{}.ps1", safe_name));
    let http = dir.join(format!("{}.http.json", safe_name));
    let composite = dir.join(format!("{}.composite.json", safe_name));
    let py = dir.join(format!("{}.py", safe_name));
    let js = dir.join(format!("{}.js", safe_name));
    if ps1.exists() {
        fs::read_to_string(&ps1).map_err(|e| e.to_string())
    } else if http.exists() {
        fs::read_to_string(&http).map_err(|e| e.to_string())
    } else if composite.exists() {
        fs::read_to_string(&composite).map_err(|e| e.to_string())
    } else if py.exists() {
        fs::read_to_string(&py).map_err(|e| e.to_string())
    } else if js.exists() {
        fs::read_to_string(&js).map_err(|e| e.to_string())
    } else {
        Err(format!("Skill '{}' introuvable", safe_name))
    }
}

#[command]
pub fn delete_skill(app: AppHandle, name: String) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(&app);
    let ps1 = dir.join(format!("{}.ps1", safe_name));
    let http = dir.join(format!("{}.http.json", safe_name));
    let composite = dir.join(format!("{}.composite.json", safe_name));
    let py = dir.join(format!("{}.py", safe_name));
    let js = dir.join(format!("{}.js", safe_name));
    if ps1.exists() {
        fs::remove_file(&ps1).map_err(|e| e.to_string())?;
        Ok(format!("Skill PS1 '{}' supprime", safe_name))
    } else if http.exists() {
        fs::remove_file(&http).map_err(|e| e.to_string())?;
        Ok(format!("Skill HTTP '{}' supprime", safe_name))
    } else if composite.exists() {
        fs::remove_file(&composite).map_err(|e| e.to_string())?;
        Ok(format!("Skill composite '{}' supprime", safe_name))
    } else if py.exists() {
        fs::remove_file(&py).map_err(|e| e.to_string())?;
        Ok(format!("Skill Python '{}' supprime", safe_name))
    } else if js.exists() {
        fs::remove_file(&js).map_err(|e| e.to_string())?;
        Ok(format!("Skill Node.js '{}' supprime", safe_name))
    } else {
        Err(format!("Skill '{}' introuvable", safe_name))
    }
}

#[command]
pub fn patch_skill(
    app: AppHandle,
    name: String,
    search: String,
    replace: String,
) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    if search.is_empty() {
        return Err("Le bloc SEARCH ne peut pas etre vide".into());
    }
    let dir = skills_dir(&app);
    let ps1_path = dir.join(format!("{}.ps1", safe_name));
    let http_path = dir.join(format!("{}.http.json", safe_name));
    let py_path = dir.join(format!("{}.py", safe_name));
    let js_path = dir.join(format!("{}.js", safe_name));
    let (path, is_ps1) = if ps1_path.exists() {
        (ps1_path, true)
    } else if http_path.exists() {
        (http_path, false)
    } else if py_path.exists() {
        (py_path, true)
    } else if js_path.exists() {
        (js_path, true)
    } else {
        return Err(format!("Skill '{}' introuvable", safe_name));
    };
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let occurrences = content.matches(search.as_str()).count();
    match occurrences {
        0 => return Err(format!(
            "Bloc SEARCH introuvable dans le skill '{}'. Verifiez que le texte correspond exactement.",
            safe_name
        )),
        2.. => return Err(format!(
            "Bloc SEARCH ambigu dans '{}' : {} occurrences. Ajoutez plus de contexte.",
            safe_name, occurrences
        )),
        _ => {}
    }
    let patched = content.replacen(search.as_str(), replace.as_str(), 1);
    if is_ps1 && patched.len() > 64_000 {
        return Err("Contenu apres patch trop long (max 64 KB)".into());
    }
    fs::write(&path, patched).map_err(|e| e.to_string())?;
    Ok(format!("Skill '{}' patche ({}).", safe_name, path.display()))
}

// ─── Plan / Checkpoint ────────────────────────────────────────────────────────

fn plan_path(app: &AppHandle) -> std::path::PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("PLAN.md")
}

#[command]
pub fn save_plan(app: AppHandle, content: String) -> Result<String, String> {
    let path = plan_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(format!("PLAN.md sauvegarde : {}", path.display()))
}

#[command]
pub fn get_plan(app: AppHandle) -> Result<String, String> {
    let path = plan_path(&app);
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}
