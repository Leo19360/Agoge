/* ============================================
   AGOGE - Import du dump Open Food Facts -> table aliments (MySQL)
   Utilise la CLI mysql.exe pour LOAD DATA LOCAL INFILE.
   Mapping des colonnes PAR NOM de header (auto-détecté, robuste).
   ============================================ */
const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const CSV_FILE = process.env.CSV_FILE || path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');
const MYSQL_CLI = process.env.MYSQL_CLI || 'C:\\laragon\\bin\\mysql\\mysql-8.4.3-winx64\\bin\\mysql.exe';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || '3306';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'agoge';

// Colonnes cibles : nom dans le header CSV -> colonne MySQL
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

function mysqlExec(sql) {
  const args = [
    `-h ${DB_HOST}`,
    `-P ${DB_PORT}`,
    `-u ${DB_USER}`,
    DB_PASSWORD ? `-p${DB_PASSWORD}` : '',
    `-D ${DB_NAME}`,
    `--local-infile=1`,
    `-e "${sql.replace(/"/g, '\\"')}"`
  ];
  const cmd = `"${MYSQL_CLI}" ${args.filter(Boolean).join(' ')}`;
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 500 * 1024 * 1024, stdio: ['pipe', 'pipe', 'inherit'] });
}

async function readHeader() {
  const rl = readline.createInterface({ input: fs.createReadStream(CSV_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    rl.close();
    return line.split('\t');
  }
  return [];
}

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Fichier introuvable : ${CSV_FILE}`);
    process.exit(1);
  }

  // 1. Lire le header et construire le mapping dynamique
  const header = await readHeader();
  const nbCols = header.length;
  console.log(`Header: ${nbCols} colonnes`);

  const nameToIndex = {};
  header.forEach((name, i) => { nameToIndex[name] = i; });

  const mapping = []; // [{ csvName, idx, mysqlCol, numeric }]
  const missing = [];
  for (const [csvName, mysqlCol] of Object.entries(TARGETS)) {
    const idx = nameToIndex[csvName];
    if (idx === undefined) {
      missing.push(csvName);
      continue;
    }
    mapping.push({ idx, mysqlCol, numeric: NUMERIC_COLS.includes(mysqlCol) });
  }
  if (missing.length) {
    console.warn(`⚠️ Colonnes absentes du header (ignorées) : ${missing.join(', ')}`);
  }
  console.log(`Mapping: ${mapping.length} colonnes mappées`);

  // 2. Activer local_infile
  mysqlExec("SET GLOBAL local_infile = 1");
  console.log('local_infile activé');

  // 3. Créer la table (drop + recreate pour repartir proprement)
  mysqlExec("DROP TABLE IF EXISTS aliments");
  mysqlExec(
    "CREATE TABLE aliments (" +
    "id BIGINT AUTO_INCREMENT PRIMARY KEY, " +
    "code VARCHAR(20) NOT NULL, " +
    "product_name VARCHAR(255) NULL, " +
    "generic_name VARCHAR(255) NULL, " +
    "brands VARCHAR(255) NULL, " +
    "quantity VARCHAR(100) NULL, " +
    "categories VARCHAR(500) NULL, " +
    "countries_en VARCHAR(255) NULL, " +
    "ingredients_text MEDIUMTEXT NULL, " +
    "allergens VARCHAR(500) NULL, " +
    "nutriscore_grade VARCHAR(10) NULL, " +
    "nova_group INT NULL, " +
    "image_url VARCHAR(500) NULL, " +
    "image_small_url VARCHAR(500) NULL, " +
    "energy_kj_100g DOUBLE NULL, " +
    "energy_kcal_100g DOUBLE NULL, " +
    "fat_100g DOUBLE NULL, " +
    "saturated_fat_100g DOUBLE NULL, " +
    "carbohydrates_100g DOUBLE NULL, " +
    "sugars_100g DOUBLE NULL, " +
    "fiber_100g DOUBLE NULL, " +
    "proteins_100g DOUBLE NULL, " +
    "salt_100g DOUBLE NULL, " +
    "sodium_100g DOUBLE NULL, " +
    "unique_scans_n INT NULL" +
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
  );
  console.log('Table aliments créée');

  // 4. Construire le LOAD DATA
  const vars = Array.from({ length: nbCols }, (_, i) => `@c${i}`).join(', ');
  const sets = mapping.map((m) => {
    if (m.numeric) return `${m.mysqlCol} = NULLIF(@c${m.idx}, '') + 0`;
    return `${m.mysqlCol} = NULLIF(@c${m.idx}, '')`;
  }).join(', ');

  const csvPath = CSV_FILE.replace(/\\/g, '/');
  const loadSql = [
    `LOAD DATA LOCAL INFILE '${csvPath}'`,
    `INTO TABLE aliments`,
    `CHARACTER SET utf8mb4`,
    `FIELDS TERMINATED BY '\\t'`,
    `OPTIONALLY ENCLOSED BY '"'`,
    `ESCAPED BY '\\\\'`,
    `LINES TERMINATED BY '\\n'`,
    `IGNORE 1 LINES`,
    `(${vars})`,
    `SET ${sets}`
  ].join(' ');

  console.log('Import en cours (fichier de 12 Go — patience, ça peut prendre longtemps)...');
  console.time('import');
  const output = mysqlExec(loadSql);
  console.timeEnd('import');
  if (output.trim()) console.log('Résultat:', output.trim());

  // 5. Créer les index (après import = beaucoup plus rapide)
  console.log('Création des index...');
  mysqlExec("CREATE INDEX idx_aliments_code ON aliments(code)");
  mysqlExec("CREATE INDEX idx_aliments_name ON aliments(product_name)");
  mysqlExec("CREATE INDEX idx_aliments_brands ON aliments(brands)");
  console.log('Index créés');

  // 6. Vérifier
  const cnt = mysqlExec("SELECT COUNT(*) AS n FROM aliments").trim();
  const sample = mysqlExec(
    "SELECT code, product_name, brands, energy_kcal_100g, proteins_100g, carbohydrates_100g, fat_100g FROM aliments WHERE product_name IS NOT NULL AND energy_kcal_100g IS NOT NULL LIMIT 5"
  ).trim();
  console.log(`Total produits importés : ${cnt}`);
  console.log('Échantillon (avec macros) :');
  console.log(sample);
  console.log('Terminé ✅');
}

main().catch(e => {
  console.error('Erreur:', e.message);
  process.exit(1);
});

