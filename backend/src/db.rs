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
    let sql = include_str!("../migrations/001_create_notes.sql");
    sqlx::raw_sql(sql)
        .execute(pool)
        .await
        .expect("Failed to run migrations");
    log::info!("Database migrations applied successfully");
}
