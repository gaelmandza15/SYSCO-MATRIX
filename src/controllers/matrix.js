import { state } from '../state/store.js';
import { formatFCFA } from '../lib/format.js';
import { rowsFor } from '../matrix/definitions.js';

export function matrixTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h3 class="text-sm font-semibold text-neutral-900">Matrice d'Intégration Balance vers DSF (Système Normal)</h3>
                    <p class="text-xs text-neutral-500 mt-0.5">Correspondance automatique des postes du Bilan Actif/Passif et du Compte de Résultat.</p>
                </div>
                <div class="flex space-x-2">
                    <button data-mview="bilan-actif" class="matrix-tab-btn px-3.5 py-2 rounded-xl text-xs font-medium transition-colors">Bilan Actif</button>
                    <button data-mview="bilan-passif" class="matrix-tab-btn px-3.5 py-2 rounded-xl text-xs font-medium transition-colors">Bilan Passif</button>
                    <button data-mview="compte-resultat" class="matrix-tab-btn px-3.5 py-2 rounded-xl text-xs font-medium transition-colors">Compte de Résultat</button>
                </div>
            </div>

            <div class="border border-neutral-200 rounded-2xl overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-xs font-medium">
                            <th class="p-3.5">Poste DSF / Référence</th>
                            <th class="p-3.5">Libellé du Poste</th>
                            <th class="p-3.5">Comptes associés</th>
                            <th class="p-3.5 text-right">Montant Net (F CFA)</th>
                        </tr>
                    </thead>
                    <tbody id="matrix-table-body" class="divide-y divide-neutral-100 text-xs text-neutral-900"></tbody>
                </table>
            </div>
        </div>
    `;
}

export function initMatrix() {
    const container = document.getElementById('tab-matrix');
    if (container) container.innerHTML = matrixTemplate();

    document.querySelectorAll('.matrix-tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => switchMatrixSubTab(btn.getAttribute('data-mview')));
    });

    applyMatrixTabStyle();
}

function switchMatrixSubTab(subTab) {
    state.currentMatrixSubTab = subTab;
    applyMatrixTabStyle();
    renderMatrixTable();
}

function applyMatrixTabStyle() {
    document.querySelectorAll('.matrix-tab-btn').forEach((btn) => {
        const active = btn.getAttribute('data-mview') === state.currentMatrixSubTab;
        btn.classList.toggle('bg-neutral-900', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('bg-neutral-100', !active);
        btn.classList.toggle('text-neutral-700', !active);
    });
}

export function renderMatrixTable() {
    const tbody = document.getElementById('matrix-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const rows = rowsFor(state.currentMatrixSubTab);

    rows.forEach((r) => {
        const matchingAccounts = state.accounts.filter((acc) => acc.code.startsWith(r.prefix));
        const total = matchingAccounts.reduce((sum, acc) => {
            return r.type === 'debit'
                ? sum + (acc.debit - acc.credit)
                : sum + (acc.credit - acc.debit);
        }, 0);

        const accountsListStr = matchingAccounts.map((a) => a.code).join(', ') || 'Aucun';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-neutral-50 transition-colors border-b border-neutral-100';
        tr.innerHTML = `
            <td class="p-3.5 font-semibold text-neutral-900">${r.ref}</td>
            <td class="p-3.5 text-neutral-700">${r.label}</td>
            <td class="p-3.5 text-neutral-500 font-mono text-[11px]">${accountsListStr}</td>
            <td class="p-3.5 text-right font-medium">${formatFCFA(total)}</td>
        `;
        tbody.appendChild(tr);
    });
}
