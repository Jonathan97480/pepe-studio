use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, USER_AGENT};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub url: String,
    pub source: String,
}

#[tauri::command]
pub async fn search_web(
    query: String,
    source: Option<String>,
    api_key: Option<String>,
    locale: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Err("La requête ne peut pas être vide".to_string());
    }
    if q.len() > 500 {
        return Err("Requête trop longue (max 500 caractères)".to_string());
    }
    match source.unwrap_or_else(|| "duckduckgo".to_string()).as_str() {
        "brave"  => search_brave(q, api_key, locale).await,
        "serper" => search_serper(q, api_key, locale).await,
        "tavily" => search_tavily(q, api_key).await,
        _        => search_duckduckgo(q, locale).await,
    }
}

// ── DuckDuckGo (aucune clé requise) ──────────────────────────────────────────

async fn search_duckduckgo(query: String, locale: Option<String>) -> Result<Vec<SearchResult>, String> {
    let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    let req_url = format!("https://html.duckduckgo.com/html/?q={}", encoded);

    let lang = locale
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("fr");

    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    ));
    headers.insert(ACCEPT, HeaderValue::from_static(
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ));
    if let Ok(v) = HeaderValue::from_str(&format!("{},en;q=0.8", lang)) {
        headers.insert(ACCEPT_LANGUAGE, v);
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Erreur client HTTP: {e}"))?;

    let html_text = client
        .get(&req_url)
        .send()
        .await
        .map_err(|e| format!("Erreur DuckDuckGo: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Erreur lecture: {e}"))?;

    let document = Html::parse_document(&html_text);
    let title_sel   = Selector::parse("a.result__a").unwrap();
    let snippet_sel = Selector::parse("a.result__snippet, .result__snippet").unwrap();

    let titles:   Vec<_> = document.select(&title_sel).collect();
    let snippets: Vec<_> = document.select(&snippet_sel).collect();

    let mut results: Vec<SearchResult> = Vec::new();
    let mut snippet_idx = 0;
    for title_el in titles.iter().take(10) {
        let title = title_el.text().collect::<Vec<_>>().join("").trim().to_string();
        if title.is_empty() { continue; }

        let raw_href = title_el.value().attr("href").unwrap_or("");
        let url = extract_ddg_url(raw_href);
        if url.is_empty() { continue; }

        let snippet = snippets
            .get(snippet_idx)
            .map(|s| s.text().collect::<Vec<_>>().join("").trim().to_string())
            .unwrap_or_default();
        snippet_idx += 1;

        results.push(SearchResult { title, snippet, url, source: "duckduckgo".to_string() });
    }

    if results.is_empty() {
        return Err("Aucun résultat trouvé (DuckDuckGo a peut-être retourné un CAPTCHA)".to_string());
    }
    Ok(results)
}

fn extract_ddg_url(href: &str) -> String {
    // href = "//duckduckgo.com/l/?uddg=ENCODED_URL&..." or absolute URL
    let absolute = if href.starts_with("//") {
        format!("https:{}", href)
    } else if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else {
        return String::new();
    };
    if let Ok(parsed) = url::Url::parse(&absolute) {
        if let Some((_, v)) = parsed.query_pairs().find(|(k, _)| k == "uddg") {
            let decoded = v.to_string();
            if decoded.starts_with("http://") || decoded.starts_with("https://") {
                return decoded;
            }
        }
        // Direct absolute URL (no uddg param)
        if absolute.starts_with("https://http") || absolute.starts_with("https://") {
            if !absolute.contains("duckduckgo.com") {
                return absolute;
            }
        }
    }
    String::new()
}

// ── Brave Search API ──────────────────────────────────────────────────────────

async fn search_brave(query: String, api_key: Option<String>, locale: Option<String>) -> Result<Vec<SearchResult>, String> {
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or("Clé API Brave manquante. Va dans Paramètres → Recherche Web et renseigne ta clé Brave Search.")?;

    let lang = locale.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("fr");
    let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    let req_url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count=10&search_lang={}&ui_lang={}",
        encoded, lang, lang
    );

    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Ok(v) = HeaderValue::from_str(&key) {
        headers.insert("X-Subscription-Token", v);
    } else {
        return Err("Clé Brave invalide (caractères non-ASCII)".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Erreur client HTTP: {e}"))?;

    let resp: serde_json::Value = client
        .get(&req_url)
        .send()
        .await
        .map_err(|e| format!("Erreur Brave: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Erreur JSON Brave: {e}"))?;

    let empty = vec![];
    let items = resp["web"]["results"].as_array().unwrap_or(&empty);
    let results = items.iter().take(10).filter_map(|item| {
        Some(SearchResult {
            title:   item["title"].as_str()?.to_string(),
            snippet: item["description"].as_str().unwrap_or("").to_string(),
            url:     item["url"].as_str()?.to_string(),
            source:  "brave".to_string(),
        })
    }).collect();
    Ok(results)
}

// ── Serper API (Google) ───────────────────────────────────────────────────────

async fn search_serper(query: String, api_key: Option<String>, locale: Option<String>) -> Result<Vec<SearchResult>, String> {
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or("Clé API Serper manquante. Va dans Paramètres → Recherche Web et renseigne ta clé Serper.")?;

    let lang = locale.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("fr");
    let body = serde_json::json!({ "q": query, "num": 10, "gl": lang });

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    if let Ok(v) = HeaderValue::from_str(&key) {
        headers.insert("X-API-KEY", v);
    } else {
        return Err("Clé Serper invalide (caractères non-ASCII)".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Erreur client HTTP: {e}"))?;

    let resp: serde_json::Value = client
        .post("https://google.serper.dev/search")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erreur Serper: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Erreur JSON Serper: {e}"))?;

    let empty = vec![];
    let items = resp["organic"].as_array().unwrap_or(&empty);
    let results = items.iter().take(10).filter_map(|item| {
        Some(SearchResult {
            title:   item["title"].as_str()?.to_string(),
            snippet: item["snippet"].as_str().unwrap_or("").to_string(),
            url:     item["link"].as_str()?.to_string(),
            source:  "serper".to_string(),
        })
    }).collect();
    Ok(results)
}

// ── Tavily API ────────────────────────────────────────────────────────────────

async fn search_tavily(query: String, api_key: Option<String>) -> Result<Vec<SearchResult>, String> {
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or("Clé API Tavily manquante. Va dans Paramètres → Recherche Web et renseigne ta clé Tavily.")?;

    let body = serde_json::json!({
        "query": query,
        "max_results": 10,
        "search_depth": "basic",
        "include_raw_content": false,
    });

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    if let Ok(v) = HeaderValue::from_str(&format!("Bearer {}", key)) {
        headers.insert("Authorization", v);
    } else {
        return Err("Clé Tavily invalide (caractères non-ASCII)".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Erreur client HTTP: {e}"))?;

    let resp: serde_json::Value = client
        .post("https://api.tavily.com/search")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Erreur Tavily: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Erreur JSON Tavily: {e}"))?;

    let empty = vec![];
    let items = resp["results"].as_array().unwrap_or(&empty);
    let results = items.iter().take(10).filter_map(|item| {
        Some(SearchResult {
            title:   item["title"].as_str()?.to_string(),
            snippet: item["content"].as_str().unwrap_or("").to_string(),
            url:     item["url"].as_str()?.to_string(),
            source:  "tavily".to_string(),
        })
    }).collect();
    Ok(results)
}
