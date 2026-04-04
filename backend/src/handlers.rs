use actix_web::{
    cookie::{time::Duration, Cookie, SameSite},
    web, HttpRequest, HttpResponse,
};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::*;

const SESSION_COOKIE_NAME: &str = "mynotes_session";

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

fn session_cookie(user_id: i64) -> Cookie<'static> {
    Cookie::build(SESSION_COOKIE_NAME, user_id.to_string())
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::days(7))
        .finish()
}

fn session_clear_cookie() -> Cookie<'static> {
    Cookie::build(SESSION_COOKIE_NAME, "")
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(0))
        .finish()
}

fn session_user_id(req: &HttpRequest) -> Option<i64> {
    req.cookie(SESSION_COOKIE_NAME)
        .and_then(|c| c.value().parse::<i64>().ok())
}

pub async fn register(
    pool: web::Data<PgPool>,
    body: web::Json<RegisterRequest>,
) -> HttpResponse {
    let username = body.username.trim();
    let email = body.email.trim();
    let password = body.password.as_str();

    if username.len() < 3 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "用户名至少3个字符" }));
    }
    if password.len() < 6 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "密码至少6个字符" }));
    }
    if !email.contains('@') {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "邮箱格式不正确" }));
    }

    let existing: Result<Option<(i64,)>, sqlx::Error> =
        sqlx::query_as("SELECT id FROM users WHERE username = $1 OR email = $2")
            .bind(username)
            .bind(email)
            .fetch_optional(pool.get_ref())
            .await;

    let existing = match existing {
        Ok(value) => value,
        Err(e) => {
            log::error!("Failed to check existing user: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({ "error": "register_failed" }));
        }
    };

    if existing.is_some() {
        return HttpResponse::Conflict().json(serde_json::json!({ "error": "User already exists" }));
    }

    let password_hash = hash_password(password);
    let inserted: Result<(i64, String, String), sqlx::Error> = sqlx::query_as(
        r#"INSERT INTO users (username, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, username, email"#,
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .fetch_one(pool.get_ref())
    .await;

    match inserted {
        Ok((id, username, email)) => HttpResponse::Ok()
            .cookie(session_cookie(id))
            .json(UserResponse { id, username, email }),
        Err(e) => {
            log::error!("Failed to register user: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({ "error": "register_failed" }))
        }
    }
}

pub async fn login(
    pool: web::Data<PgPool>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    let username = body.username.trim();
    let password_hash = hash_password(body.password.as_str());

    let user: Result<Option<UserRow>, sqlx::Error> = sqlx::query_as(
        "SELECT id, username, email, password_hash FROM users WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(pool.get_ref())
    .await;

    let user = match user {
        Ok(value) => value,
        Err(e) => {
            log::error!("Failed to login user: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({ "error": "login_failed" }));
        }
    };

    let user = match user {
        Some(value) => value,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Invalid credentials" })),
    };

    if user.password_hash != password_hash {
        return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Invalid credentials" }));
    }

    HttpResponse::Ok()
        .cookie(session_cookie(user.id))
        .json(UserResponse {
            id: user.id,
            username: user.username,
            email: user.email,
        })
}

pub async fn logout() -> HttpResponse {
    HttpResponse::Ok()
        .cookie(session_clear_cookie())
        .json(serde_json::json!({ "message": "已退出登录" }))
}

pub async fn me(
    req: HttpRequest,
    pool: web::Data<PgPool>,
) -> HttpResponse {
    let user_id = match session_user_id(&req) {
        Some(value) => value,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Unauthorized" })),
    };

    let user: Result<Option<(i64, String, String)>, sqlx::Error> =
        sqlx::query_as("SELECT id, username, email FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(pool.get_ref())
            .await;

    match user {
        Ok(Some((id, username, email))) => HttpResponse::Ok().json(UserResponse { id, username, email }),
        Ok(None) => HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Unauthorized" })),
        Err(e) => {
            log::error!("Failed to fetch current user: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({ "error": "me_failed" }))
        }
    }
}

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
