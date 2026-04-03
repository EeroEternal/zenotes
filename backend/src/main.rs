mod db;
mod handlers;
mod models;

use actix_cors::Cors;
use actix_web::{middleware, web, App, HttpResponse, HttpServer};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    dotenvy::dotenv().ok();
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env or environment");
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse()
        .expect("PORT must be a number");

    let pool = db::init_pool(&database_url).await;
    db::run_migrations(&pool).await;

    log::info!("API listening on http://{}:{}", host, port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .app_data(web::Data::new(pool.clone()))
            .route("/api/notes", web::get().to(handlers::list_notes))
            .route("/api/notes", web::post().to(handlers::create_note))
            .route("/api/notes/{id}", web::patch().to(handlers::update_note))
            .route("/api/notes/{id}", web::delete().to(handlers::delete_note))
            .route("/api/notes/reorder", web::post().to(handlers::reorder_notes))
            .route("/api/health", web::get().to(health))
    })
    .bind((host.as_str(), port))?
    .run()
    .await
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
}
