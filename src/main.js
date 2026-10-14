import './styles/input.css';

import { appLayout } from './ui/layout.js';
import { renderIcons } from './ui/icons.js';
import { switchTab } from './ui/navigation.js';
import { showToast } from './ui/toast.js';

import * as store from './state/store.js';

import { initDashboard, renderDashboard } from './controllers/dashboard.js';
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

function bindGlobalEvents() {
    // Navigation sidebar.
    document.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.getAttribute('data-nav')));
    });

    // Boutons du header.
    document.getElementById('btn-sample')?.addEventListener('click', async () => {
        await store.loadSampleData();
        renderBalanceTable();
        renderDashboard();
        showToast('Balance témoin SYSCOHADA chargée.');
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
