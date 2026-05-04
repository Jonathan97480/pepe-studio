/// Handler health/status pour le serveur API.
use axum::{http::StatusCode, response::IntoResponse};

pub async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}
