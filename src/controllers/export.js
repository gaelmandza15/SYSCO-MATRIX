import { exportDsfReport } from '../db/client.js';
import { showToast } from '../ui/toast.js';

/**
 * Exporte le rapport DSF au format Excel (.xlsx) via la boîte de
 * dialogue « Enregistrer sous », puis ouvre le fichier généré.
 */
export function runExportExcel() {
    return runExport('xlsx', 'Classeur Excel');
}

/**
 * Exporte le rapport DSF au format PDF via la boîte de dialogue
 * « Enregistrer sous », puis ouvre le fichier généré.
 */
export function runExportPdf() {
    return runExport('pdf', 'Document PDF');
}

async function runExport(format, label) {
    try {
        showToast(`Génération du rapport ${label}…`);
        const path = await exportDsfReport(format);
        if (path === null) {
            // L'utilisateur a annulé la boîte de dialogue.
            return;
        }
        showToast(`Rapport ${label} exporté avec succès.`);
    } catch (err) {
        console.error(err);
        showToast(`Échec de l'export : ${err}`);
    }
}

export { runExport };
