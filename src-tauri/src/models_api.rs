/// Routes modèles — liste le modèle actuellement chargé via llama.cpp.
use axum::{extract::State as AxumState, response::IntoResponse, Json};
use serde_json::{json, Value};

use crate::state::ProxyState;

pub async fn models_handler(AxumState(state): AxumState<ProxyState>) -> impl IntoResponse {
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

pub fn placeholder_models() -> Value {
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
