//! Opérations sur les fichiers : lecture, écriture, patch, listing de dossiers,
//! renommage en lot et lecture de bytes PDF.

use serde::{Deserialize, Serialize};
use tauri::command;

// ─── Lecture / écriture ───────────────────────────────────────────────────────

/// Lit le contenu d'un fichier sur le disque.
#[command]
pub fn read_file_content(path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    // Limiter à 500 Ko pour éviter de saturer le contexte LLM
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 512 * 1024 {
        return Err(format!(
            "Fichier trop volumineux ({} Ko) — limite 512 Ko",
            metadata.len() / 1024
        ));
    }
    std::fs::read_to_string(p).map_err(|e| format!("Erreur lecture : {}", e))
}

/// Écrit (ou écrase) un fichier sur le disque.
/// Le chemin peut être absolu ou relatif au répertoire courant.
/// Crée les dossiers parents si nécessaire.
#[command]
pub fn write_file(path: String, content: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(p, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!(
        "Fichier écrit : {} ({} octets)",
        path,
        content.len()
    ))
}

/// Applique un Search & Replace exact dans un fichier existant.
/// `search` doit apparaître exactement une fois (0 → erreur, 2+ → ambigu).
#[command]
pub fn patch_file(path: String, search: String, replace: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    if search.is_empty() {
        return Err("Le bloc SEARCH ne peut pas être vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    let content = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    let occurrences = content.matches(search.as_str()).count();
    match occurrences {
        0 => return Err(format!(
            "Bloc SEARCH introuvable dans '{}'. Le texte doit correspondre exactement (espaces et retours à la ligne inclus).",
            path
        )),
        2.. => return Err(format!(
            "Bloc SEARCH ambigu dans '{}' : {} occurrences trouvées. Ajoutez plus de contexte pour le rendre unique.",
            path, occurrences
        )),
        _ => {}
    }
    let patched = content.replacen(search.as_str(), replace.as_str(), 1);
    std::fs::write(p, patched.as_bytes()).map_err(|e| e.to_string())?;
    Ok(format!(
        "Fichier patché : {} ({} octets)",
        path,
        patched.len()
    ))
}

// ─── Lecture bytes PDF ────────────────────────────────────────────────────────

/// Lit un fichier PDF et retourne ses octets encodés en base64.
/// Permet au frontend (pdfjs) d'extraire le texte côté JS.
#[command]
pub fn read_pdf_bytes(path: String) -> Result<String, String> {
    use base64::Engine;
    if path.trim().is_empty() {
        return Err("Chemin vide".into());
    }
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("Fichier introuvable : {}", path));
    }
    let lower = path.to_lowercase();
    if !lower.ends_with(".pdf") {
        return Err("Le fichier doit être un PDF (.pdf)".into());
    }
    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    // Limite 50 Mo pour les PDFs
    if metadata.len() > 50 * 1024 * 1024 {
        return Err(format!(
            "PDF trop volumineux ({} Mo) — limite 50 Mo",
            metadata.len() / 1_048_576
        ));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Erreur lecture : {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// ─── Listing de dossiers ──────────────────────────────────────────────────────

/// Liste tous les fichiers PDF dans un dossier (non-récursif par défaut).
#[command]
pub fn list_folder_pdfs(folder: String, recursive: Option<bool>) -> Result<Vec<String>, String> {
    if folder.trim().is_empty() {
        return Err("Chemin de dossier vide".into());
    }
    let p = std::path::Path::new(&folder);
    if !p.exists() {
        return Err(format!("Dossier introuvable : {}", folder));
    }
    if !p.is_dir() {
        return Err(format!("Ce chemin n'est pas un dossier : {}", folder));
    }
    let deep = recursive.unwrap_or(false);
    let mut results: Vec<String> = Vec::new();
    collect_pdfs(p, deep, &mut results)?;
    results.sort();
    Ok(results)
}

fn collect_pdfs(
    dir: &std::path::Path,
    recursive: bool,
    out: &mut Vec<String>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_pdfs(&path, true, out)?;
        } else if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "pdf" {
                    out.push(path.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    Ok(())
}

fn collect_matching_files(
    dir: &std::path::Path,
    recursive: bool,
    extensions: Option<&std::collections::HashSet<String>>,
    out: &mut Vec<String>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && recursive {
            collect_matching_files(&path, true, extensions, out)?;
        } else if path.is_file() {
            let matches = match extensions {
                Some(exts) => path
                    .extension()
                    .map(|ext| exts.contains(&ext.to_string_lossy().to_lowercase()))
                    .unwrap_or(false),
                None => true,
            };
            if matches {
                out.push(path.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    Ok(())
}

#[command]
pub fn list_folder_files(
    folder: String,
    recursive: Option<bool>,
    extensions: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    if folder.trim().is_empty() {
        return Err("Chemin de dossier vide".into());
    }
    let p = std::path::Path::new(&folder);
    if !p.exists() {
        return Err(format!("Dossier introuvable : {}", folder));
    }
    if !p.is_dir() {
        return Err(format!("Ce chemin n'est pas un dossier : {}", folder));
    }

    let extension_set = extensions.and_then(|values| {
        let cleaned: std::collections::HashSet<String> = values
            .into_iter()
            .map(|v| v.trim().trim_start_matches('.').to_lowercase())
            .filter(|v| !v.is_empty())
            .collect();
        if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        }
    });

    let mut results: Vec<String> = Vec::new();
    collect_matching_files(
        p,
        recursive.unwrap_or(false),
        extension_set.as_ref(),
        &mut results,
    )?;
    results.sort();
    Ok(results)
}

#[command]
pub fn list_folder_images(folder: String, recursive: Option<bool>) -> Result<Vec<String>, String> {
    list_folder_files(
        folder,
        recursive,
        Some(vec![
            "png".into(),
            "jpg".into(),
            "jpeg".into(),
            "webp".into(),
            "gif".into(),
            "bmp".into(),
            "svg".into(),
        ]),
    )
}

// ─── Renommage en lot ─────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BatchRenameItem {
    pub from: String,
    pub to: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BatchRenameResult {
    pub from: String,
    pub to: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Renomme plusieurs fichiers en une seule opération.
/// `to` peut être un nom de fichier simple (même dossier que `from`) ou un chemin absolu.
#[command]
pub fn batch_rename_files(renames: Vec<BatchRenameItem>) -> Vec<BatchRenameResult> {
    renames
        .into_iter()
        .map(|item| {
            let from_path = std::path::Path::new(&item.from);
            if !from_path.exists() {
                return BatchRenameResult {
                    from: item.from,
                    to: item.to,
                    success: false,
                    error: Some("Fichier source introuvable".to_string()),
                };
            }
            let to_path = std::path::Path::new(&item.to);
            let dest = if to_path.is_absolute() || item.to.contains('/') || item.to.contains('\\') {
                to_path.to_path_buf()
            } else {
                let parent = from_path.parent().unwrap_or(std::path::Path::new("."));
                parent.join(&item.to)
            };
            match std::fs::rename(&item.from, &dest) {
                Ok(_) => BatchRenameResult {
                    from: item.from,
                    to: dest.to_string_lossy().replace('\\', "/"),
                    success: true,
                    error: None,
                },
                Err(e) => BatchRenameResult {
                    from: item.from,
                    to: item.to,
                    success: false,
                    error: Some(e.to_string()),
                },
            }
        })
        .collect()
}
