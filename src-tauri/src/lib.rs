mod accounting;
mod backup;
mod commands;
mod db;
mod dsf;
mod export;
mod import;
mod models;
mod pdf;

use std::sync::Mutex;
use tauri::Manager;

/// Chemin global de la base de données, initialisé au démarrage.
static DB_PATH: Mutex<Option<String>> = Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Résoudre le dossier de données applicatives (persistant, hors-ligne).
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let db_path = data_dir.join("sysc_matrix.db");
            let db_path_str = db_path.to_string_lossy().to_string();

            // Initialiser la base (tables + migrations).
            db::init(&db_path_str).map_err(|e| e.to_string())?;

            // Stocker le chemin pour les commandes.
            *DB_PATH.lock().unwrap() = Some(db_path_str);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_accounts,
            commands::add_account,
            commands::update_account,
            commands::parse_balance_file,
            commands::import_accounts,
            commands::delete_account,
            commands::clear_accounts,
            commands::get_settings,
            commands::save_settings,
            commands::export_dsf_report,
            commands::export_dsf_pdf,
            commands::create_snapshot,
            commands::list_snapshots,
            commands::restore_snapshot,
            commands::delete_snapshot,
            commands::export_backup,
            commands::import_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SYSC-MATRIX");
}
