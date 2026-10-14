import { state, createSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot } from '../state/store.js';
import { dbClient, pickAndExportBackup, pickBackupFile, readFileAsText } from '../db/client.js';
import { renderIcons } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { dialogPrompt, dialogConfirm } from '../ui/dialog.js';

/** Échappement HTML pour les libellés stockés (labels de snapshots). */
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function backupTemplate() {
    return `
        <div class="bg-white p-6 rounded-2xl border border-neutral-200/80 shadow-sm">
            <h3 class="text-sm font-semibold text-neutral-900 mb-1">Sauvegardes & Historique</h3>
            <p class="text-xs text-neutral-500 mb-4">
                Chaque action destructive (réinitialisation, import en remplacement) enregistre
                automatiquement un point de restauration. Vous pouvez aussi créer un point manuel
                et revenir en arrière à tout moment — la restauration est elle-même réversible.
            </p>

            <div class="flex flex-wrap items-center gap-2 mb-4">
                <button id="btn-snapshot-create" class="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-medium hover:bg-neutral-800 transition-colors flex items-center space-x-2">
                    <i data-lucide="camera" class="w-3.5 h-3.5"></i>
                    <span>Créer un point de restauration</span>
                </button>
                <button id="btn-backup-export" class="px-3.5 py-2 bg-white text-neutral-700 border border-neutral-300 rounded-xl text-xs font-medium hover:bg-neutral-100 transition-colors flex items-center space-x-2">
                    <i data-lucide="download" class="w-3.5 h-3.5"></i>
                    <span>Exporter (.json)</span>
                </button>
                <button id="btn-backup-import" class="px-3.5 py-2 bg-white text-neutral-700 border border-neutral-300 rounded-xl text-xs font-medium hover:bg-neutral-100 transition-colors flex items-center space-x-2">
                    <i data-lucide="upload" class="w-3.5 h-3.5"></i>
                    <span>Importer des sauvegardes</span>
                </button>
                <input type="file" id="backup-file" accept=".json,application/json" class="hidden">
            </div>

            <div id="snapshot-list" class="border border-neutral-200 rounded-2xl overflow-hidden">
                <p class="p-4 text-xs text-neutral-400">Chargement de l'historique…</p>
            </div>
        </div>
    `;
}

export function initBackup() {
    const container = document.getElementById('tab-backup');
    if (!container) return;
    container.innerHTML = backupTemplate();

    document.getElementById('btn-snapshot-create')?.addEventListener('click', async () => {
        try {
            const label = await dialogPrompt({
                title: 'Créer un point de restauration',
                message: 'Un instantané complet de la balance et des paramètres sera enregistré.',
                value: 'Point de restauration manuel',
                placeholder: 'Nom du point de restauration',
            });
            if (label === null) return;
            await createSnapshot(label.trim() || 'Point de restauration manuel');
            showToast('Point de restauration créé.');
            await renderSnapshots();
        } catch (err) {
            showToast(`Échec : ${err.message ?? err}`);
        }
    });

    document.getElementById('btn-backup-export')?.addEventListener('click', async () => {
        try {
            if (dbClient.isTauri()) {
                const written = await pickAndExportBackup(null);
                if (written) showToast(`Sauvegardes exportées : ${written}`);
            } else {
                // Aperçu navigateur : l'état courant est d'abord snapshoté pour
                // que le fichier exporté contienne un point complet et restaurable.
                await createSnapshot('Sauvegarde manuelle');
                const payload = {
                    app: 'SYSC-MATRIX',
                    version: 1,
                    exported_at: new Date().toLocaleString('fr-FR'),
                    snapshots: [{
                        label: 'Sauvegarde manuelle',
                        created_at: new Date().toLocaleString('fr-FR'),
                        accounts: JSON.parse(JSON.stringify(state.accounts)),
                        settings: { ...state.settings },
                    }],
                };
                const written = await pickAndExportBackup(payload);
                if (written) showToast(`Sauvegardes exportées : ${written}`);
                await renderSnapshots();
            }
        } catch (err) {
            showToast(`Export impossible : ${err.message ?? err}`);
        }
    });

    document.getElementById('btn-backup-import')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('backup-file');
        if (!fileInput) return;
        if (dbClient.isTauri()) {
            try {
                const path = await pickBackupFile();
                if (!path) return;
                const count = await dbClient.importBackup(path);
                showToast(`${count} sauvegarde(s) importée(s).`);
                await renderSnapshots();
            } catch (err) {
                showToast(`Import impossible : ${err.message ?? err}`);
            }
        } else {
            fileInput.value = '';
            fileInput.click();
        }
    });

    document.getElementById('backup-file')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const doc = JSON.parse(await readFileAsText(file));
            const snaps = Array.isArray(doc.snapshots) ? doc.snapshots : [];
            if (!snaps.length) throw new Error('aucun snapshot dans ce fichier');
            const added = await importBrowserSnapshots(snaps);
            showToast(`${added} sauvegarde(s) importée(s).`);
            await renderSnapshots();
        } catch (err) {
            showToast(`Fichier invalide : ${err.message ?? err}`);
        } finally {
            e.target.value = '';
        }
    });
}

/** Import navigateur : injecte les snapshots du fichier dans l'historique mémoire. */
async function importBrowserSnapshots(snaps) {
    return dbClient.importBackup(null, snaps);
}

export async function renderSnapshots() {
    const panel = document.getElementById('snapshot-list');
    if (!panel) return;

    let metas = [];
    try {
        metas = await listSnapshots();
    } catch (err) {
        panel.innerHTML = `<p class="p-4 text-xs text-red-600">Historique indisponible : ${esc(err.message ?? err)}</p>`;
        return;
    }

    if (!metas.length) {
        panel.innerHTML = `<p class="p-4 text-xs text-neutral-400">Aucun point de restauration pour le moment.</p>`;
        return;
    }

    panel.innerHTML = `
        <table class="w-full text-left border-collapse text-xs">
            <thead>
                <tr class="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
                    <th class="p-3">Point de restauration</th>
                    <th class="p-3">Date</th>
                    <th class="p-3 text-right">Comptes</th>
                    <th class="p-3 text-center">Actions</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100 text-neutral-900">
                ${metas.map((m) => `
                    <tr class="hover:bg-neutral-50 transition-colors">
                        <td class="p-3 font-medium">${esc(m.label)}</td>
                        <td class="p-3 text-neutral-600">${esc(m.created_at)}</td>
                        <td class="p-3 text-right">${m.account_count}</td>
                        <td class="p-3 text-center whitespace-nowrap">
                            <button data-restore="${m.id}" title="Revenir à ce point" class="px-2.5 py-1 bg-neutral-900 text-white rounded-lg text-[11px] font-medium hover:bg-neutral-800 transition-colors mr-1.5">Restaurer</button>
                            <button data-delete-snap="${m.id}" title="Supprimer ce point" class="p-1 text-neutral-400 hover:text-red-600 transition-colors">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                            </button>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>
    `;

    panel.querySelectorAll('[data-restore]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-restore'));
            const meta = metas.find((x) => x.id === id);
            const ok = await dialogConfirm({
                title: 'Revenir à ce point de restauration ?',
                message: 'La balance et les paramètres actuels seront remplacés. Un nouveau point sera enregistré avant : l\'opération reste annulable.',
                lines: [
                    `Point : ${meta?.label ?? id}`,
                    `Date : ${meta?.created_at ?? '?'}`,
                    `Comptes : ${meta?.account_count ?? '?'}`,
                ],
                okLabel: 'Restaurer',
            });
            if (!ok) return;
            try {
                await restoreSnapshot(id);
                showToast('État restauré. L\'opération est annulable via l\'historique.');
                await renderSnapshots();
                renderIcons();
            } catch (err) {
                showToast(`Restauration échouée : ${err.message ?? err}`);
            }
        });
    });

    panel.querySelectorAll('[data-delete-snap]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = Number(btn.getAttribute('data-delete-snap'));
            const ok = await dialogConfirm({
                title: 'Supprimer ce point de restauration ?',
                message: 'Cette action est définitive : ce point disparaîtra de l\'historique.',
                okLabel: 'Supprimer',
                danger: true,
            });
            if (!ok) return;
            try {
                await deleteSnapshot(id);
                await renderSnapshots();
            } catch (err) {
                showToast(`Suppression échouée : ${err.message ?? err}`);
            }
        });
    });

    renderIcons();
}
