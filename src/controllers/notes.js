import { state } from '../state/store.js';
import { formatFCFA, fiscalYear } from '../lib/format.js';
import { getSumByPrefix, getCreditSumByPrefix } from '../lib/sums.js';
import { renderIcons } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

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

    document.getElementById('btn-print-notes')?.addEventListener('click', printNotes);
}

/** Contenu HTML des trois notes — partagé entre l'écran et l'impression. */
function notesHtml(accounts) {
    return `
        <div class="note-block p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 1 : État des Immobilisations</h4>
            <p class="text-xs text-neutral-500">Généré automatiquement à partir des comptes de Classe 2. Total brut immobilisé : <strong>${formatFCFA(getSumByPrefix(accounts, '2'))}</strong>.</p>
        </div>
        <div class="note-block p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 2 : État des Stocks</h4>
            <p class="text-xs text-neutral-500">Généré automatiquement à partir des comptes de Classe 3. Total stocks : <strong>${formatFCFA(getSumByPrefix(accounts, '3'))}</strong>.</p>
        </div>
        <div class="note-block p-4 rounded-2xl border border-neutral-200 bg-neutral-50 space-y-2">
            <h4 class="text-xs font-semibold text-neutral-900">Note 3 : Créances et Dettes</h4>
            <p class="text-xs text-neutral-500">Clients et comptes rattachés : <strong>${formatFCFA(getSumByPrefix(accounts, '41'))}</strong> | Fournisseurs : <strong>${formatFCFA(getCreditSumByPrefix(accounts, '40'))}</strong>.</p>
        </div>
    `;
}

export function renderNotes() {
    const container = document.getElementById('notes-container');
    if (!container) return;

    container.innerHTML = notesHtml(state.accounts);

    renderIcons();
}

/**
 * Imprime uniquement les Notes Annexes dans un document propre :
 * fenêtre deimpression dédiée avec en-tête société / exercice, au lieu
 * d'un window.print() qui imprime toute la page applicative.
 */
function printNotes() {
    const s = state.settings;
    const company = s.company || 'Entreprise';
    const year = fiscalYear(s.closing_date);
    const dateStr = new Date().toLocaleDateString('fr-FR');

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        showToast("Impression bloquée par le navigateur. Autorisez les fenêtres pop-up pour cette application.");
        return;
    }

    win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Notes Annexes — ${esc(company)}</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 40px; font-size: 13px; line-height: 1.5; }
    header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 28px; }
    .company { font-size: 18px; font-weight: bold; }
    .meta { font-size: 12px; color: #444; margin-top: 4px; }
    h1 { font-size: 16px; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 24px; }
    section { margin-bottom: 24px; page-break-inside: avoid; }
    h2 { font-size: 14px; border-left: 4px solid #111; padding-left: 8px; margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; font-size: 12px; }
    th { background: #f1f1f1; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    footer { margin-top: 40px; border-top: 1px solid #999; padding-top: 8px; font-size: 11px; color: #555; display: flex; justify-content: space-between; }
    @media print { body { margin: 20mm; } }
</style>
</head>
<body>
<header>
    <div class="company">${esc(company)}</div>
    <div class="meta">${s.nif ? `NIF : ${esc(s.nif)} — ` : ''}Exercice clos le ${s.closing_date ? esc(s.closing_date) : '(non renseigné)'} · Notes annexes au bilan de l'exercice ${year}</div>
</header>
<h1>Notes Annexes — SYSCOHADA Révisé</h1>

<section>
    <h2>Note 1 : État des Immobilisations</h2>
    <p>Généré automatiquement à partir des comptes de la classe 2.</p>
    ${accountsTable(state.accounts.filter((a) => a.code.startsWith('2')))}
    <table><tr><th>Total brut immobilisé</th><td class="num"><strong>${formatFCFA(getSumByPrefix(state.accounts, '2'))}</strong></td></tr></table>
</section>

<section>
    <h2>Note 2 : État des Stocks</h2>
    <p>Généré automatiquement à partir des comptes de la classe 3.</p>
    ${accountsTable(state.accounts.filter((a) => a.code.startsWith('3')))}
    <table><tr><th>Total stocks</th><td class="num"><strong>${formatFCFA(getSumByPrefix(state.accounts, '3'))}</strong></td></tr></table>
</section>

<section>
    <h2>Note 3 : Créances et Dettes</h2>
    ${accountsTable(state.accounts.filter((a) => a.code.startsWith('41')), 'Créances clients et comptes rattachés')}
    <table><tr><th>Clients et comptes rattachés (débit)</th><td class="num"><strong>${formatFCFA(getSumByPrefix(state.accounts, '41'))}</strong></td></tr></table>
    ${accountsTable(state.accounts.filter((a) => a.code.startsWith('40')), 'Dettes fournisseurs et comptes rattachés')}
    <table><tr><th>Fournisseurs (crédit)</th><td class="num"><strong>${formatFCFA(getCreditSumByPrefix(state.accounts, '40'))}</strong></td></tr></table>
</section>

<footer>
    <span>${esc(company)} — Notes annexes exercice ${year}</span>
    <span>Édité le ${dateStr} via SYSC-MATRIX</span>
</footer>
</body>
</html>`);
    win.document.close();
    win.focus();
    // Laisse le temps au rendu avant d'ouvrir la boîte d'impression.
    setTimeout(() => { win.print(); }, 250);
}

function accountsTable(rows, caption) {
    if (!rows.length) return `<p style="color:#666;font-style:italic">Aucun compte renseigné.</p>`;
    return `${caption ? `<p style="margin-top:10px"><strong>${caption}</strong></p>` : ''}
    <table>
        <thead><tr><th>N° Compte</th><th>Intitulé</th><th style="text-align:right">Solde Débiteur</th><th style="text-align:right">Solde Créditeur</th></tr></thead>
        <tbody>${rows.map((a) => `<tr><td>${esc(a.code)}</td><td>${esc(a.name)}</td><td class="num">${formatFCFA(a.debit)}</td><td class="num">${formatFCFA(a.credit)}</td></tr>`).join('')}</tbody>
    </table>`;
}

function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
