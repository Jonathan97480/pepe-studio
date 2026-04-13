// dev_server.rs — Serveur HTTP local pour le navigateur intégré
// Sert les fichiers statiques depuis un dossier, capture les erreurs JS,
// et expose une commande screenshot (base64 du contenu HTML rendu).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::State;
use tiny_http::{Header, Method, Response, Server, StatusCode};

// ─── État partagé ────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct DevServerState {
    /// Handle du thread serveur (None = arrêté)
    pub thread: Mutex<Option<thread::JoinHandle<()>>>,
    /// Buffer des logs d'erreur capturés côté JS
    pub logs: Arc<Mutex<Vec<String>>>,
    /// Port actuellement utilisé
    pub port: Mutex<u16>,
    /// Dossier racine servi
    pub base_dir: Mutex<Option<String>>,
    /// Signal d'arrêt
    pub stop_flag: Arc<Mutex<bool>>,
}

// ─── Script injecté dans chaque page HTML ────────────────────────────────────

fn error_capture_script(port: u16) -> String {
    format!(
        r#"<script>
(function(){{
  var _port = {port};
  function send(msg) {{
    fetch('http://127.0.0.1:' + _port + '/api/logs', {{
      method: 'POST',
      headers: {{ 'Content-Type': 'application/json' }},
      body: JSON.stringify({{ message: msg }})
    }}).catch(function(){{}});
  }}
  var _err = console.error.bind(console);
  console.error = function() {{
    var args = Array.prototype.slice.call(arguments);
    send('[console.error] ' + args.join(' '));
    _err.apply(console, arguments);
  }};
  var _warn = console.warn.bind(console);
  console.warn = function() {{
    var args = Array.prototype.slice.call(arguments);
    send('[console.warn] ' + args.join(' '));
    _warn.apply(console, arguments);
  }};
  window.addEventListener('error', function(e) {{
    send('[JS Error] ' + e.message + ' (' + e.filename + ':' + e.lineno + ':' + e.colno + ')');
  }});
  window.addEventListener('unhandledrejection', function(e) {{
    send('[Promise Rejection] ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  }});
}})();
</script>"#,
        port = port
    )
}

// ─── Type MIME ───────────────────────────────────────────────────────────────

fn mime_for_path(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") | Some("mjs") => "application/javascript; charset=utf-8",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

// ─── Thread serveur ────────────────────────────────────────────────────────────

/// Fait tourner la boucle de traitement des requêtes sur un `Server` déjà bindé.
fn run_server(
    server: Server,
    port: u16,
    base_dir: PathBuf,
    logs: Arc<Mutex<Vec<String>>>,
    stop_flag: Arc<Mutex<bool>>,
) {
    eprintln!("[DevServer] En écoute sur http://127.0.0.1:{}", port);

    // Boucle non-bloquante : try_recv() + vérification du stop_flag toutes les 20 ms
    loop {
        if *stop_flag.lock().unwrap() {
            break;
        }

        let request = match server.try_recv() {
            Ok(Some(r)) => r,
            Ok(None) => {
                // Pas de requête en attente, on laisse le CPU respirer
                thread::sleep(Duration::from_millis(20));
                continue;
            }
            Err(e) => {
                eprintln!("[DevServer] Erreur réseau : {}", e);
                break;
            }
        };

        let method = request.method().clone();
        let url = request.url().to_string();

        // ── POST /api/logs ──
        if method == Method::Post && url == "/api/logs" {
            let mut body = String::new();
            let mut req = request;
            let _ = req.as_reader().read_to_string(&mut body);

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(msg) = json.get("message").and_then(|m| m.as_str()) {
                    let mut log_buf = logs.lock().unwrap();
                    log_buf.push(msg.to_string());
                    // Garder au max 200 entrées
                    if log_buf.len() > 200 {
                        log_buf.drain(0..100);
                    }
                }
            }

            let cors_origin =
                Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
            let _ = req.respond(
                Response::from_string("ok")
                    .with_status_code(StatusCode(200))
                    .with_header(cors_origin),
            );
            continue;
        }

        // ── OPTIONS (preflight CORS) ──
        if method == Method::Options {
            let cors_origin =
                Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
            let cors_methods =
                Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap();
            let cors_headers =
                Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap();
            let _ = request.respond(
                Response::from_string("")
                    .with_status_code(StatusCode(204))
                    .with_header(cors_origin)
                    .with_header(cors_methods)
                    .with_header(cors_headers),
            );
            continue;
        }

        // ── GET fichier statique ──
        // Nettoyer le chemin (supprimer query string)
        let clean_url = url.split('?').next().unwrap_or("/").to_string();
        let rel = clean_url.trim_start_matches('/');

        // Résoudre le chemin absolu en s'assurant qu'il reste sous base_dir
        let mut file_path = base_dir.clone();
        for segment in rel.split('/') {
            if segment == ".." || segment == "." {
                continue; // Sécurité : pas de directory traversal
            }
            if !segment.is_empty() {
                file_path.push(segment);
            }
        }

        // Fallback : dossier → index.html
        if file_path.is_dir() {
            file_path.push("index.html");
        }

        match fs::read(&file_path) {
            Ok(mut content) => {
                let mime = mime_for_path(&file_path);

                // Injecter le script d'interception dans les pages HTML
                if mime.starts_with("text/html") {
                    let script = error_capture_script(port);
                    let html = String::from_utf8_lossy(&content).into_owned();
                    let injected = if let Some(pos) = html.to_lowercase().find("<head>") {
                        let mut s = html.clone();
                        s.insert_str(pos + "<head>".len(), &script);
                        s
                    } else {
                        // Pas de <head> → insérer au début
                        format!("{}{}", script, html)
                    };
                    content = injected.into_bytes();
                }

                let content_type =
                    Header::from_bytes("Content-Type", mime).unwrap();
                let cors_origin =
                    Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let cache_control =
                    Header::from_bytes("Cache-Control", "no-cache, no-store, must-revalidate").unwrap();
                let pragma =
                    Header::from_bytes("Pragma", "no-cache").unwrap();
                let _ = request.respond(
                    Response::from_data(content)
                        .with_status_code(StatusCode(200))
                        .with_header(content_type)
                        .with_header(cors_origin)
                        .with_header(cache_control)
                        .with_header(pragma),
                );
            }
            Err(_) => {
                let cors_origin =
                    Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let _ = request.respond(
                    Response::from_string("404 Not Found")
                        .with_status_code(StatusCode(404))
                        .with_header(cors_origin),
                );
            }
        }
    }

    eprintln!("[DevServer] Arrêté.");
}

// ─── Commandes Tauri ──────────────────────────────────────────────────────────

/// Démarre le serveur de développement sur le port indiqué (défaut 7820).
/// Le socket est bindé DANS CETTE FONCTION avant le spawn du thread,
/// donc la commande ne retourne que quand le serveur est prêt à accepter des connexions.
#[tauri::command]
pub fn start_dev_server(
    base_dir: String,
    port: Option<u16>,
    state: State<DevServerState>,
) -> Result<u16, String> {
    let p = port.unwrap_or(7820);

    // Signaler l'arrêt au thread existant
    {
        let mut flag = state.stop_flag.lock().unwrap();
        *flag = true;
    }
    // Attendre que le thread soit sorti de sa boucle try_recv (20 ms/itération, max ~40 ms)
    thread::sleep(Duration::from_millis(200));
    // Réinitialiser le flag
    {
        let mut flag = state.stop_flag.lock().unwrap();
        *flag = false;
    }

    let path = PathBuf::from(&base_dir);
    if !path.exists() {
        return Err(format!("Dossier introuvable : {}", base_dir));
    }

    // Binder le socket ICI (thread de la commande).
    // start_dev_server ne retourne Ok() qu'après le bind réussi.
    // Élimine la race condition où l'iframe charge avant que le serveur soit prêt.
    let addr = format!("127.0.0.1:{}", p);
    let server = Server::http(&addr)
        .map_err(|e| format!("Impossible de lier le port {} : {}", p, e))?;

    let logs_arc = Arc::clone(&state.logs);
    let stop_arc = Arc::clone(&state.stop_flag);

    let handle = thread::spawn(move || {
        run_server(server, p, path, logs_arc, stop_arc);
    });

    *state.thread.lock().unwrap() = Some(handle);
    *state.port.lock().unwrap() = p;
    *state.base_dir.lock().unwrap() = Some(base_dir);

    Ok(p)
}

/// Arrête le serveur de développement.
#[tauri::command]
pub fn stop_dev_server(state: State<DevServerState>) -> Result<(), String> {
    let mut flag = state.stop_flag.lock().unwrap();
    *flag = true;
    Ok(())
}

/// Retourne et vide le buffer des logs d'erreur capturés.
#[tauri::command]
pub fn get_browser_errors(state: State<DevServerState>) -> Vec<String> {
    let mut buf = state.logs.lock().unwrap();
    let result = buf.clone();
    buf.clear();
    result
}

/// Retourne les informations du serveur en cours (port, base_dir).
#[tauri::command]
pub fn get_dev_server_info(state: State<DevServerState>) -> HashMap<String, String> {
    let port = *state.port.lock().unwrap();
    let base_dir = state
        .base_dir
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_default();
    let running = !*state.stop_flag.lock().unwrap() && port != 0;

    let mut info = HashMap::new();
    info.insert("port".to_string(), port.to_string());
    info.insert("base_dir".to_string(), base_dir);
    info.insert("running".to_string(), running.to_string());
    info
}
