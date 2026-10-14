use rusqlite::params;

use crate::db;
use crate::export;
use crate::import;
use crate::models::{Account, AccountInput, AccountUpdate, ImportRow, Settings};
use crate::pdf;

// Balance témoin SYSCOHADA — jeu d'exemple ÉQUILIBRÉ et cohérent.
//
// Une balance générale doit toujours vérifier : Total Débit = Total Crédit
// (contrepartie de la partie double), et Actif = Passif au bilan.
//
// Ici : Débit = Crédit = 127 500 000 F.
//   Actif  = 79 500 000 F (immo nettes 40M + stocks 8M + clients 14M + trésorerie 17,5M)
//   Passif = 79 500 000 F (capitaux 45M + emprunts 15M + fournisseurs 9,5M + résultat 10M)
// Le résultat de l'exercice (10 000 000 F) ressort de l'activité
// (produits 55M − charges 45M) et est intégré au passif.
const SAMPLE_ACCOUNTS: &[(&str, &str, f64, f64)] = &[
    // Classe 1 — Capitaux propres et dettes financières
    ("1011", "Capital social", 0.0, 40_000_000.0),
    ("1110", "Réserve légale", 0.0, 5_000_000.0),
    ("1610", "Emprunts et dettes financières", 0.0, 15_000_000.0),
    // Classe 2 — Immobilisations
    ("2210", "Terrains", 25_000_000.0, 0.0),
    ("2410", "Matériel et mobilier", 18_000_000.0, 0.0),
    ("2821", "Amortissements des immobilisations", 0.0, 3_000_000.0),
    // Classe 3 — Stocks
    ("3110", "Marchandises", 8_000_000.0, 0.0),
    // Classe 4 — Tiers
    ("4110", "Clients", 14_000_000.0, 0.0),
    ("4010", "Fournisseurs d'exploitation", 0.0, 9_500_000.0),
    // Classe 5 — Trésorerie
    ("5210", "Banques", 16_000_000.0, 0.0),
    ("5710", "Caisse", 1_500_000.0, 0.0),
    // Classe 6 — Charges
    ("6011", "Achats de marchandises", 35_000_000.0, 0.0),
    ("6110", "Transports", 2_000_000.0, 0.0),
    ("6610", "Charges de personnel", 8_000_000.0, 0.0),
    // Classe 7 — Produits
    ("7011", "Ventes de marchandises", 0.0, 55_000_000.0),
];

const DEFAULT_SETTINGS: Settings = Settings {
    company: String::new(),
    nif: String::new(),
    country: String::new(),
    closing_date: String::new(),
};

fn row_to_account(row: &rusqlite::Row) -> rusqlite::Result<Account> {
    Ok(Account {
        id: row.get(0)?,
        code: row.get(1)?,
        name: row.get(2)?,
        debit: row.get(3)?,
        credit: row.get(4)?,
    })
}

/// Récupère l'ensemble des comptes de la balance.
#[tauri::command]
pub fn get_accounts() -> Result<Vec<Account>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, code, name, debit, credit FROM accounts ORDER BY code ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_account)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Ajoute un compte et retourne la liste mise à jour.
#[tauri::command]
pub fn add_account(input: AccountInput) -> Result<Vec<Account>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO accounts (code, name, debit, credit) VALUES (?1, ?2, ?3, ?4)",
        params![input.code, input.name, input.debit, input.credit],
    )
    .map_err(|e| e.to_string())?;
    list_all(&conn)
}

/// Supprime un compte par son identifiant.
#[tauri::command]
pub fn delete_account(id: i64) -> Result<Vec<Account>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    list_all(&conn)
}

/// Modifie un compte existant (code, intitulé, soldes) en place.
#[tauri::command]
pub fn update_account(input: AccountUpdate) -> Result<Vec<Account>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let affected = conn
        .execute(
            "UPDATE accounts SET code = ?2, name = ?3, debit = ?4, credit = ?5 WHERE id = ?1",
            params![input.id, input.code, input.name, input.debit, input.credit],
        )
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("Aucun compte avec l'identifiant {}.", input.id));
    }
    list_all(&conn)
}

/// Lit un fichier de balance (CSV, TSV ou .xlsx) choisi par l'utilisateur
/// et retourne les lignes analysées, sans écrire en base.
///
/// Le frontend affiche une prévisualisation, puis confirme via
/// `import_accounts`.
#[tauri::command]
pub fn parse_balance_file(path: String) -> Result<Vec<ImportRow>, String> {
    import::parse_balance_file(&path)
}

/// Importe des lignes de balance (issues d'un CSV ou d'un tableur).
///
/// - `replace` à `true` : la balance est vidée avant l'import ;
/// - sinon les lignes sont fusionnées : si un code existe déjà, son
///   intitulé et ses soldes sont mis à jour, sinon le compte est créé.
#[tauri::command]
pub fn import_accounts(rows: Vec<ImportRow>, replace: bool) -> Result<Vec<Account>, String> {
    let mut conn = db::connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    if replace {
        tx.execute("DELETE FROM accounts", [])
            .map_err(|e| e.to_string())?;
    }
    for row in rows {
        let code = row.code.trim();
        if code.is_empty() {
            continue;
        }
        let updated = tx
            .execute(
                "UPDATE accounts SET name = ?2, debit = ?3, credit = ?4 WHERE code = ?1",
                params![code, row.name, row.debit, row.credit],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            tx.execute(
                "INSERT INTO accounts (code, name, debit, credit) VALUES (?1, ?2, ?3, ?4)",
                params![code, row.name, row.debit, row.credit],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    list_all(&conn)
}

/// Vide entièrement la balance.
#[tauri::command]
pub fn clear_accounts() -> Result<Vec<Account>, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM accounts", [])
        .map_err(|e| e.to_string())?;
    list_all(&conn)
}

/// Recharge la balance témoin SYSCOHADA (remplace le contenu actuel).
#[tauri::command]
pub fn load_sample_data() -> Result<Vec<Account>, String> {
    let mut conn = db::connection().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM accounts", [])
        .map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare("INSERT INTO accounts (code, name, debit, credit) VALUES (?1, ?2, ?3, ?4)")
            .map_err(|e| e.to_string())?;
        for (code, name, debit, credit) in SAMPLE_ACCOUNTS {
            stmt.execute(params![code, name, debit, credit])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    list_all(&conn)
}

/// Retourne les paramètres de l'entreprise.
#[tauri::command]
pub fn get_settings() -> Result<Settings, String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let mut settings = DEFAULT_SETTINGS.clone();
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        match k.as_str() {
            "company" => settings.company = v,
            "nif" => settings.nif = v,
            "country" => settings.country = v,
            "closing_date" => settings.closing_date = v,
            _ => {}
        }
    }
    Ok(settings)
}

/// Sauvegarde les paramètres de l'entreprise.
#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let conn = db::connection().map_err(|e| e.to_string())?;
    let pairs = [
        ("company", settings.company),
        ("nif", settings.nif),
        ("country", settings.country),
        ("closing_date", settings.closing_date),
    ];
    for (k, v) in pairs {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn list_all(conn: &rusqlite::Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare("SELECT id, code, name, debit, credit FROM accounts ORDER BY code ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_account)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Exporte le rapport DSF complet (classeur Excel) vers `path`.
///
/// Le classeur contient : Synthèse, Balance Générale, les trois vues de la
/// matrice d'intégration, les Notes Annexes et les Contrôles d'équilibre.
#[tauri::command]
pub fn export_dsf_report(path: String) -> Result<String, String> {
    let accounts = get_accounts()?;
    let settings = get_settings()?;
    export::write_workbook(&path, &accounts, &settings)?;
    Ok(path)
}

/// Exporte le rapport DSF au format PDF (document mis en page).
#[tauri::command]
pub fn export_dsf_pdf(path: String) -> Result<String, String> {
    let accounts = get_accounts()?;
    let settings = get_settings()?;
    pdf::write_pdf(&path, &accounts, &settings)?;
    Ok(path)
}
