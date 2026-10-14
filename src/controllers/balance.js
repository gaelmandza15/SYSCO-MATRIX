import { state, clearAccounts, deleteAccount } from '../state/store.js';
import { formatFCFA } from '../lib/format.js';
import { renderIcons } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { renderDashboard } from './dashboard.js';

export function balanceTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h3 class="text-sm font-semibold text-neutral-900">Balance Générale des Comptes (SYSCOHADA Révisé)</h3>
                    <p class="text-xs text-neutral-500 mt-0.5">Saisissez ou importez les soldes par compte pour alimenter la matrice DSF.</p>
                </div>
                <div class="flex items-center space-x-3">
                    <button id="btn-add-account" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors flex items-center space-x-2">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        <span>Ajouter un Compte</span>
                    </button>
                    <button id="btn-clear" class="px-3.5 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-200 transition-colors border border-neutral-200">
                        Réinitialiser
                    </button>
                </div>
            </div>

            <div class="flex items-center space-x-4 mb-4">
                <div class="relative flex-1">
                    <i data-lucide="search" class="w-4 h-4 text-neutral-400 absolute left-3.5 top-3"></i>
                    <input type="text" id="balance-search" placeholder="Rechercher par numéro de compte ou intitulé..." class="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <select id="class-filter" class="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                    <option value="">Toutes les classes</option>
                    <option value="1">Classe 1: Capitaux Propres</option>
                    <option value="2">Classe 2: Immobilisations</option>
                    <option value="3">Classe 3: Stocks</option>
                    <option value="4">Classe 4: Tiers</option>
                    <option value="5">Classe 5: Trésorerie</option>
                    <option value="6">Classe 6: Charges</option>
                    <option value="7">Classe 7: Produits</option>
                </select>
            </div>

            <div class="border border-neutral-200 rounded-2xl overflow-hidden">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-neutral-50 border-b border-neutral-200 text-neutral-500 text-xs font-medium">
                            <th class="p-3.5">N° Compte</th>
                            <th class="p-3.5">Intitulé du Compte</th>
                            <th class="p-3.5 text-right">Solde Débiteur</th>
                            <th class="p-3.5 text-right">Solde Créditeur</th>
                            <th class="p-3.5 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="balance-table-body" class="divide-y divide-neutral-100 text-xs text-neutral-900"></tbody>
                </table>
            </div>
        </div>
    `;
}

export function initBalance() {
    const container = document.getElementById('tab-balance');
    if (container) container.innerHTML = balanceTemplate();

    const search = document.getElementById('balance-search');
    const filter = document.getElementById('class-filter');
    if (search) search.addEventListener('input', renderBalanceTable);
    if (filter) filter.addEventListener('change', renderBalanceTable);

    document.getElementById('btn-add-account')?.addEventListener('click', openAccountModal);
    document.getElementById('btn-clear')?.addEventListener('click', async () => {
        if (confirm('Voulez-vous vraiment réinitialiser toute la balance ?')) {
            await clearAccounts();
            renderBalanceTable();
            showToast('Balance réinitialisée.');
        }
    });
}

export function renderBalanceTable() {
    const tbody = document.getElementById('balance-table-body');
    if (!tbody) return;

    const search = (document.getElementById('balance-search')?.value ?? '').toLowerCase();
    const classFilter = document.getElementById('class-filter')?.value ?? '';

    const filtered = state.accounts.filter((acc) => {
        const matchesSearch =
            acc.code.toLowerCase().includes(search) || acc.name.toLowerCase().includes(search);
        const matchesClass = classFilter === '' || acc.code.startsWith(classFilter);
        return matchesSearch && matchesClass;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-neutral-400">Aucun compte trouvé</td></tr>`;
        return;
    }

    filtered.forEach((acc) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-neutral-50 transition-colors border-b border-neutral-100';
        tr.innerHTML = `
            <td class="p-3.5 font-semibold text-neutral-900">${acc.code}</td>
            <td class="p-3.5 text-neutral-700">${acc.name}</td>
            <td class="p-3.5 text-right font-medium">${formatFCFA(acc.debit)}</td>
            <td class="p-3.5 text-right font-medium">${formatFCFA(acc.credit)}</td>
            <td class="p-3.5 text-center">
                <button data-delete="${acc.id}" class="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-delete'));
            await deleteAccountAction(id);
        });
    });

    renderIcons();
    renderDashboard();
}

async function deleteAccountAction(id) {
    await deleteAccount(id);
    renderBalanceTable();
    showToast('Compte supprimé.');
}

function openAccountModal() {
    const modal = document.getElementById('account-modal');
    document.getElementById('modal-code').value = '';
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-debit').value = 0;
    document.getElementById('modal-credit').value = 0;
    modal.classList.remove('hidden');
}
