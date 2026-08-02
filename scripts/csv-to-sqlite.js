/* ============================================
   AGOGE - Conversion CSV Open Food Facts -> SQLite
   Lit en.openfoodfacts.org.products.csv (TSV, 12 Go)
   et produit data/aliments.db
   Mapping des colonnes PAR NOM de header (robuste)
   Usage : node scripts/csv-to-sqlite.js [--limit N] [--file chemin]
   ============================================ */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

// Colonnes cibles (nom dans le header du CSV) -> colonne MySQL/SQLite
const TARGETS = {
  code: 'code',
  product_name: 'product_name',
  generic_name: 'generic_name',
  quantity: 'quantity',
  brands: 'brands',
  categories: 'categories',
  countries_en: 'countries_en',
  ingredients_text: 'ingredients_text',
  allergens: 'allergens',
  nutriscore_grade: 'nutriscore_grade',
  nova_group: 'nova_group',
  image_url: 'image_url',
  image_small_url: 'image_small_url',
  'energy-kj_100g': 'energy_kj_100g',
  'energy-kcal_100g': 'energy_kcal_100g',
  fat_100g: 'fat_100g',
  'saturated-fat_100g': 'saturated_fat_100g',
  carbohydrates_100g: 'carbohydrates_100g',
  sugars_100g: 'sugars_100g',
  fiber_100g: 'fiber_100g',
  proteins_100g: 'proteins_100g',
  salt_100g: 'salt_100g',
  sodium_100g: 'sodium_100g',
  unique_scans_n: 'unique_scans_n'
};

const NUMERIC_COLS = [
  'energy_kj_100g', 'energy_kcal_100g', 'fat_100g', 'saturated_fat_100g',
  'carbohydrates_100g', 'sugars_100g', 'fiber_100g', 'proteins_100g',
  'salt_100g', 'sodium_100g', 'nova_group', 'unique_scans_n'
];

const DEFAULT_FILE = path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');
const DEFAULT_OUT = path.join(__dirname, '..', 'data', 'aliments.db');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { file: DEFAULT_FILE, out: DEFAULT_OUT, limit: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit') opts.limit = parseInt(args[i + 1], 10);
    if (args[i] === '--file') opts.file = args[i + 1];
    if (args[i] === '--out') opts.out = args[i + 1];
  }
  return opts;
}

// Nettoie les valeurs CSV (enlève les retours chariot, tronque si trop long)
function clean(v, maxLen) {
