//! Logique comptable SYSCOHADA Révisé — miroir de `src/lib/accounting.js`.
//!
//! Centralise le passage balance → états financiers afin que les exports
//! Excel et PDF utilisent exactement les mêmes règles que l'interface.
//!
//! Convention de signe : pour un compte, `solde = débit - crédit`.

use crate::models::Account;

/// Tolérance d'arrondi (F CFA) pour considérer deux montants égaux.
pub const BALANCE_TOLERANCE: f64 = 1.0;

/// Synthèse complète des états financiers.
#[derive(Debug, Default, Clone)]
pub struct Statements {
    // Actif
    pub immo_brut: f64,
    pub amortissements: f64,
    pub immo_net: f64,
    pub stocks: f64,
    pub creances: f64,
    pub tresorerie: f64,
    pub actif_circulant: f64,
    pub total_actif: f64,
    // Passif
    pub capitaux_propres: f64,
    pub dettes_circulantes: f64,
    pub resultat_integre: f64,
    pub resultat_saisi: bool,
    pub resultat_au_compte13: f64,
    pub total_passif: f64,
    // Résultat
    pub chiffre_affaires: f64,
    pub total_produits: f64,
    pub total_charges: f64,
    pub resultat_net: f64,
    // Contrôle
    pub ecart_bilan: f64,
}

fn sum_debit_side(accounts: &[Account], prefix: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix) && a.debit > a.credit)
        .map(|a| a.debit - a.credit)
        .sum()
}

fn sum_credit_side(accounts: &[Account], prefix: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix) && a.credit > a.debit)
        .map(|a| a.credit - a.debit)
        .sum()
}

fn sum_prefix_signed(accounts: &[Account], prefix: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| a.debit - a.credit)
        .sum()
}

fn sum_credit_prefix(accounts: &[Account], prefix: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| a.credit - a.debit)
        .sum()
}

/// Calcule la synthèse des états financiers (identique au frontend).
pub fn compute_statements(accounts: &[Account]) -> Statements {
    // ---------- ACTIF ----------
    let immo_brut: f64 = accounts
        .iter()
        .filter(|a| a.code.starts_with('2') && !a.code.starts_with("28"))
        .map(|a| a.debit)
        .sum();
    let amortissements: f64 = accounts
        .iter()
        .filter(|a| a.code.starts_with("28"))
        .map(|a| a.credit - a.debit)
        .sum();
    let immo_net = immo_brut - amortissements;

    let stocks = sum_prefix_signed(accounts, "3");
    let creances = sum_debit_side(accounts, "4");
    let tresorerie = sum_prefix_signed(accounts, "5");
    let actif_circulant = stocks + creances;
    let total_actif = immo_net + actif_circulant + tresorerie;

    // ---------- COMPTE DE RÉSULTAT ----------
    let total_produits: f64 = accounts
        .iter()
        .filter(|a| a.code.starts_with('7'))
        .map(|a| a.credit - a.debit)
        .sum();
    let total_charges: f64 = accounts
        .iter()
        .filter(|a| a.code.starts_with('6'))
        .map(|a| a.debit - a.credit)
        .sum();
    let resultat_net = total_produits - total_charges;
    let chiffre_affaires = sum_credit_prefix(accounts, "70");

    let resultat_au_compte13: f64 = accounts
        .iter()
        .filter(|a| a.code.starts_with("13"))
        .map(|a| a.credit - a.debit)
        .sum();
    let resultat_saisi = accounts.iter().any(|a| a.code.starts_with("13"));

    // ---------- PASSIF ----------
    let capitaux_propres = sum_credit_prefix(accounts, "1");
    let dettes_circulantes = sum_credit_side(accounts, "4");
    let tresorerie_passif = (-sum_prefix_signed(accounts, "5")).max(0.0);
    let resultat_integre = if resultat_saisi { 0.0 } else { resultat_net };
    let total_passif =
        capitaux_propres + dettes_circulantes + tresorerie_passif + resultat_integre;

    Statements {
        immo_brut,
        amortissements,
        immo_net,
        stocks,
        creances,
        tresorerie,
        actif_circulant,
        total_actif,
        capitaux_propres,
        dettes_circulantes,
        resultat_integre,
        resultat_saisi,
        resultat_au_compte13,
        total_passif,
        chiffre_affaires,
        total_produits,
        total_charges,
        resultat_net,
        ecart_bilan: total_actif - total_passif,
    }
}

/// Résultat d'un contrôle d'équilibre.
pub struct Control {
    pub title: String,
    pub passed: bool,
    /// "error" ou "warning"
    pub severity: &'static str,
    pub detail: String,
}

/// Exécute les contrôles d'équilibre SYSCOHADA (identiques au frontend).
pub fn run_controls(accounts: &[Account]) -> Vec<Control> {
    let s = compute_statements(accounts);

    let total_debit: f64 = accounts.iter().map(|a| a.debit).sum();
    let total_credit: f64 = accounts.iter().map(|a| a.credit).sum();
    let ecart_pd = total_debit - total_credit;
    let pd_ok = ecart_pd.abs() <= BALANCE_TOLERANCE;

    let bilan_ok = s.ecart_bilan.abs() <= BALANCE_TOLERANCE;

    let ecart_resultat = s.resultat_au_compte13 - s.resultat_net;
    // Si le compte 13 est saisi : concordance exigée (erreur sinon).
    // Sinon : résultat intégré d'office au passif — simple information
    // (état normal d'une balance avant clôture), pas une anomalie.
    let (resultat_ok, resultat_sev) = if s.resultat_saisi {
        (ecart_resultat.abs() <= BALANCE_TOLERANCE, "error")
    } else {
        (true, "info")
    };

    let hors_nomenclature: Vec<String> = accounts
        .iter()
        .filter(|a| {
            let c = a.code.chars().next().unwrap_or('0');
            !('1'..='8').contains(&c)
        })
        .map(|a| a.code.clone())
        .collect();
    let nomen_ok = hors_nomenclature.is_empty();

    vec![
        Control {
            title: "Équilibre de la Balance Générale (Débit = Crédit)".into(),
            passed: pd_ok,
            severity: "error",
            detail: if pd_ok {
                format!("Total Débit = Total Crédit = {} F", fmt_num(total_debit))
            } else {
                format!(
                    "Écart de {} F (Débit {} F / Crédit {} F).",
                    fmt_num(ecart_pd),
                    fmt_num(total_debit),
                    fmt_num(total_credit)
                )
            },
        },
        Control {
            title: "Équilibre du Bilan (Actif = Passif)".into(),
            passed: bilan_ok,
            severity: "error",
            detail: if bilan_ok {
                format!("Actif = Passif = {} F", fmt_num(s.total_actif))
            } else {
                format!(
                    "Écart de {} F (Actif {} F / Passif {} F).",
                    fmt_num(s.ecart_bilan),
                    fmt_num(s.total_actif),
                    fmt_num(s.total_passif)
                )
            },
        },
        Control {
            title: "Concordance du Résultat Net (Compte 13)".into(),
            passed: resultat_ok,
            severity: resultat_sev,
            detail: if s.resultat_saisi {
                if resultat_ok {
                    format!(
                        "Résultat du compte de résultat repris au passif : {} F.",
                        fmt_num(s.resultat_net)
                    )
                } else {
                    format!(
                        "Le compte 13 ({} F) diffère du résultat calculé ({} F).",
                        fmt_num(s.resultat_au_compte13),
                        fmt_num(s.resultat_net)
                    )
                }
            } else if s.resultat_net.abs() <= BALANCE_TOLERANCE {
                "Aucun résultat à affecter (produits = charges).".into()
            } else {
                format!(
                    "Résultat de {} F non encore affecté au compte 13 — intégré d'office au passif (normal avant clôture).",
                    fmt_num(s.resultat_net)
                )
            },
        },
        Control {
            title: "Règles d'Imputation SYSCOHADA Révisé".into(),
            passed: nomen_ok,
            severity: "warning",
            detail: if nomen_ok {
                "Tous les comptes appartiennent aux classes 1 à 8 de la nomenclature OHADA.".into()
            } else {
                format!("Comptes hors nomenclature : {}.", hors_nomenclature.join(", "))
            },
        },
    ]
}

/// Formatage entier avec séparateurs de milliers (espaces fines → espaces).
fn fmt_num(v: f64) -> String {
    let n = v.round() as i64;
    let neg = n < 0;
    let digits = n.abs().to_string();
    let bytes = digits.as_bytes();
    let mut out = String::new();
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i) % 3 == 0 {
            out.push('\u{202f}');
        }
        out.push(*b as char);
    }
    format!("{}{}", if neg { "-" } else { "" }, out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn acc(code: &str, debit: f64, credit: f64) -> Account {
        Account {
            id: 0,
            code: code.to_string(),
            name: "x".into(),
            debit,
            credit,
        }
    }

    #[test]
    fn balanced_balance_is_balanced() {
        let accounts = vec![
            acc("1010", 0.0, 40_000_000.0),
            acc("2210", 25_000_000.0, 0.0),
            acc("5210", 15_000_000.0, 0.0),
        ];
        let s = compute_statements(&accounts);
        assert_eq!(s.total_actif, 40_000_000.0);
        assert_eq!(s.total_passif, 40_000_000.0);
        assert_eq!(s.ecart_bilan, 0.0);
    }

    #[test]
    fn unposted_result_is_integrated_in_passif() {
        let accounts = vec![
            acc("1010", 0.0, 40_000_000.0),
            acc("2210", 50_000_000.0, 0.0),
            acc("7011", 0.0, 10_000_000.0),
        ];
        let s = compute_statements(&accounts);
        assert_eq!(s.resultat_net, 10_000_000.0);
        assert_eq!(s.resultat_integre, 10_000_000.0);
        assert_eq!(s.total_passif, 50_000_000.0);
        assert_eq!(s.ecart_bilan, 0.0);
    }

    #[test]
    fn controls_flag_unbalanced() {
        let accounts = vec![
            acc("1010", 0.0, 40_000_000.0),
            acc("2210", 50_000_000.0, 0.0),
        ];
        let controls = run_controls(&accounts);
        // Partie double ET bilan déséquilibrés.
        assert!(!controls[0].passed);
        assert!(!controls[1].passed);
    }

    /// La balance témoin livrée avec l'application doit être équilibrée.
    #[test]
    fn sample_balance_is_fully_compliant() {
        let accounts: Vec<Account> = vec![
            acc("1011", 0.0, 40_000_000.0),
            acc("1110", 0.0, 5_000_000.0),
            acc("1610", 0.0, 15_000_000.0),
            acc("2210", 25_000_000.0, 0.0),
            acc("2410", 18_000_000.0, 0.0),
            acc("2821", 0.0, 3_000_000.0),
            acc("3110", 8_000_000.0, 0.0),
            acc("4110", 14_000_000.0, 0.0),
            acc("4010", 0.0, 9_500_000.0),
            acc("5210", 16_000_000.0, 0.0),
            acc("5710", 1_500_000.0, 0.0),
            acc("6011", 35_000_000.0, 0.0),
            acc("6110", 2_000_000.0, 0.0),
            acc("6610", 8_000_000.0, 0.0),
            acc("7011", 0.0, 55_000_000.0),
        ];
        let s = compute_statements(&accounts);
        // Partie double et bilan équilibrés.
        let td: f64 = accounts.iter().map(|a| a.debit).sum();
        let tc: f64 = accounts.iter().map(|a| a.credit).sum();
        assert_eq!(td, tc);
        assert_eq!(s.total_actif, s.total_passif);
        assert_eq!(s.ecart_bilan, 0.0);
        // Résultat cohérent avec l'activité : 55M − 45M = 10M.
        assert_eq!(s.resultat_net, 10_000_000.0);

        // Tous les contrôles doivent être conformes (passed = true), y compris
        // les contrôles critiques (severity = "error" désigne la criticité,
        // pas l'issue) et l'information sur le résultat non encore affecté.
        for c in run_controls(&accounts) {
            assert!(c.passed, "contrôle non conforme : {} — {}", c.title, c.detail);
        }
    }
}
