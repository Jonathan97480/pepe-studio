//! Gestion des serveurs MCP (Model Context Protocol) en Node.js.
//! Protocole JSON-RPC 2.0 over stdio, sans dépendances npm côté serveur.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use std::{fs, thread};
use tauri::{command, AppHandle, State};

// ─────────────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpToolInfo {
    pub name: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerInfo {
    pub name: String,
    pub description: String,
    pub running: bool,
    pub tools: Vec<McpToolInfo>,
}

// ─────────────────────────────────────────────────────────────────────────────
// État interne
// ─────────────────────────────────────────────────────────────────────────────

pub(crate) struct RunningServer {
    child: Child,
    stdin: ChildStdin,
    rx: Receiver<String>,
    next_id: u64,
    tools: Vec<McpToolInfo>,
}

pub struct McpState(pub(crate) Mutex<HashMap<String, RunningServer>>);

impl Default for McpState {
    fn default() -> Self {
        McpState(Mutex::new(HashMap::new()))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────────

fn mcp_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("mcp_servers");
    fs::create_dir_all(&dir).ok();
    dir
}

fn sanitize_name(name: &str) -> Result<String, String> {
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
        return Err("Nom invalide (1-64 chars alphanumerique/-/_)".into());
    }
    Ok(clean)
}

fn send_msg(stdin: &mut ChildStdin, msg: &Value) -> Result<(), String> {
    let s = serde_json::to_string(msg).map_err(|e| e.to_string())?;
    stdin.write_all(s.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

/// Lit les lignes du channel jusqu'à trouver une réponse avec l'id attendu.
/// Ignore les notifications (pas d'id) et les messages avec d'autres ids.
fn recv_response(rx: &Receiver<String>, expected_id: u64) -> Result<Value, String> {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("Timeout : le serveur MCP n'a pas repondu dans les 15 secondes".into());
        }
        let line = rx
            .recv_timeout(remaining)
            .map_err(|_| "Timeout MCP (serveur ferme ou plante)")?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let val: Value =
            serde_json::from_str(trimmed).map_err(|e| format!("JSON invalide recu : {e}"))?;
        // Ignorer les notifications (no id) et les mauvais ids
        match val.get("id") {
            None => continue,
            Some(id) if *id == expected_id => return Ok(val),
            _ => continue,
        }
    }
}

fn do_initialize(srv: &mut RunningServer) -> Result<Vec<McpToolInfo>, String> {
    // 1. initialize
    let id1 = srv.next_id;
    srv.next_id += 1;
    send_msg(
        &mut srv.stdin,
        &json!({
            "jsonrpc": "2.0", "id": id1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "pepe-studio", "version": "0.1.0" }
            }
        }),
    )?;
    let init_resp = recv_response(&srv.rx, id1)?;
    if init_resp.get("error").is_some() {
        return Err(format!("Erreur initialize : {}", init_resp["error"]));
    }

    // 2. notifications/initialized (notification sortante, aucune réponse attendue)
    send_msg(
        &mut srv.stdin,
        &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
    )?;

    // 3. tools/list
    let id2 = srv.next_id;
    srv.next_id += 1;
    send_msg(
        &mut srv.stdin,
        &json!({ "jsonrpc": "2.0", "id": id2, "method": "tools/list" }),
    )?;
    let tools_resp = recv_response(&srv.rx, id2)?;
    if tools_resp.get("error").is_some() {
        return Err(format!("Erreur tools/list : {}", tools_resp["error"]));
    }

    let tools = tools_resp["result"]["tools"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|t| McpToolInfo {
                    name: t["name"].as_str().unwrap_or("").to_string(),
                    description: t["description"].as_str().unwrap_or("").to_string(),
                    input_schema: t["inputSchema"].clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(tools)
}

// ─────────────────────────────────────────────────────────────────────────────
// Commandes Tauri
// ─────────────────────────────────────────────────────────────────────────────

/// Crée ou met à jour un serveur MCP (script Node.js sans dépendances npm).
#[command]
pub fn create_mcp_server(
    app: AppHandle,
    name: String,
    description: String,
    content: String,
) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    if content.len() > 256_000 {
        return Err("Contenu trop long (max 256 KB)".into());
    }
    let dir = mcp_dir(&app);

    let js_path = dir.join(format!("{safe_name}.js"));
    fs::write(&js_path, &content).map_err(|e| e.to_string())?;

    let meta_path = dir.join(format!("{safe_name}.json"));
    fs::write(
        &meta_path,
        serde_json::to_string_pretty(&json!({ "name": safe_name, "description": description }))
            .unwrap(),
    )
    .map_err(|e| e.to_string())?;

    Ok(format!("Serveur MCP '{safe_name}' sauvegarde dans {}", js_path.display()))
}

/// Démarre un serveur MCP, effectue le handshake MCP et retourne la liste des outils.
#[command]
pub fn start_mcp_server(
    app: AppHandle,
    mcp_state: State<McpState>,
    name: String,
) -> Result<Vec<McpToolInfo>, String> {
    let safe_name = sanitize_name(&name)?;
    let dir = mcp_dir(&app);
    let js_path = dir.join(format!("{safe_name}.js"));

    if !js_path.exists() {
        return Err(format!(
            "Serveur '{safe_name}' introuvable. Cree-le d'abord avec create_mcp_server."
        ));
    }

    // Arrêter l'instance précédente si elle tourne
    {
        let mut map = mcp_state.0.lock().unwrap();
        if let Some(mut old) = map.remove(&safe_name) {
            old.child.kill().ok();
        }
    }

    #[allow(unused_mut)]
    let mut node_cmd = Command::new("node");
    node_cmd
        .arg(&js_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // Masquer la fenêtre console sur Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        node_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = node_cmd.spawn()
        .map_err(|e| {
            format!("Impossible de lancer node : {e}. Verifiez que Node.js est installe.")
        })?;

    let stdin = child.stdin.take().ok_or("stdin indisponible")?;
    let child_stdout = child.stdout.take().ok_or("stdout indisponible")?;

    // Thread lecteur — lit stdout ligne par ligne et envoie dans le channel
    let (tx, rx): (Sender<String>, Receiver<String>) = channel();
    thread::spawn(move || {
        let reader = BufReader::new(child_stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    if tx.send(l).is_err() {
                        break; // receiver dropped, le serveur s'est arrêté
                    }
                }
                Err(_) => break,
            }
        }
    });

    let mut srv = RunningServer {
        child,
        stdin,
        rx,
        next_id: 1,
        tools: vec![],
    };

    let tools = do_initialize(&mut srv)?;
    srv.tools = tools.clone();

    mcp_state.0.lock().unwrap().insert(safe_name, srv);

    Ok(tools)
}

/// Appelle un outil d'un serveur MCP en cours d'exécution.
/// `args_json` : JSON stringifié des arguments (ex: `{"url":"...","key":"..."}`)
#[command]
pub fn call_mcp_tool(
    mcp_state: State<McpState>,
    server_name: String,
    tool_name: String,
    args_json: Option<String>,
) -> Result<String, String> {
    let safe_name = sanitize_name(&server_name)?;
    let args: Value = match args_json {
        Some(s) if !s.is_empty() => serde_json::from_str(&s).unwrap_or(json!({})),
        _ => json!({}),
    };

    let mut map = mcp_state.0.lock().unwrap();
    let srv = map.get_mut(&safe_name).ok_or_else(|| {
        format!("Serveur '{safe_name}' non demarre. Lance-le d'abord avec start_mcp_server.")
    })?;

    let id = srv.next_id;
    srv.next_id += 1;
    send_msg(
        &mut srv.stdin,
        &json!({
            "jsonrpc": "2.0", "id": id,
            "method": "tools/call",
            "params": { "name": tool_name, "arguments": args }
        }),
    )?;

    let resp = recv_response(&srv.rx, id)?;
    if let Some(err) = resp.get("error") {
        return Err(format!("Erreur MCP : {err}"));
    }

    let content = &resp["result"]["content"];
    if let Some(arr) = content.as_array() {
        let parts: Vec<String> = arr
            .iter()
            .filter_map(|c| {
                match c["type"].as_str() {
                    Some("text") => c["text"].as_str().map(|s| s.to_string()),
                    Some("image") => {
                        // MCP image content: {type:"image", data:"base64...", mimeType:"image/png"}
                        let mime = c["mimeType"].as_str().unwrap_or("image/png");
                        c["data"].as_str().map(|data| {
                            format!("![MCP Image](data:{};base64,{})", mime, data)
                        })
                    },
                    _ => None,
                }
            })
            .collect();
        Ok(parts.join("\n"))
    } else {
        Ok(serde_json::to_string(&resp["result"]).unwrap_or_default())
    }
}

/// Liste tous les serveurs MCP disponibles avec leur statut et leurs outils.
#[command]
pub fn list_mcp_servers(
    app: AppHandle,
    mcp_state: State<McpState>,
) -> Result<Vec<McpServerInfo>, String> {
    let dir = mcp_dir(&app);
    let running = mcp_state.0.lock().unwrap();
    let mut servers = vec![];

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(raw) = fs::read_to_string(&path) {
                    if let Ok(meta) = serde_json::from_str::<Value>(&raw) {
                        let name = meta["name"].as_str().unwrap_or("").to_string();
                        let description = meta["description"].as_str().unwrap_or("").to_string();
                        let tools = running
                            .get(&name)
                            .map(|s| s.tools.clone())
                            .unwrap_or_default();
                        servers.push(McpServerInfo {
                            running: running.contains_key(&name),
                            name,
                            description,
                            tools,
                        });
                    }
                }
            }
        }
    }
    Ok(servers)
}

/// Arrête et nettoie tous les serveurs MCP Node.js.
pub fn cleanup_all_mcp_servers(state: &McpState) {
    let mut map = state.0.lock().unwrap();
    for (_, mut srv) in map.drain() {
        srv.child.kill().ok();
    }
}

/// Arrête un serveur MCP en cours d'exécution.
#[command]
pub fn stop_mcp_server(mcp_state: State<McpState>, name: String) -> Result<String, String> {
    let safe_name = sanitize_name(&name)?;
    let mut map = mcp_state.0.lock().unwrap();
    if let Some(mut srv) = map.remove(&safe_name) {
        srv.child.kill().ok();
        Ok(format!("Serveur '{safe_name}' arrete."))
    } else {
        Err(format!("Serveur '{safe_name}' n'est pas en cours d'execution."))
    }
}
