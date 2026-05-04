//! Streaming de génération LLM via SSE (Server-Sent Events).

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{command, AppHandle, Manager, State};

use super::lifecycle::{ChatMessage, LlamaState, SERVER_PORT};

// ─── Paramètres d'échantillonnage ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SamplingParams {
    pub top_p: Option<f64>,
    pub top_k: Option<i64>,
    pub penalty_last_n: Option<i64>,
    pub repeat_penalty: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
    pub mirostat: Option<i64>,
    pub mirostat_tau: Option<f64>,
    pub mirostat_eta: Option<f64>,
    pub min_p: Option<f64>,
    pub typical_p: Option<f64>,
    pub dyna_temp_range: Option<f64>,
    pub dyna_temp_exponent: Option<f64>,
    pub xtc_probability: Option<f64>,
    pub xtc_threshold: Option<f64>,
    pub top_n_sigma: Option<f64>,
    pub dry_multiplier: Option<f64>,
    pub dry_base: Option<f64>,
    pub dry_allowed_length: Option<i64>,
    pub dry_penalty_last_n: Option<i64>,
    pub dry_sequence_breakers: Option<String>,
}

// ─── Commande Tauri ────────────────────────────────────────────────────────────

#[command]
pub async fn send_llama_prompt(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    prompt_id: String,
    temperature: f64,
    max_tokens: Option<i64>,
    sampling: Option<SamplingParams>,
    thinking_enabled: Option<bool>,
    state: State<'_, LlamaState>,
) -> Result<serde_json::Value, String> {
    let port = state.active_port().ok_or_else(|| {
        "Aucun serveur llama démarré. Veuillez charger le modèle d'abord.".to_string()
    })?;

    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
    let effective_max_tokens = max_tokens.filter(|&v| v > 0).unwrap_or(8192);
    let s = sampling.unwrap_or_default();

    let mut body = serde_json::json!({
        "model": "local",
        "messages": messages,
        "stream": true,
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
        "frequency_penalty": s.frequency_penalty.unwrap_or(0.5),
        "presence_penalty": s.presence_penalty.unwrap_or(0.3),
        "repeat_penalty": s.repeat_penalty.unwrap_or(1.1),
        "top_p": s.top_p.unwrap_or(0.95),
        "top_k": s.top_k.unwrap_or(40),
        "min_p": s.min_p.unwrap_or(0.05),
        "typical_p": s.typical_p.unwrap_or(1.0),
    });

    let obj = body.as_object_mut().unwrap();

    if let Some(v) = s.penalty_last_n {
        obj.insert("penalty_last_n".into(), serde_json::json!(v));
    }
    if let Some(v) = s.mirostat {
        if v > 0 {
            obj.insert("mirostat".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.mirostat_tau {
        obj.insert("mirostat_tau".into(), serde_json::json!(v));
    }
    if let Some(v) = s.mirostat_eta {
        obj.insert("mirostat_eta".into(), serde_json::json!(v));
    }
    if let Some(v) = s.dyna_temp_range {
        if v > 0.0 {
            obj.insert("dynatemp_range".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.dyna_temp_exponent {
        obj.insert("dynatemp_exponent".into(), serde_json::json!(v));
    }
    if let Some(v) = s.xtc_probability {
        if v > 0.0 {
            obj.insert("xtc_probability".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.xtc_threshold {
        obj.insert("xtc_threshold".into(), serde_json::json!(v));
    }
    if let Some(v) = s.top_n_sigma {
        if v >= 0.0 {
            obj.insert("top_n_sigma".into(), serde_json::json!(v));
        }
    }
    if let Some(v) = s.dry_multiplier {
        if v > 0.0 {
            obj.insert("dry_multiplier".into(), serde_json::json!(v));
            obj.insert(
                "dry_base".into(),
                serde_json::json!(s.dry_base.unwrap_or(1.75)),
            );
            obj.insert(
                "dry_allowed_length".into(),
                serde_json::json!(s.dry_allowed_length.unwrap_or(2)),
            );
            if let Some(pln) = s.dry_penalty_last_n {
                obj.insert("dry_penalty_last_n".into(), serde_json::json!(pln));
            }
            if let Some(ref breakers) = s.dry_sequence_breakers {
                let parsed: Vec<String> = breakers
                    .split(',')
                    .map(|b| b.trim().trim_matches('"').to_string())
                    .filter(|b| !b.is_empty())
                    .collect();
                if !parsed.is_empty() {
                    obj.insert("dry_sequence_breakers".into(), serde_json::json!(parsed));
                }
            }
        }
    }

    if thinking_enabled == Some(false) {
        obj.insert("think".into(), serde_json::json!(false));
    } else {
        obj.insert("think".into(), serde_json::json!(true));
    }

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erreur requête llama-server: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Erreur serveur llama ({}): {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("Connexion interrompue avec le serveur llama: {}", e);
                let _ = app.emit_all(
                    "llama-error",
                    serde_json::json!({
                        "prompt_id": prompt_id,
                        "error": err_msg,
                    }),
                );
                return Err(err_msg);
            }
        };
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        loop {
            match buffer.find('\n') {
                None => break,
                Some(newline_pos) => {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if !line.starts_with("data: ") {
                        continue;
                    }

                    let data = &line[6..];

                    if data == "[DONE]" {
                        let _ = app.emit_all(
                            "llama-done",
                            serde_json::json!({
                                "prompt_id": prompt_id,
                                "done": true,
                            }),
                        );
                        return Ok(serde_json::json!({ "done": true }));
                    }

                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        // Contenu de réflexion (thinking models)
                        if let Some(thinking) =
                            parsed["choices"][0]["delta"]["reasoning_content"].as_str()
                        {
                            if !thinking.is_empty() {
                                let _ = app.emit_all(
                                    "llama-stream",
                                    serde_json::json!({
                                        "prompt_id": prompt_id,
                                        "chunk": thinking,
                                        "is_thinking": true,
                                    }),
                                );
                            }
                        }
                        // Contenu normal
                        if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                let _ = app.emit_all(
                                    "llama-stream",
                                    serde_json::json!({
                                        "prompt_id": prompt_id,
                                        "chunk": content,
                                        "is_thinking": false,
                                    }),
                                );
                            }
                        }
                        if parsed["choices"][0]["finish_reason"].as_str() == Some("stop") {
                            let meta: Option<String> = {
                                let timings = &parsed["timings"];
                                if timings.is_object() {
                                    let gen_tps = timings["predicted_per_second"].as_f64();
                                    let prompt_tps = timings["prompt_per_second"].as_f64();
                                    match (prompt_tps, gen_tps) {
                                        (Some(p), Some(g)) => Some(format!(
                                            "Prompt: {:.1} t/s | Génération: {:.1} t/s",
                                            p, g
                                        )),
                                        (None, Some(g)) => {
                                            Some(format!("Génération: {:.1} t/s", g))
                                        }
                                        _ => None,
                                    }
                                } else {
                                    None
                                }
                            };
                            let prompt_tokens = parsed["usage"]["prompt_tokens"].as_u64();
                            let _ = app.emit_all(
                                "llama-done",
                                serde_json::json!({
                                    "prompt_id": prompt_id,
                                    "done": true,
                                    "meta": meta,
                                    "prompt_tokens": prompt_tokens,
                                }),
                            );
                            return Ok(serde_json::json!({ "done": true }));
                        }
                        // Usage dans un chunk séparé
                        if parsed["usage"].is_object()
                            && parsed["choices"].as_array().map_or(true, |c| c.is_empty())
                        {
                            let prompt_tokens = parsed["usage"]["prompt_tokens"].as_u64();
                            let _ = app.emit_all(
                                "llama-usage",
                                serde_json::json!({
                                    "prompt_id": prompt_id,
                                    "prompt_tokens": prompt_tokens,
                                }),
                            );
                        }
                    }
                }
            }
        }
    }

    // Fin du stream sans [DONE] explicite
    let health_url = format!("http://127.0.0.1:{}/health", SERVER_PORT);
    let health_client = reqwest::Client::builder()
        .timeout(Duration::from_millis(2000))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    match health_client.get(&health_url).send().await {
        Ok(r) if r.status().is_success() => {
            let _ = app.emit_all(
                "llama-done",
                serde_json::json!({
                    "prompt_id": prompt_id,
                    "done": true,
                    "meta": null,
                }),
            );
        }
        _ => {
            let _ = app.emit_all(
                "llama-error",
                serde_json::json!({
                    "prompt_id": prompt_id,
                    "error": "Le serveur llama-server s'est arrêté de façon inattendue. Rechargez le modèle (mémoire insuffisante ou crash).",
                }),
            );
        }
    }
    Ok(serde_json::json!({ "done": true }))
}
