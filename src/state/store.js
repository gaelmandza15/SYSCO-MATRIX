import { dbClient } from '../db/client.js';

/**
 * État central de l'application.
 * Remplace le `let balanceAccounts` global du monolithe par un store
 * qui persiste chaque mutation via le backend SQLite.
 */

export const state = {
    accounts: [],
    settings: {
        company: '',
        nif: '',
        country: '',
        closing_date: '',
    },
    currentMatrixSubTab: 'bilan-actif',
};

let listeners = [];

export function subscribe(fn) {
    listeners.push(fn);
    return () => {
        listeners = listeners.filter((l) => l !== fn);
    };
}

function notify() {
    listeners.forEach((fn) => fn(state));
}

export async function loadAccounts() {
    state.accounts = await dbClient.getAccounts();
    notify();
}

export async function loadSettings() {
    state.settings = await dbClient.getSettings();
    notify();
}

export async function init() {
    await Promise.all([loadAccounts(), loadSettings()]);
}

export async function addAccount(account) {
    state.accounts = await dbClient.addAccount(account);
    notify();
}

export async function updateAccount(account) {
    state.accounts = await dbClient.updateAccount(account);
    notify();
}

/**
 * Importe des lignes de balance (CSV ou tableur).
 * @param {{code:string,name:string,debit:number,credit:number}[]} rows
 * @param {boolean} replace true = remplace toute la balance, false = fusionne par code.
 */
export async function importAccounts(rows, replace = false) {
    state.accounts = await dbClient.importAccounts(rows, replace);
    notify();
}

export async function deleteAccount(id) {
    state.accounts = await dbClient.deleteAccount(id);
    notify();
}

export async function clearAccounts() {
    state.accounts = await dbClient.clearAccounts();
    notify();
}

export async function saveSettings(settings) {
    state.settings = { ...settings };
    await dbClient.saveSettings(settings);
    notify();
}

/* --------------------- Sauvegardes / historique --------------------- */

/** Enregistre un point de restauration manuel de l'état courant. */
export async function createSnapshot(label = 'Point de restauration') {
    return dbClient.createSnapshot(label);
}

/** Liste les points de restauration disponibles (les plus récents d'abord). */
export async function listSnapshots() {
    return dbClient.listSnapshots();
}

/**
 * Restaure l'état (balance + paramètres) enregistré dans le snapshot `id`.
 * Le backend enregistre préalablement l'état courant dans l'historique,
 * ce qui rend la manipulation réversible.
 */
export async function restoreSnapshot(id) {
    const result = await dbClient.restoreSnapshot(id);
    if (result && Array.isArray(result.accounts)) {
        state.accounts = result.accounts;
        if (result.settings) state.settings = { ...result.settings };
    } else {
        await Promise.all([loadAccounts(), loadSettings()]);
    }
    notify();
}

/** Supprime un point de restauration. */
export async function deleteSnapshot(id) {
    return dbClient.deleteSnapshot(id);
}
