/// État partagé du serveur API Pepe-Studio.
/// Ce module contient les structures d'état injectées par Tauri et par Axum.
use std::sync::Mutex;
use tokio::sync::oneshot;

// ── État géré par Tauri (cycle de vie du serveur) ────────────────────────────

pub struct ApiServerState {
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    pub port: Mutex<u16>,
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
pub struct ProxyState {
    pub llama_port: u16,
    pub app_handle: tauri::AppHandle,
}
