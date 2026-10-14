//! Lecture de fichiers de balance externe (CSV / TSV / .xlsx).
//!
//! Le parsing est réalisé côté backend afin de lire directement le fichier
//! choisi par l'utilisateur dans la boîte de dialogue native — sans plugin
//! `fs` supplémentaire ni dépendance JavaScript externe (hors-ligne total).

use std::fs;
use std::io::{Cursor, Read, Seek};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::read::ZipArchive;

use crate::models::ImportRow;

/// Analyse un fichier de balance et retourne les lignes exploitables.
pub fn parse_balance_file(path: &str) -> Result<Vec<ImportRow>, String> {
    let lower = path.to_lowercase();
    let rows = if lower.ends_with(".xlsx") || lower.ends_with(".xlsm") {
        read_xlsx(path)?
    } else {
        let bytes = fs::read(path).map_err(|e| format!("Lecture du fichier impossible : {e}"))?;
        let text = match String::from_utf8(bytes.clone()) {
            Ok(s) => s,
            // Repli pour les exports anciens en Windows-1252 / latin-1.
            Err(_) => bytes
                .iter()
                .map(|&b| char::from_u32(b as u32).unwrap_or('\u{fffd}'))
                .collect(),
        };
        parse_csv(text.trim_start_matches('\u{feff}'))
    };
    Ok(rows_to_accounts(rows))
}

/* ------------------------------- CSV ---------------------------------- */

/// Découpe un texte CSV en lignes de cellules (RFC 4180 simplifié :
/// guillemets doublés à l'intérieur des champs, séparateurs `;` `,` `\t` `|`).
pub fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let sep = detect_separator(text.lines().next().unwrap_or(""));

    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            } else {
                field.push(c);
            }
        } else if c == '"' && field.trim().is_empty() {
            // Ouvrante de champ : tolère l'espace avant le guillemet
            // (« 1," Doux, salés " »), ce que la stricte RFC 4180 interdit.
            if !field.is_empty() { field.clear(); }
            in_quotes = true;
        } else if c == sep {
            row.push(std::mem::take(&mut field));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            row.push(std::mem::take(&mut field));
            rows.push(std::mem::take(&mut row));
        } else {
            field.push(c);
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows.retain(|r| r.iter().any(|c| !c.trim().is_empty()));
    rows
}

fn detect_separator(first_line: &str) -> char {
    let mut best = ';';
    let mut best_count = 0usize;
    // Compter uniquement sur la première ligne non vide : une ligne vide en
    // tête (ou un BOM seul) ne doit pas faire retomber le séparateur sur le
    // défaut « ; » et transformer le CSV à virgules en champ unique.
    let first_line = first_line
        .trim_start_matches('\u{feff}')
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("");
    for c in [';', ',', '\t', '|'] {
        let n = first_line.matches(c).count();
        if n > best_count {
            best = c;
            best_count = n;
        }
    }
    best
}

/// Convertit un champ monétaire de tableur en nombre positif :
/// « 1 234 567,89 », « 1,234,567 », « 1.234.567,5 », « -500 FCFA »…
pub fn parse_amount(value: &str) -> f64 {
    let cleaned: String = value
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',' || *c == '.' || *c == '-')
        .collect();
    if cleaned.is_empty() {
        return 0.0;
    }
    let last_comma = cleaned.rfind(',');
    let last_dot = cleaned.rfind('.');
    let normalized = match (last_comma, last_dot) {
        (Some(c), Some(d)) => {
            if c > d {
                // virgule décimale, points = milliers → 1.234.567,89
                cleaned.replace('.', "").replace(',', ".")
            } else {
                // point décimal, virgules = milliers → 1,234,567.89
                cleaned.replace(',', "")
            }
        }
        (Some(_), None) => {
            let parts: Vec<&str> = cleaned.split(',').collect();
            // Groupes de exactement 3 chiffres après chaque virgule = milliers.
            let thousands = parts.len() >= 2
                && parts[0].len() <= 3
                && parts[1..].iter().all(|p| p.len() == 3);
            if thousands {
                cleaned.replace(',', "")
            } else {
                cleaned.replace(',', ".")
            }
        }
        (None, Some(_)) => {
            // Points seuls : milliers si groupes de 3 (1.234.567), sinon décimal.
            let parts: Vec<&str> = cleaned.split('.').collect();
            let thousands = parts.len() >= 2
                && parts[0].len() <= 3
                && parts[1..].iter().all(|p| p.len() == 3);
            if thousands {
                cleaned.replace('.', "")
            } else {
                cleaned
            }
        }
        (None, None) => cleaned,
    };
    normalized.parse::<f64>().unwrap_or(0.0).abs()
}

/// Clé de comparaison d'en-tête : minuscules, sans accents ni ponctuation.
/// Table de décomposition (NFD) des lettres précomposées latines courantes ;
/// les diacritiques combinés (U+0300..U+036F) sont ensuite filtrés.
const DECOMPOSE: &[(char, &str)] = &[
    ('à', "a"), ('á', "a"), ('â', "a"), ('ã', "a"), ('ä', "a"), ('å', "a"),
    ('è', "e"), ('é', "e"), ('ê', "e"), ('ë', "e"),
    ('ì', "i"), ('í', "i"), ('î', "i"), ('ï', "i"),
    ('ò', "o"), ('ó', "o"), ('ô', "o"), ('õ', "o"), ('ö', "o"),
    ('ù', "u"), ('ú', "u"), ('û', "u"), ('ü', "u"),
    ('ç', "c"), ('ñ', "n"), ('œ', "oe"), ('æ', "ae"), ('ÿ', "y"),
];

fn norm_header(s: &str) -> String {
    let mut out = String::new();
    for ch in s.to_lowercase().chars() {
        // Décomposer la lettre précomposée : « é » → « e », « œ » → « oe ».
        // Les diacritiques combinés isolés (entrée déjà NFD) sont alphanumé-
        // riques au sens Unicode — d'où le test explicite avant le filtre.
        let expanded: &str = match DECOMPOSE.iter().find(|(from, _)| *from == ch) {
            Some((_, to)) => to,
            None => "",
        };
        if !expanded.is_empty() {
            out.push_str(expanded);
        } else if matches!(ch, '\u{0300}'..='\u{036f}') {
            continue; // diacritique combiné isolé : ignoré
        } else if ch.is_ascii_alphanumeric() {
            out.push(ch);
        }
    }
    out
}

/// Transforme des lignes brutes en comptes importables.
///
/// Colonnes détectées par en-tête (N° Compte, Intitulé, Solde Débiteur,
/// Solde Créditeur et leurs variantes) ; à défaut, repli positionnel
/// code / intitulé / débit / crédit. Les lignes de totaux sont ignorées.
pub fn rows_to_accounts(rows: Vec<Vec<String>>) -> Vec<ImportRow> {
    if rows.is_empty() {
        return Vec::new();
    }
    let header: Vec<String> = rows[0].iter().map(|h| norm_header(h)).collect();
    let find = |cands: &[&str]| -> Option<usize> {
        cands
            .iter()
            .find_map(|c| header.iter().position(|h| h.starts_with(c)))
    };
    // Candidats triés du plus spécifique au plus court : `starts_with`
    // impose que les préfixes longs passent avant les courts
    // (« nom » est préfixe de « denomination », « n » de tout le monde).
    // NB : « ncompte » couvre « N° Compte » normalisé (le « ° » disparaît).
    let col_code = find(&["ncompte", "numero", "compte", "account", "code", "ref"]);
    let mut col_name = find(&["intitule", "libelle", "designation", "denomination", "description", "name", "nom"]);
    let mut col_debit = find(&["soldedebiteur", "soldebiteur", "montantdebit", "debit"]);
    // « Solde Créditeur » normalisé donne « soldecrediteur » (un seul « c »).
    let mut col_credit = find(&["soldecrediteur", "soldecriditeur", "montantcredit", "credit"]);

    // Garde-fou : si deux colonnes se retrouvent sur le même index (en-tête
    // ambigu), on laisse la colonne « name » libre pour le repli positionnel.
    if col_name == col_code { col_name = None }
    if col_debit == col_code { col_debit = None }
    if col_credit == col_code { col_credit = None }

    let has_header = col_code.is_some() || col_name.is_some() || col_debit.is_some() || col_credit.is_some();
    let pick = |found: Option<usize>, pos: usize| -> Option<usize> {
        found.or(if has_header {
            // En-tête présent mais ce rôle non reconnu : repli positionnel
            // seulement si la colonne n'est pas déjà prise par un autre rôle.
            let taken = [col_code, col_name, col_debit, col_credit]
                .iter()
                .any(|c| *c == Some(pos));
            if taken { None } else { Some(pos) }
        } else {
            Some(pos)
        })
    };
    let cols = (
        pick(col_code, 0),
        pick(col_name, 1),
        pick(col_debit, 2),
        pick(col_credit, 3),
    );

    let data = if has_header { &rows[1..] } else { &rows[..] };
    let mut out = Vec::new();
    for r in data {
        let get = |i: Option<usize>| -> String {
            i.and_then(|idx| r.get(idx).cloned()).unwrap_or_default()
        };
        let code = get(cols.0).trim().to_string();
        let key = norm_header(&code);
        let looks_total = ["total", "totaux", "somme", "soustotal"]
            .iter()
            .any(|t| key.starts_with(t));
        if code.is_empty() || looks_total || !code.chars().any(|c| c.is_ascii_digit()) {
            continue;
        }
        out.push(ImportRow {
            code,
            name: get(cols.1).trim().to_string(),
            debit: parse_amount(&get(cols.2)),
            credit: parse_amount(&get(cols.3)),
        });
    }
    out
}

/* ------------------------------ XLSX ---------------------------------- */

/// Lit la première feuille d'un classeur .xlsx et retourne ses lignes.
fn read_xlsx(path: &str) -> Result<Vec<Vec<String>>, String> {
    let bytes = fs::read(path).map_err(|e| format!("Lecture du fichier impossible : {e}"))?;
    let mut zip = ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| format!("Classeur Excel illisible : {e}"))?;

    let shared = read_zip_entry(&mut zip, "xl/sharedStrings.xml").unwrap_or_default();
    let mut sheet_names: Vec<String> = zip
        .file_names()
        .filter(|n| n.starts_with("xl/worksheets/") && n.ends_with(".xml"))
        .map(|n| n.to_string())
        .collect();
    sheet_names.sort();
    let sheet_name = sheet_names
        .first()
        .ok_or("Aucune feuille trouvée dans le classeur.")?
        .clone();
    let sheet = read_zip_entry(&mut zip, &sheet_name)
        .ok_or_else(|| format!("Feuille {} illisible.", sheet_name))?;

    Ok(parse_sheet_xml(&sheet, &shared))
}

fn read_zip_entry<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    name: &str,
) -> Option<String> {
    let mut file = zip.by_name(name).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// Index de colonne à partir d'une référence de cellule (« B7 » → 1).
fn column_index(cell_ref: &str) -> usize {
    let mut idx = 0usize;
    for ch in cell_ref.chars() {
        if ch.is_ascii_alphabetic() {
            idx = idx * 26 + (ch.to_ascii_uppercase() as usize - 'A' as usize + 1);
        } else {
            break;
        }
    }
    idx.saturating_sub(1)
}

/// Analyse `xl/worksheets/sheetN.xml` avec quick-xml.
fn parse_sheet_xml(xml: &str, shared_xml: &str) -> Vec<Vec<String>> {
    let shared = parse_shared_strings(shared_xml);
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);

    let mut current_row: Vec<String> = Vec::new();
    let mut in_row = false;
    let mut cell_col = 0usize;
    let mut cell_type = String::new();
    let mut in_value = false; // <v> ou <t>
    let mut value_buf = String::new();
    let mut in_v = false;
    let mut in_t = false;

    loop {
        match reader.read_event().unwrap_or(Event::Eof) {
            Event::Start(e) => match e.name().as_ref() {
                b"row" => {
                    in_row = true;
                    current_row.clear();
                }
                b"c" if in_row => {
                    let mut r_attr: Option<String> = None;
                    let mut t_attr: Option<String> = None;
                    for a in e.attributes().flatten() {
                        match a.key.as_ref() {
                            b"r" => r_attr = Some(String::from_utf8_lossy(a.value.as_ref()).into_owned()),
                            b"t" => t_attr = Some(String::from_utf8_lossy(a.value.as_ref()).into_owned()),
                            _ => {}
                        }
                    }
                    cell_col = r_attr
                        .as_deref()
                        .map(column_index)
                        .unwrap_or(current_row.len());
                    cell_type = t_attr.unwrap_or_default();
                    value_buf.clear();
                    in_value = false;
                }
                b"v" if in_row => {
                    in_v = true;
                    in_value = true;
                    value_buf.clear();
                }
                b"t" if in_row && cell_type == "inlineStr" => {
                    in_t = true;
                    in_value = true;
                }
                _ => {}
            },
            Event::Text(e) => {
                if in_value {
                    value_buf.push_str(&e.unescape().unwrap_or_default());
                }
            }
            Event::End(e) => match e.name().as_ref() {
                b"v" => {
                    in_v = false;
                    in_value = false;
                }
                b"t" => {
                    if in_t {
                        in_t = false;
                        in_value = false;
                    }
                }
                b"c" if in_row => {
                    let raw = std::mem::take(&mut value_buf);
                    let value = if cell_type == "s" {
                        raw.trim()
                            .parse::<usize>()
                            .ok()
                            .and_then(|i| shared.get(i).cloned())
                            .unwrap_or_default()
                    } else {
                        raw
                    };
                    while current_row.len() <= cell_col {
                        current_row.push(String::new());
                    }
                    current_row[cell_col] = value;
                    cell_type.clear();
                }
                b"row" if in_row => {
                    in_row = false;
                    if current_row.iter().any(|c| !c.trim().is_empty()) {
                        rows.push(current_row.clone());
                    }
                }
                _ => {}
            },
            Event::Empty(e) if e.name().as_ref() == b"c" && in_row => {
                // Cellule vide auto-fermée : on réserve sa colonne.
                let col = e
                    .attributes()
                    .flatten()
                    .find(|a| a.key.as_ref() == b"r")
                    .map(|a| column_index(&String::from_utf8_lossy(a.value.as_ref())))
                    .unwrap_or(current_row.len());
                while current_row.len() <= col {
                    current_row.push(String::new());
                }
            }
            Event::Eof => break,
            _ => {}
        }
        let _ = (&in_v, &in_t);
    }
    rows
}

/// Chaînes partagées : chaque `<si>` peut contenir plusieurs `<t>` (rich text).
fn parse_shared_strings(xml: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut current = String::new();
    let mut has_si = false;
    let mut in_t = false;
    loop {
        match reader.read_event().unwrap_or(Event::Eof) {
            Event::Start(e) => match e.name().as_ref() {
                b"si" => {
                    current.clear();
                    has_si = true;
                }
                b"t" if has_si => in_t = true,
                _ => {}
            },
            Event::Text(e) => {
                if in_t {
                    current.push_str(&e.unescape().unwrap_or_default());
                }
            }
            Event::End(e) => match e.name().as_ref() {
                b"t" => in_t = false,
                b"si" => {
                    out.push(std::mem::take(&mut current));
                    has_si = false;
                }
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_semicolon_with_accents_and_totals() {
        let text = "N° Compte;Intitulé;Solde Débiteur;Solde Créditeur\n\
                    411000;Clients;14 000 000,00;\n\
                    401000;Fournisseurs;;9 500 000\n\
                    Total;;23 500 000;9 500 000\n";
        let rows = rows_to_accounts(parse_csv(text));
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].code, "411000");
        assert_eq!(rows[0].name, "Clients");
        assert_eq!(rows[0].debit, 14_000_000.0);
        assert_eq!(rows[0].credit, 0.0);
        assert_eq!(rows[1].credit, 9_500_000.0);
    }

    #[test]
    fn amount_parsing_variants() {
        assert_eq!(parse_amount("1 234 567,89"), 1_234_567.89);
        assert_eq!(parse_amount("1,234,567"), 1_234_567.0);
        assert_eq!(parse_amount("1.234.567,5"), 1_234_567.5);
        assert_eq!(parse_amount("1.234.567"), 1_234_567.0);
        assert_eq!(parse_amount("-500 FCFA"), 500.0);
        assert_eq!(parse_amount("12,50"), 12.5);
        assert_eq!(parse_amount(""), 0.0);
    }

    #[test]
    fn quoted_fields_and_commas() {
        let text = "code,name,debit,credit\n1,\"Doux, salés\",100,0";
        let rows = rows_to_accounts(parse_csv(text));
        assert_eq!(rows[0].name, "Doux, salés");
    }

    #[test]
    fn positional_fallback_without_header() {
        let text = "2410;Matériel;18000000;0";
        let rows = rows_to_accounts(parse_csv(text));
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].code, "2410");
        assert_eq!(rows[0].debit, 18_000_000.0);
    }

    #[test]
    fn sheet_xml_cells_and_shared_strings() {
        let shared = "<sst><si><t>N° Compte</t></si><si><t>Clients \"spéciaux\"</t></si></sst>";
        let sheet = "<worksheet><sheetData>\
            <row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c></row>\
            <row r=\"2\"><c r=\"A2\">411000</c><c r=\"B2\" t=\"s\"><v>1</v></c><c r=\"C2\"><v>14000000</v></c></row>\
            </sheetData></worksheet>"
            .replace(">411000<", "><v>411000</v><");
        let rows = parse_sheet_xml(&sheet, shared);
        assert_eq!(rows[0][0], "N° Compte");
        assert_eq!(rows[1][1], "Clients \"spéciaux\"");
        assert_eq!(rows[1][2], "14000000");
    }

    // ---- Tests de parité avec le parseur JS de repli (balance.js) ----

    fn rows(v: Vec<Vec<&str>>) -> Vec<Vec<String>> {
        v.into_iter().map(|r| r.into_iter().map(|s| s.to_string()).collect()).collect()
    }

    #[test]
    fn num_compte_nom() {
        let r = rows_to_accounts(rows(vec![
            vec!["Num compte", "Nom", "Débit", "Crédit"],
            vec!["12", "Test", "100", ""],
        ]));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].code, "12");
        assert_eq!(r[0].name, "Test");
        assert_eq!(r[0].debit, 100.0);
    }

    #[test]
    fn fr_partial_header_fallbacks() {
        let r = rows_to_accounts(rows(vec![
            vec!["Compte", "Dénomination", "Solde débiteur"],
            vec!["5", "Banque", "10"],
        ]));
        assert_eq!(r[0].name, "Banque");
        assert_eq!(r[0].debit, 10.0);
    }

    #[test]
    fn english_headers() {
        let r = rows_to_accounts(rows(vec![
            vec!["Account", "Name", "Debit", "Credit"],
            vec!["2031", "Equipment", "100", ""],
            vec!["4011", "Suppliers", "", "200"],
        ]));
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].name, "Equipment");
        assert_eq!(r[1].credit, 200.0);
    }

    #[test]
    fn variants_fr_montant() {
        let r = rows_to_accounts(rows(vec![
            vec!["Code", "Libellé", "Montant Débiteur", "Montant Créditeur"],
            vec!["5121", "Banque", "300", ""],
        ]));
        assert_eq!(r[0].code, "5121");
        assert_eq!(r[0].name, "Banque");
        assert_eq!(r[0].debit, 300.0);
    }

    #[test]
    fn ref_designation() {
        let r = rows_to_accounts(rows(vec![
            vec!["Ref", "Designation", "Debit", "Credit"],
            vec!["1", "Caisse", "50", ""],
        ]));
        assert_eq!(r[0].name, "Caisse");
    }

    #[test]
    fn ncompte_accented_tab() {
        let text = "N\u{b0} Compte\tIntitulé\tSolde Débiteur\tSolde Créditeur\n2031\tMatériel\t1 500 000,50\t\nTotaux\t\t3 500 000,5\t2 000 000\n";
        let r = rows_to_accounts(parse_csv(text));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].code, "2031");
        assert_eq!(r[0].debit, 1_500_000.5);
    }
}
