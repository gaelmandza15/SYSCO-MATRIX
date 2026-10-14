/**
 * Gabarit statique de l'application (sidebar, header, onglets, modal, toast).
 * Les zones dynamiques sont remplies par les contrôleurs.
 */
export function appLayout() {
    return `
    <aside id="sidebar" class="w-80 bg-white border-r border-neutral-200 flex flex-col z-20 transition-all duration-300">
        <div class="p-6 border-b border-neutral-100 flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <div class="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-semibold text-sm">SM</div>
                <div>
                    <h1 class="font-semibold text-sm tracking-tight text-neutral-900">SYSC-MATRIX</h1>
                    <p class="text-xs text-neutral-500">SYSCOHADA Révisé • Système Normal</p>
                </div>
            </div>
        </div>

        <nav class="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            <button data-nav="dashboard" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="layout-dashboard" class="w-4 h-4 text-neutral-500"></i>
                <span>Tableau de Bord</span>
            </button>
            <button data-nav="balance" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="file-spreadsheet" class="w-4 h-4 text-neutral-500"></i>
                <span>Balance Générale</span>
            </button>
            <button data-nav="matrix" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="layers" class="w-4 h-4 text-neutral-500"></i>
                <span>Matrice d'Intégration DSF</span>
            </button>
            <button data-nav="controls" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="shield-check" class="w-4 h-4 text-neutral-500"></i>
                <span>Contrôles d'Équilibre</span>
            </button>
            <button data-nav="notes" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="file-text" class="w-4 h-4 text-neutral-500"></i>
                <span>Notes Annexes Automatiques</span>
            </button>
            <button data-nav="settings" class="nav-btn w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <i data-lucide="sliders" class="w-4 h-4 text-neutral-500"></i>
                <span>Paramètres & Règles</span>
            </button>
        </nav>

        <div class="p-4 border-t border-neutral-100">
            <div class="bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200/60">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-neutral-600">Exercice Comptable</span>
                    <span id="sidebar-year" class="text-xs font-semibold text-neutral-900">2026</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-xs font-medium text-neutral-600">Devise</span>
                    <span id="sidebar-currency" class="text-xs font-semibold text-neutral-900">FCFA (XOF/XAF)</span>
                </div>
            </div>
        </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-50">
        <header class="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-8 z-10">
            <div class="flex items-center space-x-4">
                <h2 id="page-title" class="text-base font-semibold text-neutral-900 tracking-tight">Tableau de Bord & Synthèse</h2>
                <span class="px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full text-xs font-medium border border-neutral-200">Système Normal</span>
            </div>

            <div class="flex items-center space-x-3">
                <button id="btn-sample" class="px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors flex items-center space-x-2 border border-neutral-200">
                    <i data-lucide="database" class="w-3.5 h-3.5"></i>
                    <span>Charger Balance Témoin</span>
                </button>
                <button id="btn-export-pdf" class="px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors flex items-center space-x-2 border border-neutral-200">
                    <i data-lucide="file-type" class="w-3.5 h-3.5"></i>
                    <span>Exporter PDF</span>
                </button>
                <button id="btn-export" class="px-3.5 py-2 rounded-xl text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition-colors flex items-center space-x-2">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>Exporter Excel</span>
                </button>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto p-8">
            <div id="tab-dashboard" class="space-y-6 max-w-7xl mx-auto tab-content"><!-- dashboard --></div>
            <div id="tab-balance" class="space-y-6 max-w-7xl mx-auto tab-content hidden"><!-- balance --></div>
            <div id="tab-matrix" class="space-y-6 max-w-7xl mx-auto tab-content hidden"><!-- matrix --></div>
            <div id="tab-controls" class="space-y-6 max-w-7xl mx-auto tab-content hidden"><!-- controls --></div>
            <div id="tab-notes" class="space-y-6 max-w-7xl mx-auto tab-content hidden"><!-- notes --></div>
            <div id="tab-settings" class="space-y-6 max-w-7xl mx-auto tab-content hidden"><!-- settings --></div>
        </div>
    </main>

    <div id="account-modal" class="fixed inset-0 bg-neutral-900/20 backdrop-blur-xs flex items-center justify-center z-50 hidden">
        <div class="bg-white w-full max-w-md p-6 rounded-2xl border border-neutral-200 shadow-xl space-y-4">
            <h3 class="text-sm font-semibold text-neutral-900" id="modal-title">Ajouter un Compte</h3>
            <div class="space-y-3">
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1">N° de Compte</label>
                    <input type="text" id="modal-code" placeholder="ex: 411000" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1">Intitulé</label>
                    <input type="text" id="modal-name" placeholder="ex: Clients" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1">Solde Débiteur (F CFA)</label>
                    <input type="number" id="modal-debit" value="0" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1">Solde Créditeur (F CFA)</label>
                    <input type="number" id="modal-credit" value="0" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
            </div>
            <div class="flex justify-end space-x-2 pt-2">
                <button id="modal-cancel" class="px-3.5 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-200">Annuler</button>
                <button id="modal-save" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800">Enregistrer</button>
            </div>
        </div>
    </div>

    <div id="toast" class="fixed bottom-6 right-6 bg-neutral-900 text-white px-4 py-3 rounded-2xl text-xs shadow-lg transform translate-y-20 opacity-0 transition-all duration-300 z-50 flex items-center space-x-2">
        <i data-lucide="check" class="w-4 h-4 text-emerald-400"></i>
        <span id="toast-msg">Action effectuée avec succès</span>
    </div>
    `;
}
