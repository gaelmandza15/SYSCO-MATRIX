import './styles/input.css';

import { appLayout } from './ui/layout.js';
import { renderIcons } from './ui/icons.js';
import { switchTab } from './ui/navigation.js';

import * as store from './state/store.js';
import { fiscalYear, currencyLabel } from './lib/format.js';

import { initDashboard } from './controllers/dashboard.js';
import { initBalance, renderBalanceTable } from './controllers/balance.js';
import { initMatrix } from './controllers/matrix.js';
import { initControls } from './controllers/controls.js';
import { initNotes } from './controllers/notes.js';
import { initSettings } from './controllers/settings.js';
import { initAccountsModal } from './controllers/accounts.js';
import { runExportExcel, runExportPdf } from './controllers/export.js';

function mountLayout() {
    const app = document.getElementById('app');
    app.innerHTML = appLayout();
}

/**
 * Année et devise de la sidebar dérivées des paramètres (exercice clos,
 * pays OHADA) — plus rien de codé en dur. Rappelée à chaque changement
 * de paramètres grâce à l'abonnement au store.
 */
function renderSidebarInfo() {
    const s = store.state.settings;
    const yearEl = document.getElementById('sidebar-year');
    const curEl = document.getElementById('sidebar-currency');
    if (yearEl) yearEl.textContent = String(fiscalYear(s.closing_date));
    if (curEl) curEl.textContent = currencyLabel(s.country);
}

function bindGlobalEvents() {
    // Navigation sidebar.
    document.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-nav')));
    });

    document.getElementById('btn-export')?.addEventListener('click', runExportExcel);
    document.getElementById('btn-export-pdf')?.addEventListener('click', runExportPdf);

    // Lien "Commencer la Saisie" du tableau de bord (délégué).
    document.addEventListener('click', (e) => {
        const goto = e.target.closest('[data-goto]');
        if (goto) switchTab(goto.getAttribute('data-goto'));
    });
}

async function bootstrap() {
    mountLayout();
    renderSidebarInfo();
    store.subscribe(renderSidebarInfo);

    // Initialiser chaque onglet (template + écouteurs).
    initDashboard();
    initBalance();
    initMatrix();
    initControls();
    initNotes();
    initSettings();
    initAccountsModal();

    bindGlobalEvents();

    // Charger les données depuis SQLite, puis premier rendu.
    await store.init();
    renderBalanceTable();
    // Applique l'état actif du premier onglet (Tableau de Bord).
    switchTab('dashboard');
    renderIcons();
}

bootstrap();
