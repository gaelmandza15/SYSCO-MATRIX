use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
use std::collections::BTreeMap;

use crate::accounting;
use crate::dsf::{BILAN_ACTIF, BILAN_PASSIF, COMPTE_RESULTAT, DsfRow};
use crate::models::{Account, Settings};

/// Couleur d'accent (neutral-900 de la maquette).
const ACCENT: Color = Color::RGB(0x18_18_1B);
const LIGHT: Color = Color::RGB(0xF4_F4_F5);
const GREEN: Color = Color::RGB(0x05_96_69);
const AMBER: Color = Color::RGB(0xB4_53_09);

fn title_format() -> Format {
    Format::new()
        .set_bold()
        .set_font_size(14)
        .set_font_color(ACCENT)
}

fn subtitle_format() -> Format {
    Format::new().set_font_size(10).set_font_color(Color::RGB(0x71_71_7A))
}

fn header_format() -> Format {
    Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(ACCENT)
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::VerticalCenter)
}

fn label_format() -> Format {
    Format::new().set_border(FormatBorder::Thin)
}

fn ref_format() -> Format {
    Format::new().set_bold().set_border(FormatBorder::Thin)
}

fn accounts_format() -> Format {
    Format::new()
        .set_font_color(Color::RGB(0x71_71_7A))
        .set_font_name("Consolas")
        .set_font_size(9)
        .set_border(FormatBorder::Thin)
}

/// Format monétaire FCFA (séparateur de milliers, sans décimales).
fn money_format() -> Format {
    Format::new()
        .set_num_format("#,##0\" F\"")
        .set_border(FormatBorder::Thin)
}

fn money_bold_format() -> Format {
    Format::new()
        .set_bold()
        .set_num_format("#,##0\" F\"")
        .set_border(FormatBorder::Thin)
        .set_background_color(LIGHT)
}

fn total_label_format() -> Format {
    Format::new()
        .set_bold()
        .set_border(FormatBorder::Thin)
        .set_background_color(LIGHT)
}

/// Somme des soldes pour les comptes dont le code commence par `prefix`.
/// `kind == "debit"` => débit - crédit ; sinon crédit - débit.
fn sum_prefix(accounts: &[Account], prefix: &str, kind: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| if kind == "debit" { a.debit - a.credit } else { a.credit - a.debit })
        .sum()
}

/// Liste triée et dédupliquée des codes correspondant au préfixe.
fn codes_for(accounts: &[Account], prefix: &str) -> String {
    let mut codes: Vec<String> = accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| a.code.clone())
        .collect();
    codes.sort();
    codes.dedup();
    if codes.is_empty() {
        "Aucun".to_string()
    } else {
        codes.join(", ")
    }
}

/// Construit le classeur DSF complet et l'écrit dans `path`.
pub fn write_workbook(path: &str, accounts: &[Account], settings: &Settings) -> Result<(), String> {
    let mut wb = Workbook::new();

    sheet_synthese(&mut wb, accounts, settings)?;
    sheet_balance(&mut wb, accounts)?;
    sheet_matrice(&mut wb, accounts, "Bilan Actif", BILAN_ACTIF)?;
    sheet_matrice(&mut wb, accounts, "Bilan Passif", BILAN_PASSIF)?;
    sheet_matrice(&mut wb, accounts, "Compte de Résultat", COMPTE_RESULTAT)?;
    sheet_notes(&mut wb, accounts)?;
    sheet_controles(&mut wb, accounts)?;

    wb.save(path).map_err(|e| e.to_string())
}

/// Onglet 1 : synthèse (KPIs + paramètres entreprise).
fn sheet_synthese(
    wb: &mut Workbook,
    accounts: &[Account],
    settings: &Settings,
) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name("Synthèse").map_err(|e| e.to_string())?;
    ws.set_column_width(0, 38).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 22).map_err(|e| e.to_string())?;

    ws.write_with_format(0, 0, "SYSC-MATRIX — Synthèse SYSCOHADA Révisé", &title_format())
        .map_err(|e| e.to_string())?;
    ws.write_with_format(1, 0, "Système Normal • Espace OHADA", &subtitle_format())
        .map_err(|e| e.to_string())?;

    // Paramètres entreprise.
    let mut r = 3u32;
    let infos = [
        ("Raison sociale", settings.company.clone()),
        ("N° d'Identification Fiscale (NIF)", settings.nif.clone()),
        ("Pays", settings.country.clone()),
        ("Exercice clos le", settings.closing_date.clone()),
    ];
    for (k, v) in infos {
        ws.write_with_format(r, 0, k, &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, if v.is_empty() { "—" } else { v.as_str() }, &label_format())
            .map_err(|e| e.to_string())?;
        r += 1;
    }

    // Calculs via le module comptable partagé (mêmes règles que le frontend).
    let st = accounting::compute_statements(accounts);

    r += 1;
    ws.write_with_format(r, 0, "Indicateurs clés", &title_format()).map_err(|e| e.to_string())?;
    r += 1;
    ws.write_with_format(r, 0, "Indicateur", &header_format()).map_err(|e| e.to_string())?;
    ws.write_with_format(r, 1, "Montant", &header_format()).map_err(|e| e.to_string())?;
    r += 1;

    let kpis = [
        ("Total Bilan Actif", st.total_actif),
        ("Actif Immobilisé Net", st.immo_net),
        ("Actif Circulant & Trésorerie", st.actif_circulant + st.tresorerie),
        ("Capitaux Propres & Assimilés", st.capitaux_propres),
        ("Total Dettes & Passif", st.total_passif),
        ("Chiffre d'Affaires HT", st.chiffre_affaires),
        ("Total des Charges", st.total_charges),
        ("Total des Produits", st.total_produits),
        ("Résultat Net", st.resultat_net),
    ];
    for (k, v) in kpis {
        ws.write_with_format(r, 0, k, &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, v, &money_format()).map_err(|e| e.to_string())?;
        r += 1;
    }

    // Statut d'équilibre : Actif = Passif.
    r += 1;
    let balanced = st.ecart_bilan.abs() <= accounting::BALANCE_TOLERANCE;
    let status = if accounts.is_empty() {
        ("En attente de données", AMBER)
    } else if balanced {
        ("Équilibre Parfait", GREEN)
    } else {
        ("Écart détecté", Color::RGB(0xE1_1D_48))
    };
    ws.write_with_format(r, 0, "Statut d'équilibre", &label_format()).map_err(|e| e.to_string())?;
    let status_fmt = Format::new().set_bold().set_font_color(status.1).set_border(FormatBorder::Thin);
    ws.write_with_format(r, 1, status.0, &status_fmt).map_err(|e| e.to_string())?;

    Ok(())
}

/// Onglet 2 : balance générale détaillée.
fn sheet_balance(wb: &mut Workbook, accounts: &[Account]) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name("Balance Générale").map_err(|e| e.to_string())?;
    ws.set_column_width(0, 14).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 52).map_err(|e| e.to_string())?;
    ws.set_column_width(2, 20).map_err(|e| e.to_string())?;
    ws.set_column_width(3, 20).map_err(|e| e.to_string())?;

    ws.write_with_format(0, 0, "Balance Générale des Comptes (SYSCOHADA Révisé)", &title_format())
        .map_err(|e| e.to_string())?;

    let headers = ["N° Compte", "Intitulé du Compte", "Solde Débiteur", "Solde Créditeur"];
    for (c, h) in headers.iter().enumerate() {
        ws.write_with_format(2, c as u16, *h, &header_format()).map_err(|e| e.to_string())?;
    }

    let mut r = 3u32;
    let mut total_debit = 0.0;
    let mut total_credit = 0.0;
    // BTreeMap => tri par code.
    let mut sorted: BTreeMap<&str, &Account> = BTreeMap::new();
    for a in accounts {
        sorted.insert(a.code.as_str(), a);
    }
    for acc in sorted.values() {
        ws.write_with_format(r, 0, acc.code.as_str(), &ref_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, acc.name.as_str(), &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 2, acc.debit, &money_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 3, acc.credit, &money_format()).map_err(|e| e.to_string())?;
        total_debit += acc.debit;
        total_credit += acc.credit;
        r += 1;
    }

    if accounts.is_empty() {
        ws.write_with_format(r, 0, "Aucun compte saisi", &label_format()).map_err(|e| e.to_string())?;
    } else {
        ws.write_with_format(r, 0, "TOTAL", &total_label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, "", &total_label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 2, total_debit, &money_bold_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 3, total_credit, &money_bold_format()).map_err(|e| e.to_string())?;
    }
    r += 2;
    let diff = (total_debit - total_credit).abs();
    let eq = if diff < 1.0 { "Équilibrée" } else { "Déséquilibrée" };
    ws.write_with_format(
        r,
        0,
        format!("Balance {eq} (écart : {:.0} F)", diff),
        &subtitle_format(),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Onglet 3-5 : matrice d'intégration (un onglet par vue).
fn sheet_matrice(
    wb: &mut Workbook,
    accounts: &[Account],
    name: &str,
    rows: &[DsfRow],
) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name(name).map_err(|e| e.to_string())?;
    ws.set_column_width(0, 18).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 46).map_err(|e| e.to_string())?;
    ws.set_column_width(2, 34).map_err(|e| e.to_string())?;
    ws.set_column_width(3, 20).map_err(|e| e.to_string())?;

    ws.write_with_format(0, 0, format!("Matrice d'Intégration — {name}"), &title_format())
        .map_err(|e| e.to_string())?;

    let headers = ["Poste DSF", "Libellé du Poste", "Comptes associés", "Montant Net (F CFA)"];
    for (c, h) in headers.iter().enumerate() {
        ws.write_with_format(2, c as u16, *h, &header_format()).map_err(|e| e.to_string())?;
    }

    let mut r = 3u32;
    for row in rows {
        let total = sum_prefix(accounts, row.prefix, row.kind);
        ws.write_with_format(r, 0, row.reference, &ref_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, row.label, &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 2, codes_for(accounts, row.prefix), &accounts_format())
            .map_err(|e| e.to_string())?;
        ws.write_with_format(r, 3, total, &money_format()).map_err(|e| e.to_string())?;
        r += 1;
    }

    Ok(())
}

/// Onglet 6 : notes annexes automatiques.
fn sheet_notes(wb: &mut Workbook, accounts: &[Account]) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name("Notes Annexes").map_err(|e| e.to_string())?;
    ws.set_column_width(0, 42).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 24).map_err(|e| e.to_string())?;

    ws.write_with_format(0, 0, "Notes Annexes Automatiques (SYSCOHADA Révisé)", &title_format())
        .map_err(|e| e.to_string())?;
    ws.write_with_format(1, 0, "Tableaux générés automatiquement à partir de la balance.", &subtitle_format())
        .map_err(|e| e.to_string())?;

    let st = accounting::compute_statements(accounts);
    let notes: [(&str, f64); 8] = [
        ("Note 1 : Immobilisations brutes (Classe 2)", st.immo_brut),
        ("Note 2 : Amortissements (Classe 28)", st.amortissements),
        ("Note 3 : Immobilisations nettes", st.immo_net),
        ("Note 4 : Stocks (Classe 3)", st.stocks),
        ("Note 5 : Créances (Classe 4 débitrice)", st.creances),
        ("Note 6 : Trésorerie (Classe 5)", st.tresorerie),
        ("Note 7 : Dettes circulantes (Classe 4 créditrice)", st.dettes_circulantes),
        ("Note 8 : Résultat intégré au passif", st.resultat_integre),
    ];

    let mut r = 3u32;
    ws.write_with_format(r, 0, "Note", &header_format()).map_err(|e| e.to_string())?;
    ws.write_with_format(r, 1, "Montant", &header_format()).map_err(|e| e.to_string())?;
    r += 1;
    for (label, value) in notes {
        ws.write_with_format(r, 0, label, &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, value, &money_format()).map_err(|e| e.to_string())?;
        r += 1;
    }

    Ok(())
}

/// Onglet 7 : contrôles d'équilibre.
fn sheet_controles(wb: &mut Workbook, accounts: &[Account]) -> Result<(), String> {
    let ws = wb.add_worksheet();
    ws.set_name("Contrôles").map_err(|e| e.to_string())?;
    ws.set_column_width(0, 52).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 14).map_err(|e| e.to_string())?;
    ws.set_column_width(2, 46).map_err(|e| e.to_string())?;

    ws.write_with_format(0, 0, "Contrôles d'Équilibre et Cohérence SYSCOHADA", &title_format())
        .map_err(|e| e.to_string())?;

    let headers = ["Contrôle", "Statut", "Détail"];
    for (c, h) in headers.iter().enumerate() {
        ws.write_with_format(2, c as u16, *h, &header_format()).map_err(|e| e.to_string())?;
    }

    let controls = accounting::run_controls(accounts);

    let ok_fmt = Format::new().set_bold().set_font_color(GREEN).set_border(FormatBorder::Thin);
    let info_fmt = Format::new().set_bold().set_font_color(Color::RGB(0x71_71_7A)).set_border(FormatBorder::Thin);
    let warn_fmt = Format::new().set_bold().set_font_color(AMBER).set_border(FormatBorder::Thin);
    let ko_fmt = Format::new().set_bold().set_font_color(Color::RGB(0xE1_1D_48)).set_border(FormatBorder::Thin);

    let mut r = 3u32;
    for c in &controls {
        let (label, fmt) = if c.passed && c.severity != "info" {
            ("Conforme", &ok_fmt)
        } else if c.severity == "info" {
            ("Information", &info_fmt)
        } else if c.severity == "warning" {
            ("À vérifier", &warn_fmt)
        } else {
            ("Non conforme", &ko_fmt)
        };
        ws.write_with_format(r, 0, c.title.as_str(), &label_format()).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 1, label, fmt).map_err(|e| e.to_string())?;
        ws.write_with_format(r, 2, c.detail.as_str(), &label_format()).map_err(|e| e.to_string())?;
        r += 1;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<Account> {
        [
            ("1011", "Capital social", 0.0, 50_000_000.0),
            ("1110", "Réserve légale", 0.0, 5_000_000.0),
            ("1310", "Résultat net de l'exercice (bénéfice)", 0.0, 12_500_000.0),
            ("1610", "Emprunts et dettes financières", 0.0, 15_000_000.0),
            ("2110", "Frais de développement", 2_000_000.0, 0.0),
            ("2210", "Terrains", 25_000_000.0, 0.0),
            ("2410", "Matériel et mobilier", 18_000_000.0, 0.0),
            ("2821", "Amortissements des immobilisations", 0.0, 3_000_000.0),
            ("3110", "Marchandises", 8_000_000.0, 0.0),
            ("4110", "Clients", 14_000_000.0, 0.0),
            ("4010", "Fournisseurs d'exploitation", 0.0, 9_500_000.0),
            ("5210", "Banques", 16_000_000.0, 0.0),
            ("5710", "Caisse", 1_500_000.0, 0.0),
            ("6011", "Achats de marchandises", 45_000_000.0, 0.0),
            ("6110", "Transports", 3_500_000.0, 0.0),
            ("6310", "Impôts et taxes", 2_500_000.0, 0.0),
            ("6610", "Charges de personnel", 18_000_000.0, 0.0),
            ("7011", "Ventes de marchandises", 0.0, 85_000_000.0),
            ("7710", "Produits financiers", 0.0, 1_000_000.0),
        ]
        .iter()
        .enumerate()
        .map(|(i, (c, n, d, cr))| Account {
            id: i as i64 + 1,
            code: c.to_string(),
            name: n.to_string(),
            debit: *d,
            credit: *cr,
        })
        .collect()
    }

    #[test]
    fn generates_workbook_file() {
        let accounts = sample();
        let settings = Settings {
            company: "SARL TEST SYSCOHADA".into(),
            nif: "M012612345678X".into(),
            country: "SN".into(),
            closing_date: "2026-12-31".into(),
        };
        let out = std::env::temp_dir().join("sysc_export_test.xlsx");
        let path = out.to_string_lossy().to_string();
        write_workbook(&path, &accounts, &settings).expect("write workbook");

        let meta = std::fs::metadata(&path).expect("file exists");
        assert!(meta.len() > 5000, "workbook should be non-trivial, got {}", meta.len());

        // Vérifie la signature ZIP (PK) d'un .xlsx.
        let bytes = std::fs::read(&path).expect("read");
        assert_eq!(&bytes[0..2], b"PK", "xlsx doit être un conteneur ZIP");

        println!("TEST_XLSX_PATH={path}");
        println!("TEST_XLSX_SIZE={}", meta.len());
    }

    #[test]
    fn sums_match_expected_totals() {
        let accounts = sample();
        // Total charges (classe 6) et produits (classe 7) des comptes témoin :
        // 6011 45M + 6110 3,5M + 6310 2,5M + 6610 18M = 69M
        // 7011 85M + 7710 1M = 86M  =>  résultat 17M
        let charges: f64 = accounts.iter().filter(|a| a.code.starts_with('6')).map(|a| a.debit - a.credit).sum();
        let produits: f64 = accounts.iter().filter(|a| a.code.starts_with('7')).map(|a| a.credit - a.debit).sum();
        assert_eq!(charges, 69_000_000.0);
        assert_eq!(produits, 86_000_000.0);
        assert_eq!(produits - charges, 17_000_000.0);
    }
}
