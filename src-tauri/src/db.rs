use rusqlite::Connection;
use std::path::Path;

/// Ouvre (ou crée) la base SQLite et applique les migrations.
pub fn init(path: &str) -> rusqlite::Result<Connection> {
    if let Some(parent) = Path::new(path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

/// Applique les migrations nécessaires (idempotent).
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS accounts (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            code   TEXT NOT NULL,
            name   TEXT NOT NULL,
            debit  REAL NOT NULL DEFAULT 0,
            credit REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );
        "#,
    )
}

/// Retourne une connexion à la base, à partir de l'état global.
pub fn connection() -> rusqlite::Result<Connection> {
    let path = crate::DB_PATH
        .lock()
        .map_err(|_| rusqlite::Error::InvalidQuery)?
        .clone();
    match path {
        Some(p) => Connection::open(&p),
        None => Err(rusqlite::Error::InvalidQuery),
    }
}
