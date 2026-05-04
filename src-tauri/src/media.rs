//! Lecture, sauvegarde et téléchargement d'images et de PDFs (base64).

use serde::Serialize;
use tauri::{command, AppHandle};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn infer_image_mime(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct ImageReadResult {
    pub path: String,
    pub data_url: String,
    pub filename: String,
    pub mime_type: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ImageBatchItem {
    pub path: String,
    pub data_url: Option<String>,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PdfBatchItem {
    pub path: String,
    pub base64: Option<String>,
    pub error: Option<String>,
}

// ─── Commandes image ──────────────────────────────────────────────────────────

#[command]
pub fn read_image(path: String) -> Result<ImageReadResult, String> {
    use base64::Engine;

    if path.trim().is_empty() {
        return Err("Chemin image vide".into());
    }

    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    if !p.is_file() {
        return Err(format!("Ce chemin n'est pas un fichier : {}", path));
    }

    let mime_type = infer_image_mime(p).to_string();
    if !mime_type.starts_with("image/") {
        return Err("Fichier image non supporté".into());
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 20 * 1024 * 1024 {
        return Err(format!(
            "Image trop volumineuse ({} Mo) — limite 20 Mo",
            metadata.len() / 1_048_576
        ));
    }

    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let data_url = format!(
        "data:{};base64,{}",
        mime_type,
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );
    let filename = p
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_string();

    Ok(ImageReadResult {
        path: p.to_string_lossy().replace('\\', "/"),
        data_url,
        filename,
        mime_type,
    })
}

#[command]
pub fn read_image_batch(paths: Vec<String>) -> Vec<ImageBatchItem> {
    paths
        .into_iter()
        .map(|path| match read_image(path.clone()) {
            Ok(result) => ImageBatchItem {
                path: result.path,
                data_url: Some(result.data_url),
                filename: Some(result.filename),
                mime_type: Some(result.mime_type),
                error: None,
            },
            Err(error) => ImageBatchItem {
                path,
                data_url: None,
                filename: None,
                mime_type: None,
                error: Some(error),
            },
        })
        .collect()
}

// ─── Commandes PDF batch ──────────────────────────────────────────────────────

/// Lit une liste de fichiers PDF et retourne leurs octets encodés en base64.
#[command]
pub fn read_pdf_batch(paths: Vec<String>) -> Vec<PdfBatchItem> {
    use base64::Engine;
    paths
        .into_iter()
        .map(|path| {
            let p = std::path::Path::new(&path);
            if !p.exists() {
                return PdfBatchItem {
                    path,
                    base64: None,
                    error: Some("Fichier introuvable".to_string()),
                };
            }
            let lower = path.to_lowercase();
            if !lower.ends_with(".pdf") {
                return PdfBatchItem {
                    path,
                    base64: None,
                    error: Some("Ce n'est pas un fichier PDF".to_string()),
                };
            }
            match std::fs::metadata(p) {
                Ok(m) if m.len() > 50 * 1024 * 1024 => PdfBatchItem {
                    path,
                    base64: None,
                    error: Some(format!("PDF trop volumineux ({} Mo)", m.len() / 1_048_576)),
                },
                Ok(_) => match std::fs::read(p) {
                    Ok(bytes) => PdfBatchItem {
                        path,
                        base64: Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
                        error: None,
                    },
                    Err(e) => PdfBatchItem {
                        path,
                        base64: None,
                        error: Some(e.to_string()),
                    },
                },
                Err(e) => PdfBatchItem {
                    path,
                    base64: None,
                    error: Some(e.to_string()),
                },
            }
        })
        .collect()
}

// ─── Sauvegarde et téléchargement ─────────────────────────────────────────────

/// Sauvegarde une image encodée en base64 (data URL) sur le disque.
/// Retourne le chemin absolu, le dataUrl et le nom du fichier.
#[command]
pub fn save_image(
    app: AppHandle,
    data_url: String,
    filename: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::Engine;

    // Décoder le data URL: "data:image/png;base64,iVBORw0..."
    let (mime, b64_data) = if let Some(rest) = data_url.strip_prefix("data:") {
        let parts: Vec<&str> = rest.splitn(2, ";base64,").collect();
        if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            return Err("Format data URL invalide — attendu : data:<mime>;base64,<data>".into());
        }
    } else {
        return Err("Le data_url doit commencer par 'data:'".into());
    };

    let ext = mime
        .split('/')
        .nth(1)
        .unwrap_or("png")
        .split('+')
        .next()
        .unwrap_or("png");
    let fname = filename.unwrap_or_else(|| {
        format!(
            "image_{}.{}",
            chrono::Local::now().format("%Y%m%d_%H%M%S"),
            ext
        )
    });

    let images_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pepe-studio")
        .join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let path = images_dir.join(&fname);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data.as_bytes())
        .map_err(|e| format!("Erreur décodage base64 : {}", e))?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "dataUrl": data_url,
        "filename": fname,
    }))
}

/// Ouvre un dialogue natif "Enregistrer sous" pour choisir où sauvegarder l'image base64.
#[command]
pub fn save_image_as(
    data_url: String,
    filename: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::Engine;
    use tauri::api::dialog::blocking::FileDialogBuilder;

    let (mime, b64_data) = if let Some(rest) = data_url.strip_prefix("data:") {
        let parts: Vec<&str> = rest.splitn(2, ";base64,").collect();
        if parts.len() == 2 {
            (parts[0].to_string(), parts[1].to_string())
        } else {
            return Err("Format data URL invalide — attendu : data:<mime>;base64,<data>".into());
        }
    } else {
        return Err("Le data_url doit commencer par 'data:'".into());
    };

    let ext = mime
        .split('/')
        .nth(1)
        .unwrap_or("png")
        .split('+')
        .next()
        .unwrap_or("png");

    let suggested_name = filename.unwrap_or_else(|| {
        format!(
            "image_{}.{}",
            chrono::Local::now().format("%Y%m%d_%H%M%S"),
            ext
        )
    });

    let selected_path = FileDialogBuilder::new()
        .set_title("Enregistrer l'image")
        .set_file_name(&suggested_name)
        .add_filter("Image", &[ext])
        .save_file()
        .ok_or_else(|| "Sauvegarde annulée".to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data.as_bytes())
        .map_err(|e| format!("Erreur décodage base64 : {}", e))?;
    std::fs::write(&selected_path, &bytes).map_err(|e| e.to_string())?;

    let final_name = selected_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();

    Ok(serde_json::json!({
        "path": selected_path.to_string_lossy(),
        "dataUrl": data_url,
        "filename": final_name,
    }))
}

/// Supprime un fichier image généré localement.
#[command]
pub fn delete_generated_image(path: String) -> Result<String, String> {
    let image_path = std::path::PathBuf::from(path.trim());
    if path.trim().is_empty() {
        return Err("Chemin image vide".into());
    }
    if !image_path.exists() {
        return Ok("Image déjà absente".into());
    }

    let ext = image_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_image = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "bmp");
    if !is_image {
        return Err("Le fichier ciblé n'est pas une image prise en charge".into());
    }

    std::fs::remove_file(&image_path).map_err(|e| format!("Suppression impossible: {}", e))?;
    Ok("Image supprimée".into())
}

/// Télécharge une image depuis une URL HTTP et la sauvegarde sur le disque.
/// Retourne le chemin absolu + dataUrl pour affichage inline dans le chat.
#[command]
pub fn download_image(
    app: AppHandle,
    url: String,
    filename: Option<String>,
) -> Result<serde_json::Value, String> {
    use base64::Engine;
    use reqwest::blocking::Client;

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (compatible; PepeStudio/1.0)")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("Erreur téléchargement : {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Erreur HTTP {} pour : {}", resp.status(), url));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .trim()
        .to_string();

    let ext = content_type
        .split('/')
        .nth(1)
        .unwrap_or("png")
        .split('+')
        .next()
        .unwrap_or("png");

    let fname = filename.unwrap_or_else(|| {
        url.split('/')
            .last()
            .and_then(|s| s.split('?').next())
            .filter(|s| !s.is_empty() && s.contains('.'))
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                format!(
                    "image_{}.{}",
                    chrono::Local::now().format("%Y%m%d_%H%M%S"),
                    ext
                )
            })
    });

    let images_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("pepe-studio")
        .join("images");
    std::fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;

    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    let path = images_dir.join(&fname);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", content_type, b64);

    Ok(serde_json::json!({
        "path": path.to_string_lossy(),
        "dataUrl": data_url,
        "filename": fname,
    }))
}
