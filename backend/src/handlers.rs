use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::*;

pub async fn list_notes(pool: web::Data<PgPool>) -> HttpResponse {
    let rows = sqlx::query_as::<_, NoteRow>(
        "SELECT * FROM notes ORDER BY pinned DESC, position ASC, updated_at DESC",
    )
    .fetch_all(pool.get_ref())
    .await;

    match rows {
        Ok(rows) => {
            let notes: Vec<NoteResponse> = rows.into_iter().map(NoteResponse::from).collect();
            HttpResponse::Ok().json(notes)
        }
        Err(e) => {
            log::error!("Failed to fetch notes: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({"error": "fetch_failed"}))
        }
    }
}

pub async fn create_note(
    pool: web::Data<PgPool>,
    body: web::Json<CreateNoteRequest>,
) -> HttpResponse {
    let title = body.title.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let content = body.content.as_deref().map(|s| s.trim()).unwrap_or("");

    if title.is_none() && content.is_empty() {
        return HttpResponse::BadRequest()
            .json(serde_json::json!({"error": "content_or_title_required"}));
    }

    let color = body.color.as_deref().unwrap_or("white");
    let tags = serde_json::to_value(body.tags.as_deref().unwrap_or(&[])).unwrap();

    // Get max position for unpinned notes
    let max_pos: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position), 0) FROM notes WHERE pinned = false",
    )
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    let id = Uuid::new_v4();
    let position = max_pos + 1;

    let result = sqlx::query_as::<_, NoteRow>(
        r#"INSERT INTO notes (id, title, content, color, tags, pinned, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, false, $6, now(), now())
           RETURNING *"#,
    )
    .bind(id)
    .bind(title)
    .bind(content)
    .bind(color)
    .bind(&tags)
    .bind(position)
    .fetch_one(pool.get_ref())
    .await;

    match result {
        Ok(row) => HttpResponse::Created().json(NoteResponse::from(row)),
        Err(e) => {
            log::error!("Failed to create note: {}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "create_failed"}))
        }
    }
}

pub async fn update_note(
    pool: web::Data<PgPool>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateNoteRequest>,
) -> HttpResponse {
    let id = path.into_inner();

    // Fetch existing note
    let existing = sqlx::query_as::<_, NoteRow>("SELECT * FROM notes WHERE id = $1")
        .bind(id)
        .fetch_optional(pool.get_ref())
        .await;

    let existing = match existing {
        Ok(Some(row)) => row,
        Ok(None) => {
            return HttpResponse::NotFound().json(serde_json::json!({"error": "not_found"}))
        }
        Err(e) => {
            log::error!("Failed to fetch note: {}", e);
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "fetch_failed"}));
        }
    };

    let new_pinned = body.pinned.unwrap_or(existing.pinned);

    // If pinned state changed, move to end of that group
    let new_position = if new_pinned != existing.pinned {
        let max_pos: i32 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(position), 0) FROM notes WHERE pinned = $1",
        )
        .bind(new_pinned)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);
        max_pos + 1
    } else {
        existing.position
    };

    let new_title = match &body.title {
        Some(t) => {
            let trimmed = t.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        }
        None => existing.title.clone(),
    };

    let new_content = match &body.content {
        Some(c) => c.trim().to_string(),
        None => existing.content.clone(),
    };

    let new_color = body.color.as_deref().unwrap_or(&existing.color).to_string();

    let new_tags = match &body.tags {
        Some(tags) => serde_json::to_value(tags).unwrap(),
        None => existing.tags.clone(),
    };

    let result = sqlx::query_as::<_, NoteRow>(
        r#"UPDATE notes
           SET title = $1, content = $2, color = $3, tags = $4, pinned = $5, position = $6, updated_at = now()
           WHERE id = $7
           RETURNING *"#,
    )
    .bind(&new_title)
    .bind(&new_content)
    .bind(&new_color)
    .bind(&new_tags)
    .bind(new_pinned)
    .bind(new_position)
    .bind(id)
    .fetch_one(pool.get_ref())
    .await;

    match result {
        Ok(row) => HttpResponse::Ok().json(NoteResponse::from(row)),
        Err(e) => {
            log::error!("Failed to update note: {}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "update_failed"}))
        }
    }
}

pub async fn delete_note(pool: web::Data<PgPool>, path: web::Path<Uuid>) -> HttpResponse {
    let id = path.into_inner();

    let result = sqlx::query("DELETE FROM notes WHERE id = $1")
        .bind(id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => HttpResponse::NoContent().finish(),
        Err(e) => {
            log::error!("Failed to delete note: {}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "delete_failed"}))
        }
    }
}

pub async fn reorder_notes(
    pool: web::Data<PgPool>,
    body: web::Json<ReorderRequest>,
) -> HttpResponse {
    let mut tx = match pool.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            log::error!("Failed to begin transaction: {}", e);
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "transaction_failed"}));
        }
    };

    for (idx, id) in body.ordered_ids.iter().enumerate() {
        let result = sqlx::query(
            "UPDATE notes SET position = $1 WHERE id = $2 AND pinned = $3",
        )
        .bind((idx + 1) as i32)
        .bind(id)
        .bind(body.pinned)
        .execute(&mut *tx)
        .await;

        if let Err(e) = result {
            log::error!("Failed to reorder note {}: {}", id, e);
            let _ = tx.rollback().await;
            return HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "reorder_failed"}));
        }
    }

    match tx.commit().await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({"ok": true})),
        Err(e) => {
            log::error!("Failed to commit reorder: {}", e);
            HttpResponse::InternalServerError()
                .json(serde_json::json!({"error": "commit_failed"}))
        }
    }
}
