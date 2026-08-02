const express = require('express');
const https = require('https');
const db = require('../db');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

// Total macros pour une date
async function totalsForDate(userId, date) {
  const rows = await db.all('SELECT calories, proteins, carbs, fats FROM food_entries WHERE user_id = ? AND date = ?', userId, date);
  const t = { calories: 0, proteins: 0, carbs: 0, fats: 0, count: rows.length };
  for (const r of rows) {
    t.calories += r.calories || 0;
    t.proteins += r.proteins || 0;
    t.carbs += r.carbs || 0;
    t.fats += r.fats || 0;
  }
  return t;
}

// Types de repas autorisés
const MEAL_TYPES = ['petit_dejeuner', 'dejeuner', 'collation', 'diner'];
function normalizeMealType(mt) {
  if (!mt) return null;
  const v = String(mt).toLowerCase().replace(/-/g, '_');
  return MEAL_TYPES.includes(v) ? v : null;
}

// Repas d'une date
router.get('/entries', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const entries = await db.all('SELECT * FROM food_entries WHERE user_id = ? AND date = ? ORDER BY id DESC', req.userId, date);
    const totals = await totalsForDate(req.userId, date);
    const goal = await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId);
    res.json({ date, entries, totals, goal: goal || null });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un aliment
router.post('/entries', async (req, res) => {
  const { date, food_name, quantity, unit, meal_type, calories, proteins, carbs, fats } = req.body;
  if (!food_name) return res.status(400).json({ error: 'Nom de l\'aliment requis' });
  if (quantity !== undefined && (isNaN(quantity) || quantity < 0)) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }
  const mt = normalizeMealType(meal_type);
  try {
    const d = date || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO food_entries (user_id, date, food_name, quantity, unit, meal_type, calories, proteins, carbs, fats) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.userId, d, food_name, quantity || 100, unit || 'g', mt, calories || 0, proteins || 0, carbs || 0, fats || 0
    );
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ?', info.lastInsertRowid);
    res.status(201).json({ entry, totals: await totalsForDate(req.userId, d), goal: await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un repas (quantité, type de repas, macros — recalculés côté client)
router.put('/entries/:id', async (req, res) => {
  try {
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    const { quantity, unit, meal_type, calories, proteins, carbs, fats, food_name } = req.body;
    const mt = normalizeMealType(meal_type);
    await db.run(
      `UPDATE food_entries SET
        food_name = ?, quantity = ?, unit = ?, meal_type = ?,
        calories = ?, proteins = ?, carbs = ?, fats = ?
       WHERE id = ?`,
      food_name ?? entry.food_name,
      quantity !== undefined ? quantity : entry.quantity,
      unit || entry.unit,
      mt !== null ? mt : entry.meal_type,
      calories !== undefined ? calories : entry.calories,
      proteins !== undefined ? proteins : entry.proteins,
      carbs !== undefined ? carbs : entry.carbs,
      fats !== undefined ? fats : entry.fats,
      req.params.id
    );
    const updated = await db.get('SELECT * FROM food_entries WHERE id = ?', req.params.id);
    res.json({ entry: updated, totals: await totalsForDate(req.userId, entry.date), date: entry.date });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un aliment
router.delete('/entries/:id', async (req, res) => {
  try {
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    await db.run('DELETE FROM food_entries WHERE id = ?', req.params.id);
    res.json({ success: true, totals: await totalsForDate(req.userId, entry.date), date: entry.date });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Objectifs
router.put('/goals', async (req, res) => {
  const { calories, proteins, carbs, fats } = req.body;
  try {
    await db.run(`
      INSERT INTO goals (user_id, calories, proteins, carbs, fats)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        calories = VALUES(calories),
        proteins = VALUES(proteins),
        carbs = VALUES(carbs),
        fats = VALUES(fats)
    `, req.userId, calories || 0, proteins || 0, carbs || 0, fats || 0);
    res.json(await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---- SUIVI D'EAU (water_entries) ----
// Récupère les entrées d'eau d'une date + total + objectif
router.get('/water', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const entries = await db.all(
      'SELECT * FROM water_entries WHERE user_id = ? AND date = ? ORDER BY id DESC',
      req.userId, date
    );
    const goal = await db.get('SELECT water_goal FROM goals WHERE user_id = ?', req.userId);
    const total = entries.reduce((s, e) => s + (e.amount_ml || 0), 0);
    res.json({
      date,
      entries,
      total_ml: total,
      goal_ml: (goal && goal.water_goal) || 2500
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajoute une entrée d'eau (verre d'eau)
router.post('/water', async (req, res) => {
  const { amount_ml, date } = req.body;
  try {
    const d = date || new Date().toISOString().slice(0, 10);
    const a = parseInt(amount_ml, 10);
    if (isNaN(a) || a < 1 || a > 2000) {
      return res.status(400).json({ error: 'Quantité invalide (1-2000 ml)' });
    }
    const info = await db.run(
      'INSERT INTO water_entries (user_id, date, amount_ml) VALUES (?,?,?)',
      req.userId, d, a
    );
    const entry = await db.get('SELECT * FROM water_entries WHERE id = ?', info.lastInsertRowid);
    res.status(201).json(entry);
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprime une entrée d'eau
router.delete('/water/:id', async (req, res) => {
  try {
    const entry = await db.get('SELECT * FROM water_entries WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    await db.run('DELETE FROM water_entries WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Met à jour l'objectif d'eau quotidien
router.put('/water-goal', async (req, res) => {
  const { goal_ml } = req.body;
  try {
    const g = parseInt(goal_ml, 10);
    if (isNaN(g) || g < 100 || g > 10000) {
      return res.status(400).json({ error: 'Objectif invalide (100-10000 ml)' });
    }
    await db.run(`
      INSERT INTO goals (user_id, calories, proteins, carbs, fats, water_goal)
      VALUES (?,0,0,0,0,?)
      ON DUPLICATE KEY UPDATE water_goal = VALUES(water_goal)
    `, req.userId, g);
    res.json({ goal_ml: g });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---- RECHERCHE LOCALE D'ALIMENTS (table aliments) ----
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Réponse OpenFoodFacts invalide'));
          }
        } else {
          reject(new Error('OpenFoodFacts indisponible'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy(new Error('Timeout OpenFoodFacts'));
    });
  });
}

async function searchOpenFoodFacts(q, limit) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', q);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('lc', 'fr');
  url.searchParams.set('cc', 'FR');
  url.searchParams.set('page_size', String(limit));
  url.searchParams.set('fields', 'code,product_name,generic_name,brands,quantity,image_front_url,nutriments,ingredients_text_fr,allergens_from_ingredients,nutriscore_grade,nova_group');

  const payload = await fetchJson(url.toString());
  const products = Array.isArray(payload.products) ? payload.products : [];

  return products
    .map((p) => {
      const name = (p.product_name || p.generic_name || '').trim();
      if (!name) return null;
      const nutriments = p.nutriments || {};
      const energy = nutriments['energy-kcal_100g'] ?? nutriments.energy_100g ?? nutriments.energy ?? 0;
      const calories = Number(energy) || 0;
      const proteins = Number(nutriments.proteins_100g || 0);
      const carbs = Number(nutriments.carbohydrates_100g || 0);
      const fats = Number(nutriments.fat_100g || 0);
      const fibers = Number(nutriments.fiber_100g || 0);
      const sugars = Number(nutriments.sugars_100g || 0);
      const salt = Number(nutriments.salt_100g || 0);
      const sodium = Number(nutriments.sodium_100g || 0);
      return {
        id: p.code || p._id,
        name,
        brands: p.brands || '',
        quantity: p.quantity || '',
        image: p.image_front_url || '',
        calories,
        proteins,
        carbs,
        fats,
        fibers,
        sugars,
        salt,
        sodium,
        nutriscore: p.nutriscore_grade || '',
        nova: p.nova_group || null,
        ingredients: p.ingredients_text_fr || '',
        allergens: p.allergens_from_ingredients || '',
        liquid: /ml|cl|l\b/i.test(p.quantity || ''),
        _remote: true
      };
    })
    .filter(Boolean);
}

router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);

    try {
      const like = `%${q}%`;
      const rows = await db.all(
        `SELECT code as id, product_name as name, generic_name, brands, quantity,
                image_url as image, energy_kcal_100g as calories,
                proteins_100g as proteins, carbohydrates_100g as carbs,
                fat_100g as fats, fiber_100g as fibers, sugars_100g as sugars,
                salt_100g as salt, sodium_100g as sodium,
                nutriscore_grade as nutriscore, nova_group as nova,
                ingredients_text as ingredients, allergens
         FROM aliments
         WHERE product_name LIKE ? OR generic_name LIKE ? OR brands LIKE ?
         LIMIT ?`,
        like, like, like, limit
      );

      if (rows && rows.length) {
        return res.json(rows.map(r => ({
          ...r,
          _local: true,
          liquid: r.quantity ? /ml|cl|l\b/i.test(r.quantity) : false
        })));
      }
    } catch (dbError) {
      // ignore and fallback to OpenFoodFacts
    }

    const remoteResults = await searchOpenFoodFacts(q, limit);
    return res.json(remoteResults);
  } catch (e) {
    res.status(500).json({ error: 'Recherche impossible pour le moment. Réessaie dans quelques secondes.' });
  }
});

// Moyennes 7 jours
router.get('/stats', async (req, res) => {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const rows = await db.all(
      'SELECT date, SUM(calories) as cal, SUM(proteins) as p, SUM(carbs) as c, SUM(fats) as f FROM food_entries WHERE user_id = ? AND date >= ? GROUP BY date',
      req.userId, fmt(start)
    );

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = fmt(d);
      const found = rows.find(r => r.date === key);
      days.push({
        date: key,
        calories: found ? Number(found.cal) || 0 : 0,
        proteins: found ? Number(found.p) || 0 : 0,
        carbs: found ? Number(found.c) || 0 : 0,
        fats: found ? Number(found.f) || 0 : 0
      });
    }

    const n = days.filter(d => d.calories > 0).length;
    const avg = (key) => n ? days.reduce((s, d) => s + (d[key] || 0), 0) / n : 0;
    res.json({
      days,
      averages: {
        calories: Math.round(avg('calories')),
        proteins: Math.round(avg('proteins')),
        carbs: Math.round(avg('carbs')),
        fats: Math.round(avg('fats')),
        tracked_days: n
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;

