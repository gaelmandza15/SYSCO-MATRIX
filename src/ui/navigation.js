import { renderMatrixTable } from '../controllers/matrix.js';
import { renderControls } from '../controllers/controls.js';
import { renderNotes } from '../controllers/notes.js';
import { renderDashboard } from '../controllers/dashboard.js';
import { renderSnapshots } from '../controllers/backup.js';

const TITLES = {
    dashboard: 'Tableau de Bord & Synthèse',
    balance: 'Balance Générale des Comptes',
    matrix: "Matrice d'Intégration DSF (Système Normal)",
    controls: "Contrôles d'Équilibre et Cohérence",
    notes: 'Notes Annexes Automatiques',
    backup: 'Sauvegardes & Historique',
    settings: 'Paramètres & Règles',
};

export function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach((btn) => {
        const active = btn.getAttribute('data-nav') === tabId;
        btn.classList.toggle('nav-active', active);
    });

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = TITLES[tabId] ?? '';

    if (tabId === 'matrix') renderMatrixTable();
    if (tabId === 'controls') renderControls();
    if (tabId === 'notes') renderNotes();
    if (tabId === 'backup') renderSnapshots();
    renderDashboard();
}
