import { state } from '../state/store.js';
import { formatFCFA } from '../lib/format.js';
import { computeStatements, BALANCE_TOLERANCE } from '../lib/accounting.js';

export function dashboardTemplate() {
    return `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                <div class="flex items-center justify-between text-neutral-500 mb-2">
                    <span class="text-xs font-medium">Total Bilan Actif</span>
                    <i data-lucide="trending-up" class="w-4 h-4 text-neutral-400"></i>
                </div>
                <div id="kpi-actif" class="text-xl font-bold text-neutral-900">0 F</div>
                <div class="text-xs text-neutral-500 mt-1">Équilibre actif / passif validé</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                <div class="flex items-center justify-between text-neutral-500 mb-2">
                    <span class="text-xs font-medium">Chiffre d'Affaires HT</span>
                    <i data-lucide="dollar-sign" class="w-4 h-4 text-neutral-400"></i>
                </div>
                <div id="kpi-ca" class="text-xl font-bold text-neutral-900">0 F</div>
                <div class="text-xs text-neutral-500 mt-1">Comptes 70...</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                <div class="flex items-center justify-between text-neutral-500 mb-2">
                    <span class="text-xs font-medium">Résultat Net (Bénéfice/Perte)</span>
                    <i data-lucide="pie-chart" class="w-4 h-4 text-neutral-400"></i>
                </div>
                <div id="kpi-result" class="text-xl font-bold text-neutral-900">0 F</div>
                <div class="text-xs text-neutral-500 mt-1">Résultat de l'exercice</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-neutral-200/80 shadow-sm">
                <div class="flex items-center justify-between text-neutral-500 mb-2">
                    <span class="text-xs font-medium">Statut d'Équilibre</span>
                    <i data-lucide="check-circle" class="w-4 h-4 text-neutral-600"></i>
                </div>
                <div id="kpi-status" class="text-sm font-semibold text-amber-600">En attente de données</div>
                <div class="text-xs text-neutral-500 mt-1">Contrôles SYSCOHADA</div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
                <h3 class="text-sm font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
                    <i data-lucide="activity" class="w-4 h-4 text-neutral-500"></i>
                    <span>Synthèse des États Financiers SYSCOHADA Révisé</span>
                </h3>
                <p class="text-xs text-neutral-500 mb-6">
                    Cette matrice automatise le passage de la balance générale aux états financiers normalisés (Bilan, Compte de Résultat, Tableau des Flux de Trésorerie) selon les normes en vigueur dans l'espace OHADA.
                </p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60">
                        <span class="text-xs font-medium text-neutral-500">Actif Immobilisé Brut</span>
                        <div id="summary-immobilise" class="text-base font-bold text-neutral-900 mt-1">0 F</div>
                    </div>
                    <div class="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60">
                        <span class="text-xs font-medium text-neutral-500">Actif Circulant & Trésorerie</span>
                        <div id="summary-circulant" class="text-base font-bold text-neutral-900 mt-1">0 F</div>
                    </div>
                    <div class="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60">
                        <span class="text-xs font-medium text-neutral-500">Capitaux Propres & Assimilés</span>
                        <div id="summary-capitaux" class="text-base font-bold text-neutral-900 mt-1">0 F</div>
                    </div>
                    <div class="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60">
                        <span class="text-xs font-medium text-neutral-500">Total Dettes & Passif</span>
                        <div id="summary-dettes" class="text-base font-bold text-neutral-900 mt-1">0 F</div>
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm flex flex-col justify-between">
                <div>
                    <h3 class="text-sm font-semibold text-neutral-900 mb-4 flex items-center space-x-2">
                        <i data-lucide="info" class="w-4 h-4 text-neutral-500"></i>
                        <span>Guide Rapide</span>
                    </h3>
                    <ul class="space-y-3 text-xs text-neutral-600">
                        <li class="flex items-start space-x-2">
                            <span class="w-4 h-4 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center font-bold text-[10px] mt-0.5">1</span>
                            <span>Importez ou saisissez votre balance dans l'onglet <strong>Balance Générale</strong>.</span>
                        </li>
                        <li class="flex items-start space-x-2">
                            <span class="w-4 h-4 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center font-bold text-[10px] mt-0.5">2</span>
                            <span>Vérifiez l'affectation automatique dans la <strong>Matrice d'Intégration DSF</strong>.</span>
                        </li>
                        <li class="flex items-start space-x-2">
                            <span class="w-4 h-4 rounded-full bg-neutral-100 text-neutral-900 flex items-center justify-center font-bold text-[10px] mt-0.5">3</span>
                            <span>Exécutez les <strong>Contrôles d'Équilibre</strong> pour valider la conformité.</span>
                        </li>
                    </ul>
                </div>
                <div class="mt-6 pt-4 border-t border-neutral-100">
                    <button data-goto="balance" class="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-medium transition-colors">
                        Commencer la Saisie
                    </button>
                </div>
            </div>
        </div>
    `;
}

export function initDashboard() {
    const container = document.getElementById('tab-dashboard');
    if (container) container.innerHTML = dashboardTemplate();
}

export function renderDashboard() {
    const accounts = state.accounts;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    const s = computeStatements(accounts);

    set('kpi-actif', formatFCFA(s.totalActif));
    set('kpi-ca', formatFCFA(s.chiffreAffaires));
    set('kpi-result', formatFCFA(s.resultatNet));
    set('summary-immobilise', formatFCFA(s.immoNet));
    set('summary-circulant', formatFCFA(s.actifCirculant + s.tresorerie));
    set('summary-capitaux', formatFCFA(s.capitauxPropres));
    set('summary-dettes', formatFCFA(s.totalPassif));

    // Statut d'équilibre : Actif total = Passif total.
    const isBalanced = Math.abs(s.ecartBilan) <= BALANCE_TOLERANCE;
    const statusEl = document.getElementById('kpi-status');
    if (statusEl) {
        if (accounts.length === 0) {
            statusEl.textContent = 'En attente de données';
            statusEl.className = 'text-sm font-semibold text-amber-600';
        } else if (isBalanced) {
            statusEl.textContent = 'Équilibre Parfait';
            statusEl.className = 'text-sm font-semibold text-emerald-600';
        } else {
            statusEl.textContent = `Écart de ${formatFCFA(Math.abs(s.ecartBilan))}`;
            statusEl.className = 'text-sm font-semibold text-rose-600';
        }
    }
}
