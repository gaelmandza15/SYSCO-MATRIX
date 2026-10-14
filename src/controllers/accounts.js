import { addAccount } from '../state/store.js';
import { showToast } from '../ui/toast.js';
import { renderBalanceTable } from './balance.js';

export function initAccountsModal() {
    const modal = document.getElementById('account-modal');

    document.getElementById('modal-cancel')?.addEventListener('click', closeAccountModal);
    document.getElementById('modal-save')?.addEventListener('click', saveAccount);

    // Fermer au clic sur l'overlay.
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeAccountModal();
    });
}

function closeAccountModal() {
    document.getElementById('account-modal').classList.add('hidden');
}

async function saveAccount() {
    const code = document.getElementById('modal-code').value.trim();
    const name = document.getElementById('modal-name').value.trim();
    const debit = parseFloat(document.getElementById('modal-debit').value) || 0;
    const credit = parseFloat(document.getElementById('modal-credit').value) || 0;

    if (!code || !name) {
        showToast("Veuillez renseigner le code et l'intitulé.");
        return;
    }

    await addAccount({ code, name, debit, credit });
    closeAccountModal();
    renderBalanceTable();
    showToast('Compte ajouté avec succès.');
}
