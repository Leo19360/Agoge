/* ============================================
   AGOGE - Export SQLite -> fichier SQL MySQL
   Génère data/agoge-mysql.sql (importable dans phpMyAdmin)
   ============================================ */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const SQLITE_DB = path.join(__dirname, '..', 'data', 'agoge.db');
const OUT_SQL = path.join(__dirname, '..', 'data', 'agoge-mysql.sql');

const db = new DatabaseSync(SQLITE_DB);

// Colonnes (dans l'ordre) pour chaque table — correspond au schéma MySQL de server/db.js
const TABLES = {
  users: ['id', 'email', 'password_hash', 'name', 'age', 'height', 'goal', 'created_at'],
  sessions: ['id', 'user_id', 'name', 'date', 'notes', 'is_template', 'created_at'],
  exercises: ['id', 'session_id', 'name', 'nb_sets', 'rest_seconds', 'sort_order'],
  sets: ['id', 'exercise_id', 'set_number', 'weight', 'reps', 'done'],
  food_entries: ['id', 'user_id', 'date', 'food_name', 'quantity', 'unit', 'calories', 'proteins', 'carbs', 'fats', 'created_at'],
  goals: ['user_id', 'calories', 'proteins', 'carbs', 'fats'],
  weight_entries: ['id', 'user_id', 'date', 'weight', 'created_at'],
  body_measurements: ['id', 'user_id', 'date', 'waist', 'chest', 'arms', 'thighs', 'hips', 'shoulders', 'notes'],
  photos: ['id', 'user_id', 'date', 'photo_path', 'created_at'],
  sync_queue: ['id', 'user_id', 'action', 'payload', 'created_at']
};

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  const s = String(v);
  // Échappe backslashes et quotes simples pour MySQL
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function mysqlType(sqliteType) {
  const t = String(sqliteType).toUpperCase();
  if (t === 'INTEGER') return 'INT';
  if (t === 'REAL') return 'DOUBLE';
  return 'TEXT';
}

const lines = [];
lines.push('-- ============================================');
lines.push('-- AGOGE - Export MySQL (généré depuis SQLite)');
lines.push('-- Date : ' + new Date().toISOString());
lines.push('-- ============================================');
lines.push('');
lines.push('SET FOREIGN_KEY_CHECKS = 0;');
lines.push('SET NAMES utf8mb4;');
lines.push('');

for (const [table, cols] of Object.entries(TABLES)) {
  // CREATE TABLE
  const pk = cols[0] === 'id' ? cols[0] : (table === 'goals' ? 'user_id' : null);
  const colDefs = cols.map((c) => {
    let type = 'TEXT';
    // Types approximatifs MySQL (cohérents avec l'app)
    if (table === 'users' && c === 'id') type = 'INT';
    else if (table === 'users' && c === 'email') type = 'VARCHAR(255)';
    else if (table === 'users' && (c === 'password_hash' || c === 'name')) type = 'VARCHAR(255)';
    else if (table === 'sessions' && (c === 'name')) type = 'VARCHAR(255)';
    else if (table === 'sessions' && c === 'date') type = 'VARCHAR(20)';
    else if (table === 'sessions' && c === 'notes') type = 'TEXT';
    else if (table === 'exercises' && (c === 'name')) type = 'VARCHAR(255)';
    else if (table === 'food_entries' && c === 'food_name') type = 'VARCHAR(255)';
    else if (table === 'food_entries' && c === 'date') type = 'VARCHAR(20)';
    else if (table === 'food_entries' && c === 'unit') type = 'VARCHAR(10)';
    else if (table === 'weight_entries' && c === 'date') type = 'VARCHAR(20)';
    else if (table === 'body_measurements' && c === 'date') type = 'VARCHAR(20)';
    else if (table === 'photos' && c === 'photo_path') type = 'VARCHAR(500)';
    else if (table === 'photos' && c === 'date') type = 'VARCHAR(20)';
    else if (c === 'created_at') type = 'DATETIME';
    else if (['age', 'height', 'nb_sets', 'rest_seconds', 'sort_order', 'set_number', 'reps', 'done', 'is_template', 'user_id', 'session_id', 'exercise_id', 'id'].includes(c)) type = 'INT';
    else if (['weight', 'quantity', 'calories', 'proteins', 'carbs', 'fats', 'waist', 'chest', 'arms', 'thighs', 'hips', 'shoulders'].includes(c)) type = 'DOUBLE';
    return `  \`${c}\` ${type}${c === pk ? ' NOT NULL' : ''}`;
  });

  // Définit la PK + index
  if (pk) {
    colDefs.push(`  PRIMARY KEY (\`${pk}\`)`);
  }
  if (table === 'users') colDefs.push('  UNIQUE KEY `email` (`email`)');
  if (table === 'goals') colDefs.push(`  CONSTRAINT fk_goals_user FOREIGN KEY (\`user_id\`) REFERENCES users(\`id\`) ON DELETE CASCADE`);
  if (['sessions', 'exercises', 'sets', 'food_entries', 'weight_entries', 'body_measurements', 'photos', 'sync_queue'].includes(table)) {
    const fkCol = table === 'sessions' ? 'user_id' : table === 'exercises' ? 'session_id' : table === 'sets' ? 'exercise_id' : 'user_id';
    const fkRef = table === 'exercises' ? 'sessions' : table === 'sets' ? 'exercises' : 'users';
    colDefs.push(`  KEY \`idx_${table}_${fkCol}\` (\`${fkCol}\`)`);
    colDefs.push(`  CONSTRAINT \`fk_${table}_${fkCol}\` FOREIGN KEY (\`${fkCol}\`) REFERENCES \`${fkRef}\`(\`id\`) ON DELETE CASCADE`);
  }

  lines.push(`CREATE TABLE IF NOT EXISTS \`${table}\` (`);
  lines.push(colDefs.join(',\n'));
  lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  lines.push('');

  // INSERT
  const rows = db.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length) {
    const colList = cols.map((c) => `\`${c}\``).join(', ');
    lines.push(`INSERT INTO \`${table}\` (${colList}) VALUES`);
    const values = rows.map((row) => {
      return '(' + cols.map((c) => esc(row[c])).join(', ') + ')';
    });
    lines.push(values.join(',\n') + ';');
    lines.push('');
  }
}

lines.push('SET FOREIGN_KEY_CHECKS = 1;');
lines.push('');

fs.writeFileSync(OUT_SQL, lines.join('\n'), 'utf8');
console.log(`✅ Export généré : ${OUT_SQL}`);
console.log(`   Fichier à importer dans phpMyAdmin.`);

db.close();

