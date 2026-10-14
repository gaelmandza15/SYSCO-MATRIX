use printpdf::*;
use std::collections::BTreeMap;

use crate::accounting;
use crate::dsf::{BILAN_ACTIF, BILAN_PASSIF, COMPTE_RESULTAT, DsfRow};
use crate::models::{Account, Settings};

// --- Géométrie de page (A4 portrait, en mm) ---
const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN_L: f32 = 15.0;
const MARGIN_R: f32 = 15.0;
const TOP_Y: f32 = PAGE_H - 20.0;
const BOTTOM_Y: f32 = 22.0;
/// Abscisse de la 3ᵉ colonne (comptes associés / intermédiaire).
const COL_C2: f32 = MARGIN_L + 104.0;

fn accent() -> Color {
    Color::Rgb(Rgb::new(0.094, 0.094, 0.106, None))
}
fn grey_text() -> Color {
    Color::Rgb(Rgb::new(0.44, 0.44, 0.48, None))
}
fn light_fill() -> Color {
    Color::Rgb(Rgb::new(0.957, 0.957, 0.961, None))
}
fn white() -> Color {
    Color::Rgb(Rgb::new(1.0, 1.0, 1.0, None))
}
fn green() -> Color {
    Color::Rgb(Rgb::new(0.02, 0.59, 0.41, None))
}
fn amber() -> Color {
    Color::Rgb(Rgb::new(0.71, 0.33, 0.04, None))
}
fn red() -> Color {
    Color::Rgb(Rgb::new(0.88, 0.11, 0.28, None))
}

/// État du générateur : pagination + polices.
struct Report {
    doc: PdfDocumentReference,
    font: IndirectFontRef,
    font_bold: IndirectFontRef,
    page: PdfPageIndex,
    layer: PdfLayerIndex,
    /// Toutes les pages créées (pour le pied de page final).
    pages: Vec<(PdfPageIndex, PdfLayerIndex)>,
    y: f32,
}

impl Report {
    fn new() -> Result<Self, String> {
        let (doc, page, layer) = PdfDocument::new(
            "Rapport DSF SYSCOHADA Révisé",
            Mm(PAGE_W),
            Mm(PAGE_H),
            "Page 1",
        );
        let font = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| e.to_string())?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| e.to_string())?;
        Ok(Report {
            doc,
            font,
            font_bold,
            page,
            layer,
            pages: vec![(page, layer)],
            y: TOP_Y,
        })
    }

    fn layer(&self) -> PdfLayerReference {
        self.doc.get_page(self.page).get_layer(self.layer)
    }

    fn new_page(&mut self) {
        let (page, layer) = self.doc.add_page(Mm(PAGE_W), Mm(PAGE_H), "Rapport DSF");
        self.page = page;
        self.layer = layer;
        self.pages.push((page, layer));
        self.y = TOP_Y;
    }

    fn ensure_space(&mut self, needed: f32) {
        if self.y - needed < BOTTOM_Y {
            self.new_page();
        }
    }

    fn text(&self, s: &str, size: f32, x: f32, y: f32, bold: bool, color: &Color) {
        let layer = self.layer();
        layer.set_fill_color(color.clone());
        let font = if bold { &self.font_bold } else { &self.font };
        layer.use_text(s, size, Mm(x), Mm(y), font);
    }

    fn text_right(&self, s: &str, size: f32, right_x: f32, y: f32, bold: bool, color: &Color) {
        let w = est_width(s, size);
        self.text(s, size, right_x - w, y, bold, color);
    }

    fn rect(&self, x0: f32, y0: f32, x1: f32, y1: f32, color: &Color) {
        let layer = self.layer();
        layer.set_fill_color(color.clone());
        layer.add_rect(Rect::new(Mm(x0), Mm(y0), Mm(x1), Mm(y1)));
    }

    fn header(&mut self, title: &str, subtitle: &str) {
        self.rect(0.0, PAGE_H - 18.0, PAGE_W, PAGE_H, &accent());
        self.text(title, 15.0, MARGIN_L, PAGE_H - 11.0, true, &white());
        self.y = PAGE_H - 26.0;
        if !subtitle.is_empty() {
            self.text(subtitle, 9.0, MARGIN_L, self.y, false, &grey_text());
            self.y -= 7.0;
        }
    }

    fn section(&mut self, title: &str) {
        self.ensure_space(14.0);
        self.y -= 4.0;
        self.text(title, 12.0, MARGIN_L, self.y, true, &accent());
        self.y -= 3.0;
        self.rect(MARGIN_L, self.y, PAGE_W - MARGIN_R, self.y + 1.2, &light_fill());
        self.y -= 6.0;
    }

    fn paragraph(&mut self, s: &str) {
        self.ensure_space(6.0);
        self.text(s, 8.5, MARGIN_L, self.y, false, &grey_text());
        self.y -= 5.5;
    }

    fn kv_row(&mut self, key: &str, value: &str) {
        self.ensure_space(6.0);
        self.text(key, 9.0, MARGIN_L, self.y, false, &grey_text());
        self.text(value, 9.0, MARGIN_L + 65.0, self.y, true, &accent());
        self.y -= 5.6;
    }

    fn table_header(&mut self, c0: &str, c1: &str, c2: &str, c3: &str) {
        self.ensure_space(8.0);
        let top = self.y + 4.6;
        self.rect(MARGIN_L, self.y - 1.8, PAGE_W - MARGIN_R, top, &accent());
        self.text(c0, 8.0, MARGIN_L + 2.0, self.y, true, &white());
        self.text(c1, 8.0, MARGIN_L + 22.0, self.y, true, &white());
        self.text(c2, 7.5, COL_C2, self.y, true, &white());
        self.text_right(c3, 8.0, PAGE_W - MARGIN_R - 2.0, self.y, true, &white());
        self.y -= 7.0;
    }

    fn table_row(&mut self, c0: &str, c1: &str, c2: &str, amount: Option<f64>, bold: bool, shade: bool) {
        let h = 6.2;
        self.ensure_space(h + 1.0);
        if shade {
            self.rect(MARGIN_L, self.y - 1.6, PAGE_W - MARGIN_R, self.y + 4.4, &light_fill());
        }
        let color = accent();
        self.text(c0, 8.0, MARGIN_L + 2.0, self.y, bold, &color);
        self.text(c1, 8.0, MARGIN_L + 22.0, self.y, bold, &color);
        // Colonne intermédiaire : tronquée pour ne jamais empiéter sur le montant.
        self.text(&truncate(c2, 34), 7.0, COL_C2, self.y, false, &grey_text());
        if let Some(v) = amount {
            self.text_right(&fmt_money(v), 8.0, PAGE_W - MARGIN_R - 2.0, self.y, bold, &color);
        }
        self.y -= h;
    }

    /// Ajoute les pieds de page sur toutes les pages (appel final).
    fn stamp_footers(&self) {
        let count = self.pages.len();
        for (i, (page_idx, layer_idx)) in self.pages.iter().enumerate() {
            let layer = self.doc.get_page(*page_idx).get_layer(*layer_idx);
            let label = format!(
                "SYSC-MATRIX — Rapport DSF SYSCOHADA Révisé   •   Page {}/{}",
                i + 1,
                count
            );
            layer.set_fill_color(grey_text());
            layer.use_text(label, 7.0, Mm(MARGIN_L), Mm(12.0), &self.font);
        }
    }

    fn save(self, path: &str) -> Result<(), String> {
        self.stamp_footers();
        let bytes = self.doc.save_to_bytes().map_err(|e| e.to_string())?;
        std::fs::write(path, bytes).map_err(|e| e.to_string())
    }
}

fn est_width(s: &str, size: f32) -> f32 {
    s.chars().count() as f32 * size * 0.5
}

/// Formate un montant de façon compacte (sans le suffixe « F ») pour la
/// colonne Débit/Crédit, en abrégeant les millions.
fn compact(v: f64) -> String {
    if v == 0.0 {
        return "0".to_string();
    }
    if v.abs() >= 1_000_000.0 {
        let m = v / 1_000_000.0;
        // Une décimale seulement si nécessaire.
        if (m.fract()).abs() < 0.05 {
            format!("{} M", m.round() as i64)
        } else {
            format!("{:.1} M", m)
        }
    } else {
        let n = v.round() as i64;
        let digits = n.abs().to_string();
        let mut out = String::new();
        let bytes = digits.as_bytes();
        for (i, b) in bytes.iter().enumerate() {
            if i > 0 && (bytes.len() - i) % 3 == 0 {
                out.push(' ');
            }
            out.push(*b as char);
        }
        format!("{}{}", if n < 0 { "-" } else { "" }, out)
    }
}

/// Formate un montant FCFA : milliers séparés par des espaces.
fn fmt_money(v: f64) -> String {
    let neg = v < 0.0;
    let n = v.abs().round() as i64;
    let digits = n.to_string();
    let mut out = String::new();
    let bytes = digits.as_bytes();
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && (bytes.len() - i) % 3 == 0 {
            out.push(' ');
        }
        out.push(*b as char);
    }
    format!("{}{} F", if neg { "-" } else { "" }, out)
}

fn sum_prefix(accounts: &[Account], prefix: &str, kind: &str) -> f64 {
    accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| if kind == "debit" { a.debit - a.credit } else { a.credit - a.debit })
        .sum()
}

fn codes_for(accounts: &[Account], prefix: &str) -> String {
    let mut codes: Vec<String> = accounts
        .iter()
        .filter(|a| a.code.starts_with(prefix))
        .map(|a| a.code.clone())
        .collect();
    codes.sort();
    codes.dedup();
    if codes.is_empty() {
        return "Aucun".to_string();
    }
    let joined = codes.join(", ");
    truncate(&joined, 42)
}

/// Génère le rapport DSF complet au format PDF.
pub fn write_pdf(path: &str, accounts: &[Account], settings: &Settings) -> Result<(), String> {
    let mut r = Report::new()?;

    r.header(
        "SYSC-MATRIX — Rapport DSF",
        "Matrice d'Intégration & États Financiers • SYSCOHADA Révisé • Système Normal",
    );

    r.paragraph(&format!(
        "Raison sociale : {}     NIF : {}     Pays : {}     Exercice clos le : {}",
        na(&settings.company),
        na(&settings.nif),
        na(&settings.country),
        na(&settings.closing_date)
    ));
    r.y -= 2.0;

    // Calculs via le module comptable partagé (mêmes règles que le frontend).
    let st = accounting::compute_statements(accounts);

    r.section("Synthèse des États Financiers");
    r.kv_row("Total Bilan Actif", &fmt_money(st.total_actif));
    r.kv_row("Actif Immobilisé Net", &fmt_money(st.immo_net));
    r.kv_row("Actif Circulant & Trésorerie", &fmt_money(st.actif_circulant + st.tresorerie));
    r.kv_row("Capitaux Propres & Assimilés", &fmt_money(st.capitaux_propres));
    r.kv_row("Total Dettes & Passif", &fmt_money(st.total_passif));
    r.kv_row("Chiffre d'Affaires HT", &fmt_money(st.chiffre_affaires));
    r.kv_row("Total des Charges", &fmt_money(st.total_charges));
    r.kv_row("Total des Produits", &fmt_money(st.total_produits));
    r.kv_row("Résultat Net", &fmt_money(st.resultat_net));

    r.y -= 2.0;
    let balanced = st.ecart_bilan.abs() <= accounting::BALANCE_TOLERANCE;
    let (status, color) = if accounts.is_empty() {
        ("En attente de données", Color::Rgb(Rgb::new(0.71, 0.33, 0.04, None)))
    } else if balanced {
        ("Équilibre Parfait", green())
    } else {
        ("Écart détecté", red())
    };
    r.text("Statut d'équilibre :", 9.0, MARGIN_L, r.y, false, &grey_text());
    r.text(status, 9.0, MARGIN_L + 65.0, r.y, true, &color);
    r.y -= 8.0;

    r.section("Balance Générale des Comptes");
    if accounts.is_empty() {
        r.paragraph("Aucun compte saisi dans la balance.");
    } else {
        r.table_header("N° Compte", "Intitulé", "Débit / Crédit", "Solde Net");
        let mut sorted: BTreeMap<&str, &Account> = BTreeMap::new();
        for a in accounts {
            sorted.insert(a.code.as_str(), a);
        }
        for acc in sorted.values() {
            let net = acc.debit - acc.credit;
            r.table_row(&acc.code, &truncate(&acc.name, 40),
                        &format!("{}D / {}C", compact(acc.debit), compact(acc.credit)),
                        Some(net), false, false);
        }
        let td: f64 = accounts.iter().map(|a| a.debit).sum();
        let tc: f64 = accounts.iter().map(|a| a.credit).sum();
        r.table_row("", "TOTAL", &format!("{}D / {}C", compact(td), compact(tc)), Some(td - tc), true, true);
    }

    write_matrix(&mut r, accounts, "Bilan — Actif", BILAN_ACTIF);
    write_matrix(&mut r, accounts, "Bilan — Passif", BILAN_PASSIF);
    write_matrix(&mut r, accounts, "Compte de Résultat", COMPTE_RESULTAT);

    r.section("Notes Annexes Automatiques");
    r.table_header("Note", "Libellé", "", "Montant");
    r.table_row("N1", "Total brut immobilisé (Classe 2)", "", Some(sum_prefix(accounts, "2", "debit")), false, false);
    r.table_row("N2", "Total des stocks (Classe 3)", "", Some(sum_prefix(accounts, "3", "debit")), false, true);
    r.table_row("N3", "Créances clients et rattachés (41)", "", Some(sum_prefix(accounts, "41", "debit")), false, false);
    r.table_row("N4", "Dettes fournisseurs (40)", "", Some(sum_prefix(accounts, "40", "credit")), false, true);

    r.section("Contrôles d'Équilibre et Cohérence");
    let controls = accounting::run_controls(accounts);
    for c in &controls {
        r.ensure_space(7.0);
        let (color, label) = if c.passed && c.severity != "info" {
            (green(), "Conforme")
        } else if c.severity == "info" {
            (grey_text(), "Information")
        } else if c.severity == "warning" {
            (amber(), "À vérifier")
        } else {
            (red(), "Non conforme")
        };
        r.text(if c.passed { "[X]" } else { "[ ]" }, 9.0, MARGIN_L, r.y, true, &color);
        r.text(&truncate(&c.title, 58), 8.5, MARGIN_L + 9.0, r.y, false, &accent());
        r.text(label, 8.5, PAGE_W - MARGIN_R - 24.0, r.y, true, &color);
        r.y -= 6.0;
    }

    r.save(path)
}

fn write_matrix(r: &mut Report, accounts: &[Account], title: &str, rows: &[DsfRow]) {
    r.section(title);
    r.table_header("Poste", "Libellé", "Comptes associés", "Montant Net");
    for row in rows {
        let total = sum_prefix(accounts, row.prefix, row.kind);
        r.table_row(row.reference, &truncate(row.label, 44), &codes_for(accounts, row.prefix), Some(total), false, false);
    }
}

fn na(s: &str) -> &str {
    if s.is_empty() { "—" } else { s }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() > max {
        format!("{}…", s.chars().take(max.saturating_sub(1)).collect::<String>())
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<Account> {
        [
            ("1011", "Capital social", 0.0, 50_000_000.0),
            ("1310", "Résultat net de l'exercice", 0.0, 12_500_000.0),
            ("2130", "Logiciels", 2_000_000.0, 0.0),
            ("2210", "Terrains", 25_000_000.0, 0.0),
            ("2821", "Amortissements", 0.0, 3_000_000.0),
            ("3110", "Marchandises", 8_000_000.0, 0.0),
            ("4110", "Clients", 14_000_000.0, 0.0),
            ("4010", "Fournisseurs", 0.0, 9_500_000.0),
            ("5210", "Banques", 16_000_000.0, 0.0),
            ("6011", "Achats de marchandises", 45_000_000.0, 0.0),
            ("7011", "Ventes de marchandises", 0.0, 85_000_000.0),
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
    fn generates_valid_pdf() {
        let accounts = sample();
        let settings = Settings {
            company: "SARL TEST SYSCOHADA".into(),
            nif: "M012612345678X".into(),
            country: "SN".into(),
            closing_date: "2026-12-31".into(),
        };
        let out = std::env::temp_dir().join("sysc_export_test.pdf");
        let path = out.to_string_lossy().to_string();
        write_pdf(&path, &accounts, &settings).expect("write pdf");

        let bytes = std::fs::read(&path).expect("read");
        assert!(bytes.len() > 2000, "pdf trop petit: {}", bytes.len());
        assert_eq!(&bytes[0..5], b"%PDF-", "signature PDF manquante");
        let tail = String::from_utf8_lossy(&bytes[bytes.len().saturating_sub(20)..]);
        assert!(tail.contains("%%EOF"), "marqueur EOF manquant");
        println!("TEST_PDF_PATH={path}");
        println!("TEST_PDF_SIZE={}", bytes.len());
    }

    #[test]
    fn money_formatting_has_thousands_separator() {
        assert_eq!(fmt_money(81500000.0), "81 500 000 F");
        assert_eq!(fmt_money(0.0), "0 F");
        assert_eq!(fmt_money(-2500.0), "-2 500 F");
    }
}
