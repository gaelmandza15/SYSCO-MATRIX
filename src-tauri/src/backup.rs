use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db;
use crate::models::{Account, Settings};

/// Nombre maximum de points de restauration conservés en base.
pub const MAX_SNAPSHOTS: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: i64,
    pub label: String,
    pub created_at: String,
    pub account_count: i64,
}

fn snapshot_sql() -> &'static str {
    "CREATE TABLE IF NOT EXISTS snapshots (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at    TEXT NOT NULL,
        label         TEXT NOT NULL,
        accounts_json TEXT NOT NULL,
        settings_json TEXT NOT NULL
    );"
}

/// Applique la migration « snapshots » (idempotent).
pub fn migrate(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(snapshot_sql())
}

/// Sérialise l'état courant (comptes + paramètres) en JSON.
fn current_state_json(conn: &rusqlite::Connection) -> Result<(String, String), String> {
    let mut stmt = conn
        .prepare("SELECT id, code, name, debit, credit FROM accounts ORDER BY code ASC, id ASC")
        .map_err(|e| e.to_string())?;
    let accounts: Vec<Account> = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                debit: row.get(3)?,
                credit: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut sstmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let mut settings = Settings::default();
    let rows = sstmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        match k.as_str() {
            "company" => settings.company = v,
            "nif" => settings.nif = v,
            "country" => settings.country = v,
            "closing_date" => settings.closing_date = v,
            _ => {}
        }
    }

    let accounts_json = serde_json::to_string(&accounts).map_err(|e| e.to_string())?;
    let settings_json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    Ok((accounts_json, settings_json))
}

/// Enregistre un point de restauration de l'état courant.
pub fn create_snapshot(label: &str) -> Result<i64, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let (accounts_json, settings_json) = current_state_json(&conn)?;
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let label = if label.trim().is_empty() {
        "Point de restauration"
    } else {
        label.trim()
    };
    conn.execute(
        "INSERT INTO snapshots (created_at, label, accounts_json, settings_json) VALUES (?1, ?2, ?3, ?4)",
        params![created_at, label, accounts_json, settings_json],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();

    // Purge : on garde les MAX_SNAPSHOTS plus récents.
    conn.execute(
        "DELETE FROM snapshots WHERE id NOT IN (
            SELECT id FROM snapshots ORDER BY id DESC LIMIT ?1
        )",
        params![MAX_SNAPSHOTS as i64],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Liste les points de restauration disponibles (les plus récents d'abord).
pub fn list_snapshots() -> Result<Vec<SnapshotMeta>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, label, created_at,
                    CAST(json_array_length(accounts_json) AS INTEGER)
             FROM snapshots ORDER BY id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SnapshotMeta {
                id: row.get(0)?,
                label: row.get(1)?,
                created_at: row.get(2)?,
                account_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Restaure l'état enregistré dans le snapshot `id`.
/// Retourne `{ accounts, settings }` pour resynchroniser le frontend.
pub fn restore_snapshot(id: i64) -> Result<serde_json::Value, String> {
    let mut conn = db::connection().map_err(|e| e.to_string())?;
    let (accounts_json, settings_json): (String, String) = conn
        .query_row(
            "SELECT accounts_json, settings_json FROM snapshots WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("Aucun point de restauration avec l'identifiant {id}."))?;

    let accounts: Vec<Account> =
        serde_json::from_str(&accounts_json).map_err(|e| format!("Snapshot corrompu : {e}"))?;
    let settings: Settings =
        serde_json::from_str(&settings_json).map_err(|e| format!("Snapshot corrompu : {e}"))?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM accounts", []).map_err(|e| e.to_string())?;
    for a in &accounts {
        tx.execute(
            "INSERT INTO accounts (id, code, name, debit, credit) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![a.id, a.code, a.name, a.debit, a.credit],
        )
        .map_err(|e| e.to_string())?;
    }
    let pairs = [
        ("company", &settings.company),
        ("nif", &settings.nif),
        ("country", &settings.country),
        ("closing_date", &settings.closing_date),
    ];
    for (k, v) in pairs {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "accounts": accounts, "settings": settings }))
}

/// Supprime un point de restauration.
pub fn delete_snapshot(id: i64) -> Result<(), String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM snapshots WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("Aucun point de restauration avec l'identifiant {id}."));
    }
    Ok(())
}

/// Exporte tous les snapshots au format JSON vers `path` (sauvegarde fichier).
pub fn export_backup(path: &str) -> Result<String, String> {
    let metas = list_snapshots()?;
    let conn = db::connection().map_err(|e| e.to_string())?;
    let mut full = Vec::new();
    for m in &metas {
        let (a, s): (String, String) = conn
            .query_row(
                "SELECT accounts_json, settings_json FROM snapshots WHERE id = ?1",
                params![m.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        full.push(serde_json::json!({
            "id": m.id,
            "label": m.label,
            "created_at": m.created_at,
            "accounts": serde_json::from_str::<Vec<Account>>(&a).unwrap_or_default(),
            "settings": serde_json::from_str::<Settings>(&s).unwrap_or_default(),
        }));
    }
    let doc = serde_json::json!({
        "app": "SYSC-MATRIX",
        "version": 1,
        "exported_at": chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        "snapshots": full,
    });
    let content = serde_json::to_string_pretty(&doc).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| format!("Écriture impossible : {e}"))?;
    Ok(path.to_string())
}

/// Importe des snapshots depuis un fichier JSON produit par `export_backup`
/// et les ajoute à l'historique existant (sans écraser les points courants).
/// Retourne le nombre de points restaurés.
pub fn import_backup(path: &str) -> Result<usize, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Lecture impossible : {e}"))?;
    let doc: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Fichier invalide : {e}"))?;
    let arr = doc
        .get("snapshots")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Fichier invalide : tableau « snapshots » absent.".to_string())?;

    let conn = db::connection().map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for item in arr {
        let accounts = item.get("accounts").cloned().unwrap_or_else(|| serde_json::json!([]));
        let settings = item
            .get("settings")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        let label = item
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("Sauvegarde importée")
            .to_string();
        let created_at = item
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let created_at = if created_at.is_empty() {
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
        } else {
            created_at
        };
        conn.execute(
            "INSERT INTO snapshots (created_at, label, accounts_json, settings_json) VALUES (?1, ?2, ?3, ?4)",
            params![
                created_at,
                label,
                accounts.to_string(),
                settings.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    // Purge après import aussi.
    conn.execute(
        "DELETE FROM snapshots WHERE id NOT IN (
            SELECT id FROM snapshots ORDER BY id DESC LIMIT ?1
        )",
        params![MAX_SNAPSHOTS as i64],
    )
    .map_err(|e| e.to_string())?;
    Ok(count)
}
