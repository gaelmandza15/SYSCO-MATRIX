import { state } from '../state/store.js';
import { formatFCFA } from '../lib/format.js';
import { getSumByPrefix, getCreditSumByPrefix } from '../lib/sums.js';
import { renderIcons } from '../ui/icons.js';

export function notesTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h3 class="text-sm font-semibold text-neutral-900">Notes Annexes Automatiques (SYSCOHADA Révisé)</h3>
                    <p class="text-xs text-neutral-500 mt-0.5">Génération des tableaux d'immobilisations, amortissements, provisions et créances/dettes.</p>
                </div>
                <button id="btn-print-notes" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors flex items-center space-x-2">
                    <i data-lucide="printer" class="w-3.5 h-3.5"></i>
                    <span>Imprimer les Notes</span>
                </button>
            </div>
            <div class="space-y-6" id="notes-container"></div>
        </div>
    `;
}

export function initNotes() {
    const container = document.getElementById('tab-notes');
    if (container) container.innerHTML = notesTemplate();

    document.getElementById('btn-print-notes')?.addEventListener('click', () => window.print());
}

export function renderNotes() {
    const container = document.getElementById('notes-container');
    if (!container) return;

    const accounts = state.accounts;

    container.innerHTML = `
        <div class="p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 1 : État des Immobilisations</h4>
            <p class="text-xs text-neutral-500">Généré automatiquement à partir des comptes de Classe 2. Total brut immobilisé : <strong>${formatFCFA(getSumByPrefix(accounts, '2'))}</strong>.</p>
        </div>
        <div class="p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 2 : État des Stocks</h4>
            <p class="text-xs text-neutral-500">Généré automatiquement à partir des comptes de Classe 3. Total stocks : <strong>${formatFCFA(getSumByPrefix(accounts, '3'))}</strong>.</p>
        </div>
        <div class="p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 3 : Créances et Dettes</h4>
            <p class="text-xs text-neutral-500">Clients et comptes rattachés : <strong>${formatFCFA(getSumByPrefix(accounts, '41'))}</strong> | Fournisseurs : <strong>${formatFCFA(getCreditSumByPrefix(accounts, '40'))}</strong>.</p>
        </div>
    `;

    renderIcons();
}
