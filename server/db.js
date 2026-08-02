/* ============================================
   AGOGE - Connexion MySQL
   Compatible local (Laragon) ET cloud (Netlify)
   ============================================ */
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'agoge';
// En cloud (Netlify), activez le chiffrement SSL si le provider le demande
const DB_SSL = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1';

function sslConfig() {
  if (!DB_SSL) return undefined;
  return {
    rejectUnauthorized: false // accepte les certificats auto-signés des providers cloud
  };
}

// Pool lazy : il n'est créé qu'à la première requête.
// Indispensable en serverless : les fonctions Netlify peuvent
// importer db.js sans connexion active au démarrage.
let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4_unicode_ci',
      dateStrings: true,
      ...(sslConfig() ? { ssl: sslConfig() } : {})
    });
  }
  return pool;
}

// Crée la base de données si elle n'existe pas.
// Non bloquante : si les privilèges CREATE sont refusés (typique en cloud),
// on continue — la base doit alors être créée manuellement.
async function ensureDatabase() {
  try {
    const conn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      ...(sslConfig() ? { ssl: sslConfig() } : {})
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
}

module.exports = { get, all, run, pool: getPool, init };

