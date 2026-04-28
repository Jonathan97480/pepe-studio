/// Serveur API compatible OpenAI — expose le LLM de Pepe-Studio
/// à des clients externes (Open WebUI, etc.) via HTTP sur localhost.
///
/// Endpoints :
///   GET  /health                 → 200 OK
///   GET  /v1/models              → liste le modèle actuellement chargé
///   POST /v1/chat/completions    → proxy vers llama.cpp (streaming SSE supporté)
use axum::{
    body::StreamBody,
    extract::State as AxumState,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};

use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::Manager;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};

use crate::db::list_model_files;
use crate::dev_server::{
    get_browser_errors, get_dev_server_info, start_dev_server, stop_dev_server, DevServerState,
};
use crate::http_client::http_request;
use crate::hw_info::{
    batch_rename_files, download_image, get_hardware_info, list_folder_files, list_folder_images,
    list_folder_pdfs, patch_file, read_file_content, read_image, read_image_batch, read_pdf_batch,
    run_shell_command, save_image, write_file, BatchRenameItem,
};
use crate::logger::{get_current_log_path, list_log_sessions, read_log_session, AppLogger};
use crate::mcp::{
    call_mcp_tool, create_mcp_server, list_mcp_servers, start_mcp_server, stop_mcp_server, McpState,
};
use crate::model_metadata::inspect_model_metadata;
use crate::scraper::scrape_url;
use crate::search::search_web;
use crate::skills::{
    create_skill, delete_skill, get_plan, list_skills, patch_skill, read_skill, run_skill,
    save_plan,
};
use crate::terminal_manager::{
    close_terminal, create_terminal, get_terminal_history, list_terminals, terminal_exec,
    terminal_kill_interactive, terminal_pty_resize, terminal_send_stdin,
    terminal_start_interactive, InteractiveState, TerminalManagerState,
};

// ── État géré par Tauri (partagé, thread-safe) ───────────────────────────────

pub struct ApiServerState {
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    port: Mutex<u16>,
}

impl Default for ApiServerState {
    fn default() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
            port: Mutex::new(8766),
        }
    }
}

// ── État interne d'Axum (clonable, injecté dans les handlers) ─────────────────

#[derive(Clone)]
struct ProxyState {
    llama_port: u16,
    app_handle: tauri::AppHandle,
}

// ── Commandes Tauri ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_api_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ApiServerState>,
    port: u16,
) -> Result<String, String> {
    // Vérifier que le serveur n'est pas déjà actif
    {
        let tx = state.shutdown_tx.lock().unwrap();
        if tx.is_some() {
            return Err("Le serveur API est déjà en cours d'exécution".into());
        }
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let proxy_state = ProxyState {
        llama_port: 8765,
        app_handle: app.clone(),
    };

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/v1/models", get(models_handler))
        .route("/v1/chat/completions", post(chat_completions_handler))
        .with_state(proxy_state)
        .layer(cors);

    let addr: std::net::SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    let (tx, rx) = oneshot::channel::<()>();

    {
        let mut shutdown = state.shutdown_tx.lock().unwrap();
        *shutdown = Some(tx);
    }
    {
        let mut p = state.port.lock().unwrap();
        *p = port;
    }

    tokio::spawn(async move {
        axum::Server::bind(&addr)
            .serve(app.into_make_service())
            .with_graceful_shutdown(async {
                rx.await.ok();
            })
            .await
            .ok();
    });

    Ok(format!(
        "Serveur API démarré sur http://localhost:{}/v1",
        port
    ))
}

#[tauri::command]
pub fn stop_api_server(state: tauri::State<'_, ApiServerState>) {
    let mut tx = state.shutdown_tx.lock().unwrap();
    if let Some(sender) = tx.take() {
        let _ = sender.send(());
    }
}

#[tauri::command]
pub fn get_api_server_info(state: tauri::State<'_, ApiServerState>) -> Value {
    let is_running = state.shutdown_tx.lock().unwrap().is_some();
    let port = *state.port.lock().unwrap();
    json!({
        "running": is_running,
        "port": port,
        "url": if is_running { format!("http://localhost:{}", port) } else { String::new() }
    })
}

// ── Handlers Axum ────────────────────────────────────────────────────────────

async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

async fn models_handler(AxumState(state): AxumState<ProxyState>) -> impl IntoResponse {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/v1/models", state.llama_port);

    match client.get(&url).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(body) => Json(body).into_response(),
            Err(_) => Json(placeholder_models()).into_response(),
        },
        Err(_) => Json(placeholder_models()).into_response(),
    }
}

async fn chat_completions_handler(
    AxumState(state): AxumState<ProxyState>,
    Json(body): Json<Value>,
) -> Response {
    // Non-stream: boucle tool-calling locale pour exposer les outils Pepe-Studio
    // via l'API OpenAI-compatible (Open WebUI).
    let is_streaming = body
        .get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !is_streaming {
        match chat_with_tools_loop(&state, body).await {
            Ok(final_json) => return (StatusCode::OK, Json(final_json)).into_response(),
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({
                        "error": {
                            "message": e,
                            "type": "tool_loop_error",
                            "code": "bad_gateway"
                        }
                    })),
                )
                    .into_response()
            }
        }
    }

    // Mode stream: approche hybride —
    // - injecte les outils dans la requête
    // - proxifie le stream natif de llama.cpp (réflexion en temps réel)
    // - intercepte finish_reason=tool_calls en cours de route
    // - exécute les outils puis relance un nouveau stream pour la réponse finale
    chat_with_tools_stream(&state, body).await
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async fn chat_with_tools_loop(state: &ProxyState, mut req_body: Value) -> Result<Value, String> {
    ensure_tools_are_available(&mut req_body);

    // Les tool calls sont bien plus simples à gérer en non-stream.
    req_body["stream"] = Value::Bool(false);

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/v1/chat/completions", state.llama_port);

    for _step in 0..4 {
        let resp = client
            .post(&url)
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Erreur proxy llama.cpp: {e}"))?;

        let mut response_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Réponse llama.cpp invalide: {e}"))?;

        let assistant_message = response_json
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("message"))
            .cloned();

        let Some(assistant_message) = assistant_message else {
            return Ok(response_json);
        };

        let tool_calls = assistant_message
            .get("tool_calls")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();

        if tool_calls.is_empty() {
            return Ok(response_json);
        }

        append_message(&mut req_body, assistant_message);

        for call in tool_calls {
            let call_id = call
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("tool_call")
                .to_string();
            let name = call
                .get("function")
                .and_then(|f| f.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args_str = call
                .get("function")
                .and_then(|f| f.get("arguments"))
                .and_then(|v| v.as_str())
                .unwrap_or("{}");

            let args = serde_json::from_str::<Value>(args_str).unwrap_or_else(|_| json!({}));
            let tool_result = execute_tool(state, name, &args).await;
            let tool_content = match tool_result {
                Ok(v) => json!({ "ok": true, "result": v }).to_string(),
                Err(err) => json!({ "ok": false, "error": err }).to_string(),
            };

            append_message(
                &mut req_body,
                json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": tool_content
                }),
            );
        }

        // Si on a exécuté des outils, on relance un tour modèle.
        response_json["_tool_calls_executed"] = Value::Bool(true);
    }

    Err("Limite de boucle tool-calling atteinte (max 4 tours)".into())
}

fn ensure_tools_are_available(req_body: &mut Value) {
    let has_tools = req_body
        .get("tools")
        .and_then(|t| t.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);

    if has_tools {
        return;
    }

    req_body["tools"] = json!([
        {
            "type": "function",
            "function": {
                "name": "get_hardware_info",
                "description": "Récupère les informations matérielles locales (RAM, CPU, GPU, VRAM)",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_disk_usage",
                "description": "Récupère la taille totale, utilisée et libre d'un disque local (ex: D:)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "drive": { "type": "string", "description": "Lettre du disque, ex: D" }
                    },
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "cmd",
                "description": "Exécute une commande shell ponctuelle (PowerShell sur Windows)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string" }
                    },
                    "required": ["command"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Lit le contenu d'un fichier texte local",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" }
                    },
                    "required": ["path"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Écrit ou crée un fichier local",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "patch_file",
                "description": "Patch exact d'un fichier existant avec search/replace",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "search": { "type": "string" },
                        "replace": { "type": "string" }
                    },
                    "required": ["path", "search", "replace"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_folder_files",
                "description": "Liste les fichiers d'un dossier",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder": { "type": "string" },
                        "recursive": { "type": "boolean" },
                        "extensions": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["folder"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_folder_images",
                "description": "Liste les images d'un dossier",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder": { "type": "string" },
                        "recursive": { "type": "boolean" }
                    },
                    "required": ["folder"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_folder_pdfs",
                "description": "Liste les PDFs d'un dossier",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "folder": { "type": "string" },
                        "recursive": { "type": "boolean" }
                    },
                    "required": ["folder"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_image",
                "description": "Charge une image locale",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" }
                    },
                    "required": ["path"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_image_batch",
                "description": "Charge plusieurs images locales",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "paths": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["paths"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_pdf_batch",
                "description": "Lit un lot de PDFs en base64",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "paths": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["paths"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "batch_rename",
                "description": "Renomme plusieurs fichiers en une opération",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "renames": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "from": { "type": "string" },
                                    "to": { "type": "string" }
                                },
                                "required": ["from", "to"],
                                "additionalProperties": false
                            }
                        }
                    },
                    "required": ["renames"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_image",
                "description": "Sauvegarde une image data URL",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "data_url": { "type": "string" },
                        "filename": { "type": "string" }
                    },
                    "required": ["data_url"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "download_image",
                "description": "Télécharge une image HTTP",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string" },
                        "filename": { "type": "string" }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "http_request",
                "description": "Appel HTTP REST générique",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "method": { "type": "string" },
                        "url": { "type": "string" },
                        "headers": { "type": "string" },
                        "body": { "type": "string" }
                    },
                    "required": ["method", "url"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_web",
                "description": "Recherche sur le web et retourne des résultats structurés",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "source": { "type": "string", "enum": ["duckduckgo", "brave", "serper", "tavily"] },
                        "api_key": { "type": "string" },
                        "locale": { "type": "string" }
                    },
                    "required": ["query"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "scrape_url",
                "description": "Scrape une page web (mode static/js)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": { "type": "string" },
                        "mode": { "type": "string", "enum": ["static", "js"] }
                    },
                    "required": ["url"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "inspect_model_metadata",
                "description": "Inspecte les métadonnées d'un fichier GGUF",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "model_path": { "type": "string" }
                    },
                    "required": ["model_path"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_model_files",
                "description": "Liste les fichiers modèles GGUF",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_skill",
                "description": "Crée un skill local",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "description": { "type": "string" },
                        "content": { "type": "string" },
                        "skill_type": { "type": "string" },
                        "method": { "type": "string" },
                        "url": { "type": "string" },
                        "headers_template": { "type": "string" },
                        "default_body": { "type": "string" },
                        "base_url": { "type": "string" },
                        "routes": { "type": "string" }
                    },
                    "required": ["name", "description", "content"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_skills",
                "description": "Liste les skills",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_skill",
                "description": "Lit le contenu d'un skill",
                "parameters": {
                    "type": "object",
                    "properties": { "name": { "type": "string" } },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "run_skill",
                "description": "Exécute un skill",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "args": { "type": "string" }
                    },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_skill",
                "description": "Supprime un skill",
                "parameters": {
                    "type": "object",
                    "properties": { "name": { "type": "string" } },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "patch_skill",
                "description": "Patch un skill existant",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "search": { "type": "string" },
                        "replace": { "type": "string" }
                    },
                    "required": ["name", "search", "replace"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_plan",
                "description": "Sauvegarde le plan projet",
                "parameters": {
                    "type": "object",
                    "properties": { "content": { "type": "string" } },
                    "required": ["content"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_plan",
                "description": "Lit le plan projet",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_mcp_server",
                "description": "Crée un serveur MCP",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "description": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["name", "description", "content"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "start_mcp_server",
                "description": "Démarre un serveur MCP",
                "parameters": {
                    "type": "object",
                    "properties": { "name": { "type": "string" } },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "call_mcp_tool",
                "description": "Appelle un outil MCP",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "server_name": { "type": "string" },
                        "tool_name": { "type": "string" },
                        "args_json": { "type": "string" }
                    },
                    "required": ["server_name", "tool_name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_mcp_servers",
                "description": "Liste les serveurs MCP",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "stop_mcp_server",
                "description": "Arrête un serveur MCP",
                "parameters": {
                    "type": "object",
                    "properties": { "name": { "type": "string" } },
                    "required": ["name"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "start_dev_server",
                "description": "Démarre le serveur dev local",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "base_dir": { "type": "string" },
                        "port": { "type": "integer" }
                    },
                    "required": ["base_dir"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "stop_dev_server",
                "description": "Arrête le serveur dev",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_browser_errors",
                "description": "Lit les erreurs navigateur capturées",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_dev_server_info",
                "description": "Statut du serveur dev",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_terminal",
                "description": "Crée un terminal persistant",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "cwd": { "type": "string" }
                    },
                    "required": ["cwd"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "terminal_exec",
                "description": "Exécute une commande dans un terminal persistant",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" },
                        "command": { "type": "string" }
                    },
                    "required": ["terminal_id", "command"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "terminal_start_interactive",
                "description": "Démarre un processus interactif dans un terminal",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" },
                        "command": { "type": "string" }
                    },
                    "required": ["terminal_id", "command"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "terminal_send_stdin",
                "description": "Envoie du texte stdin à un terminal interactif",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" },
                        "input": { "type": "string" }
                    },
                    "required": ["terminal_id", "input"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "terminal_pty_resize",
                "description": "Redimensionne le PTY d'un terminal interactif",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" },
                        "rows": { "type": "integer" },
                        "cols": { "type": "integer" }
                    },
                    "required": ["terminal_id", "rows", "cols"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "terminal_kill_interactive",
                "description": "Tue le processus interactif d'un terminal",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" }
                    },
                    "required": ["terminal_id"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_terminals",
                "description": "Liste les terminaux ouverts",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "close_terminal",
                "description": "Ferme un terminal",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" }
                    },
                    "required": ["terminal_id"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_terminal_history",
                "description": "Historique d'un terminal",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "terminal_id": { "type": "string" }
                    },
                    "required": ["terminal_id"],
                    "additionalProperties": false
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_current_log_path",
                "description": "Chemin du log courant",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_log_sessions",
                "description": "Liste les sessions de logs",
                "parameters": { "type": "object", "properties": {}, "additionalProperties": false }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_log_session",
                "description": "Lit une session de logs",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filename": { "type": "string" },
                        "max_lines": { "type": "integer" }
                    },
                    "required": ["filename"],
                    "additionalProperties": false
                }
            }
        }
    ]);
    req_body["tool_choice"] = json!("auto");
}

fn append_message(req_body: &mut Value, msg: Value) {
    if !req_body
        .get("messages")
        .map(|m| m.is_array())
        .unwrap_or(false)
    {
        req_body["messages"] = Value::Array(vec![]);
    }
    if let Some(arr) = req_body.get_mut("messages").and_then(|m| m.as_array_mut()) {
        arr.push(msg);
    }
}

// ── Structs pour l'accumulation de tool_calls en streaming ───────────────────

#[derive(Default, Clone)]
struct PartialToolCall {
    id: String,
    name: String,
    arguments: String,
}

fn accumulate_tool_call_delta(calls: &mut Vec<PartialToolCall>, delta_calls: &Value) {
    if let Some(arr) = delta_calls.as_array() {
        for delta_call in arr {
            let index = delta_call
                .get("index")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
            while calls.len() <= index {
                calls.push(PartialToolCall::default());
            }
            let call = &mut calls[index];
            if let Some(id) = delta_call.get("id").and_then(|v| v.as_str()) {
                if !id.is_empty() {
                    call.id = id.to_string();
                }
            }
            if let Some(func) = delta_call.get("function") {
                if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                    if !name.is_empty() {
                        call.name = name.to_string();
                    }
                }
                if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                    call.arguments.push_str(args);
                }
            }
        }
    }
}

fn build_assistant_tool_calls_message(calls: &[PartialToolCall], content: &str) -> Value {
    let tool_calls: Vec<Value> = calls
        .iter()
        .enumerate()
        .map(|(i, call)| {
            json!({
                "id": if call.id.is_empty() { format!("call_{}", i) } else { call.id.clone() },
                "type": "function",
                "function": {
                    "name": call.name.clone(),
                    "arguments": call.arguments.clone()
                }
            })
        })
        .collect();
    let content_val: Value = if content.is_empty() {
        Value::Null
    } else {
        json!(content)
    };
    json!({
        "role": "assistant",
        "content": content_val,
        "tool_calls": tool_calls
    })
}

// ── Hybrid Stream: stream natif + interception tool_calls + relance ───────────
//
// Flux :
//  1. Injecte les schémas d'outils dans la requête
//  2. Proxifie le stream llama.cpp → client (réflexion en temps réel)
//  3. Intercepte les deltas tool_calls (pas transmis au client)
//  4. Quand finish_reason=tool_calls : exécute les outils, met à jour messages, relance
//  5. Quand finish_reason=stop       : transmet le chunk stop + [DONE] → termine

async fn chat_with_tools_stream(state: &ProxyState, mut req_body: Value) -> Response {
    ensure_tools_are_available(&mut req_body);
    req_body["stream"] = Value::Bool(true);

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Vec<u8>, std::io::Error>>(128);
    let state_clone = state.clone();

    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let url = format!(
            "http://127.0.0.1:{}/v1/chat/completions",
            state_clone.llama_port
        );

        use futures_util::StreamExt;

        'outer: for _step in 0..5 {
            let resp = match client.post(&url).json(&req_body).send().await {
                Ok(r) => r,
                Err(e) => {
                    let msg = format!(
                        "data: {}\n\n",
                        json!({"error": {"message": e.to_string(), "type": "proxy_error"}})
                    );
                    let _ = tx.send(Ok(msg.into_bytes())).await;
                    break 'outer;
                }
            };

            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();
            let mut partial_tool_calls: Vec<PartialToolCall> = Vec::new();
            let mut assistant_content = String::new();
            let mut tool_calls_executed = false;

            'drain: loop {
                match byte_stream.next().await {
                    None => break 'drain,
                    Some(Err(e)) => {
                        eprintln!("[api_server] stream error: {e}");
                        break 'drain;
                    }
                    Some(Ok(chunk)) => {
                        buffer.push_str(&String::from_utf8_lossy(&chunk));

                        loop {
                            let Some(nl_pos) = buffer.find('\n') else {
                                break; // no complete line yet, wait for next chunk
                            };
                            let raw_line = buffer[..nl_pos].to_string();
                            buffer = buffer[nl_pos + 1..].to_string();
                            let line = raw_line.trim_end_matches('\r');

                            if line == "data: [DONE]" {
                                if !tool_calls_executed {
                                    let _ = tx.send(Ok(b"data: [DONE]\n\n".to_vec())).await;
                                    break 'outer;
                                } else {
                                    break 'drain; // continue 'outer for next LLM step
                                }
                            }

                            let data = match line.strip_prefix("data: ") {
                                Some(d) if !d.is_empty() => d,
                                _ => continue,
                            };

                            let event = match serde_json::from_str::<Value>(data) {
                                Ok(e) => e,
                                Err(_) => continue,
                            };

                            let delta = event
                                .get("choices")
                                .and_then(|c| c.get(0))
                                .and_then(|c0| c0.get("delta"))
                                .cloned()
                                .unwrap_or_else(|| json!({}));

                            let finish_reason = event
                                .get("choices")
                                .and_then(|c| c.get(0))
                                .and_then(|c0| c0.get("finish_reason"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());

                            // Accumulate tool_calls (don't forward to client)
                            if let Some(tc) = delta.get("tool_calls") {
                                accumulate_tool_call_delta(&mut partial_tool_calls, tc);
                            }

                            // Build forwarded delta (reasoning + content + role only)
                            let mut fwd_delta = json!({});
                            let mut should_forward = false;

                            if let Some(role) = delta.get("role").and_then(|v| v.as_str()) {
                                fwd_delta["role"] = json!(role);
                                should_forward = true;
                            }
                            if let Some(rc) =
                                delta.get("reasoning_content").and_then(|v| v.as_str())
                            {
                                if !rc.is_empty() {
                                    fwd_delta["reasoning_content"] = json!(rc);
                                    should_forward = true;
                                }
                            }
                            if let Some(c) = delta.get("content").and_then(|v| v.as_str()) {
                                if !c.is_empty() {
                                    fwd_delta["content"] = json!(c);
                                    assistant_content.push_str(c);
                                    should_forward = true;
                                }
                            }

                            // Forward to client if we have content/reasoning/role
                            if should_forward {
                                let mut fwd_event = event.clone();
                                if let Some(choices) = fwd_event.get_mut("choices") {
                                    if let Some(c0) = choices.get_mut(0) {
                                        c0["delta"] = fwd_delta;
                                        c0["finish_reason"] = Value::Null;
                                    }
                                }
                                let fwd_str = format!("data: {}\n\n", fwd_event);
                                let _ = tx.send(Ok(fwd_str.into_bytes())).await;
                            }

                            match finish_reason.as_deref() {
                                Some("tool_calls") => {
                                    // Execute all tool calls and append results to messages
                                    let assistant_msg = build_assistant_tool_calls_message(
                                        &partial_tool_calls,
                                        &assistant_content,
                                    );
                                    append_message(&mut req_body, assistant_msg);

                                    for call in &partial_tool_calls {
                                        let args = serde_json::from_str::<Value>(&call.arguments)
                                            .unwrap_or_else(|_| json!({}));
                                        let result =
                                            execute_tool(&state_clone, &call.name, &args).await;
                                        let content_str = match result {
                                            Ok(v) => json!({"ok": true, "result": v}).to_string(),
                                            Err(e) => json!({"ok": false, "error": e}).to_string(),
                                        };
                                        append_message(
                                            &mut req_body,
                                            json!({
                                                "role": "tool",
                                                "tool_call_id": call.id,
                                                "content": content_str
                                            }),
                                        );
                                    }

                                    partial_tool_calls.clear();
                                    assistant_content.clear();
                                    tool_calls_executed = true;
                                    // Continue draining until [DONE] before relaunching
                                }
                                Some("stop") | Some("length") => {
                                    // Forward the stop chunk and [DONE] then exit
                                    let mut stop_event = event.clone();
                                    if let Some(choices) = stop_event.get_mut("choices") {
                                        if let Some(c0) = choices.get_mut(0) {
                                            c0["delta"] = json!({});
                                            c0["finish_reason"] =
                                                json!(finish_reason.as_deref().unwrap_or("stop"));
                                        }
                                    }
                                    let stop_str = format!("data: {}\n\n", stop_event);
                                    let _ = tx.send(Ok(stop_str.into_bytes())).await;
                                    let _ = tx.send(Ok(b"data: [DONE]\n\n".to_vec())).await;
                                    break 'outer;
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }

            if !tool_calls_executed {
                // Stream ended without proper finish_reason (unexpected EOF)
                let _ = tx.send(Ok(b"data: [DONE]\n\n".to_vec())).await;
                break 'outer;
            }
            // Continue 'outer to start next LLM call with tool results
        }
    });

    // Build streaming response from mpsc channel
    let recv_stream = futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });

    let mut response = Response::new(axum::body::boxed(StreamBody::new(recv_stream)));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        "content-type",
        HeaderValue::from_static("text/event-stream"),
    );
    response
        .headers_mut()
        .insert("cache-control", HeaderValue::from_static("no-cache"));
    response
        .headers_mut()
        .insert("x-accel-buffering", HeaderValue::from_static("no"));
    response
}

async fn execute_tool(state: &ProxyState, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "get_hardware_info" => {
            let info = get_hardware_info()?;
            serde_json::to_value(info).map_err(|e| e.to_string())
        }
        "get_disk_usage" => {
            let drive_raw = opt_string(args, "drive").unwrap_or_else(|| "D".to_string());
            let drive = drive_raw.trim().trim_end_matches(':').to_uppercase();
            if drive.len() != 1 || !drive.chars().all(|c| c.is_ascii_alphabetic()) {
                return Err("Paramètre 'drive' invalide (ex: D)".into());
            }

            let ps = format!(
                "$d = Get-PSDrive -Name '{}' -ErrorAction Stop; [PSCustomObject]@{{name=$d.Name; total_bytes=($d.Used + $d.Free); used_bytes=$d.Used; free_bytes=$d.Free; total_gb=[math]::Round((($d.Used + $d.Free)/1GB),2); used_gb=[math]::Round(($d.Used/1GB),2); free_gb=[math]::Round(($d.Free/1GB),2)}} | ConvertTo-Json -Compress",
                drive
            );
            let out = run_shell_command(ps)?;
            if let Ok(value) = serde_json::from_str::<Value>(&out) {
                Ok(value)
            } else {
                Ok(json!({ "raw": out }))
            }
        }
        "cmd" => {
            let command = required_string(args, "command")?;
            let out = run_shell_command(command)?;
            Ok(json!({ "output": out }))
        }
        "read_file" => {
            let path = required_string(args, "path")?;
            let content = read_file_content(path)?;
            Ok(json!({ "content": content }))
        }
        "write_file" => {
            let path = required_string(args, "path")?;
            let content = required_string(args, "content")?;
            let out = write_file(path, content)?;
            Ok(json!({ "message": out }))
        }
        "patch_file" => {
            let path = required_string(args, "path")?;
            let search = required_string(args, "search")?;
            let replace = required_string(args, "replace")?;
            let out = patch_file(path, search, replace)?;
            Ok(json!({ "message": out }))
        }
        "list_folder_files" => {
            let folder = required_string(args, "folder")?;
            let recursive = opt_bool(args, "recursive");
            let extensions = opt_string_vec(args, "extensions")?;
            let out = list_folder_files(folder, recursive, extensions)?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "list_folder_images" => {
            let folder = required_string(args, "folder")?;
            let recursive = opt_bool(args, "recursive");
            let out = list_folder_images(folder, recursive)?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "list_folder_pdfs" => {
            let folder = required_string(args, "folder")?;
            let recursive = opt_bool(args, "recursive");
            let out = list_folder_pdfs(folder, recursive)?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "read_image" => {
            let path = required_string(args, "path")?;
            let out = read_image(path)?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "read_image_batch" => {
            let paths = required_string_vec(args, "paths")?;
            let out = read_image_batch(paths);
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "read_pdf_batch" => {
            let paths = required_string_vec(args, "paths")?;
            let out = read_pdf_batch(paths);
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "batch_rename" => {
            let renames: Vec<BatchRenameItem> = serde_json::from_value(
                args.get("renames")
                    .cloned()
                    .ok_or("Paramètre 'renames' manquant")?,
            )
            .map_err(|e| format!("Format renames invalide: {e}"))?;
            let out = batch_rename_files(renames);
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "save_image" => {
            let data_url = required_string(args, "data_url")?;
            let filename = opt_string(args, "filename");
            save_image(state.app_handle.clone(), data_url, filename)
        }
        "download_image" => {
            let url = required_string(args, "url")?;
            let filename = opt_string(args, "filename");
            download_image(state.app_handle.clone(), url, filename)
        }
        "http_request" => {
            let method = required_string(args, "method")?;
            let url = required_string(args, "url")?;
            let headers = opt_string(args, "headers");
            let body = opt_string(args, "body");
            let out = http_request(method, url, headers, body).await?;
            Ok(json!({ "response": out }))
        }
        "search_web" => {
            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or("Paramètre 'query' manquant")?
                .to_string();
            let source = args
                .get("source")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let api_key = args
                .get("api_key")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let locale = args
                .get("locale")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let results = search_web(query, source, api_key, locale).await?;
            serde_json::to_value(results).map_err(|e| e.to_string())
        }
        "scrape_url" => {
            let url = required_string(args, "url")?;
            let mode = opt_string(args, "mode");
            let out = scrape_url(state.app_handle.clone(), url, mode).await?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "inspect_model_metadata" => {
            let model_path = required_string(args, "model_path")?;
            let out = inspect_model_metadata(state.app_handle.clone(), model_path)?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "list_model_files" => {
            let out = list_model_files(state.app_handle.clone())?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "create_skill" => {
            let out = create_skill(
                state.app_handle.clone(),
                required_string(args, "name")?,
                required_string(args, "description")?,
                required_string(args, "content")?,
                opt_string(args, "skill_type"),
                opt_string(args, "method"),
                opt_string(args, "url"),
                opt_string(args, "headers_template"),
                opt_string(args, "default_body"),
                opt_string(args, "base_url"),
                opt_string(args, "routes"),
            )?;
            Ok(json!({ "message": out }))
        }
        "list_skills" => {
            let out = list_skills(state.app_handle.clone())?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "read_skill" => {
            let out = read_skill(state.app_handle.clone(), required_string(args, "name")?)?;
            Ok(json!({ "content": out }))
        }
        "run_skill" => {
            let out = run_skill(
                state.app_handle.clone(),
                required_string(args, "name")?,
                opt_string(args, "args"),
            )?;
            Ok(json!({ "output": out }))
        }
        "delete_skill" => {
            let out = delete_skill(state.app_handle.clone(), required_string(args, "name")?)?;
            Ok(json!({ "message": out }))
        }
        "patch_skill" => {
            let out = patch_skill(
                state.app_handle.clone(),
                required_string(args, "name")?,
                required_string(args, "search")?,
                required_string(args, "replace")?,
            )?;
            Ok(json!({ "message": out }))
        }
        "save_plan" => {
            let out = save_plan(state.app_handle.clone(), required_string(args, "content")?)?;
            Ok(json!({ "message": out }))
        }
        "get_plan" => {
            let out = get_plan(state.app_handle.clone())?;
            Ok(json!({ "content": out }))
        }
        "create_mcp_server" => {
            let out = create_mcp_server(
                state.app_handle.clone(),
                required_string(args, "name")?,
                required_string(args, "description")?,
                required_string(args, "content")?,
            )?;
            Ok(json!({ "message": out }))
        }
        "start_mcp_server" => {
            let out = start_mcp_server(
                state.app_handle.clone(),
                state.app_handle.state::<McpState>(),
                required_string(args, "name")?,
            )?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "call_mcp_tool" => {
            let out = call_mcp_tool(
                state.app_handle.state::<McpState>(),
                required_string(args, "server_name")?,
                required_string(args, "tool_name")?,
                opt_string(args, "args_json"),
            )?;
            Ok(json!({ "output": out }))
        }
        "list_mcp_servers" => {
            let out = list_mcp_servers(
                state.app_handle.clone(),
                state.app_handle.state::<McpState>(),
            )?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "stop_mcp_server" => {
            let out = stop_mcp_server(
                state.app_handle.state::<McpState>(),
                required_string(args, "name")?,
            )?;
            Ok(json!({ "message": out }))
        }
        "start_dev_server" => {
            let out = start_dev_server(
                required_string(args, "base_dir")?,
                opt_u16(args, "port"),
                state.app_handle.state::<DevServerState>(),
            )?;
            Ok(json!({ "port": out }))
        }
        "stop_dev_server" => {
            stop_dev_server(state.app_handle.state::<DevServerState>())?;
            Ok(json!({ "ok": true }))
        }
        "get_browser_errors" => {
            let out = get_browser_errors(state.app_handle.state::<DevServerState>());
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "get_dev_server_info" => {
            let out = get_dev_server_info(state.app_handle.state::<DevServerState>());
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "create_terminal" => {
            let out = create_terminal(
                opt_string(args, "name"),
                opt_string(args, "cwd"),
                state.app_handle.state::<TerminalManagerState>(),
            )?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "terminal_exec" => {
            let out = terminal_exec(
                required_string(args, "terminal_id")?,
                required_string(args, "command")?,
                state.app_handle.state::<TerminalManagerState>(),
            )?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "terminal_start_interactive" => {
            terminal_start_interactive(
                required_string(args, "terminal_id")?,
                required_string(args, "command")?,
                state.app_handle.clone(),
                state.app_handle.state::<TerminalManagerState>(),
                state.app_handle.state::<InteractiveState>(),
            )?;
            Ok(json!({ "ok": true }))
        }
        "terminal_send_stdin" => {
            terminal_send_stdin(
                required_string(args, "terminal_id")?,
                required_string(args, "input")?,
                state.app_handle.state::<InteractiveState>(),
            )?;
            Ok(json!({ "ok": true }))
        }
        "terminal_pty_resize" => {
            terminal_pty_resize(
                required_string(args, "terminal_id")?,
                required_u16(args, "rows")?,
                required_u16(args, "cols")?,
                state.app_handle.state::<InteractiveState>(),
            )?;
            Ok(json!({ "ok": true }))
        }
        "terminal_kill_interactive" => {
            terminal_kill_interactive(
                required_string(args, "terminal_id")?,
                state.app_handle.state::<InteractiveState>(),
            )?;
            Ok(json!({ "ok": true }))
        }
        "list_terminals" => {
            let out = list_terminals(state.app_handle.state::<TerminalManagerState>());
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "close_terminal" => {
            let out = close_terminal(
                required_string(args, "terminal_id")?,
                state.app_handle.state::<TerminalManagerState>(),
            )?;
            Ok(json!({ "message": out }))
        }
        "get_terminal_history" => {
            let out = get_terminal_history(
                required_string(args, "terminal_id")?,
                state.app_handle.state::<TerminalManagerState>(),
            )?;
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "get_current_log_path" => {
            let out = get_current_log_path(state.app_handle.state::<AppLogger>());
            Ok(json!({ "path": out }))
        }
        "list_log_sessions" => {
            let out = list_log_sessions(state.app_handle.state::<AppLogger>());
            serde_json::to_value(out).map_err(|e| e.to_string())
        }
        "read_log_session" => {
            let out = read_log_session(
                state.app_handle.state::<AppLogger>(),
                required_string(args, "filename")?,
                opt_usize(args, "max_lines"),
            )?;
            Ok(json!({ "content": out }))
        }
        _ => Err(format!("Outil non supporté par le proxy API: {name}")),
    }
}

fn required_string(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Paramètre '{}' manquant", key))
}

fn opt_string(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn opt_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| v.as_bool())
}

fn required_u16(args: &Value, key: &str) -> Result<u16, String> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .and_then(|n| u16::try_from(n).ok())
        .ok_or_else(|| format!("Paramètre '{}' manquant ou invalide", key))
}

fn opt_u16(args: &Value, key: &str) -> Option<u16> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .and_then(|n| u16::try_from(n).ok())
}

fn opt_usize(args: &Value, key: &str) -> Option<usize> {
    args.get(key)
        .and_then(|v| v.as_u64())
        .and_then(|n| usize::try_from(n).ok())
}

fn required_string_vec(args: &Value, key: &str) -> Result<Vec<String>, String> {
    let arr = args
        .get(key)
        .and_then(|v| v.as_array())
        .ok_or_else(|| format!("Paramètre '{}' manquant", key))?;
    let out: Option<Vec<String>> = arr
        .iter()
        .map(|v| v.as_str().map(|s| s.to_string()))
        .collect();
    out.ok_or_else(|| format!("Paramètre '{}' invalide", key))
}

fn opt_string_vec(args: &Value, key: &str) -> Result<Option<Vec<String>>, String> {
    let Some(value) = args.get(key) else {
        return Ok(None);
    };
    if let Some(arr) = value.as_array() {
        let out: Option<Vec<String>> = arr
            .iter()
            .map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        return out
            .map(Some)
            .ok_or_else(|| format!("Paramètre '{}' invalide", key));
    }
    Err(format!("Paramètre '{}' invalide", key))
}

fn placeholder_models() -> Value {
    json!({
        "object": "list",
        "data": [{
            "id": "pepe-studio-model",
            "object": "model",
            "created": 1700000000,
            "owned_by": "pepe-studio"
        }]
    })
}
