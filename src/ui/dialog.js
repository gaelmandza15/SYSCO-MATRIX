/**
 * Boîtes de dialogue maison (remplacent prompt()/confirm() natifs, dont les
 * popups « localhost dit… » dégradent l'UX). Style aligné sur le modal
 * « account-modal » de layout.js.
 */

let overlayEl = null;
let lastFocus = null;
let keyHandler = null;

const CANCEL_HTML = `
    <button data-dialog="cancel" class="px-3.5 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-xs font-medium hover:bg-neutral-200 transition-colors">Annuler</button>
`;

function ensureOverlay() {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'dialog-overlay';
    overlayEl.className =
        'fixed inset-0 bg-neutral-900/20 backdrop-blur-xs flex items-center justify-center z-[60] hidden';
    document.body.appendChild(overlayEl);
    return overlayEl;
}

function close(result) {
    if (!overlayEl) return;
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
    }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
    const resolve = overlayEl.__resolve;
    overlayEl.__resolve = null;
    if (resolve) resolve(result);
}

/**
 * Dialogue générique à valeur (type prompt).
 * @returns {Promise<string|null>} la valeur saisie, ou null si annulé.
 */
export function dialogPrompt({ title, message = '', value = '', placeholder = '' }) {
    const overlay = ensureOverlay();
    return new Promise((resolve) => {
        overlay.__resolve = resolve;
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-md mx-4 p-6 rounded-2xl border border-neutral-200 shadow-xl space-y-4">
                <h3 class="text-sm font-semibold text-neutral-900">${escapeHtml(title)}</h3>
                ${message ? `<p class="text-xs text-neutral-500 -mt-2">${escapeHtml(message)}</p>` : ''}
                <input type="text" data-dialog="input" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}"
                    class="w-full px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs focus:outline-none focus:border-neutral-400">
                <div class="flex justify-end space-x-2 pt-1">
                    ${CANCEL_HTML}
                    <button data-dialog="ok" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors">Valider</button>
                </div>
            </div>`;
        const input = overlay.querySelector('[data-dialog="input"]');
        overlay.querySelector('[data-dialog="ok"]').addEventListener('click', () => close(input.value));
        overlay.querySelector('[data-dialog="cancel"]').addEventListener('click', () => close(null));
        keyHandler = (e) => {
            if (e.key === 'Escape') close(null);
            else if (e.key === 'Enter') close(input.value);
        };
        document.addEventListener('keydown', keyHandler);
        lastFocus = document.activeElement;
        overlay.classList.remove('hidden');
        input.focus();
        input.select();
    });
}

/**
 * Confirmation (type confirm).
 * @returns {Promise<boolean>} true si l'utilisateur confirme.
 */
export function dialogConfirm({ title, message = '', lines = [], okLabel = 'Confirmer', danger = false }) {
    const overlay = ensureOverlay();
    return new Promise((resolve) => {
        overlay.__resolve = resolve;
        const body = message
            ? `<p class="text-xs text-neutral-600 leading-relaxed">${escapeHtml(message)}</p>`
            : '';
        const list = lines.length
            ? `<div class="bg-neutral-50 border border-neutral-200 rounded-xl p-3 text-xs text-neutral-700 space-y-1">
                   ${lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
               </div>`
            : '';
        overlay.innerHTML = `
            <div class="bg-white w-full max-w-md mx-4 p-6 rounded-2xl border border-neutral-200 shadow-xl space-y-4">
                <h3 class="text-sm font-semibold text-neutral-900">${escapeHtml(title)}</h3>
                ${body}${list}
                <div class="flex justify-end space-x-2 pt-1">
                    ${CANCEL_HTML}
                    <button data-dialog="ok" class="px-3.5 py-2 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-800'} text-white rounded-xl text-xs font-medium transition-colors">${escapeHtml(okLabel)}</button>
                </div>
            </div>`;
        overlay.querySelector('[data-dialog="ok"]').addEventListener('click', () => close(true));
        overlay.querySelector('[data-dialog="cancel"]').addEventListener('click', () => close(false));
        keyHandler = (e) => {
            if (e.key === 'Escape') close(false);
        };
        document.addEventListener('keydown', keyHandler);
        lastFocus = document.activeElement;
        overlay.classList.remove('hidden');
        overlay.querySelector('[data-dialog="ok"]').focus();
    });
}

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHtml(s);
}
