/// Middleware de rate limiting par IP — fenêtre glissante.
///
/// Utilisation : ajouter `RateLimiter` en tant qu'`Extension` sur le router,
/// puis enregistrer `rate_limit_middleware` avec `axum::middleware::from_fn`.
/// Le serveur doit utiliser `into_make_service_with_connect_info::<SocketAddr>()`
/// pour que `ConnectInfo` soit disponible dans les extensions de la requête.
use axum::{
    body::Body,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

/// Rate limiter à fenêtre glissante, partagé via `Clone` (Arc interne).
#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<Mutex<HashMap<IpAddr, Vec<Instant>>>>,
    /// Nombre maximum de requêtes autorisées dans la fenêtre.
    max_requests: usize,
    /// Durée de la fenêtre glissante.
    window: Duration,
}

impl RateLimiter {
    /// Crée un nouveau limiteur : `max_requests` requêtes par `window`.
    pub fn new(max_requests: usize, window: Duration) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            max_requests,
            window,
        }
    }

    /// Retourne `true` si la requête est autorisée, `false` si le quota est dépassé.
    pub fn check_and_record(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut map = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let timestamps = map.entry(ip).or_default();
        // Purge les entrées hors fenêtre
        timestamps.retain(|&t| now.duration_since(t) < self.window);
        if timestamps.len() < self.max_requests {
            timestamps.push(now);
            true
        } else {
            false
        }
    }
}

/// Middleware axum 0.6 — extrait `ConnectInfo` et `RateLimiter` depuis les extensions.
/// Si le quota est dépassé, renvoie 429 Too Many Requests en JSON.
pub async fn rate_limit_middleware(req: Request<Body>, next: Next<Body>) -> Response {
    use axum::extract::ConnectInfo;

    // IP du client (disponible si le serveur utilise into_make_service_with_connect_info)
    let ip = req
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip())
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));

    // Limiteur injecté via Extension layer
    if let Some(limiter) = req.extensions().get::<RateLimiter>().cloned() {
        if !limiter.check_and_record(ip) {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(json!({
                    "error": {
                        "message": "Trop de requêtes. Veuillez patienter avant de réessayer.",
                        "type": "rate_limit_error",
                        "code": "too_many_requests"
                    }
                })),
            )
                .into_response();
        }
    }

    next.run(req).await
}
