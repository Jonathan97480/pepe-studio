/// Serveur API compatible OpenAI — expose le LLM de Pepe-Studio
/// à des clients externes (Open WebUI, etc.) via HTTP sur localhost.
///
/// Endpoints :
///   GET  /health                 → 200 OK
///   GET  /v1/models              → liste le modèle actuellement chargé
///   POST /v1/chat/completions    → proxy vers llama.cpp (streaming SSE supporté)
///
/// Organisation des sous-modules :
///   state.rs      — ApiServerState, ProxyState
///   health.rs     — handler GET /health
///   models_api.rs — handler GET /v1/models
///   chat_api.rs   — handler POST /v1/chat/completions (loop + stream)
///   tools_api.rs  — execute_tool, ensure_tools_are_available, helpers
use axum::{
    middleware,
    routing::{get, post},
    Extension, Router,
};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::oneshot;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::chat_api::chat_completions_handler;
use crate::health::health_handler;
use crate::models_api::models_handler;
use crate::rate_limit::{rate_limit_middleware, RateLimiter};
use crate::state::ProxyState;

// Re-export pour que main.rs puisse importer ApiServerState depuis api_server
pub use crate::state::ApiServerState;

// ── Commandes Tauri ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_api_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, ApiServerState>,
    port: u16,
) -> Result<String, String> {
    {
        let tx = state.shutdown_tx.lock().unwrap();
        if tx.is_some() {
            return Err("Le serveur API est déjà en cours d'exécution".into());
        }
    }

    // CORS — restreint aux origines localhost/127.0.0.1 uniquement
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(
            |origin: &axum::http::HeaderValue, _: &axum::http::request::Parts| {
                let b = origin.as_bytes();
                b.starts_with(b"http://localhost")
                    || b.starts_with(b"http://127.0.0.1")
                    || b.starts_with(b"https://localhost")
                    || b.starts_with(b"https://127.0.0.1")
            },
        ))
        .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
        .allow_headers(tower_http::cors::Any);

    // Rate limiter : 120 requêtes par minute par IP
    let rate_limiter = RateLimiter::new(120, Duration::from_secs(60));

    let proxy_state = ProxyState {
        llama_port: 8765,
        app_handle: app.clone(),
    };

    let router = Router::new()
        .route("/health", get(health_handler))
        .route("/v1/models", get(models_handler))
        .route("/v1/chat/completions", post(chat_completions_handler))
        .with_state(proxy_state)
        .layer(middleware::from_fn(rate_limit_middleware))
        .layer(Extension(rate_limiter))
        .layer(cors);

    // Écoute uniquement sur localhost — pas d'exposition réseau externe
    let addr: std::net::SocketAddr = format!("127.0.0.1:{}", port)
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
            .serve(router.into_make_service_with_connect_info::<SocketAddr>())
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
