/// Définition d'un poste DSF : référence, libellé et préfixe(s) de comptes.
pub struct DsfRow {
    pub reference: &'static str,
    pub label: &'static str,
    pub prefix: &'static str,
    /// "debit" => solde débiteur (débit - crédit), "credit" => (crédit - débit)
    pub kind: &'static str,
}

/// Bilan — Actif (Système Normal).
pub const BILAN_ACTIF: &[DsfRow] = &[
    DsfRow { reference: "AE", label: "Frais de développement et brevets", prefix: "21", kind: "debit" },
    DsfRow { reference: "AF", label: "Logiciels et droits similaires", prefix: "213", kind: "debit" },
    DsfRow { reference: "AG", label: "Fonds commercial", prefix: "215", kind: "debit" },
    DsfRow { reference: "AI", label: "Terrains", prefix: "22", kind: "debit" },
    DsfRow { reference: "AJ", label: "Bâtiments", prefix: "23", kind: "debit" },
    DsfRow { reference: "AK", label: "Matériel, mobilier et installations", prefix: "24", kind: "debit" },
    DsfRow { reference: "AZ", label: "Amortissements des immobilisations", prefix: "28", kind: "credit" },
    DsfRow { reference: "HAQ", label: "Stocks et en-cours", prefix: "3", kind: "debit" },
    DsfRow { reference: "BQ", label: "Créances clients et comptes rattachés", prefix: "41", kind: "debit" },
    DsfRow { reference: "BQ2", label: "Disponibilités (Banques & Caisse)", prefix: "5", kind: "debit" },
];

/// Bilan — Passif.
pub const BILAN_PASSIF: &[DsfRow] = &[
    DsfRow { reference: "CA", label: "Capital social ou personnel", prefix: "101", kind: "credit" },
    DsfRow { reference: "CB", label: "Primes d'émission, de fusion, d'apport", prefix: "104", kind: "credit" },
    DsfRow { reference: "CD", label: "Réserves (légale, statutaire)", prefix: "11", kind: "credit" },
    DsfRow { reference: "CG", label: "Résultat net de l'exercice", prefix: "13", kind: "credit" },
    DsfRow { reference: "DA", label: "Emprunts et dettes financières", prefix: "16", kind: "credit" },
    DsfRow { reference: "EA", label: "Dettes fournisseurs et comptes rattachés", prefix: "40", kind: "credit" },
    DsfRow { reference: "EB", label: "Dettes fiscales et sociales", prefix: "42", kind: "credit" },
];

/// Compte de Résultat.
pub const COMPTE_RESULTAT: &[DsfRow] = &[
    DsfRow { reference: "RA", label: "Ventes de marchandises", prefix: "701", kind: "credit" },
    DsfRow { reference: "RB", label: "Ventes de produits fabriqués", prefix: "702", kind: "credit" },
    DsfRow { reference: "RC", label: "Production stockée / immobilisée", prefix: "72", kind: "credit" },
    DsfRow { reference: "RD", label: "Achats de marchandises", prefix: "601", kind: "debit" },
    DsfRow { reference: "RE", label: "Achats de matières premières", prefix: "602", kind: "debit" },
    DsfRow { reference: "RF", label: "Transports", prefix: "61", kind: "debit" },
    DsfRow { reference: "RG", label: "Services extérieurs", prefix: "62", kind: "debit" },
    DsfRow { reference: "RH", label: "Impôts et taxes", prefix: "63", kind: "debit" },
    DsfRow { reference: "RI", label: "Charges de personnel", prefix: "66", kind: "debit" },
    DsfRow { reference: "RJ", label: "Dotations aux amortissements", prefix: "68", kind: "debit" },
];
