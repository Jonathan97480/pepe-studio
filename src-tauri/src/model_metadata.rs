use serde::Serialize;
use std::env;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle};

#[derive(Serialize, Clone, Debug)]
pub struct ModelMetadata {
    pub path: String,
    pub architecture: String,
    pub name: String,
    pub context_length: u64,
    pub block_count: u64,
    pub head_count_kv: u64,
    pub key_length: u64,
    pub value_length: u64,
    pub embedding_length: u64,
    pub file_size_bytes: u64,
    pub has_chat_template: bool,
}

fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\\") {
        PathBuf::from(stripped.to_string())
    } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped.to_string())
    } else {
        path
    }
}

fn dir_candidates(base: PathBuf) -> Vec<PathBuf> {
    let stripped = strip_unc_prefix(base.clone());
    if stripped == base {
        vec![base]
    } else {
        vec![base, stripped]
    }
}

fn resolve_model_path(app: &AppHandle, model_path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(model_path);
    let file_name = requested.file_name().unwrap_or_default();
    let mut candidates = Vec::new();

    if requested.is_absolute() {
        candidates.push(requested.to_path_buf());
        candidates.push(strip_unc_prefix(requested.to_path_buf()));
    }

    let mut base_dirs: Vec<PathBuf> = Vec::new();
    if let Some(rd) = app.path_resolver().resource_dir() {
        base_dirs.extend(dir_candidates(rd));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(ed) = exe.parent() {
            base_dirs.extend(dir_candidates(ed.to_path_buf()));
        }
    }
    for base in &base_dirs {
        candidates.push(base.join(file_name));
        candidates.push(base.join("models").join(file_name));
        candidates.push(base.join("_up_").join("models").join(file_name));
        candidates.push(base.join("_up_").join(file_name));
    }

    if !requested.is_absolute() {
        candidates.push(requested.to_path_buf());
        candidates.push(Path::new("..").join(requested));
        candidates.push(Path::new("src-tauri").join(requested));
    }

    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    candidates.push(cwd.join("models").join(file_name));

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.canonicalize().unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err(format!("Le modèle '{}' est introuvable", model_path))
}

fn read_u8(reader: &mut BufReader<File>) -> Result<u8, String> {
    let mut buf = [0u8; 1];
    reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf[0])
}

fn read_u32(reader: &mut BufReader<File>) -> Result<u32, String> {
    let mut buf = [0u8; 4];
    reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(u32::from_le_bytes(buf))
}

fn read_u64(reader: &mut BufReader<File>) -> Result<u64, String> {
    let mut buf = [0u8; 8];
    reader.read_exact(&mut buf).map_err(|e| e.to_string())?;
    Ok(u64::from_le_bytes(buf))
}

fn skip_bytes(reader: &mut BufReader<File>, count: u64) -> Result<(), String> {
    let offset = i64::try_from(count).map_err(|_| "Offset trop grand".to_string())?;
    reader
        .seek(SeekFrom::Current(offset))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn read_gguf_string(reader: &mut BufReader<File>) -> Result<String, String> {
    let len = read_u64(reader)?;
    let mut bytes = vec![0u8; len as usize];
    reader.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn skip_gguf_string(reader: &mut BufReader<File>) -> Result<(), String> {
    let len = read_u64(reader)?;
    skip_bytes(reader, len)
}

fn scalar_size(kind: u32) -> Option<u64> {
    match kind {
        0 | 1 | 7 => Some(1),
        2 | 3 => Some(2),
        4 | 5 | 6 => Some(4),
        10 | 11 | 12 => Some(8),
        _ => None,
    }
}

fn skip_value(reader: &mut BufReader<File>, value_type: u32) -> Result<(), String> {
    match value_type {
        8 => skip_gguf_string(reader),
        9 => {
            let elem_type = read_u32(reader)?;
            let len = read_u64(reader)?;
            if elem_type == 8 {
                for _ in 0..len {
                    skip_gguf_string(reader)?;
                }
                return Ok(());
            }
            if elem_type == 9 {
                for _ in 0..len {
                    skip_value(reader, elem_type)?;
                }
                return Ok(());
            }
            if let Some(size) = scalar_size(elem_type) {
                return skip_bytes(reader, size.saturating_mul(len));
            }
            Err(format!("Type GGUF array non supporté: {}", elem_type))
        }
        other => {
            if let Some(size) = scalar_size(other) {
                skip_bytes(reader, size)
            } else {
                Err(format!("Type GGUF non supporté: {}", other))
            }
        }
    }
}

fn read_u64_like(reader: &mut BufReader<File>, value_type: u32) -> Result<Option<u64>, String> {
    match value_type {
        4 => Ok(Some(read_u32(reader)? as u64)),
        5 => Ok(Some(read_u32(reader)? as i32 as i64 as u64)),
        10 => Ok(Some(read_u64(reader)?)),
        11 => Ok(Some(read_u64(reader)? as i64 as u64)),
        _ => {
            skip_value(reader, value_type)?;
            Ok(None)
        }
    }
}

fn read_bool_like(reader: &mut BufReader<File>, value_type: u32) -> Result<Option<bool>, String> {
    match value_type {
        7 => Ok(Some(read_u8(reader)? != 0)),
        _ => {
            skip_value(reader, value_type)?;
            Ok(None)
        }
    }
}

fn read_string_like(reader: &mut BufReader<File>, value_type: u32) -> Result<Option<String>, String> {
    match value_type {
        8 => Ok(Some(read_gguf_string(reader)?)),
        _ => {
            skip_value(reader, value_type)?;
            Ok(None)
        }
    }
}

#[command]
pub fn inspect_model_metadata(app: AppHandle, model_path: String) -> Result<ModelMetadata, String> {
    let resolved = resolve_model_path(&app, &model_path)?;
    let file = File::open(&resolved).map_err(|e| e.to_string())?;
    let file_size_bytes = file.metadata().map_err(|e| e.to_string())?.len();
    let mut reader = BufReader::new(file);

    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if &magic != b"GGUF" {
        return Err("Fichier GGUF invalide (magic manquant)".into());
    }

    let version = read_u32(&mut reader)?;
    if !(2..=3).contains(&version) {
        return Err(format!("Version GGUF non supportée: {}", version));
    }

    let _tensor_count = read_u64(&mut reader)?;
    let metadata_kv_count = read_u64(&mut reader)?;

    let mut architecture = String::new();
    let mut name = String::new();
    let mut context_length = 0u64;
    let mut block_count = 0u64;
    let mut head_count_kv = 0u64;
    let mut key_length = 0u64;
    let mut value_length = 0u64;
    let mut embedding_length = 0u64;
    let mut has_chat_template = false;

    for _ in 0..metadata_kv_count {
        let key = read_gguf_string(&mut reader)?;
        let value_type = read_u32(&mut reader)?;

        match key.as_str() {
            "general.architecture" => {
                if let Some(value) = read_string_like(&mut reader, value_type)? {
                    architecture = value;
                }
            }
            "general.name" => {
                if let Some(value) = read_string_like(&mut reader, value_type)? {
                    name = value;
                }
            }
            "tokenizer.chat_template" => {
                if let Some(value) = read_string_like(&mut reader, value_type)? {
                    has_chat_template = !value.trim().is_empty();
                }
            }
            _ if key.ends_with(".context_length") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    context_length = value;
                }
            }
            _ if key.ends_with(".block_count") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    block_count = value;
                }
            }
            _ if key.ends_with(".attention.head_count_kv") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    head_count_kv = value;
                }
            }
            _ if key.ends_with(".attention.key_length") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    key_length = value;
                }
            }
            _ if key.ends_with(".attention.value_length") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    value_length = value;
                }
            }
            _ if key.ends_with(".embedding_length") => {
                if let Some(value) = read_u64_like(&mut reader, value_type)? {
                    embedding_length = value;
                }
            }
            _ => {
                if key.ends_with(".add_bos_token") || key.ends_with(".add_eos_token") {
                    let _ = read_bool_like(&mut reader, value_type)?;
                } else {
                    skip_value(&mut reader, value_type)?;
                }
            }
        }
    }

    Ok(ModelMetadata {
        path: resolved.to_string_lossy().replace('\\', "/"),
        architecture,
        name,
        context_length,
        block_count,
        head_count_kv,
        key_length,
        value_length,
        embedding_length,
        file_size_bytes,
        has_chat_template,
    })
}
