/**
 * Logique comptable SYSCOHADA Révisé — Système Normal.
 *
 * Centralise le passage balance → états financiers afin que le tableau de
 * bord, les contrôles et les exports (Excel/PDF) partagent exactement les
 * mêmes règles de calcul.
 *
 * Convention de signe : pour un compte, `solde = débit - crédit`.
 *  - Un solde positif est un solde débiteur (actif, charges).
 *  - Un solde négatif est un solde créditeur (passif, produits).
 */

import { getSumByPrefix, getCreditSumByPrefix } from './sums.js';

/**
 * Calcule la synthèse complète des états financiers.
 * @param {Array<{code:string,name:string,debit:number,credit:number}>} accounts
 */
export function computeStatements(accounts) {
    // ---------- ACTIF ----------
    // Immobilisations : classe 2 hors amortissements (28).
    const immoBrut = accounts
        .filter((a) => a.code.startsWith('2') && !a.code.startsWith('28'))
        .reduce((s, a) => s + a.debit, 0);
    const amortissements = accounts
        .filter((a) => a.code.startsWith('28'))
        .reduce((s, a) => s + (a.credit - a.debit), 0);
    const immoNet = immoBrut - amortissements;

    // Actif circulant :
    //  - Stocks : classe 3 (débit - crédit)
    //  - Créances : classe 4 en solde débiteur (clients, avances, etc.)
    //  - Trésorerie : classe 5 (débit - crédit)
    const stocks = getSumByPrefix(accounts, '3');
    const creances = sumDebitSide(accounts, '4');
    const tresorerie = getSumByPrefix(accounts, '5');
    const actifCirculant = stocks + creances;
    const totalActif = immoNet + actifCirculant + tresorerie;

    // ---------- COMPTE DE RÉSULTAT ----------
    // Calculé en premier car le résultat est intégré au passif s'il n'a pas
    // encore été affecté au compte 13.
    const totalProduits = accounts
        .filter((a) => a.code.startsWith('7'))
        .reduce((s, a) => s + (a.credit - a.debit), 0);
    const totalCharges = accounts
        .filter((a) => a.code.startsWith('6'))
        .reduce((s, a) => s + (a.debit - a.credit), 0);
    const resultatNet = totalProduits - totalCharges;
    const chiffreAffaires = getCreditSumByPrefix(accounts, '70');

    // Le compte 13 (résultat net) est-il déjà saisi au passif ?
    const resultatAuCompte13 = accounts
        .filter((a) => a.code.startsWith('13'))
        .reduce((s, a) => s + (a.credit - a.debit), 0);
    const resultatSaisi = accounts.some((a) => a.code.startsWith('13'));

    // ---------- PASSIF ----------
    // Capitaux propres & dettes financières : classe 1 (crédit - débit).
    const capitauxPropres = getCreditSumByPrefix(accounts, '1');
    // Dettes circulantes : classe 4 en solde créditeur (fournisseurs,
    // dettes fiscales et sociales, etc.).
    const dettesCirculantes = sumCreditSide(accounts, '4');
    // Trésorerie passif (banques créditrices / découverts) : classe 5 négative.
    const tresoreriePassif = Math.max(0, -getSumByPrefix(accounts, '5'));

    // Si le résultat de l'exercice n'est pas encore affecté au compte 13,
    // il figure néanmoins au passif du bilan SYSCOHADA : on l'ajoute.
    const resultatIntegre = resultatSaisi ? 0 : resultatNet;
    const totalPassif = capitauxPropres + dettesCirculantes + tresoreriePassif + resultatIntegre;

    return {
        // Actif
        immoBrut,
        amortissements,
        immoNet,
        stocks,
        creances,
        tresorerie,
        actifCirculant,
        totalActif,
        // Passif
        capitauxPropres,
        dettesCirculantes,
        resultatIntegre,
        resultatSaisi,
        resultatAuCompte13,
        totalPassif,
        // Résultat
        chiffreAffaires,
        totalProduits,
        totalCharges,
        resultatNet,
        // Contrôle
        ecartBilan: totalActif - totalPassif,
    };
}

/** Somme des soldes débiteurs (débit - crédit) pour un préfixe. */
function sumDebitSide(accounts, prefix) {
    return accounts
        .filter((a) => a.code.startsWith(prefix) && a.debit > a.credit)
        .reduce((s, a) => s + (a.debit - a.credit), 0);
}

/** Somme des soldes créditeurs (crédit - débit) pour un préfixe. */
function sumCreditSide(accounts, prefix) {
    return accounts
        .filter((a) => a.code.startsWith(prefix) && a.credit > a.debit)
        .reduce((s, a) => s + (a.credit - a.debit), 0);
}

/** Tolérance d'arrondi (F CFA) pour considérer deux montants égaux. */
export const BALANCE_TOLERANCE = 1;

/**
 * Exécute les contrôles d'équilibre SYSCOHADA sur la balance.
 * Chaque contrôle est un vrai test (plus de valeur codée en dur).
 *
 * @returns {Array<{title:string, passed:boolean, detail:string, severity:'error'|'warning'}>}
 */
export function runControls(accounts) {
    const s = computeStatements(accounts);

    const totalDebit = accounts.reduce((acc, a) => acc + a.debit, 0);
    const totalCredit = accounts.reduce((acc, a) => acc + a.credit, 0);
    const ecartPartieDouble = totalDebit - totalCredit;
    const partieDoubleOk = Math.abs(ecartPartieDouble) <= BALANCE_TOLERANCE;

    // Équilibre du bilan : Actif = Passif.
    const bilanOk = Math.abs(s.ecartBilan) <= BALANCE_TOLERANCE;

    // Concordance du résultat : le résultat du compte de résultat doit être
    // repris au passif (compte 13 « Résultat net de l'exercice »).
    // - Si le compte 13 est saisi : il doit égaler le résultat calculé (erreur sinon).
    // - Sinon : le résultat est intégré d'office au passif, donc le bilan reste
    //   juste. C'est l'état NORMAL d'une balance avant clôture (l'affectation du
    //   résultat se fait à l'inventaire) → simple information, pas une anomalie.
    const ecartResultat = s.resultatAuCompte13 - s.resultatNet;
    const resultatOk = s.resultatSaisi
        ? Math.abs(ecartResultat) <= BALANCE_TOLERANCE
        : true;
    const resultatSeverity = s.resultatSaisi ? 'error' : 'info';
    const resultatDetail = s.resultatSaisi
        ? Math.abs(ecartResultat) <= BALANCE_TOLERANCE
            ? `Résultat du compte de résultat repris au passif : ${fnum(s.resultatNet)} F.`
            : `Le compte 13 (${fnum(s.resultatAuCompte13)} F) diffère du résultat calculé (${fnum(s.resultatNet)} F).`
        : Math.abs(s.resultatNet) <= BALANCE_TOLERANCE
          ? 'Aucun résultat à affecter (produits = charges).'
          : `Résultat de ${fnum(s.resultatNet)} F non encore affecté au compte 13 — intégré d'office au passif (normal avant clôture).`;

    // Nomenclature : tous les comptes doivent appartenir aux classes 1 à 8.
    const horsNomenclature = accounts.filter((a) => {
        const c = a.code.charAt(0);
        return c < '1' || c > '8';
    });
    const nomenclatureOk = horsNomenclature.length === 0;

    return [
        {
            title: 'Équilibre de la Balance Générale (Débit = Crédit)',
            passed: partieDoubleOk,
            severity: 'error',
            detail: partieDoubleOk
                ? `Total Débit = Total Crédit = ${fnum(totalDebit)} F`
                : `Écart de ${fnum(ecartPartieDouble)} F (Débit ${fnum(totalDebit)} F / Crédit ${fnum(totalCredit)} F).`,
        },
        {
            title: 'Équilibre du Bilan (Actif = Passif)',
            passed: bilanOk,
            severity: 'error',
            detail: bilanOk
                ? `Actif = Passif = ${fnum(s.totalActif)} F`
                : `Écart de ${fnum(s.ecartBilan)} F (Actif ${fnum(s.totalActif)} F / Passif ${fnum(s.totalPassif)} F).`,
        },
        {
            title: "Concordance du Résultat Net (Compte 13)",
            passed: resultatOk,
            severity: resultatSeverity,
            detail: resultatDetail,
        },
        {
            title: "Règles d'Imputation SYSCOHADA Révisé",
            passed: nomenclatureOk,
            severity: 'warning',
            detail: nomenclatureOk
                ? 'Tous les comptes appartiennent aux classes 1 à 8 de la nomenclature OHADA.'
                : `Comptes hors nomenclature : ${horsNomenclature.map((a) => a.code).join(', ')}.`,
        },
    ];
}

function fnum(v) {
    return new Intl.NumberFormat('fr-FR').format(Math.round(v));
}
