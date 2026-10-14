import { state, saveSettings } from '../state/store.js';
import { showToast } from '../ui/toast.js';

export function settingsTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <h3 class="text-sm font-semibold text-neutral-900 mb-1">Paramètres de l'Entreprise et Règles</h3>
            <p class="text-xs text-neutral-500 mb-6">Personnalisez les informations de la société et les paramètres de calcul pour l'exercice 2026.</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1.5">Raison Sociale</label>
                    <input type="text" id="set-company" value="SARL EXEMPLE SYSCOHADA" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1.5">N° d'Identification Fiscale (NIF)</label>
                    <input type="text" id="set-nif" value="M012612345678X" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1.5">Pays (Espace OHADA)</label>
                    <select id="set-country" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                        <option value="SN">Sénégal (XOF)</option>
                        <option value="CI">Côte d'Ivoire (XOF)</option>
                        <option value="CM">Cameroun (XAF)</option>
                        <option value="GA">Gabon (XAF)</option>
                        <option value="BF">Burkina Faso (XOF)</option>
                        <option value="ML">Mali (XOF)</option>
                        <option value="NE">Niger (XOF)</option>
                        <option value="TG">Togo (XOF)</option>
                        <option value="BJ">Bénin (XOF)</option>
                        <option value="CG">Congo (XAF)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-neutral-700 mb-1.5">Exercice clos le</label>
                    <input type="date" id="set-date" value="2026-12-31" class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                </div>
            </div>

            <div class="mt-6 pt-6 border-t border-neutral-100 flex justify-end">
                <button id="btn-save-settings" class="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors">
                    Enregistrer les Paramètres
                </button>
            </div>
        </div>
    `;
}

function hydrate() {
    const s = state.settings;
    if (s.company) setVal('set-company', s.company);
    if (s.nif) setVal('set-nif', s.nif);
    if (s.country) setVal('set-country', s.country);
    if (s.closing_date) setVal('set-date', s.closing_date);
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

export function initSettings() {
    const container = document.getElementById('tab-settings');
    if (container) container.innerHTML = settingsTemplate();

    hydrate();

    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
        const settings = {
            company: document.getElementById('set-company').value,
            nif: document.getElementById('set-nif').value,
            country: document.getElementById('set-country').value,
            closing_date: document.getElementById('set-date').value,
        };
        await saveSettings(settings);
        showToast('Paramètres enregistrés avec succès.');
    });
}
