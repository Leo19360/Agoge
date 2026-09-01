/* ============================================
   AGOGE - Connexion MySQL
   Compatible local (Laragon) et cloud (Render/Aiven)
   ============================================ */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { getEnv } = require('./config');

const DB_HOST = getEnv('DB_HOST', { defaultValue: 'localhost' });
const DB_PORT = parseInt(getEnv('DB_PORT', { defaultValue: '3306' }), 10);
const DB_USER = getEnv('DB_USER', { defaultValue: 'root' });
const DB_PASSWORD = getEnv('DB_PASSWORD', { defaultValue: '' });
const DB_NAME = getEnv('DB_NAME', { defaultValue: 'agoge' });
const DATABASE_URL = getEnv('DATABASE_URL', { defaultValue: '' }) || getEnv('MYSQL_URL', { defaultValue: '' }) || getEnv('MYSQL_DATABASE_URL', { defaultValue: '' });

function sslConfig() {
  const shouldUseSsl =
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1' ||
    process.env.AIVEN_SSL === 'true' ||
    process.env.AIVEN_SSL === '1' ||
    /(?:^|[?&])(ssl|sslmode)=/i.test(DATABASE_URL);

  if (!shouldUseSsl) return undefined;
  return {
    rejectUnauthorized: false
  };
}

function getConnectionConfig(options = {}) {
  const { includeDatabase = true } = options;
  const ssl = sslConfig();

  if (DATABASE_URL) {
    try {
      const parsedUrl = new URL(DATABASE_URL);
      const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, '')) || DB_NAME;

      return {
        host: parsedUrl.hostname || DB_HOST,
        port: parseInt(parsedUrl.port || DB_PORT, 10),
        user: decodeURIComponent(parsedUrl.username || DB_USER),
        password: decodeURIComponent(parsedUrl.password || DB_PASSWORD),
        ...(includeDatabase ? { database: databaseName } : {}),
        ...(ssl ? { ssl } : {})
      };
    } catch (err) {
      console.warn('⚠️ DATABASE_URL invalide, utilisation des variables DB_* :', err.message);
    }
  }

  return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    ...(includeDatabase ? { database: DB_NAME } : {}),
    ...(ssl ? { ssl } : {})
  };
}

// Pool lazy : il n'est créé qu'à la première requête.
// Indispensable en serverless : les fonctions Netlify peuvent
// importer db.js sans connexion active au démarrage.
let pool = null;

function getPool() {
  if (!pool) {
    const config = getConnectionConfig();
    pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4_unicode_ci',
      dateStrings: true
    });
  }
  return pool;
}

// Crée la base de données si elle n'existe pas.
// Non bloquante : si les privilèges CREATE sont refusés (typique en cloud),
// on continue — la base doit alors être créée manuellement.
async function ensureDatabase() {
  try {
    const config = getConnectionConfig({ includeDatabase: false });
    const conn = await mysql.createConnection({
      ...config,
      database: undefined
    });
    const databaseName = (DATABASE_URL ? new URL(DATABASE_URL).pathname.replace(/^\/+/, '') : DB_NAME) || DB_NAME;
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
  } catch (e) {
    console.warn('⚠️  ensureDatabase ignoré (privilèges insuffisants en cloud) :', e.message);
  }
}

// Wrappers compatibles avec l'ancienne API SQLite (promesses)
async function get(sql, ...params) {
  const [rows] = await getPool().query(sql, params);
  return rows[0];
}

async function all(sql, ...params) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function run(sql, ...params) {
  const [result] = await getPool().query(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

function sanitizeText(value, { maxLength = 255, allowEmpty = true } = {}) {
  if (value === null || value === undefined) return allowEmpty ? null : null;
  const str = String(value).trim();
  if (!str) return allowEmpty ? null : null;
  const cleaned = str.replace(/\s+/g, ' ');
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function parsePositiveInt(value, min = 1, max = 1000000) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (!Number.isInteger(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const date = new Date(`${str}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return str;
}

function escapeLikeTerm(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NULL,
    birth_date VARCHAR(20) NULL,
    sex VARCHAR(20) NULL,
    age INT NULL,
    height INT NULL,
    goal VARCHAR(50) NULL,
    photo_data MEDIUMBLOB NULL,
    photo_mime VARCHAR(50) NULL,
    theme VARCHAR(20) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    date VARCHAR(20) NOT NULL,
    notes TEXT NULL,
    is_template TINYINT(1) DEFAULT 0,
    duration_min INT NULL,
    volume DOUBLE DEFAULT 0,
    total_sets INT DEFAULT 0,
    total_reps INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS exercises (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    muscle_group VARCHAR(100) NULL,
    nb_sets INT DEFAULT 3,
    rest_seconds INT DEFAULT 90,
    sort_order INT DEFAULT 0,
    done TINYINT(1) DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    exercise_id INT NOT NULL,
    set_number INT NOT NULL,
    weight DOUBLE DEFAULT 0,
    reps INT DEFAULT 0,
    rpe VARCHAR(10) NULL,
    target_reps VARCHAR(20) NULL,
    target_weight DOUBLE DEFAULT 0,
    done TINYINT(1) DEFAULT 0,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS food_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date VARCHAR(20) NOT NULL,
    food_name VARCHAR(255) NOT NULL,
    quantity DOUBLE DEFAULT 100,
    unit VARCHAR(10) DEFAULT 'g',
    meal_type VARCHAR(20) NULL,
    calories DOUBLE DEFAULT 0,
    proteins DOUBLE DEFAULT 0,
    carbs DOUBLE DEFAULT 0,
    fats DOUBLE DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS goals (
    user_id INT PRIMARY KEY,
    calories DOUBLE DEFAULT 0,
    proteins DOUBLE DEFAULT 0,
    carbs DOUBLE DEFAULT 0,
    fats DOUBLE DEFAULT 0,
    water_goal INT DEFAULT 2500,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS weight_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date VARCHAR(20) NOT NULL,
    weight DOUBLE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS body_measurements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date VARCHAR(20) NOT NULL,
    waist DOUBLE NULL,
    chest DOUBLE NULL,
    arms DOUBLE NULL,
    forearms DOUBLE NULL,
    thighs DOUBLE NULL,
    calves DOUBLE NULL,
    hips DOUBLE NULL,
    shoulders DOUBLE NULL,
    neck DOUBLE NULL,
    notes TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS exercise_library (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL DEFAULT 0,
    name VARCHAR(255) NOT NULL,
    muscle_group VARCHAR(100) NULL,
    category VARCHAR(100) NULL,
    description TEXT NULL,
    rest_seconds INT DEFAULT 90,
    UNIQUE KEY uq_lib (user_id, name),
    INDEX idx_lib_muscle (muscle_group)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS water_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date VARCHAR(20) NOT NULL,
    amount_ml INT NOT NULL DEFAULT 250,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS active_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    session_id INT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS notification_settings (
    user_id INT PRIMARY KEY,
    workout_enabled TINYINT(1) DEFAULT 0,
    workout_time VARCHAR(10) NULL,
    meal_enabled TINYINT(1) DEFAULT 0,
    meal_time VARCHAR(10) NULL,
    weigh_enabled TINYINT(1) DEFAULT 0,
    weigh_time VARCHAR(10) NULL,
    hydration_enabled TINYINT(1) DEFAULT 0,
    hydration_interval INT DEFAULT 60,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS photos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    date VARCHAR(20) NOT NULL,
    photo_path VARCHAR(500) NULL,
    photo_data MEDIUMBLOB NULL,
    photo_mime VARCHAR(50) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS sync_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(255) NOT NULL,
    payload TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS aliments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    product_name VARCHAR(255) NULL,
    generic_name VARCHAR(255) NULL,
    brands VARCHAR(255) NULL,
    quantity VARCHAR(100) NULL,
    categories VARCHAR(500) NULL,
    countries_en VARCHAR(255) NULL,
    ingredients_text MEDIUMTEXT NULL,
    allergens VARCHAR(500) NULL,
    nutriscore_grade VARCHAR(10) NULL,
    nova_group INT NULL,
    image_url VARCHAR(500) NULL,
    image_small_url VARCHAR(500) NULL,
    energy_kj_100g DOUBLE NULL,
    energy_kcal_100g DOUBLE NULL,
    fat_100g DOUBLE NULL,
    saturated_fat_100g DOUBLE NULL,
    carbohydrates_100g DOUBLE NULL,
    sugars_100g DOUBLE NULL,
    fiber_100g DOUBLE NULL,
    proteins_100g DOUBLE NULL,
    salt_100g DOUBLE NULL,
    sodium_100g DOUBLE NULL,
    unique_scans_n INT NULL,
    INDEX idx_code (code),
    INDEX idx_product_name (product_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS generic_foods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NULL,
    source_name VARCHAR(50) NOT NULL DEFAULT 'USDA',
    source_url VARCHAR(500) NULL,
    calories_per_100g DOUBLE DEFAULT 0,
    protein_g_100g DOUBLE DEFAULT 0,
    carbs_g_100g DOUBLE DEFAULT 0,
    fat_g_100g DOUBLE DEFAULT 0,
    fiber_g_100g DOUBLE DEFAULT 0,
    sugar_g_100g DOUBLE DEFAULT 0,
    salt_g_100g DOUBLE DEFAULT 0,
    sodium_g_100g DOUBLE DEFAULT 0,
    quantity VARCHAR(100) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_generic_name (name),
    INDEX idx_generic_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS recipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    serving_size_g DOUBLE DEFAULT 0,
    calories DOUBLE DEFAULT 0,
    proteins DOUBLE DEFAULT 0,
    carbs DOUBLE DEFAULT 0,
    fats DOUBLE DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipe_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    grams DOUBLE DEFAULT 0,
    calories_per_100g DOUBLE DEFAULT 0,
    protein_g_100g DOUBLE DEFAULT 0,
    carbs_g_100g DOUBLE DEFAULT 0,
    fat_g_100g DOUBLE DEFAULT 0,
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

// Migration : ajoute photo_data / photo_mime sur les anciennes bases
async function migratePhotosColumn() {
  try {
    const rows = await getPool().query('SHOW COLUMNS FROM photos LIKE \'photo_data\'');
    if (rows[0].length === 0) {
      await getPool().query('ALTER TABLE photos ADD COLUMN photo_data MEDIUMBLOB NULL');
      await getPool().query('ALTER TABLE photos ADD COLUMN photo_mime VARCHAR(50) NULL');
      console.log('✅ Migration photos : colonnes photo_data ajoutées');
    }
  } catch (e) {
    console.warn('⚠️  Migration photos ignorée :', e.message);
  }
}

// Migration : ajoute les colonnes de la refonte "séances permanentes"
async function migrateSessionsColumns() {
  const migrations = [
    'ALTER TABLE exercises ADD COLUMN muscle_group VARCHAR(100) NULL AFTER name',
    'ALTER TABLE exercises ADD COLUMN done TINYINT(1) DEFAULT 0 AFTER sort_order',
    'ALTER TABLE sets ADD COLUMN target_reps VARCHAR(20) NULL AFTER reps',
    'ALTER TABLE sets ADD COLUMN target_weight DOUBLE DEFAULT 0 AFTER target_reps'
  ];
  for (const sql of migrations) {
    try {
      await getPool().query(sql);
      console.log('✅ Migration séances : colonne ajoutée');
    } catch (e) {
      // Colonne déjà présente : on ignore
    }
  }
}

// ---- Migration v3 : colonnes de la refonte complète ----
async function hasColumn(table, column) {
  const [rows] = await getPool().query('SHOW COLUMNS FROM `' + table + '` LIKE ?', [column]);
  return rows.length > 0;
}

async function addColumnIfMissing(table, definition) {
  const col = /^\w+/.exec(definition);
  if (!col) return;
  try {
    if (!(await hasColumn(table, col[0]))) {
      await getPool().query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
      console.log(`✅ Migration v3 : ${table}.${col[0]} ajouté`);
    }
  } catch (e) { /* table inexistante etc. */ }
}

async function migrateV3() {
  const cols = [
    ['users', "first_name VARCHAR(255) NULL AFTER name"],
    ['users', "birth_date VARCHAR(20) NULL AFTER first_name"],
    ['users', "sex VARCHAR(20) NULL AFTER birth_date"],
    ['users', "photo_data MEDIUMBLOB NULL AFTER goal"],
    ['users', "photo_mime VARCHAR(50) NULL AFTER photo_data"],
    ['users', "theme VARCHAR(20) NULL AFTER photo_mime"],
    ['sessions', "duration_min INT NULL AFTER is_template"],
    ['sessions', "volume DOUBLE DEFAULT 0 AFTER duration_min"],
    ['sessions', "total_sets INT DEFAULT 0 AFTER volume"],
    ['sessions', "total_reps INT DEFAULT 0 AFTER total_sets"],
    ['sets', "rpe VARCHAR(10) NULL AFTER reps"],
    ['food_entries', "meal_type VARCHAR(20) NULL AFTER unit"],
    ['goals', "water_goal INT DEFAULT 2500 AFTER fats"],
    ['body_measurements', "forearms DOUBLE NULL AFTER arms"],
    ['body_measurements', "calves DOUBLE NULL AFTER thighs"],
    ['body_measurements', "neck DOUBLE NULL AFTER shoulders"]
  ];
  for (const [table, def] of cols) {
    await addColumnIfMissing(table, def);
  }
}

// ---- Seed : librairie d'exercices par défaut (globale, user_id=0) ----
const DEFAULT_EXERCISES = [
  ['Squat', 'Quadriceps', 'Composé', 'Squat complet avec barre', 120],
  ['Soulevé de terre', 'Dos', 'Composé', 'Soulevé de terre classique', 150],
  ['Développé couché', 'Pectoraux', 'Composé', 'Développé couché à la barre', 120],
  ['Développé militaire', 'Épaules', 'Composé', 'Développé épaules à la barre', 120],
  ['Rowing barre', 'Dos', 'Composé', 'Rowing buste penché à la barre', 120],
  ['Tractions', 'Dos', 'Poids du corps', 'Tractions pronation ou supination', 90],
  ['Dips', 'Pectoraux', 'Poids du corps', 'Dips aux barres parallèles', 90],
  ['Pompes', 'Pectoraux', 'Poids du corps', 'Pompes classiques', 60],
  ['Fentes', 'Quadriceps', 'Composé', 'Fentes marchées avec haltères', 90],
  ['Presse à cuisses', 'Quadriceps', 'Machine', 'Presse à cuisses inclinée', 120],
  ['Leg curl', 'Ischio-jambiers', 'Machine', 'Leg curl allongé', 90],
  ['Leg extension', 'Quadriceps', 'Machine', 'Leg extension assis', 90],
  ['Élévations latérales', 'Épaules', 'Isolation', 'Élévations latérales haltères', 60],
  ['Curl biceps', 'Biceps', 'Isolation', 'Curl biceps à la barre ou haltères', 60],
  ['Extension triceps', 'Triceps', 'Isolation', 'Extension triceps à la poulie', 60],
  ['Curl marteau', 'Biceps', 'Isolation', 'Curl marteau haltères', 60],
  ['Gainage', 'Abdominaux', 'Gainage', 'Planche ventrale', 45],
  ['Crunch', 'Abdominaux', 'Isolation', 'Crunch au sol', 45],
  ['Mollets debout', 'Mollets', 'Machine', 'Extension mollets debout', 60],
  ['Développé haltères', 'Pectoraux', 'Isolation', 'Développé couché haltères', 90]
];

async function seedExerciseLibrary() {
  try {
    const [rows] = await getPool().query('SELECT COUNT(*) AS c FROM exercise_library');
    if (Number(rows[0].c) > 0) return;
    for (const ex of DEFAULT_EXERCISES) {
      await getPool().query(
        'INSERT INTO exercise_library (user_id, name, muscle_group, category, description, rest_seconds) VALUES (0,?,?,?,?,?)',
        ex
      );
    }
    console.log('✅ Seed librairie : exercices par défaut ajoutés');
  } catch (e) {
    console.warn('⚠️  Seed librairie ignoré :', e.message);
  }
}

async function seedSystemUser() {
  try {
    const [rows] = await getPool().query('SELECT COUNT(*) AS c FROM users WHERE email = ?', ['system@agoge.local']);
    if (Number(rows[0].c) > 0) return;

    await getPool().query(
      'INSERT INTO users (email, password_hash, name, first_name) VALUES (?, ?, ?, ?)',
      ['system@agoge.local', 'system', 'Système', 'Système']
    );
    console.log('✅ Seed users : compte système ajouté');
  } catch (e) {
    console.warn('⚠️  Seed users ignoré :', e.message);
  }
}

async function seedGenericFoods() {
  try {
    const filePath = path.join(__dirname, '..', 'data', 'generic_foods_seed.json');
    if (!fs.existsSync(filePath)) return;

    const seedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const food of seedData) {
      await getPool().query(
        `INSERT INTO generic_foods (name, category, source_name, source_url, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g, sugar_g_100g, salt_g_100g, sodium_g_100g, quantity)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           category = VALUES(category),
           source_name = VALUES(source_name),
           source_url = VALUES(source_url),
           calories_per_100g = VALUES(calories_per_100g),
           protein_g_100g = VALUES(protein_g_100g),
           carbs_g_100g = VALUES(carbs_g_100g),
           fat_g_100g = VALUES(fat_g_100g),
           fiber_g_100g = VALUES(fiber_g_100g),
           sugar_g_100g = VALUES(sugar_g_100g),
           salt_g_100g = VALUES(salt_g_100g),
           sodium_g_100g = VALUES(sodium_g_100g),
           quantity = VALUES(quantity)`,
        [
          food.name,
          food.category || null,
          food.source_name || 'USDA',
          food.source_url || null,
          food.calories_per_100g || 0,
          food.protein_g_100g || 0,
          food.carbs_g_100g || 0,
          food.fat_g_100g || 0,
          food.fiber_g_100g || 0,
          food.sugar_g_100g || 0,
          food.salt_g_100g || 0,
          food.sodium_g_100g || 0,
          food.quantity || '100 g'
        ]
      );
    }
    console.log('✅ Seed nutrition : aliments génériques USDA/CIQUAL ajoutés');
  } catch (e) {
    console.warn('⚠️  Seed nutrition ignoré :', e.message);
  }
}

async function seedRecipes() {
  try {
    const filePath = path.join(__dirname, '..', 'data', 'recipes_seed.json');
    if (!fs.existsSync(filePath)) return;

    const seedData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const [systemUserRows] = await getPool().query('SELECT id FROM users WHERE email = ? LIMIT 1', ['system@agoge.local']);
    const systemUserId = systemUserRows[0] ? Number(systemUserRows[0].id) : 1;

    for (const recipe of seedData) {
      const [existing] = await getPool().query('SELECT id FROM recipes WHERE user_id = ? AND name = ?', [systemUserId, recipe.name]);
      let recipeId;

      if (existing.length > 0) {
        recipeId = existing[0].id;
        await getPool().query(
          'UPDATE recipes SET description = ?, serving_size_g = ?, calories = ?, proteins = ?, carbs = ?, fats = ? WHERE id = ?',
          [recipe.description || '', recipe.serving_size_g || 100, recipe.calories || 0, recipe.proteins || 0, recipe.carbs || 0, recipe.fats || 0, recipeId]
        );
        await getPool().query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]);
      } else {
        const [insert] = await getPool().query(
          'INSERT INTO recipes (user_id, name, description, serving_size_g, calories, proteins, carbs, fats) VALUES (?,?,?,?,?,?,?,?)',
          [systemUserId, recipe.name, recipe.description || '', recipe.serving_size_g || 100, recipe.calories || 0, recipe.proteins || 0, recipe.carbs || 0, recipe.fats || 0]
        );
        recipeId = insert.insertId;
      }

      for (const ingredient of recipe.ingredients || []) {
        await getPool().query(
          'INSERT INTO recipe_ingredients (recipe_id, name, grams, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g) VALUES (?,?,?,?,?,?,?)',
          [recipeId, ingredient.name, ingredient.grams || 0, ingredient.calories_per_100g || 0, ingredient.protein_g_100g || 0, ingredient.carbs_g_100g || 0, ingredient.fat_g_100g || 0]
        );
      }
    }
    console.log('✅ Seed nutrition : recettes pré-remplies ajoutées');
  } catch (e) {
    console.warn('⚠️  Seed recettes ignoré :', e.message);
  }
}

// Initialise la base + les tables
async function init() {
  await ensureDatabase();
  for (const sql of TABLES) {
    await getPool().query(sql);
  }
  await migratePhotosColumn();
  await migrateSessionsColumns();
  await migrateV3();
  await seedExerciseLibrary();
  await seedSystemUser();
  await seedGenericFoods();
  await seedRecipes();
}

module.exports = {
  get,
  all,
  run,
  pool: getPool,
  init,
  sanitizeText,
  parsePositiveInt,
  normalizeDate,
  escapeLikeTerm
};

