import {
    createIcons,
    LayoutDashboard,
    FileSpreadsheet,
    Layers,
    ShieldCheck,
    FileText,
    Sliders,
    Database,
    Download,
    TrendingUp,
    DollarSign,
    PieChart,
    CheckCircle,
    Activity,
    Info,
    Plus,
    Search,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Printer,
    Check,
    FileType,
    XCircle,
    Camera,
    History,
    Upload,
    Pencil,
} from 'lucide';

/**
 * Sous-ensemble des icônes réellement utilisées dans l'interface.
 *
 * On importe les icônes une par une (plutôt que le jeu complet `icons`,
 * soit ~1700 icônes) afin de garder le bundle léger.
 * Les clés doivent être en PascalCase : `createIcons` convertit
 * `data-lucide="trash-2"` en `Trash2` pour la résolution.
 */
const ICONS = {
    LayoutDashboard,
    FileSpreadsheet,
    Layers,
    ShieldCheck,
    FileText,
    Sliders,
    Database,
    Download,
    TrendingUp,
    DollarSign,
    PieChart,
    CheckCircle,
    Activity,
    Info,
    Plus,
    Search,
    Trash2,
    CheckCircle2,
    AlertCircle,
    Printer,
    Check,
    FileType,
    XCircle,
    Camera,
    History,
    Upload,
    Pencil,
};

/**
 * Crée les icônes pour tous les éléments `[data-lucide]` du document.
 *
 * Le build ESM de `lucide` n'expose pas le jeu d'icônes globalement
 * (contrairement au build UMD du CDN) : il faut donc lui passer
 * explicitement l'objet `icons`.
 */
export function renderIcons() {
    createIcons({
        icons: ICONS,
        nameAttr: 'data-lucide',
    });
}
