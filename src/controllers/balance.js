import { state, clearAccounts, deleteAccount, updateAccount, importAccounts } from '../state/store.js';
import { dbClient, pickBalanceFile, readFileAsText } from '../db/client.js';
import { formatFCFA } from '../lib/format.js';
import { renderIcons } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { renderDashboard } from './dashboard.js';

/** Échappement HTML minimal pour les données issues de fichiers externes. */
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Parseur CSV autonome (RFC 4180 simplifié) : repli navigateur pour
 * l'import de balance (côté Tauri, le parsing est fait dans le backend).
 */
export function parseCsv(text) {
    text = String(text).replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const sepCandidates = [',', ';', '\t', '|']
        .map((s) => ({ s, n: firstLine.split(s).length - 1 }))
        .sort((a, b) => b.n - a.n);
    const sep = sepCandidates[0].n > 0 ? sepCandidates[0].s : ';';

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === sep) {
            row.push(field); field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            rows.push(row); row = [];
        } else field += c;
    }
    if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Convertit un champ monétaire du tableur en nombre (« 1 234 567,89 » → 1234567.89). */
export function parseAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
    // On ne conserve que les chiffres et les séparateurs de nombres :
    // espaces insécables, signes monétaires et autres suffixes sont éliminés.
    const cleaned = String(value ?? '').replace(/[^0-9.,-]/g, '');
    if (!cleaned) return 0;
    // Le dernier séparateur decimal est la virgule ou le point selon l'usage.
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;
    if (lastComma > -1 && lastDot > -1) {
        // Les deux présents : le plus à droite est le séparateur décimal.
        normalized = lastComma > lastDot
            ? cleaned.replace(/\./g, '').replace(',', '.')
            : cleaned.replace(/,/g, '');
    } else if (lastComma > -1) {
        const parts = cleaned.split(',');
        // Virgules de milliers si les groupes après sont de taille 3 (ex. « 1,234,567 »).
        normalized = (parts.length > 2 && parts.slice(1).every((p) => p.length === 3))
            ? cleaned.replace(/,/g, '')
            : cleaned.replace(/,/g, '.');
    }
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Clé de comparaison d'en-tête : minuscules, sans ponctuation ni accents.
 * L'ordre est important : NFD d'abord (é → e + U+0301), puis retrait des
 * caractères non alphanumériques — l'inverse détruirait les diacritiques.
 */
const normHeader = (s) =>
    String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

/**
 * Transforme des lignes CSV en comptes importables.
 * Colonnes détectées par en-tête (fallback : position — code, intitulé, débit, crédit).
 * Retourne `{ rows, skipped }`.
 */
export function rowsToAccounts(rows) {
    if (!rows.length) return { rows: [], skipped: 0 };

    const header = rows[0].map(normHeader);
    const find = (...candidates) => {
        for (const cand of candidates) {
            const idx = header.findIndex((h) => h === cand || h.startsWith(cand));
            if (idx !== -1) return idx;
        }
        return -1;
    };
    // Candidats triés du plus spécifique au plus court : « startsWith »
    // impose que les préfixes longs soient testés avant les courts
    // (« nom » est un préfixe de « denomination », « n » de tout le monde).
    // NB : « ncompte » couvre « N° Compte » normalisé (le « ° » disparaît).
    const colCode = find('ncompte', 'numero', 'compte', 'account', 'code', 'numero_compte', 'numrocompte', 'ref');
    const colName = find('intitul', 'libelle', 'designation', 'denomination', 'description', 'name', 'nom');
    const colDebit = find('soldedebiteur', 'soldebiteur', 'montantdebit', 'debit');
    // « soldecrediteur » : « Solde Créditeur » normalisé (minuscules, sans
    // accents ni ponctuation) donne « soldecrediteur » — un seul « c ».
    const colCredit = find('soldecrediteur', 'soldecriditeur', 'montantcredit', 'credit');

    const hasHeader = colCode !== -1 || colName !== -1 || colDebit !== -1 || colCredit !== -1;
    // Garde-fou : si un en-tête ambigu fait correspondre deux rôles à la même
    // colonne, on libère le rôle non-code. Et si un rôle manque alors qu'un
    // en-tête existe, on retombe sur la position — sauf si la colonne est déjà
    // capturée par un autre rôle (ex. « Nom » capté par « name » ≠ position 1 ?
    // non : ici « nom » serait libre ; mais « Name » volé à « numero » ne doit
    // pas bloquer la position 0).
    let nameCol = colName === colCode ? -1 : colName;
    let debitCol = colDebit === colCode ? -1 : colDebit;
    let creditCol = colCredit === colCode ? -1 : colCredit;
    const fallback = { code: 0, name: 1, debit: 2, credit: 3 };
    const assigned = [colCode, nameCol, debitCol, creditCol];
    const pick = (idx, posIfMissing) => {
        if (idx !== -1) return idx;
        if (!hasHeader) return posIfMissing;
        // Repli positionnel conditionnel : colonne non déjà prise par un rôle.
        return assigned.includes(posIfMissing) ? -1 : posIfMissing;
    };
    const cols = {
        code: pick(colCode, fallback.code),
        name: pick(nameCol, fallback.name),
        debit: pick(debitCol, fallback.debit),
        credit: pick(creditCol, fallback.credit),
    };

    const out = [];
    let skipped = 0;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    for (const r of dataRows) {
        const get = (i) => (i >= 0 && i < r.length ? r[i] : '');
        const code = String(get(cols.code)).trim();
        // Ignorer les lignes de totaux et les lignes sans numéro de compte.
        const hCode = normHeader(code);
        if (!code || /^(totaux?|somme|soustotal)/.test(hCode) || !/[0-9]/.test(code)) { skipped++; continue; }
        out.push({
            code,
            name: String(get(cols.name)).trim(),
            debit: Math.abs(parseAmount(get(cols.debit))),
            credit: Math.abs(parseAmount(get(cols.credit))),
        });
    }
    return { rows: out, skipped };
}

export function balanceTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h3 class="text-sm font-semibold text-neutral-900">Balance Générale des Comptes (SYSCOHADA Révisé)</h3>
                    <p class="text-xs text-neutral-500 mt-0.5">Saisissez ou importez les soldes par compte pour alimenter la matrice DSF.</p>
                </div>
                <div class="flex items-center space-x-3">
                    <button id="btn-import-balance" class="px-3.5 py-2 bg-white text-neutral-700 border border-neutral-300 rounded-xl text-xs font-medium hover:bg-neutral-100 transition-colors flex items-center space-x-2">
                        <i data-lucide="upload" class="w-3.5 h-3.5"></i>
                        <span>Importer (CSV/Excel)</span>
                    </button>
                    <button id="btn-add-account" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors flex items-center space-x-2">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        <span>Ajouter un Compte</span>
                    </button>
                    <button id="btn-clear" class="px-3.5 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-200 transition-colors border border-neutral-200">
                        Réinitialiser
                    </button>
                </div>
            </div>

            <input type="file" id="balance-file" accept=".csv,.txt,.xlsx,text/csv" class="hidden">
            <div id="import-preview" class="hidden mb-4 p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-3"></div>

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

    document.getElementById('btn-add-account')?.addEventListener('click', () => openAccountModal());
    document.getElementById('btn-clear')?.addEventListener('click', async () => {
        if (confirm('Voulez-vous vraiment réinitialiser toute la balance ?')) {
            await clearAccounts();
            renderBalanceTable();
            showToast('Balance réinitialisée.');
        }
    });

    // Import de balance CSV / Excel.
    document.getElementById('btn-import-balance')?.addEventListener('click', onImportClick);
    document.getElementById('balance-file')?.addEventListener('change', onFileChosen);
}

/* --------------------------- Import de balance -------------------------- */

/** Mémoire tampon des lignes en attente de confirmation d'import. */
let pendingImport = null;

async function onImportClick() {
    const fileInput = document.getElementById('balance-file');
    if (!fileInput) return;

    if (dbClient.isTauri()) {
        // Côté Tauri : boîte de dialogue native + parsing dans le backend.
        try {
            const path = await pickBalanceFile();
            if (!path) return;
            const rows = await dbClient.parseBalanceFile(path);
            showImportPreview({ rows, skipped: 0 }, `Fichier : ${String(path).split(/[\\/]/).pop()}`);
        } catch (err) {
            showToast(`Import impossible : ${err instanceof Error ? err.message : err}`);
        }
    } else {
        // Aperçu navigateur : <input type="file"> + parseur JS.
        fileInput.value = '';
        fileInput.click();
    }
}

async function onFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        if (/\.xlsx?$/i.test(file.name)) {
            showToast('La lecture directe d\u2019Excel (.xlsx) requiert l\u2019application de bureau ; exportez votre fichier en CSV.');
            return;
        }
        const text = await readFileAsText(file);
        const parsed = rowsToAccounts(parseCsv(text));
        showImportPreview(parsed, `Fichier : ${file.name}`);
    } catch (err) {
        showToast(`Lecture du fichier impossible : ${err.message ?? err}`);
    } finally {
        e.target.value = '';
    }
}

/** Affiche la prévisualisation des lignes détectées avant confirmation. */
function showImportPreview({ rows, skipped }, sourceLabel) {
    pendingImport = rows;
    const panel = document.getElementById('import-preview');
    if (!panel) return;

    if (!rows.length) {
        panel.classList.remove('hidden');
        panel.innerHTML = `
            <p class="text-xs text-neutral-600">Aucun compte exploitable détecté (${esc(sourceLabel)}). Vérifiez les en-têtes : N° Compte, Intitulé, Solde Débiteur, Solde Créditeur.</p>`;
        return;
    }

    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    const previewRows = rows.slice(0, 5)
        .map((r) => `<tr class="border-b border-neutral-200/70">
            <td class="py-1 pr-4 font-semibold">${esc(r.code)}</td>
            <td class="py-1 pr-4">${esc(r.name)}</td>
            <td class="py-1 pr-4 text-right">${formatFCFA(r.debit)}</td>
            <td class="py-1 text-right">${formatFCFA(r.credit)}</td>
        </tr>`).join('');

    panel.classList.remove('hidden');
    panel.innerHTML = `
        <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-neutral-900">Prévisualisation de l\u2019import — ${esc(sourceLabel)}</h4>
            <button id="import-cancel" class="text-xs text-neutral-500 hover:text-neutral-900">Fermer</button>
        </div>
        <p class="text-xs text-neutral-600">
            ${rows.length} compte(s) détecté(s)${skipped ? `, ${skipped} ligne(s) ignorée(s)` : ''} —
            Total Débit : <strong>${formatFCFA(totalDebit)}</strong> · Total Crédit : <strong>${formatFCFA(totalCredit)}</strong>
        </p>
        <div class="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table class="w-full text-left text-xs text-neutral-800 p-2">
                <thead><tr class="text-neutral-500 border-b border-neutral-200">
                    <th class="py-1.5 pr-4 font-medium">N° Compte</th>
                    <th class="py-1.5 pr-4 font-medium">Intitulé</th>
                    <th class="py-1.5 pr-4 text-right font-medium">Débit</th>
                    <th class="py-1.5 text-right font-medium">Crédit</th>
                </tr></thead>
                <tbody>${previewRows}</tbody>
            </table>
            ${rows.length > 5 ? `<p class="p-2 text-[11px] text-neutral-400">… et ${rows.length - 5} ligne(s) supplémentaires.</p>` : ''}
        </div>
        <div class="flex items-center justify-end space-x-2 pt-1">
            <label class="flex items-center space-x-1.5 mr-auto text-xs text-neutral-600 cursor-pointer">
                <input type="checkbox" id="import-replace" class="rounded border-neutral-300">
                <span>Remplacer la balance existante (sinon : fusion par code)</span>
            </label>
            <button id="import-confirm" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors">
                Confirmer l\u2019import
            </button>
        </div>
    `;

    document.getElementById('import-cancel')?.addEventListener('click', hideImportPreview);
    document.getElementById('import-confirm')?.addEventListener('click', confirmImport);
}

function hideImportPreview() {
    pendingImport = null;
    const panel = document.getElementById('import-preview');
    if (panel) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
    }
}

async function confirmImport() {
    if (!pendingImport || !pendingImport.length) return;
    const replace = !!document.getElementById('import-replace')?.checked;
    const rows = pendingImport;
    hideImportPreview();
    try {
        await importAccounts(rows, replace);
        renderBalanceTable();
        showToast(`${rows.length} compte(s) importé(s)${replace ? ' (balance remplacée)' : ''}.`);
    } catch (err) {
        showToast(`Import échoué : ${err.message ?? err}`);
    }
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
            <td class="p-3.5 font-semibold text-neutral-900">${esc(acc.code)}</td>
            <td class="p-3.5 text-neutral-700">${esc(acc.name)}</td>
            <td class="p-3.5 text-right font-medium">${formatFCFA(acc.debit)}</td>
            <td class="p-3.5 text-right font-medium">${formatFCFA(acc.credit)}</td>
            <td class="p-3.5 text-center whitespace-nowrap">
                <button data-edit="${acc.id}" title="Modifier le compte" class="p-1.5 text-neutral-400 hover:text-neutral-900 transition-colors">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button data-delete="${acc.id}" title="Supprimer le compte" class="p-1.5 text-neutral-400 hover:text-red-600 transition-colors">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-edit'));
            const acc = state.accounts.find((a) => a.id === id);
            if (acc) openAccountModal(acc);
        });
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

/**
 * Ouvre le modal d'un compte : création (sans argument) ou modification
 * (avec le compte à corriger pré-rempli). L'état d'édition est exposé au
 * contrôleur du modal via `window.__editingAccount`.
 */
function openAccountModal(account = null) {
    const modal = document.getElementById('account-modal');
    if (!modal) return;
    window.__editingAccount = account;
    document.getElementById('modal-title').textContent =
        account ? `Modifier le compte ${account.code}` : 'Ajouter un Compte';
    document.getElementById('modal-code').value = account ? account.code : '';
    document.getElementById('modal-name').value = account ? account.name : '';
    document.getElementById('modal-debit').value = account ? account.debit : 0;
    document.getElementById('modal-credit').value = account ? account.credit : 0;
    modal.classList.remove('hidden');
}
