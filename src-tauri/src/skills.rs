//! Gestion des skills : scripts PowerShell (.ps1) ou configs HTTP (.http.json).
//! Stockes dans {app_data}/skills/

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{command, AppHandle};

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

/// Config d un skill HTTP stockee en JSON.
/// Mode single : method + url + default_body
/// Mode multi  : base_url + routes HashMap<action, RouteConfig> + headers partages
/// Les routes peuvent utiliser des URLs absolues OU des chemins relatifs (commencant par /)
/// si base_url est fourni.
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
/// Si `chain` est true et que ce n'est pas la premiere etape,
/// la sortie de l'etape precedente est passee comme args (max 2000 chars).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompositeStep {
    pub skill: String,
    pub args: Option<String>,
    pub chain: Option<bool>,
}

/// Config d'un skill composite : sequence d'appels a d'autres skills.
/// Stocke en .composite.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CompositeSkillConfig {
    pub description: String,
    pub created_at: String,
    pub steps: Vec<CompositeStep>,
    pub continue_on_error: Option<bool>,
}

fn skills_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("skills");
    fs::create_dir_all(&dir).ok();
    dir
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if clean.is_empty() || clean.len() > 64 {
        return Err("Nom de skill invalide (1-64 chars alphanumerique/-/_)".into());
    }
    Ok(clean)
}

/// Resout une URL : si path est absolu (http/https), le retourne tel quel.
/// Si path est relatif (commence par /), le concatene a base_url.
fn resolve_url(base_url: Option<&str>, path: &str) -> Result<String, String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Ok(path.to_owned());
    }
    if path.starts_with('/') {
        if let Some(base) = base_url.filter(|s| !s.trim().is_empty()) {
            return Ok(format!("{}{}", base.trim_end_matches('/'), path));
        }
        return Err(format!("URL relative '{}' requiert un champ 'base_url' au niveau du skill", path));
    }
    Err(format!("URL invalide '{}' : doit commencer par http://, https:// ou / (chemin relatif avec base_url)", path))
}

fn apply_headers(
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

/// Substitue les parametres {param} dans une URL depuis un objet JSON.
/// Ex: "/articles/{id}" + {"action":"x","id":5} -> "/articles/5"
/// Les cles "action" et "body" sont ignorees (usage interne).
fn substitute_url_params(url: &str, args: &serde_json::Value) -> String {
    let mut result = url.to_owned();
    if let Some(map) = args.as_object() {
        for (key, val) in map {
            if key == "action" || key == "body" { continue; }
            let placeholder = format!("{{{}}}", key);
            let replacement = match val {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b)   => b.to_string(),
                _ => continue,
            };
            result = result.replace(&placeholder, &replacement);
        }
    }
    result
}

fn build_request(
    client: &reqwest::blocking::Client,
    method: &str,
    url: &str,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    match method.trim().to_uppercase().as_str() {
        "GET"    => Ok(client.get(url)),
        "POST"   => Ok(client.post(url)),
        "PUT"    => Ok(client.put(url)),
        "DELETE" => Ok(client.delete(url)),
        "PATCH"  => Ok(client.patch(url)),
        other    => Err(format!("Methode HTTP non supportee : {other}")),
    }
}

fn execute_http(req: reqwest::blocking::RequestBuilder, body: Option<&str>) -> Result<String, String> {
    let req = if let Some(b) = body.filter(|s| !s.trim().is_empty()) {
        req.body(b.to_owned())
    } else {
        req
    };
    let response = req.send().map_err(|e| format!("Erreur reseau : {e}"))?;
    let status = response.status().as_u16();
    let body_text = response.text().map_err(|e| format!("Erreur lecture reponse : {e}"))?;
    const MAX_BODY: usize = 4000;
    let truncated = if body_text.len() > MAX_BODY {
        format!("{}\n... [tronque a {} chars]", &body_text[..MAX_BODY], body_text.len())
    } else {
        body_text
    };
    Ok(format!("HTTP {status}\n{truncated}"))
}

/// Cree ou met a jour un skill PS1 ou HTTP.
/// Skill PS1          : fournir content.
/// Skill HTTP single  : skill_type="http", method, url (absolue).
/// Skill HTTP multi   : skill_type="http", base_url (optionnel), routes=JSON.
///   - routes avec URL absolues : pas besoin de base_url
///   - routes avec chemins relatifs (/path) : base_url obligatoire
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
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    if skill_type.as_deref() == Some("http") {
        let parsed_routes: Option<HashMap<String, RouteConfig>> =
            if let Some(r) = routes.as_deref().filter(|s| !s.trim().is_empty()) {
                Some(serde_json::from_str(r).map_err(|e| format!("routes JSON invalide : {e}"))?)
            } else {
                None
            };

        if let Some(ref prt) = parsed_routes {
            if prt.is_empty() { return Err("routes ne peut pas etre vide".into()); }
            for (action, route) in prt {
                // Valide l URL (absolue ou relative si base_url present)
                resolve_url(base_url.as_deref(), &route.url)
                    .map_err(|e| format!("Route '{}' : {}", action, e))?;
                if !["GET","POST","PUT","DELETE","PATCH"].contains(&route.method.trim().to_uppercase().as_str()) {
                    return Err(format!("Route '{}' : methode invalide : {}", action, route.method));
                }
            }
        } else {
            let m = method.as_deref().filter(|s| !s.trim().is_empty())
                .ok_or("skill_type=http requiert 'method' ou 'routes'")?;
            let u = url.as_deref().filter(|s| !s.trim().is_empty())
                .ok_or("skill_type=http requiert 'url' ou 'routes'")?;
            resolve_url(base_url.as_deref(), u)?;
            let m_upper = m.to_uppercase();
            if !["GET","POST","PUT","DELETE","PATCH"].contains(&m_upper.as_str()) {
                return Err(format!("Methode HTTP non supportee : {m_upper}"));
            }
        }

        let nb_routes = parsed_routes.as_ref().map(|r| r.len());
        let config = HttpSkillConfig {
            description: description.replace('\n', " "),
            headers: headers_template.filter(|s| !s.trim().is_empty()),
            created_at: now,
            base_url: base_url.filter(|s| !s.trim().is_empty()),
            method: method.filter(|s| !s.trim().is_empty()).map(|m| m.trim().to_uppercase()),
            url: url.filter(|s| !s.trim().is_empty()),
            default_body: default_body.filter(|s| !s.trim().is_empty()),
            routes: parsed_routes,
        };
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        let path = dir.join(format!("{}.http.json", safe_name));
        fs::write(&path, json).map_err(|e| e.to_string())?;
        let mode = nb_routes.map(|n| format!("{n} actions")).unwrap_or_else(|| "single endpoint".into());
        return Ok(format!("Skill HTTP '{}' sauvegarde ({}) dans {}", safe_name, mode, path.display()));
    }

    // Skill composite
    if skill_type.as_deref() == Some("composite") {
        if content.trim().is_empty() {
            return Err("skill_type=composite requiert 'content' — un JSON array de steps ou objet {steps, continue_on_error}".into());
        }
        // Accepte soit un array de steps, soit {"steps": [...], "continue_on_error": true}
        #[derive(Deserialize)]
        struct CompositeInput { steps: Vec<CompositeStep>, continue_on_error: Option<bool> }
        let (steps, continue_on_error) = if content.trim_start().starts_with('[') {
            let s: Vec<CompositeStep> = serde_json::from_str(&content)
                .map_err(|e| format!("content invalide pour composite (doit etre JSON array) : {e}"))?;
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
        return Ok(format!("Skill composite '{}' sauvegarde ({} etape(s)) dans {}", safe_name, nb, path.display()));
    }

    // Skill Python
    if skill_type.as_deref() == Some("python") {
        if content.len() > 64_000 { return Err("Contenu trop long (max 64 KB)".into()); }
        let path = dir.join(format!("{}.py", safe_name));
        let full_content = format!(
            "# Skill: {}\n# Description: {}\n# Cree: {}\n\n{}",
            safe_name, description.replace('\n', " "), now, content
        );
        fs::write(&path, full_content).map_err(|e| e.to_string())?;
        return Ok(format!("Skill Python '{}' sauvegarde dans {}", safe_name, path.display()));
    }

    // Skill Node.js
    if skill_type.as_deref() == Some("nodejs") {
        if content.len() > 64_000 { return Err("Contenu trop long (max 64 KB)".into()); }
        let path = dir.join(format!("{}.js", safe_name));
        let full_content = format!(
            "// Skill: {}\n// Description: {}\n// Cree: {}\n\n{}",
            safe_name, description.replace('\n', " "), now, content
        );
        fs::write(&path, full_content).map_err(|e| e.to_string())?;
        return Ok(format!("Skill Node.js '{}' sauvegarde dans {}", safe_name, path.display()));
    }

    // Skill PS1 (defaut)
    if content.len() > 64_000 { return Err("Contenu trop long (max 64 KB)".into()); }
    let path = dir.join(format!("{}.ps1", safe_name));
    let full_content = format!(
        "# Skill: {}\n# Description: {}\n# Cree: {}\n\n{}",
        safe_name, description.replace('\n', " "), now, content
    );
    fs::write(&path, full_content).map_err(|e| e.to_string())?;
    Ok(format!("Skill PS1 '{}' sauvegarde dans {}", safe_name, path.display()))
}

#[command]
pub fn list_skills(app: AppHandle) -> Result<Vec<SkillMeta>, String> {
    let dir = skills_dir(&app);
    let mut skills = Vec::new();
    let entries = match fs::read_dir(&dir) { Ok(e) => e, Err(_) => return Ok(vec![]) };
    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext == "ps1" {
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() { continue; }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("# Description: ") { description = d.trim().to_string(); }
                if let Some(c) = line.strip_prefix("# Cree: ") { created_at = c.trim().to_string(); }
            }
            skills.push(SkillMeta { name, description, created_at, skill_type: "ps1".into() });
        } else if path.to_str().map(|s| s.ends_with(".http.json")).unwrap_or(false) {
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let name = file_name.trim_end_matches(".http.json").to_string();
            if name.is_empty() { continue; }
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let (description, created_at) = if let Ok(cfg) = serde_json::from_str::<HttpSkillConfig>(&raw) {
                let base = cfg.base_url.as_deref().unwrap_or("");
                let desc = if let Some(ref routes) = cfg.routes {
                    let mut actions: Vec<&str> = routes.keys().map(|s| s.as_str()).collect();
                    actions.sort();
                    let base_info = if !base.is_empty() { format!(" (base: {})", base) } else { String::new() };
                    format!("{}{} | Actions: {}", cfg.description, base_info, actions.join(", "))
                } else { cfg.description.clone() };
                (desc, cfg.created_at)
            } else { (String::new(), String::new()) };
            skills.push(SkillMeta { name, description, created_at, skill_type: "http".into() });
        } else if ext == "py" {
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() { continue; }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("# Description: ") { description = d.trim().to_string(); }
                if let Some(c) = line.strip_prefix("# Cree: ") { created_at = c.trim().to_string(); }
            }
            skills.push(SkillMeta { name, description, created_at, skill_type: "python".into() });
        } else if ext == "js" {
            let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            if name.is_empty() { continue; }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let mut description = String::new();
            let mut created_at = String::new();
            for line in content.lines().take(5) {
                if let Some(d) = line.strip_prefix("// Description: ") { description = d.trim().to_string(); }
                if let Some(c) = line.strip_prefix("// Cree: ") { created_at = c.trim().to_string(); }
            }
            skills.push(SkillMeta { name, description, created_at, skill_type: "nodejs".into() });
        } else if path.to_str().map(|s| s.ends_with(".composite.json")).unwrap_or(false) {
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
            let name = file_name.trim_end_matches(".composite.json").to_string();
            if name.is_empty() { continue; }
            let raw = fs::read_to_string(&path).unwrap_or_default();
            let (description, created_at) = if let Ok(cfg) = serde_json::from_str::<CompositeSkillConfig>(&raw) {
                let step_names: Vec<&str> = cfg.steps.iter().map(|s| s.skill.as_str()).collect();
                (format!("{} | Etapes: {}", cfg.description, step_names.join(" → ")), cfg.created_at)
            } else { (String::new(), String::new()) };
            skills.push(SkillMeta { name, description, created_at, skill_type: "composite".into() });
        }
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

#[command]
pub fn read_skill(app: AppHandle, name: String) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(&app);
    let ps1       = dir.join(format!("{}.ps1", safe_name));
    let http      = dir.join(format!("{}.http.json", safe_name));
    let composite = dir.join(format!("{}.composite.json", safe_name));
    let py        = dir.join(format!("{}.py", safe_name));
    let js        = dir.join(format!("{}.js", safe_name));
    if ps1.exists()       { fs::read_to_string(&ps1).map_err(|e| e.to_string()) }
    else if http.exists()      { fs::read_to_string(&http).map_err(|e| e.to_string()) }
    else if composite.exists() { fs::read_to_string(&composite).map_err(|e| e.to_string()) }
    else if py.exists()        { fs::read_to_string(&py).map_err(|e| e.to_string()) }
    else if js.exists()        { fs::read_to_string(&js).map_err(|e| e.to_string()) }
    else { Err(format!("Skill '{}' introuvable", safe_name)) }
}

/// Implémentation interne d'exécution de skill (réentrant pour les composites).
/// `depth` limite la récursion à 5 niveaux maximum.
fn run_skill_impl(app: &AppHandle, name: String, args: Option<String>, depth: u8) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(app);
    let skills_dir_str = dir.to_string_lossy().to_string();
    let composite_path = dir.join(format!("{}.composite.json", safe_name));
    let http_path      = dir.join(format!("{}.http.json", safe_name));
    let ps1_path       = dir.join(format!("{}.ps1", safe_name));
    let py_path        = dir.join(format!("{}.py", safe_name));
    let js_path        = dir.join(format!("{}.js", safe_name));

    // ── Skill composite ───────────────────────────────────────────────────────
    if composite_path.exists() {
        if depth >= 5 {
            return Err("Skill composite : profondeur maximale atteinte (5 niveaux)".into());
        }
        let raw = fs::read_to_string(&composite_path).map_err(|e| e.to_string())?;
        let cfg: CompositeSkillConfig = serde_json::from_str(&raw)
            .map_err(|e| format!("Skill composite corrompu : {e}"))?;
        let total = cfg.steps.len();
        let mut last_output = String::new();
        // Résumés compacts : (skill_name, 120 premiers chars de sortie)
        let mut step_summaries: Vec<(String, String)> = Vec::new();
        let mut all_outputs: Vec<String> = Vec::new();
        for (i, step) in cfg.steps.iter().enumerate() {
            let step_args = if step.chain.unwrap_or(false) && i > 0 {
                if last_output.is_empty() { None }
                else { Some(last_output.chars().take(2000).collect::<String>()) }
            } else {
                step.args.clone()
            };
            match run_skill_impl(app, step.skill.clone(), step_args, depth + 1) {
                Ok(out) => {
                    let preview: String = out.chars().take(120).collect();
                    let preview = if out.len() > 120 { format!("{}…", preview) } else { preview.clone() };
                    step_summaries.push((step.skill.clone(), preview.clone()));
                    last_output = out.clone();
                    all_outputs.push(format!("[étape {}/{} ✓ : {}]\n{}", i + 1, total, step.skill, out));
                }
                Err(e) => {
                    if cfg.continue_on_error.unwrap_or(false) {
                        // Mode continue_on_error : enregistrer l'erreur et continuer
                        all_outputs.push(format!("[étape {}/{} ✗ : {}]\nErreur : {}", i + 1, total, step.skill, e));
                        step_summaries.push((step.skill.clone(), format!("✗ {}", &e.chars().take(80).collect::<String>())));
                        // last_output reste inchangé (valeur de l'étape précédente)
                    } else {
                        // Comportement par défaut : abort avec rapport
                        let succeeded_block = if step_summaries.is_empty() {
                            "  (aucune étape précédente)".to_string()
                        } else {
                            step_summaries.iter().enumerate().map(|(j, (sname, preview))| {
                                format!("  étape {} '{}' ✓ — {}", j + 1, sname, preview)
                            }).collect::<Vec<_>>().join("\n")
                        };
                        return Err(format!(
                            "Étape {}/{} '{}' échouée :\n  Erreur : {}\n\nÉtapes réussies avant l'échec :\n{}\n\nPour corriger : utilise read_skill(\"{}\") puis patch_skill pour modifier cette étape.",
                            i + 1, total, step.skill, e, succeeded_block, safe_name
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
        let cfg: HttpSkillConfig = serde_json::from_str(&raw)
            .map_err(|e| format!("Skill HTTP corrompu : {e}"))?;
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Erreur client HTTP : {e}"))?;

        if let Some(ref routes) = cfg.routes {
            let args_val: serde_json::Value = args.as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or(serde_json::json!({}));
            let action = args_val.get("action").and_then(|v| v.as_str()).ok_or_else(|| {
                let mut av: Vec<&str> = routes.keys().map(|s| s.as_str()).collect();
                av.sort();
                format!("Parametre 'action' manquant. Actions disponibles : {}", av.join(", "))
            })?;
            let route = routes.get(action).ok_or_else(|| {
                let mut av: Vec<&str> = routes.keys().map(|s| s.as_str()).collect();
                av.sort();
                format!("Action '{}' introuvable. Disponibles : {}", action, av.join(", "))
            })?;
            let resolved = resolve_url(cfg.base_url.as_deref(), &route.url)?;
            let full_url = substitute_url_params(&resolved, &args_val);
            let req = build_request(&client, &route.method, &full_url)?;
            let req = apply_headers(req, &cfg.headers);
            let body = args_val.get("body").and_then(|v| v.as_str())
                .or_else(|| route.default_body.as_deref());
            return execute_http(req, body);
        }

        let method = cfg.method.as_deref().unwrap_or("GET");
        let raw_url = cfg.url.as_deref().ok_or("Skill HTTP : url manquante")?;
        let full_url = resolve_url(cfg.base_url.as_deref(), raw_url)?;
        let req = build_request(&client, method, &full_url)?;
        let req = apply_headers(req, &cfg.headers);
        let body = args.as_deref().filter(|s| !s.trim().is_empty())
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
                .map_err(|e| format!("Python introuvable ou inaccessible : {e}. Assure-toi que Python est installe et dans le PATH."))?
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
            Ok(if stdout.len() > 4000 { format!("{}...\n[tronque, {} chars]", &stdout[..4000], stdout.len()) } else { stdout })
        } else if !stderr.is_empty() {
            Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
        } else { Ok("(aucune sortie)".to_string()) };
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
                .map_err(|e| format!("Node.js introuvable ou inaccessible : {e}. Assure-toi que Node.js est installe et dans le PATH."))?
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
            Ok(if stdout.len() > 4000 { format!("{}...\n[tronque, {} chars]", &stdout[..4000], stdout.len()) } else { stdout })
        } else if !stderr.is_empty() {
            Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
        } else { Ok("(aucune sortie)".to_string()) };
    }

    // ── Skill PS1 ─────────────────────────────────────────────────────────────
    if !ps1_path.exists() { return Err(format!("Skill '{}' introuvable", safe_name)); }

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
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
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
        } else { stdout })
    } else if !stderr.is_empty() {
        Ok(format!("[stderr] {}", &stderr[..stderr.len().min(2000)]))
    } else { Ok("(aucune sortie)".to_string()) }
}

/// Execute un skill.
/// PS1        : args passes tel-quel comme parametres PowerShell
/// HTTP single: args remplace default_body
/// HTTP multi : args = JSON {"action":"nom"} ou {"action":"nom","body":"..."}
/// composite  : execute les etapes en sequence, avec chainabilite optionnelle
#[command]
pub fn run_skill(app: AppHandle, name: String, args: Option<String>) -> Result<String, String> {
    run_skill_impl(&app, name, args, 0)
}

#[command]
pub fn delete_skill(app: AppHandle, name: String) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = skills_dir(&app);
    let ps1       = dir.join(format!("{}.ps1", safe_name));
    let http      = dir.join(format!("{}.http.json", safe_name));
    let composite = dir.join(format!("{}.composite.json", safe_name));
    let py        = dir.join(format!("{}.py", safe_name));
    let js        = dir.join(format!("{}.js", safe_name));
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

/// Applique un remplacement Search & Replace dans un skill existant.
/// Le bloc `search` doit apparaître exactement une fois dans le fichier.
/// Si 0 occurrence : erreur "bloc introuvable".
/// Si 2+ occurrences : erreur "ambigu, préciser le contexte".
#[command]
pub fn patch_skill(
    app: AppHandle,
    name: String,
    search: String,
    replace: String,
) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    if search.is_empty() {
        return Err("Le bloc SEARCH ne peut pas être vide".into());
    }

    let dir = skills_dir(&app);
    let ps1_path  = dir.join(format!("{}.ps1", safe_name));
    let http_path = dir.join(format!("{}.http.json", safe_name));
    let py_path   = dir.join(format!("{}.py", safe_name));
    let js_path   = dir.join(format!("{}.js", safe_name));

    let (path, is_ps1) = if ps1_path.exists() {
        (ps1_path, true)
    } else if http_path.exists() {
        (http_path, false)
    } else if py_path.exists() {
        (py_path, true)   // meme limite taille que PS1
    } else if js_path.exists() {
        (js_path, true)
    } else {
        return Err(format!("Skill '{}' introuvable", safe_name));
    };

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let occurrences = content.matches(search.as_str()).count();
    match occurrences {
        0 => return Err(format!(
            "Bloc SEARCH introuvable dans le skill '{}'. Vérifiez que le texte correspond exactement (espaces, retours à la ligne inclus).",
            safe_name
        )),
        2.. => return Err(format!(
            "Bloc SEARCH ambigu dans le skill '{}' : {} occurrences trouvées. Ajoutez plus de contexte pour le rendre unique.",
            safe_name, occurrences
        )),
        _ => {}
    }

    let patched = content.replacen(search.as_str(), replace.as_str(), 1);

    if is_ps1 && patched.len() > 64_000 {
        return Err("Contenu après patch trop long (max 64 KB)".into());
    }

    fs::write(&path, patched).map_err(|e| e.to_string())?;
    Ok(format!("Skill '{}' patché avec succès ({})", safe_name, path.display()))
}

// ─── Plan / Checkpoint ────────────────────────────────────────────────────────

fn plan_path(app: &AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PLAN.md")
}

/// Sauvegarde (crée ou écrase) le fichier PLAN.md dans le répertoire de l'app.
#[command]
pub fn save_plan(app: AppHandle, content: String) -> Result<String, String> {
    let path = plan_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(format!("✅ PLAN.md sauvegardé : {}", path.display()))
}

/// Retourne le contenu du PLAN.md courant (chaîne vide si inexistant).
#[command]
pub fn get_plan(app: AppHandle) -> Result<String, String> {
    let path = plan_path(&app);
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}
