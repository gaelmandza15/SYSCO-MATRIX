export function formatFCFA(amount) {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' F';
}

/** Devise OHADA par pays (code ISO à 2 lettres → libellé de devise). */
const CURRENCY_BY_COUNTRY = {
    SN: 'XOF', CI: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF', BJ: 'XOF',
    CM: 'XAF', GA: 'XAF', CG: 'XAF', CF: 'XAF', TD: 'XAF', GQ: 'XAF',
};

/**
 * Libellé de devise dérivé du pays choisi dans les paramètres.
 * Sans pays renseigné : mention générique des deux zones CFA.
 */
export function currencyLabel(country) {
    const code = CURRENCY_BY_COUNTRY[(country || '').toUpperCase()];
    return code ? `FCFA (${code})` : 'FCFA (XOF/XAF)';
}

/**
 * Année d'exercice dérivée de la date de clôture des paramètres ;
 * repli sur l'année courante si la date est absente ou invalide.
 */
export function fiscalYear(closingDate) {
    const y = closingDate ? Number(String(closingDate).slice(0, 4)) : NaN;
    return Number.isFinite(y) && y > 999 ? y : new Date().getFullYear();
}
