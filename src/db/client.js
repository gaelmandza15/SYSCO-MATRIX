import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
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

// Balance témoin SYSCOHADA équilibrée (Débit = Crédit = 127 500 000 F).
// Miroir exact du jeu de données du backend Rust (`commands.rs`).
const SAMPLE_ACCOUNTS = [
    ['1011', 'Capital social', 0, 40000000],
    ['1110', 'Réserve légale', 0, 5000000],
    ['1610', 'Emprunts et dettes financières', 0, 15000000],
    ['2210', 'Terrains', 25000000, 0],
    ['2410', 'Matériel et mobilier', 18000000, 0],
    ['2821', 'Amortissements des immobilisations', 0, 3000000],
    ['3110', 'Marchandises', 8000000, 0],
    ['4110', 'Clients', 14000000, 0],
    ['4010', "Fournisseurs d'exploitation", 0, 9500000],
    ['5210', 'Banques', 16000000, 0],
    ['5710', 'Caisse', 1500000, 0],
    ['6011', 'Achats de marchandises', 35000000, 0],
    ['6110', 'Transports', 2000000, 0],
    ['6610', 'Charges de personnel', 8000000, 0],
    ['7011', 'Ventes de marchandises', 0, 55000000],
];

function invokeMemory(cmd, args = {}) {
    const m = memoryStore;
    switch (cmd) {
        case 'get_accounts':
            return [...m.accounts];
        case 'add_account':
            m.accounts.push({ id: m.nextId++, ...args.input });
            return [...m.accounts];
        case 'delete_account':
            m.accounts = m.accounts.filter((a) => a.id !== args.id);
            return [...m.accounts];
        case 'clear_accounts':
            m.accounts = [];
            return [];
        case 'load_sample_data':
            m.accounts = SAMPLE_ACCOUNTS.map(([code, name, debit, credit], i) => ({
                id: i + 1,
                code,
                name,
                debit,
                credit,
            }));
            m.nextId = m.accounts.length + 1;
            return [...m.accounts];
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
    getAccounts: () => invoke('get_accounts'),
    addAccount: (account) => invoke('add_account', { input: account }),
    deleteAccount: (id) => invoke('delete_account', { id }),
    clearAccounts: () => invoke('clear_accounts'),
    loadSampleData: () => invoke('load_sample_data'),
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
