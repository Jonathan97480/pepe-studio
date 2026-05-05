/// Route chat/completions — proxy vers llama.cpp avec tool-calling hybride.
///
/// Flux non-stream : boucle tool-calling locale (max 4 tours).
/// Flux stream     : proxifie le stream natif, intercepte finish_reason=tool_calls,
///                   exécute les outils, relance un nouveau stream pour la réponse finale.
use axum::{
    body::StreamBody,
    extract::State as AxumState,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};

use crate::state::ProxyState;
use crate::tools_api::{ensure_tools_are_available, execute_tool};

// ── Validation du schéma de la requête chat ───────────────────────────────────

/// Valide que le body de la requête respecte le schéma minimal OpenAI-compatible.
/// Retourne `Ok(())` si valide, `Err(message)` sinon.
fn validate_chat_request(body: &Value) -> Result<(), String> {
    // messages : obligatoire, tableau non vide
    let messages = body
        .get("messages")
        .ok_or("Champ 'messages' manquant")?
        .as_array()
        .ok_or("'messages' doit être un tableau JSON")?;

    if messages.is_empty() {
        return Err("'messages' ne peut pas être un tableau vide".into());
    }

    for (i, msg) in messages.iter().enumerate() {
        // role : obligatoire, chaîne de caractères
        msg.get("role")
            .and_then(|r| r.as_str())
            .ok_or_else(|| format!("messages[{i}]: champ 'role' manquant ou invalide"))?;

        // content : obligatoire (string ou array — les deux sont acceptés par l'API)
        if msg.get("content").is_none() {
            return Err(format!("messages[{i}]: champ 'content' manquant"));
        }
    }

    // max_tokens : si présent, doit être un entier positif
    if let Some(mt) = body.get("max_tokens") {
        if !mt.is_null() {
            let n = mt.as_i64().ok_or("'max_tokens' doit être un entier")?;
            if n <= 0 {
                return Err("'max_tokens' doit être strictement positif".into());
            }
        }
    }

    // temperature : si présent, doit être un nombre entre 0 et 2
    if let Some(t) = body.get("temperature") {
        if !t.is_null() {
            let f = t.as_f64().ok_or("'temperature' doit être un nombre")?;
            if !(0.0..=2.0).contains(&f) {
                return Err("'temperature' doit être compris entre 0 et 2".into());
            }
        }
    }

    Ok(())
}

// ── Tests sécurité : validation JSON + logs d'audit ──────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── messages manquant / vide ───────────────────────────────────────────────

    #[test]
    fn rejects_missing_messages() {
        let body = json!({"model": "gpt-4"});
        assert!(validate_chat_request(&body).is_err());
    }

    #[test]
    fn rejects_empty_messages_array() {
        let body = json!({"messages": []});
        let err = validate_chat_request(&body).unwrap_err();
        assert!(err.contains("vide"));
    }

    #[test]
    fn rejects_messages_not_array() {
        let body = json!({"messages": "hello"});
        assert!(validate_chat_request(&body).is_err());
    }

    // ── role / content ────────────────────────────────────────────────────────

    #[test]
    fn rejects_message_without_role() {
        let body = json!({"messages": [{"content": "hi"}]});
        let err = validate_chat_request(&body).unwrap_err();
        assert!(err.contains("role"));
    }

    #[test]
    fn rejects_message_without_content() {
        let body = json!({"messages": [{"role": "user"}]});
        let err = validate_chat_request(&body).unwrap_err();
        assert!(err.contains("content"));
    }

    // ── max_tokens ────────────────────────────────────────────────────────────

    #[test]
    fn rejects_max_tokens_zero() {
        let body = json!({
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 0
        });
        assert!(validate_chat_request(&body).is_err());
    }

    #[test]
    fn rejects_max_tokens_negative() {
        let body = json!({
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": -1
        });
        assert!(validate_chat_request(&body).is_err());
    }

    #[test]
    fn accepts_max_tokens_positive() {
        let body = json!({
            "messages": [{"role": "user", "content": "hi"}],
            "max_tokens": 512
        });
        assert!(validate_chat_request(&body).is_ok());
    }

    // ── temperature ───────────────────────────────────────────────────────────

    #[test]
    fn rejects_temperature_above_2() {
        let body = json!({
            "messages": [{"role": "user", "content": "hi"}],
            "temperature": 3.0
        });
        assert!(validate_chat_request(&body).is_err());
    }

    #[test]
    fn rejects_temperature_negative() {
        let body = json!({
            "messages": [{"role": "user", "content": "hi"}],
            "temperature": -0.1
        });
        assert!(validate_chat_request(&body).is_err());
    }

    #[test]
    fn accepts_temperature_boundary_values() {
        for temp in [0.0f64, 1.0, 2.0] {
            let body = json!({
                "messages": [{"role": "user", "content": "hi"}],
                "temperature": temp
            });
            assert!(validate_chat_request(&body).is_ok(), "Attendu Ok pour temperature={temp}");
        }
    }

    // ── requête valide de référence ───────────────────────────────────────────

    #[test]
    fn accepts_valid_request() {
        let body = json!({
            "model": "pepe-studio-model",
            "messages": [
                {"role": "system", "content": "Tu es un assistant."},
                {"role": "user",   "content": "Bonjour"}
            ],
            "temperature": 0.7,
            "max_tokens": 1024,
            "stream": false
        });
        assert!(validate_chat_request(&body).is_ok());
    }

    // ── injection dans le contenu (vérification sanitaire) ───────────────────
    // Le contenu des messages est transmis au modèle tel quel ;
    // on vérifie que la validation ne rejette pas des strings avec chars spéciaux.

    #[test]
    fn accepts_content_with_special_chars() {
        let body = json!({
            "messages": [{
                "role": "user",
                "content": "test; echo pwned && rm -rf / | cat ../../etc/passwd"
            }]
        });
        // Le contenu est data pour le LLM — pas d'exécution, donc valide
        assert!(validate_chat_request(&body).is_ok());
    }
}

// ── Handler principal ─────────────────────────────────────────────────────────

pub async fn chat_completions_handler(
    AxumState(state): AxumState<ProxyState>,
    Json(body): Json<Value>,
) -> Response {
    // Validation du schéma JSON avant tout traitement
    if let Err(msg) = validate_chat_request(&body) {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "error": {
                    "message": msg,
                    "type": "invalid_request_error",
                    "code": "unprocessable_entity"
                }
            })),
        )
            .into_response();
    }
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

    chat_with_tools_stream(&state, body).await
}

// ── Boucle tool-calling non-stream ────────────────────────────────────────────

async fn chat_with_tools_loop(state: &ProxyState, mut req_body: Value) -> Result<Value, String> {
    ensure_tools_are_available(&mut req_body);
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

        response_json["_tool_calls_executed"] = Value::Bool(true);
    }

    Err("Limite de boucle tool-calling atteinte (max 4 tours)".into())
}

// ── Helpers messages ──────────────────────────────────────────────────────────

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
                        eprintln!("[chat_api] stream error: {e}");
                        break 'drain;
                    }
                    Some(Ok(chunk)) => {
                        buffer.push_str(&String::from_utf8_lossy(&chunk));

                        loop {
                            let Some(nl_pos) = buffer.find('\n') else {
                                break;
                            };
                            let raw_line = buffer[..nl_pos].to_string();
                            buffer = buffer[nl_pos + 1..].to_string();
                            let line = raw_line.trim_end_matches('\r');

                            if line == "data: [DONE]" {
                                if !tool_calls_executed {
                                    let _ = tx.send(Ok(b"data: [DONE]\n\n".to_vec())).await;
                                    break 'outer;
                                } else {
                                    break 'drain;
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

                            if let Some(tc) = delta.get("tool_calls") {
                                accumulate_tool_call_delta(&mut partial_tool_calls, tc);
                            }

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
                                }
                                Some("stop") | Some("length") => {
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
                let _ = tx.send(Ok(b"data: [DONE]\n\n".to_vec())).await;
                break 'outer;
            }
        }
    });

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
