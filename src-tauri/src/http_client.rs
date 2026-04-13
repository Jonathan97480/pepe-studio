//! Commande Tauri pour effectuer des requêtes HTTP depuis le LLM.
//! Basée sur reqwest (déjà dans les dépendances).

use tauri::command;

/// Effectue une requête HTTP et retourne le statut + body.
///
/// `headers` : format multiline `"Clé: Valeur\nClé2: Valeur2"` (optionnel)
/// `body`    : corps de la requête en texte brut ou JSON (optionnel)
#[command]
pub async fn http_request(
    method: String,
    url: String,
    headers: Option<String>,
    body: Option<String>,
) -> Result<String, String> {
    // Validation URL basique
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL invalide : doit commencer par http:// ou https://".into());
    }
    if url.len() > 2048 {
        return Err("URL trop longue (max 2048 chars)".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Erreur création client HTTP : {e}"))?;

    let method_upper = method.trim().to_uppercase();
    let mut req = match method_upper.as_str() {
        "GET"    => client.get(&url),
        "POST"   => client.post(&url),
        "PUT"    => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH"  => client.patch(&url),
        other    => return Err(format!("Méthode HTTP non supportée : {other}")),
    };

    // Ajouter les headers (format "Clé: Valeur\nClé2: Valeur2")
    if let Some(h) = headers {
        for line in h.lines() {
            if let Some((key, value)) = line.split_once(':') {
                let k = key.trim();
                let v = value.trim();
                if !k.is_empty() {
                    req = req.header(k, v);
                }
            }
        }
    }

    // Ajouter le body
    if let Some(b) = body {
        req = req.body(b);
    }

    let response = req.send().await
        .map_err(|e| format!("Erreur réseau : {e}"))?;

    let status = response.status().as_u16();
    let body_text = response.text().await
        .map_err(|e| format!("Erreur lecture réponse : {e}"))?;

    // Tronquer si trop long
    const MAX_BODY: usize = 4000;
    let truncated = if body_text.len() > MAX_BODY {
        format!("{}\n... [tronqué à {} chars]", &body_text[..MAX_BODY], MAX_BODY)
    } else {
        body_text
    };

    Ok(format!("HTTP {status}\n{truncated}"))
}
