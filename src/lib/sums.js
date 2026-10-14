/**
 * Logique métier de calcul par préfixe de compte.
 * Les fonctions restent identiques à la version monolithe d'origine,
 * mais opèrent sur un tableau de comptes fourni en paramètre.
 */

export function getSumByPrefix(accounts, prefix) {
    return accounts
        .filter((acc) => acc.code.startsWith(prefix))
        .reduce((sum, acc) => sum + (acc.debit - acc.credit), 0);
}

export function getCreditSumByPrefix(accounts, prefix) {
    return accounts
        .filter((acc) => acc.code.startsWith(prefix))
        .reduce((sum, acc) => sum + (acc.credit - acc.debit), 0);
}
