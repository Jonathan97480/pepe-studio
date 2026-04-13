use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, WindowBuilder, WindowUrl};
use tokio::sync::oneshot;
use tokio::time::timeout;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScrapeLink {
    pub text: String,
    pub href: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScrapeHeading {
    pub level: String,
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScrapedPage {
    pub url: String,
    pub title: String,
    pub description: String,
    pub text: String,
    pub headings: Vec<ScrapeHeading>,
    pub links: Vec<ScrapeLink>,
    pub mode: String,
}

#[tauri::command]
pub async fn scrape_url(
    app: AppHandle,
    url: String,
    mode: Option<String>,
) -> Result<ScrapedPage, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("L'URL doit commencer par http:// ou https://".to_string());
    }
    if url.len() > 2048 {
        return Err("URL trop longue (max 2048 caractères)".to_string());
    }

    let mode_str = mode.unwrap_or_else(|| "static".to_string());

    match mode_str.as_str() {
        "js" => scrape_js(app, url).await,
        _ => scrape_static(url).await,
    }
}

async fn scrape_static(url: String) -> Result<ScrapedPage, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 PepeScraper/1.0"),
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Erreur client HTTP: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Erreur requête: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let html_text = response
        .text()
        .await
        .map_err(|e| format!("Erreur lecture réponse: {}", e))?;

    parse_html(&url, &html_text, "static")
}

fn parse_html(url: &str, html_text: &str, mode: &str) -> Result<ScrapedPage, String> {
    let document = Html::parse_document(html_text);

    // Title
    let title_sel = Selector::parse("title").unwrap();
    let title = document
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    // Meta description
    let meta_sel = Selector::parse("meta[name='description']").unwrap();
    let meta_og_sel = Selector::parse("meta[property='og:description']").unwrap();
    let description = document
        .select(&meta_sel)
        .next()
        .or_else(|| document.select(&meta_og_sel).next())
        .and_then(|e| e.value().attr("content"))
        .unwrap_or_default()
        .trim()
        .to_string();

    // Headings h1, h2, h3
    let h_sel = Selector::parse("h1, h2, h3").unwrap();
    let headings: Vec<ScrapeHeading> = document
        .select(&h_sel)
        .filter_map(|e| {
            let text = e.text().collect::<Vec<_>>().join(" ").trim().to_string();
            if text.is_empty() {
                return None;
            }
            let level = e.value().name().to_string();
            Some(ScrapeHeading { level, text })
        })
        .take(20)
        .collect();

    // Links
    let a_sel = Selector::parse("a[href]").unwrap();
    let links: Vec<ScrapeLink> = document
        .select(&a_sel)
        .filter_map(|e| {
            let href = e.value().attr("href")?.to_string();
            if href.is_empty() || href.starts_with('#') || href.starts_with("javascript:") {
                return None;
            }
            let text = e.text().collect::<Vec<_>>().join(" ").trim().to_string();
            Some(ScrapeLink { text, href })
        })
        .take(30)
        .collect();

    // Body text — exclude scripts, styles, nav, footer
    let body_sel = Selector::parse("body").unwrap();
    let skip_sel = Selector::parse("script, style, nav, footer, header, aside").unwrap();

    let raw_text = if let Some(body) = document.select(&body_sel).next() {
        // Get all text nodes, skipping excluded elements
        let skip_nodes: std::collections::HashSet<_> = body
            .select(&skip_sel)
            .flat_map(|e| e.text())
            .collect();

        body.text()
            .filter(|t| !skip_nodes.contains(t))
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        document
            .root_element()
            .text()
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    };

    // Normalize whitespace and truncate
    let text: String = raw_text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(6000)
        .collect();

    Ok(ScrapedPage {
        url: url.to_string(),
        title,
        description,
        text,
        headings,
        links,
        mode: mode.to_string(),
    })
}

async fn scrape_js(app: AppHandle, url: String) -> Result<ScrapedPage, String> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let label = format!("scraper-{}", ts);

    // Script injecté dans la WebView : attend le chargement + 3s puis extrait et émet
    let init_script = r##"
(function() {
    function doScrape() {
        var result = {
            title: document.title || "",
            description: (function() {
                var m = document.querySelector("meta[name='description']") ||
                        document.querySelector("meta[property='og:description']");
                return m ? (m.getAttribute("content") || "") : "";
            })(),
            headings: (function() {
                var hs = Array.from(document.querySelectorAll("h1,h2,h3")).slice(0,20);
                return hs.map(function(h) { return { level: h.tagName.toLowerCase(), text: (h.innerText||"").trim() }; })
                         .filter(function(h) { return h.text.length > 0; });
            })(),
            links: (function() {
                var as = Array.from(document.querySelectorAll("a[href]")).slice(0,30);
                return as.map(function(a) { return { text: (a.innerText||"").trim(), href: a.getAttribute("href")||"" }; })
                         .filter(function(l) { return l.href && l.href.charAt(0) !== "#" && l.href.indexOf("javascript:") !== 0; });
            })(),
            text: (function() {
                var body = document.body;
                if (!body) return "";
                var clone = body.cloneNode(true);
                ["script","style","nav","footer","header","aside"].forEach(function(tag) {
                    Array.from(clone.querySelectorAll(tag)).forEach(function(el) { el.remove(); });
                });
                return (clone.innerText || clone.textContent || "").replace(/[ \t\r\n]+/g," ").trim().slice(0,6000);
            })()
        };
        window.__TAURI__.event.emit("pepe-scrape-result", JSON.stringify(result));
    }

    if (document.readyState === "complete") {
        setTimeout(doScrape, 3000);
    } else {
        window.addEventListener("load", function() { setTimeout(doScrape, 3000); });
    }
})();
"##;

    let parsed_url = url
        .parse::<url::Url>()
        .map_err(|e| format!("URL invalide: {}", e))?;

    let (tx, rx) = oneshot::channel::<String>();
    let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

    let window = WindowBuilder::new(&app, &label, WindowUrl::External(parsed_url))
        .initialization_script(init_script)
        .visible(false)
        .build()
        .map_err(|e| format!("Erreur création WebView: {}", e))?;

    let tx_clone = tx.clone();
    window.listen("pepe-scrape-result", move |event| {
        if let Some(payload) = event.payload() {
            if let Some(sender) = tx_clone.lock().unwrap().take() {
                let _ = sender.send(payload.to_string());
            }
        }
    });

    // Timeout 12s total
    let json_str = timeout(Duration::from_secs(12), rx)
        .await
        .map_err(|_| "Timeout: la page n'a pas répondu en 12s".to_string())?
        .map_err(|_| "Canal fermé avant la réponse".to_string())?;

    let _ = window.close();

    // Le payload Tauri est parfois entouré de guillemets JSON (string serialisée deux fois)
    let clean = if json_str.starts_with('"') {
        serde_json::from_str::<String>(&json_str).unwrap_or(json_str)
    } else {
        json_str
    };

    let partial: serde_json::Value =
        serde_json::from_str(&clean).map_err(|e| format!("JSON invalide: {}", e))?;

    let title = partial["title"].as_str().unwrap_or_default().to_string();
    let description = partial["description"].as_str().unwrap_or_default().to_string();
    let text = partial["text"].as_str().unwrap_or_default().to_string();

    let headings = partial["headings"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|h| {
            Some(ScrapeHeading {
                level: h["level"].as_str()?.to_string(),
                text: h["text"].as_str()?.to_string(),
            })
        })
        .collect();

    let links = partial["links"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|l| {
            Some(ScrapeLink {
                text: l["text"].as_str()?.to_string(),
                href: l["href"].as_str()?.to_string(),
            })
        })
        .collect();

    Ok(ScrapedPage {
        url,
        title,
        description,
        text,
        headings,
        links,
        mode: "js".to_string(),
    })
}
