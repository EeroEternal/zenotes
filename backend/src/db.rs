use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::time::Duration;

pub async fn init_pool(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
        .expect("Failed to connect to PostgreSQL")
}

pub async fn run_migrations(pool: &PgPool) {
    let sql_notes = include_str!("../migrations/001_create_notes.sql");
    sqlx::raw_sql(sql_notes)
        .execute(pool)
        .await
        .expect("Failed to run notes migration");

    let sql_users = include_str!("../migrations/002_create_users.sql");
    sqlx::raw_sql(sql_users)
        .execute(pool)
        .await
        .expect("Failed to run users migration");
    log::info!("Database migrations applied successfully");
}
