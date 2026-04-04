use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct NoteRow {
    pub id: Uuid,
    pub title: Option<String>,
    pub content: String,
    pub color: String,
    pub tags: serde_json::Value,
    pub pinned: bool,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteResponse {
    pub id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub content: String,
    pub color: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<NoteRow> for NoteResponse {
    fn from(row: NoteRow) -> Self {
        let tags: Vec<String> = serde_json::from_value(row.tags).unwrap_or_default();
        Self {
            id: row.id,
            title: row.title,
            content: row.content,
            color: row.color,
            tags,
            pinned: row.pinned,
            position: row.position,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub color: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderRequest {
    pub pinned: bool,
    pub ordered_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserRow {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub password_hash: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: i64,
    pub username: String,
    pub email: String,
}
