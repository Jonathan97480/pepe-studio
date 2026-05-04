//! Gestion des conversations, messages, projets et profil utilisateur (user_facts).

use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{command, State};

use super::DbState;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MsgResult {
    pub conversation_id: i64,
    pub day_label: String,
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConversationItem {
    pub id: i64,
    pub title: String,
    pub model_name: String,
    pub created_at: String,
    pub message_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
    pub image_path: Option<String>,
    pub display_only: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UserFact {
    pub key: String,
    pub value: String,
}

// ─── Commandes conversations ──────────────────────────────────────────────────

/// Démarre une nouvelle conversation et retourne son id.
#[command]
pub fn start_conversation(model_name: String, state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO conversations (model_name) VALUES (?1)",
        params![model_name],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/// Sauvegarde un message dans une conversation.
/// Si c'est le premier message utilisateur, définit automatiquement le titre de la conversation.
#[command]
pub fn save_message(
    conversation_id: i64,
    role: String,
    content: String,
    image_path: Option<String>,
    display_only: Option<bool>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, image_path, display_only) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            conversation_id,
            role,
            content,
            image_path,
            if display_only.unwrap_or(false) { 1 } else { 0 }
        ],
    )
    .map_err(|e| e.to_string())?;
    // Auto-titre : premier message user → titre de la conv
    if role == "user" {
        let has_title: bool = conn
            .query_row(
                "SELECT title IS NOT NULL AND title != '' FROM conversations WHERE id = ?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !has_title {
            let title: String = content.chars().take(60).collect();
            conn.execute(
                "UPDATE conversations SET title = ?1 WHERE id = ?2",
                params![title, conversation_id],
            )
            .ok();
        }
    }
    Ok(())
}

/// Sauvegarde un message avec sa version compressée (Pepe-Compressor).
/// - `content`            : texte brut affiché dans l'UI
/// - `compressed_content` : version réduite envoyée au modèle / indexée pour le RAG
/// - `meta_tag`           : résumé sémantique (ex: "[Erreur|Log: npm install failed]")
#[command]
pub fn save_message_compressed(
    conversation_id: i64,
    role: String,
    content: String,
    compressed_content: String,
    meta_tag: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content, compressed_content, meta_tag)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![conversation_id, role, content, compressed_content, meta_tag],
    )
    .map_err(|e| e.to_string())?;
    // Auto-titre : premier message user → titre de la conv
    if role == "user" {
        let has_title: bool = conn
            .query_row(
                "SELECT title IS NOT NULL AND title != '' FROM conversations WHERE id = ?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !has_title {
            let title: String = content.chars().take(60).collect();
            conn.execute(
                "UPDATE conversations SET title = ?1 WHERE id = ?2",
                params![title, conversation_id],
            )
            .ok();
        }
    }
    Ok(())
}

/// Retourne les messages d'une conversation avec leur version compressée.
/// Utilisé par le RAG pour construire le contexte compact.
#[command]
pub fn get_compressed_messages(
    conversation_id: i64,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    // Utilise compressed_content si disponible, sinon content (rétro-compat)
    let mut stmt = conn
        .prepare(
            "SELECT conversation_id,
                    CASE
                        WHEN date(created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', created_at)
                    END,
                    role,
                    CASE WHEN compressed_content != '' THEN compressed_content ELSE content END
             FROM messages
             WHERE conversation_id = ?1
             ORDER BY id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id, limit as i64], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(rows)
}

/// Recherche dans les meta-tags des messages pour retrouver un contexte compressé.
/// Utilisé par le RAG sémantique pour répondre aux questions sur l'historique.
#[command]
pub fn search_meta_tags(
    query: String,
    limit: usize,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    let pattern = format!("%{}%", query.trim().to_lowercase());
    let mut stmt = conn
        .prepare(
            "SELECT m.conversation_id,
                    strftime('%d/%m/%Y', m.created_at),
                    m.role,
                    CASE WHEN m.compressed_content != '' THEN m.compressed_content ELSE SUBSTR(m.content, 1, 300) END
             FROM messages m
             WHERE LOWER(m.meta_tag) LIKE ?1
                OR LOWER(m.compressed_content) LIKE ?1
             ORDER BY m.id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![pattern, limit as i64], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(rows)
}

/// Inclut les 4 premiers messages de chaque conv so le LLM sait déjà de quoi on a parlé.
#[command]
pub fn get_conversations_summary(state: State<'_, DbState>) -> Result<String, String> {
    let conn = state.0.lock().unwrap();

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
        .unwrap_or(0);

    if total == 0 {
        return Ok(String::new());
    }

    // 8 dernières conversations non-vides
    let mut stmt = conn
        .prepare(
            "SELECT c.id,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id)
             FROM conversations c
             WHERE (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) > 0
             ORDER BY c.id DESC
             LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let conv_ids: Vec<(i64, String, i64)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();

    if conv_ids.is_empty() {
        return Ok(String::new());
    }

    let mut lines = vec![format!(
        "[Mémoire — {} conversation(s) au total. Aperçu des plus récentes :]",
        total
    )];

    for (id, day_label, msg_count) in &conv_ids {
        lines.push(format!(
            "── Conv #{} — {} ({} messages) ──",
            id, day_label, msg_count
        ));

        let mut msg_stmt = conn
            .prepare(
                "SELECT role, SUBSTR(content, 1, 200) FROM messages
                 WHERE conversation_id = ?1
                 ORDER BY id ASC LIMIT 4",
            )
            .map_err(|e| e.to_string())?;

        let msgs: Vec<(String, String)> = msg_stmt
            .query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();

        for (role, content) in &msgs {
            let label = if role == "user" { "👤" } else { "🤖" };
            let truncated: String = content.chars().take(150).collect();
            let display = if content.chars().count() > 150 {
                format!("{}…", truncated)
            } else {
                truncated
            };
            lines.push(format!("  {} {}", label, display));
        }
    }

    lines.push(String::new());
    lines.push("── Outils mémoire ──".to_string());
    lines.push(
        "  Tout parcourir (sans mot-clé) : <tool>{\"search_conversation\": \"*\"}</tool>"
            .to_string(),
    );
    lines.push(
        "  Conv complète par id          : <tool>{\"search_conversation\": \"#3\"}</tool>"
            .to_string(),
    );
    lines.push(
        "  Chercher un sujet             : <tool>{\"search_conversation\": \"python\"}</tool>"
            .to_string(),
    );

    Ok(lines.join("\n"))
}

/// Recherche dans les messages de toutes les conversations.
/// - Query vide ou "*"  → 5 convs récentes complètes
/// - "#N"              → tous les messages de la conversation N
/// - mot clé           → LIKE insensible à la casse
#[command]
pub fn search_conversation_messages(
    query: String,
    state: State<'_, DbState>,
) -> Result<Vec<MsgResult>, String> {
    let conn = state.0.lock().unwrap();
    let q = query.trim();

    // ── Tout parcourir : query vide ou "*" ────────────────────────────────────
    if q.is_empty() || q == "*" {
        let mut stmt = conn
            .prepare(
                "SELECT m.conversation_id,
                        CASE
                            WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                            WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                            ELSE strftime('%d/%m/%Y', c.created_at)
                        END,
                        m.role, SUBSTR(m.content, 1, 200) as content
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                 WHERE m.id IN (
                     SELECT id FROM messages
                     WHERE conversation_id IN (
                         SELECT id FROM conversations
                         WHERE (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) > 0
                         ORDER BY id DESC LIMIT 3
                     )
                     ORDER BY conversation_id DESC, id ASC
                 )
                 ORDER BY m.conversation_id DESC, m.id ASC
                 LIMIT 18",
            )
            .map_err(|e| e.to_string())?;
        let results: Vec<MsgResult> = stmt
            .query_map([], |row| {
                Ok(MsgResult {
                    conversation_id: row.get(0)?,
                    day_label: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        return Ok(results);
    }

    // ── Par id : "#N" ─────────────────────────────────────────────────────────
    if let Some(id_str) = q.strip_prefix('#') {
        if let Ok(conv_id) = id_str.trim().parse::<i64>() {
            let mut stmt = conn
                .prepare(
                    "SELECT m.conversation_id,
                            CASE
                                WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                                WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                                ELSE strftime('%d/%m/%Y', c.created_at)
                            END,
                            m.role, m.content
                     FROM messages m
                     JOIN conversations c ON c.id = m.conversation_id
                     WHERE m.conversation_id = ?1
                     ORDER BY m.id ASC
                     LIMIT 60",
                )
                .map_err(|e| e.to_string())?;
            let results: Vec<MsgResult> = stmt
                .query_map([conv_id], |row| {
                    Ok(MsgResult {
                        conversation_id: row.get(0)?,
                        day_label: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .flatten()
                .collect();
            return Ok(results);
        }
    }

    // ── Par mot clé LIKE (insensible à la casse) ──────────────────────────────
    let pattern = format!("%{}%", q);
    let mut stmt = conn
        .prepare(
            "SELECT m.conversation_id,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END,
                    m.role,
                    SUBSTR(m.content, 1, 400) as content
             FROM messages m
             JOIN conversations c ON c.id = m.conversation_id
             WHERE LOWER(m.content) LIKE LOWER(?1)
             ORDER BY m.id DESC
             LIMIT 25",
        )
        .map_err(|e| e.to_string())?;
    let results: Vec<MsgResult> = stmt
        .query_map([&pattern], |row| {
            Ok(MsgResult {
                conversation_id: row.get(0)?,
                day_label: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Liste toutes les conversations ayant au moins un message, triées par id DESC.
#[command]
pub fn list_conversations(state: State<'_, DbState>) -> Result<Vec<ConversationItem>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT c.id,
                    COALESCE(NULLIF(c.title, ''), 'Nouvelle conversation') as title,
                    c.model_name,
                    CASE
                        WHEN date(c.created_at) = date('now') THEN 'Aujourd''hui'
                        WHEN date(c.created_at) = date('now', '-1 day') THEN 'Hier'
                        WHEN date(c.created_at) >= date('now', '-7 days') THEN '7 derniers jours'
                        ELSE strftime('%d/%m/%Y', c.created_at)
                    END as created_at,
                    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
             FROM conversations c
             WHERE message_count > 0
             ORDER BY c.id DESC
             LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let results: Vec<ConversationItem> = stmt
        .query_map([], |row| {
            Ok(ConversationItem {
                id: row.get(0)?,
                title: row.get(1)?,
                model_name: row.get(2)?,
                created_at: row.get(3)?,
                message_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Charge tous les messages d'une conversation donnée.
#[command]
pub fn load_conversation_messages(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<Vec<ConversationMessage>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT role, content, image_path, display_only FROM messages WHERE conversation_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;
    let results: Vec<ConversationMessage> = stmt
        .query_map([conversation_id], |row| {
            let display_only_flag: i64 = row.get(3)?;
            Ok(ConversationMessage {
                role: row.get(0)?,
                content: row.get(1)?,
                image_path: row.get(2)?,
                display_only: display_only_flag != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Supprime un message image persisté dans une conversation.
#[command]
pub fn delete_image_message(
    conversation_id: i64,
    image_path: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM messages WHERE conversation_id = ?1 AND image_path = ?2",
        params![conversation_id, image_path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime une conversation et tous ses messages (CASCADE via FK).
#[command]
pub fn delete_conversation(conversation_id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Renomme une conversation (titre généré par le LLM).
#[command]
pub fn rename_conversation(
    conversation_id: i64,
    title: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET title = ?1 WHERE id = ?2",
        params![title.trim(), conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime toutes les conversations et leurs messages.
#[command]
pub fn delete_all_conversations(state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM messages", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM conversations", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Sauvegarde ou met à jour la structure de projet d'une conversation.
#[command]
pub fn save_project_structure(
    conversation_id: i64,
    structure: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET project_structure = ?1 WHERE id = ?2",
        params![structure, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Retourne la structure de projet stockée pour une conversation.
#[command]
pub fn get_project_structure(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let result: String = conn
        .query_row(
            "SELECT COALESCE(project_structure, '') FROM conversations WHERE id = ?1",
            params![conversation_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    Ok(result)
}

/// Sauvegarde ou met à jour le plan (PLAN.md) d'une conversation.
#[command]
pub fn save_conversation_plan(
    conversation_id: i64,
    content: String,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "UPDATE conversations SET plan_content = ?1 WHERE id = ?2",
        params![content, conversation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(format!(
        "✅ Plan sauvegardé pour la conversation #{}",
        conversation_id
    ))
}

/// Retourne le plan stocké pour une conversation.
#[command]
pub fn get_conversation_plan(
    conversation_id: i64,
    state: State<'_, DbState>,
) -> Result<String, String> {
    let conn = state.0.lock().unwrap();
    let result: String = conn
        .query_row(
            "SELECT COALESCE(plan_content, '') FROM conversations WHERE id = ?1",
            params![conversation_id],
            |r| r.get(0),
        )
        .unwrap_or_default();
    Ok(result)
}

// ─── Profil utilisateur (user_facts) ─────────────────────────────────────────

/// Retourne toutes les entrées du profil utilisateur.
#[command]
pub fn get_user_facts(state: State<'_, DbState>) -> Result<Vec<UserFact>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT key, value FROM user_facts ORDER BY key ASC")
        .map_err(|e| e.to_string())?;
    let results = stmt
        .query_map([], |r| {
            Ok(UserFact {
                key: r.get(0)?,
                value: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    Ok(results)
}

/// Insère ou met à jour une entrée du profil utilisateur (upsert).
#[command]
pub fn set_user_fact(key: String, value: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT INTO user_facts (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key.trim(), value.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime une entrée du profil utilisateur.
#[command]
pub fn delete_user_fact(key: String, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM user_facts WHERE key = ?1", params![key.trim()])
        .map_err(|e| e.to_string())?;
    Ok(())
}
