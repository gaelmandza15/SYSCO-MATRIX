import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';

/**
 * Client Tauri : enveloppe les appels `invoke` vers le backend Rust.
 *
 * On utilise le package officiel `@tauri-apps/api` (et non le global
 * `window.__TAURI__`, qui n'est injecté que si `withGlobalTauri` est activé).
 *
 * En dehors de Tauri (ex. aperçu navigateur via `npm run dev`), un repli
 * mémoire permet de développer l'interface sans le binaire.
 */

let useTauri = false;
try {
    useTauri = isTauri();
} catch {
    useTauri = false;
}

const memoryStore = {
    accounts: [],
    settings: { company: '', nif: '', country: '', closing_date: '' },
    nextId: 1,
};

function invokeMemory(cmd, args = {}) {
    const m = memoryStore;
    switch (cmd) {
        case 'get_accounts':
            return [...m.accounts];
        case 'add_account':
            m.accounts.push({ id: m.nextId++, ...args.input });
            return [...m.accounts];
        case 'update_account': {
            const idx = m.accounts.findIndex((a) => a.id === args.input.id);
            if (idx === -1) throw new Error(`Aucun compte avec l'identifiant ${args.input.id}.`);
            m.accounts[idx] = { ...m.accounts[idx], ...args.input };
            return [...m.accounts];
        }
        case 'import_accounts': {
            if (args.replace) m.accounts = [];
            for (const row of args.rows) {
                const code = String(row.code ?? '').trim();
                if (!code) continue;
                const idx = m.accounts.findIndex((a) => a.code === code);
                if (idx >= 0) {
                    m.accounts[idx] = { ...m.accounts[idx], name: row.name, debit: row.debit, credit: row.credit };
                } else {
                    m.accounts.push({ id: m.nextId++, code, name: row.name, debit: row.debit, credit: row.credit });
                }
            }
            return [...m.accounts];
        }
        case 'delete_account':
            m.accounts = m.accounts.filter((a) => a.id !== args.id);
            return [...m.accounts];
        case 'clear_accounts':
            m.accounts = [];
            return [];
        case 'get_settings':
            return { ...m.settings };
        case 'save_settings':
            m.settings = { ...args.settings };
            return null;
        default:
            throw new Error(`Commande inconnue: ${cmd}`);
    }
}

async function invoke(cmd, args) {
    if (useTauri) {
        return tauriInvoke(cmd, args);
    }
    return invokeMemory(cmd, args);
}

export const dbClient = {
    isTauri: () => useTauri,
    parseBalanceFile: (path) => invoke('parse_balance_file', { path }),
    getAccounts: () => invoke('get_accounts'),
    addAccount: (account) => invoke('add_account', { input: account }),
    updateAccount: (account) => invoke('update_account', { input: account }),
    importAccounts: (rows, replace) => invoke('import_accounts', { rows, replace }),
    deleteAccount: (id) => invoke('delete_account', { id }),
    clearAccounts: () => invoke('clear_accounts'),
    getSettings: () => invoke('get_settings'),
    saveSettings: (settings) => invoke('save_settings', { settings }),
};

/**
 * Export du rapport DSF (classeur Excel ou document PDF).
 *
 * Ouvre la boîte de dialogue « Enregistrer sous », génère le fichier via
 * le backend Rust, puis l'ouvre avec l'application associée du système.
 * Retourne `null` si l'utilisateur annule.
 *
 * @param {"xlsx" | "pdf"} format
 */
export async function exportDsfReport(format = 'xlsx') {
    const isPdf = format === 'pdf';
    const defaultName = isPdf ? 'Rapport_DSF_SYSCOHADA.pdf' : 'Rapport_DSF_SYSCOHADA.xlsx';
    const filterName = isPdf ? 'Document PDF' : 'Classeur Excel';
    const ext = isPdf ? 'pdf' : 'xlsx';
    const command = isPdf ? 'export_dsf_pdf' : 'export_dsf_report';

    if (useTauri) {
        const path = await save({
            title: 'Exporter le rapport DSF',
            defaultPath: defaultName,
            filters: [{ name: filterName, extensions: [ext] }],
        });
        if (!path) return null;

        const written = await invoke(command, { path });
        try {
            await openPath(written);
        } catch {
            // Le fichier est écrit même si l'ouverture automatique échoue.
        }
        return written;
    }

    // Repli hors Tauri : génère un CSV de la balance (aperçu navigateur).
    const header = 'N° Compte;Intitulé;Débit;Crédit';
    const lines = memoryStore.accounts.map(
        (a) => `${a.code};${a.name};${a.debit};${a.credit}`,
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Rapport_DSF_SYSCOHADA.csv';
    link.click();
    URL.revokeObjectURL(url);
    return 'Rapport_DSF_SYSCOHADA.csv';
}

/**
 * Boîte de dialogue « Ouvrir » pour choisir un fichier de balance.
 * Retourne le chemin côté Tauri ; en aperçu navigateur, un <input file>
 * est utilisé et la lecture est faite par `readBalanceFile`.
 */
export async function pickBalanceFile() {
    if (useTauri) {
        const selected = await openDialog({
            title: 'Importer une balance (CSV ou Excel)',
            multiple: false,
            filters: [
                { name: 'Fichiers de balance', extensions: ['csv', 'txt', 'tsv', 'xlsx', 'xlsm'] },
                { name: 'CSV', extensions: ['csv', 'txt', 'tsv'] },
                { name: 'Excel', extensions: ['xlsx', 'xlsm'] },
            ],
        });
        return typeof selected === 'string' ? selected : null;
    }
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt,.tsv,.xlsx';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        // Si l'utilisateur annule, aucune résolution : on ajoute un fallback temporel simple.
        input.click();
    });
}

/** Lit un File (aperçu navigateur) en texte UTF-8/latin-1 avec BOM toléré. */
export async function readFileAsText(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
        const td = new TextDecoder('utf-8', { fatal: true });
        return td.decode(buf);
    } catch {
        const td = new TextDecoder('windows-1252');
        return td.decode(buf);
    }
}
