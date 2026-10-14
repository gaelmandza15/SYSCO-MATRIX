# SYSC-MATRIX

Application de bureau pour la **matrice d'intégration Balance → DSF** selon le
**SYSCOHADA Révisé** (Système Normal, espace OHADA).

Passage automatisé de la balance générale aux états financiers normalisés
(Bilan, Compte de Résultat), avec contrôles d'équilibre, notes annexes et
export des rapports.

## Fonctionnalités

- **Tableau de bord** — indicateurs clés (actif, chiffre d'affaires, résultat net)
  et statut d'équilibre en temps réel.
- **Balance générale** — saisie, recherche, filtrage par classe, suppression.
- **Matrice d'intégration DSF** — correspondance automatique des postes du Bilan
  Actif / Passif et du Compte de Résultat.
- **Contrôles d'équilibre** — vérifications réelles :
  - équilibre de la balance (débit = crédit) ;
  - équilibre du bilan (actif = passif) ;
  - concordance du résultat net (compte 13) ;
  - conformité à la nomenclature OHADA (classes 1 à 8).
- **Notes annexes automatiques** — immobilisations, stocks, créances et dettes.
- **Export Excel (.xlsx)** — classeur complet à 7 onglets.
- **Export PDF** — document mis en page, prêt à imprimer.
- **Paramètres** — raison sociale, NIF, pays, date de clôture.

## Architecture

```
├── index.html               # coquille de l'application
├── src/                     # frontend (Vanilla JS + Vite)
│   ├── main.js              # point d'entrée, bootstrap
│   ├── controllers/         # un contrôleur par onglet
│   ├── lib/                 # logique métier (accounting.js, format, sums)
│   ├── matrix/              # définitions des postes DSF
│   ├── state/               # état central
│   ├── db/                  # client Tauri (invoke)
│   ├── ui/                  # gabarit, navigation, icônes, toasts
│   └── styles/              # Tailwind + styles globaux
└── src-tauri/               # backend (Rust)
    └── src/
        ├── lib.rs           # bootstrap Tauri
        ├── db.rs            # SQLite (rusqlite, bundled)
        ├── commands.rs      # commandes exposées au frontend
        ├── accounting.rs    # logique comptable (miroir du frontend)
        ├── export.rs        # génération du classeur Excel
        ├── pdf.rs           # génération du rapport PDF
        └── dsf.rs           # définition des postes DSF
```

La logique comptable est **partagée** entre le frontend (`src/lib/accounting.js`)
et le backend (`src-tauri/src/accounting.rs`) afin que l'interface et les
exports produisent exactement les mêmes résultats.

## Technologies

| Couche | Technologie |
|---|---|
| Application | [Tauri v2](https://tauri.app/) |
| Backend | Rust (rusqlite, rust_xlsxwriter, printpdf) |
| Base de données | SQLite (compilé dans le binaire, aucune dépendance système) |
| Frontend | JavaScript (Vanilla) + [Vite](https://vitejs.dev/) |
| Styles | [Tailwind CSS](https://tailwindcss.com/) |
| Icônes | [Lucide](https://lucide.dev/) |

## Fonctionnement hors-ligne

L'application ne nécessite **aucune connexion internet** :

- Tailwind est compilé localement (pas de CDN).
- La police Inter est embarquée dans le binaire.
- Les icônes Lucide sont incluses.
- SQLite est compilé dans l'exécutable.

## Prérequis

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Sur Windows : les [Build Tools C++](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  (nécessaires à la compilation de SQLite et Tauri).

## Installation

```bash
npm install
```

## Développement

```bash
npm run tauri dev
```

## Compilation de l'exécutable

```bash
npm run tauri build
```

Les binaires et installeurs sont générés dans `src-tauri/target/release/bundle/`.

## Tests

```bash
cd src-tauri && cargo test
```

## Données

La base SQLite (`sysc_matrix.db`) est créée automatiquement au premier
lancement dans le dossier de données applicatives du système
(`%APPDATA%/com.sysc.matrix/` sous Windows).

Le bouton **« Charger Balance Témoin »** insère un jeu d'exemple équilibré de
15 comptes couvrant les 7 classes, pour découvrir l'outil.

## Licence

MIT — voir le fichier [LICENSE](LICENSE).
