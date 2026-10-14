import { state } from '../state/store.js';
import { runControls } from '../lib/accounting.js';
import { renderIcons } from '../ui/icons.js';

export function controlsTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <h3 class="text-sm font-semibold text-neutral-900 mb-1">Contrôles d'Équilibre et Cohérence SYSCOHADA</h3>
            <p class="text-xs text-neutral-500 mb-6">Validation des règles fondamentales de la comptabilité générale et de la DSF.</p>
            <div class="space-y-4" id="controls-list"></div>
        </div>
    `;
}

export function initControls() {
    const container = document.getElementById('tab-controls');
    if (container) container.innerHTML = controlsTemplate();
}

export function renderControls() {
    const container = document.getElementById('controls-list');
    if (!container) return;

    container.innerHTML = '';

    if (state.accounts.length === 0) {
        container.innerHTML = `
            <div class="p-4 rounded-2xl border border-neutral-200/80 bg-neutral-50 flex items-start space-x-3">
                <div class="mt-0.5"><i data-lucide="info" class="w-5 h-5 text-neutral-400"></i></div>
                <div>
                    <h4 class="text-xs font-semibold text-neutral-900">Aucune donnée</h4>
                    <p class="text-xs text-neutral-500 mt-0.5">Saisissez ou chargez une balance pour exécuter les contrôles.</p>
                </div>
            </div>
        `;
        renderIcons();
        return;
    }

    const controls = runControls(state.accounts);

    controls.forEach((c) => {
        const v = controlVisual(c);
        const div = document.createElement('div');
        div.className = 'p-4 rounded-2xl border border-neutral-200/80 bg-neutral-50';
        div.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="mt-0.5">
                    <i data-lucide="${v.icon}" class="w-5 h-5 ${v.color}"></i>
                </div>
                <div class="flex-1">
                    <div class="flex items-center justify-between gap-3">
                        <h4 class="text-xs font-semibold text-neutral-900">${c.title}</h4>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium border ${v.badgeColor} shrink-0">${v.badge}</span>
                    </div>
                    <p class="text-xs text-neutral-500 mt-1">${c.detail}</p>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    renderIcons();
}

/**
 * Détermine l'apparence d'un contrôle selon son état.
 * `info` = observation neutre (ni conforme ni problème), affichée sobrement.
 */
function controlVisual(c) {
    if (c.passed && c.severity !== 'info') {
        return {
            icon: 'check-circle-2',
            color: 'text-emerald-600',
            badge: 'Conforme',
            badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
    }
    if (c.severity === 'info') {
        return {
            icon: 'info',
            color: 'text-neutral-500',
            badge: 'Information',
            badgeColor: 'bg-neutral-100 text-neutral-600 border-neutral-200',
        };
    }
    if (c.severity === 'warning') {
        return {
            icon: 'alert-circle',
            color: 'text-amber-600',
            badge: 'À vérifier',
            badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
        };
    }
    return {
        icon: 'x-circle',
        color: 'text-rose-600',
        badge: 'Non conforme',
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    };
}
