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

export async function deleteAccount(id) {
    state.accounts = await dbClient.deleteAccount(id);
    notify();
}

export async function clearAccounts() {
    state.accounts = await dbClient.clearAccounts();
    notify();
}

export async function loadSampleData() {
    state.accounts = await dbClient.loadSampleData();
    notify();
}

export async function saveSettings(settings) {
    state.settings = { ...settings };
    await dbClient.saveSettings(settings);
    notify();
}
