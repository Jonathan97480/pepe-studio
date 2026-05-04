//! Gestion RAG : documents, chunks (stockage + FTS5).

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use super::DbState;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentChunkInput {
    pub page_num: i64,
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChunkResult {
    pub doc_id: i64,
    pub doc_name: String,
    pub page_num: i64,
    pub chunk_text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DocumentMeta {
    pub id: i64,
    pub name: String,
    pub total_pages: i64,
    pub created_at: String,
}

// ─── Commandes ────────────────────────────────────────────────────────────────

/// Indexe un document (ses pages) dans la table document_chunks (stockage) et FTS5 (recherche).
/// Retourne l'id du document créé.
#[command]
pub fn store_document(
    name: String,
    chunks: Vec<DocumentChunkInput>,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    let total_pages = chunks.len() as i64;
    conn.execute(
        "INSERT INTO documents (name, total_pages) VALUES (?1, ?2)",
        params![name, total_pages],
    )
    .map_err(|e| e.to_string())?;
    let doc_id = conn.last_insert_rowid();

    for chunk in &chunks {
        // Stockage physique (table normale, SELECT fiable)
        conn.execute(
            "INSERT INTO document_chunks (doc_id, page_num, chunk_text) VALUES (?1, ?2, ?3)",
            params![doc_id, chunk.page_num, chunk.text],
        )
        .map_err(|e| e.to_string())?;
        // Index FTS5 (recherche par mots-clés seulement)
        conn.execute(
            "INSERT INTO document_chunks_fts (doc_id, page_num, chunk_text) VALUES (?1, ?2, ?3)",
            params![doc_id, chunk.page_num, chunk.text],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(doc_id)
}

/// Recherche les chunks les plus pertinents pour une requête dans les documents donnés.
/// Tente d'abord FTS5 MATCH ; si la requête est invalide ou sans résultat,
/// retourne automatiquement les premiers chunks du document (fallback fiable).
#[command]
pub fn search_chunks(
    query: String,
    doc_ids: Vec<i64>,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<ChunkResult>, String> {
    if doc_ids.is_empty() {
        return Ok(vec![]);
    }
    let conn = state.0.lock().unwrap();

    // ── Tentative FTS5 MATCH ─────────────────────────────────────────────────
    if !query.trim().is_empty() {
        // Sanitiser : garder uniquement les mots alphanumériques (unicode) de 2+ chars.
        // On retire les opérateurs FTS5 : " * ( ) - : ^ mais on garde lettres ET chiffres (ex: v1, api, 404).
        let safe_query: String = query
            .split_whitespace()
            .map(|w| {
                // Retirer les chars non-alphanumériques sauf apostrophe et slash (pour les chemins api/v1)
                w.chars()
                    .filter(|c| c.is_alphanumeric() || *c == '\'' || *c == '/')
                    .collect::<String>()
            })
            .filter(|w| w.chars().count() >= 2)
            .collect::<Vec<_>>()
            .join(" ");

        if !safe_query.is_empty() {
            let fts_placeholders: String = doc_ids
                .iter()
                .enumerate()
                .map(|(i, _)| format!("?{}", i + 2))
                .collect::<Vec<_>>()
                .join(", ");

            let sql = format!(
                "SELECT CAST(f.doc_id AS INTEGER), d.name, CAST(f.page_num AS INTEGER), f.chunk_text
                 FROM document_chunks_fts f
                 JOIN documents d ON d.id = CAST(f.doc_id AS INTEGER)
                 WHERE document_chunks_fts MATCH ?1
                   AND CAST(f.doc_id AS INTEGER) IN ({})
                 ORDER BY rank
                 LIMIT {}",
                fts_placeholders, limit
            );

            if let Ok(mut stmt) = conn.prepare(&sql) {
                let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(safe_query)];
                for id in &doc_ids {
                    params_vec.push(Box::new(*id));
                }
                if let Ok(rows) = stmt.query_map(
                    rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
                    |row| {
                        Ok(ChunkResult {
                            doc_id: row.get(0)?,
                            doc_name: row.get(1)?,
                            page_num: row.get(2)?,
                            chunk_text: row.get(3)?,
                        })
                    },
                ) {
                    let results: Vec<ChunkResult> = rows.flatten().collect();
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
        }
    }

    // ── Fallback : table normale document_chunks (SELECT fiable, pas de FTS5) ─
    let per_doc = ((limit + doc_ids.len() - 1) / doc_ids.len()).max(2);
    let mut results: Vec<ChunkResult> = Vec::new();
    for doc_id in &doc_ids {
        let sql = format!(
            "SELECT c.doc_id, d.name, c.page_num, c.chunk_text
             FROM document_chunks c
             JOIN documents d ON d.id = c.doc_id
             WHERE c.doc_id = ?1
             ORDER BY c.page_num
             LIMIT {}",
            per_doc
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let chunks: Vec<ChunkResult> = stmt
                .query_map([doc_id], |row| {
                    Ok(ChunkResult {
                        doc_id: row.get(0)?,
                        doc_name: row.get(1)?,
                        page_num: row.get(2)?,
                        chunk_text: row.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .flatten()
                .collect();
            results.extend(chunks);
        }
    }
    Ok(results)
}

/// Récupère les chunks d'un document via la table normale document_chunks (fiable, sans FTS5).
/// Retourne les `limit` premiers chunks triés par numéro de page.
#[command]
pub fn get_document_chunks(
    doc_id: i64,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<ChunkResult>, String> {
    let conn = state.0.lock().unwrap();
    let sql = format!(
        "SELECT c.doc_id, d.name, c.page_num, c.chunk_text
         FROM document_chunks c
         JOIN documents d ON d.id = c.doc_id
         WHERE c.doc_id = ?1
         ORDER BY c.page_num
         LIMIT {}",
        limit
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([doc_id], |row| {
            Ok(ChunkResult {
                doc_id: row.get(0)?,
                doc_name: row.get(1)?,
                page_num: row.get(2)?,
                chunk_text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Liste tous les documents indexés
#[command]
pub fn list_documents(state: State<'_, DbState>) -> Result<Vec<DocumentMeta>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, total_pages, created_at FROM documents ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([], |row| {
            Ok(DocumentMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                total_pages: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Supprime un document et tous ses chunks de l'index FTS5
#[command]
pub fn delete_document(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM document_chunks_fts WHERE CAST(doc_id AS INTEGER) = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
