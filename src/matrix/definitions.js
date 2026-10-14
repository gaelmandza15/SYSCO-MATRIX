/**
 * Mapping des postes DSF (Système Normal) vers les comptes SYSCOHADA.
 * Données séparées de la vue (matrice d'intégration).
 */

export const BILAN_ACTIF = [
    { ref: 'AE', label: 'Frais de développement et brevets', prefix: '21', type: 'debit' },
    { ref: 'AF', label: 'Logiciels et droits similaires', prefix: '213', type: 'debit' },
    { ref: 'AG', label: 'Fonds commercial', prefix: '215', type: 'debit' },
    { ref: 'AI', label: 'Terrains', prefix: '22', type: 'debit' },
    { ref: 'AJ', label: 'Bâtiments', prefix: '23', type: 'debit' },
    { ref: 'AK', label: 'Matériel, mobilier et installations', prefix: '24', type: 'debit' },
    { ref: 'AZ', label: 'Amortissements des immobilisations', prefix: '28', type: 'credit' },
    { ref: 'HAQ', label: 'Stocks et en-cours', prefix: '3', type: 'debit' },
    { ref: 'BQ', label: 'Créances clients et comptes rattachés', prefix: '41', type: 'debit' },
    { ref: 'BQ2', label: 'Disponibilités (Banques & Caisse)', prefix: '5', type: 'debit' },
];

export const BILAN_PASSIF = [
    { ref: 'CA', label: 'Capital social ou personnel', prefix: '101', type: 'credit' },
    { ref: 'CB', label: "Primes d'émission, de fusion, d'apport", prefix: '104', type: 'credit' },
    { ref: 'CD', label: 'Réserves (légale, statutaire)', prefix: '11', type: 'credit' },
    { ref: 'CG', label: "Résultat net de l'exercice", prefix: '13', type: 'credit' },
    { ref: 'DA', label: 'Emprunts et dettes financières', prefix: '16', type: 'credit' },
    { ref: 'EA', label: 'Dettes fournisseurs et comptes rattachés', prefix: '40', type: 'credit' },
    { ref: 'EB', label: 'Dettes fiscales et sociales', prefix: '42', type: 'credit' },
];

export const COMPTE_RESULTAT = [
    { ref: 'RA', label: 'Ventes de marchandises', prefix: '701', type: 'credit' },
    { ref: 'RB', label: 'Ventes de produits fabriqués', prefix: '702', type: 'credit' },
    { ref: 'RC', label: 'Production stockée / immobilisée', prefix: '72', type: 'credit' },
    { ref: 'RD', label: 'Achats de marchandises', prefix: '601', type: 'debit' },
    { ref: 'RE', label: 'Achats de matières premières', prefix: '602', type: 'debit' },
    { ref: 'RF', label: 'Transports', prefix: '61', type: 'debit' },
    { ref: 'RG', label: 'Services extérieurs', prefix: '62', type: 'debit' },
    { ref: 'RH', label: 'Impôts et taxes', prefix: '63', type: 'debit' },
    { ref: 'RI', label: 'Charges de personnel', prefix: '66', type: 'debit' },
    { ref: 'RJ', label: 'Dotations aux amortissements', prefix: '68', type: 'debit' },
];

export function rowsFor(subTab) {
    if (subTab === 'bilan-actif') return BILAN_ACTIF;
    if (subTab === 'bilan-passif') return BILAN_PASSIF;
    return COMPTE_RESULTAT;
}
