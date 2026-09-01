const express = require('express');
const https = require('https');
const db = require('../db');
const { authMiddleware } = require('./auth');
const { mergeNutritionResults, loadReferenceFoods } = require('../foodSearch');
const { calculateRecipeTotals, resolveRecipeIngredients } = require('../recipeEngine');

const { body, query, param, validationResult } = require('express-validator');
const router = express.Router();
router.use(authMiddleware);
const validators = require('../validators');

// Total macros pour une date
function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function totalsForDate(userId, date) {
  const safeDate = db.normalizeDate(date) || new Date().toISOString().slice(0, 10);
  const rows = await db.all('SELECT calories, proteins, carbs, fats FROM food_entries WHERE user_id = ? AND date = ?', userId, safeDate);
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
router.get('/entries', [ query('date').optional().isISO8601() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const date = db.normalizeDate(req.query.date) || new Date().toISOString().slice(0, 10);
    const entries = await db.all('SELECT * FROM food_entries WHERE user_id = ? AND date = ? ORDER BY id DESC', req.userId, date);
    const totals = await totalsForDate(req.userId, date);
    const goal = await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId);
    res.json({ date, entries, totals, goal: goal || null });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter un aliment
router.post('/entries', [
  body('food_name').isString().trim().notEmpty().isLength({ max: 255 }),
  body('quantity').optional().isFloat({ min: 0, max: 10000 }),
  body('unit').optional().isString().isLength({ max: 10 }),
  body('meal_type').optional().isString(),
  body('calories').optional().isNumeric(),
  body('proteins').optional().isNumeric(),
  body('carbs').optional().isNumeric(),
  body('fats').optional().isNumeric(),
  body('date').optional().isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { date, food_name, quantity, unit, meal_type, calories, proteins, carbs, fats } = req.body;
  const safeName = db.sanitizeText(food_name, { maxLength: 255 });
  if (!safeName) return res.status(400).json({ error: 'Nom de l\'aliment requis' });
  const safeQuantity = quantity === undefined ? 100 : Number(quantity);
  if (!Number.isFinite(safeQuantity) || safeQuantity < 0 || safeQuantity > 10000) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }
  const mt = normalizeMealType(meal_type);
  try {
    const d = db.normalizeDate(date) || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO food_entries (user_id, date, food_name, quantity, unit, meal_type, calories, proteins, carbs, fats) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.userId, d, safeName, safeQuantity, db.sanitizeText(unit, { maxLength: 10 }) || 'g', mt, safeNumber(calories, 0), safeNumber(proteins, 0), safeNumber(carbs, 0), safeNumber(fats, 0)
    );
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ?', info.lastInsertRowid);
    res.status(201).json({ entry, totals: await totalsForDate(req.userId, d), goal: await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId) });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un repas (quantité, type de repas, macros — recalculés côté client)
router.put('/entries/:id', [
  param('id').isInt(),
  body('quantity').optional().isFloat({ min: 0, max: 10000 }),
  body('unit').optional().isString().isLength({ max: 10 }),
  body('meal_type').optional().isString(),
  body('calories').optional().isNumeric(),
  body('proteins').optional().isNumeric(),
  body('carbs').optional().isNumeric(),
  body('fats').optional().isNumeric(),
  body('food_name').optional().isString().isLength({ max: 255 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!entry) return res.status(404).json({ error: 'Entrée introuvable' });
    const { quantity, unit, meal_type, calories, proteins, carbs, fats, food_name } = req.body;
    const safeName = food_name === undefined ? entry.food_name : db.sanitizeText(food_name, { maxLength: 255 });
    const mt = normalizeMealType(meal_type);
    const safeQuantity = quantity === undefined ? entry.quantity : Number(quantity);
    if (!Number.isFinite(safeQuantity) || safeQuantity < 0 || safeQuantity > 10000) {
      return res.status(400).json({ error: 'Quantité invalide' });
    }
    await db.run(
      `UPDATE food_entries SET
        food_name = ?, quantity = ?, unit = ?, meal_type = ?,
        calories = ?, proteins = ?, carbs = ?, fats = ?
       WHERE id = ?`,
      safeName || entry.food_name,
      safeQuantity,
      db.sanitizeText(unit, { maxLength: 10 }) || entry.unit,
      mt !== null ? mt : entry.meal_type,
      safeNumber(calories, entry.calories),
      safeNumber(proteins, entry.proteins),
      safeNumber(carbs, entry.carbs),
      safeNumber(fats, entry.fats),
      req.params.id
    );
    const updated = await db.get('SELECT * FROM food_entries WHERE id = ?', req.params.id);
    res.json({ entry: updated, totals: await totalsForDate(req.userId, entry.date), date: entry.date });
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un aliment
router.delete('/entries/:id', [ param('id').isInt() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
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
router.put('/goals', [
  body('calories').isFloat({ min: 0 }),
  body('proteins').optional().isFloat({ min: 0 }),
  body('carbs').optional().isFloat({ min: 0 }),
  body('fats').optional().isFloat({ min: 0 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { calories, proteins, carbs, fats } = req.body;
  try {
    const safeCalories = safeNumber(calories, 0);
    const safeProteins = safeNumber(proteins, 0);
    const safeCarbs = safeNumber(carbs, 0);
    const safeFats = safeNumber(fats, 0);
    await db.run(`
      INSERT INTO goals (user_id, calories, proteins, carbs, fats)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        calories = VALUES(calories),
        proteins = VALUES(proteins),
        carbs = VALUES(carbs),
        fats = VALUES(fats)
    `, req.userId, safeCalories, safeProteins, safeCarbs, safeFats);
    res.json(await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId));
  } catch (e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---- SUIVI D'EAU (water_entries) ----
// Récupère les entrées d'eau d'une date + total + objectif
router.get('/water', [ query('date').optional().isISO8601() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
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
router.post('/water', [ body('amount_ml').isInt({ min: 1, max: 2000 }), body('date').optional().isISO8601() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { amount_ml, date } = req.body;
  try {
    const d = db.normalizeDate(date) || new Date().toISOString().slice(0, 10);
    const a = db.parsePositiveInt(amount_ml, 1, 2000);
    if (!a) {
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
router.delete('/water/:id', [ param('id').isInt() ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
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
router.put('/water-goal', [ body('goal_ml').isInt({ min: 100, max: 10000 }) ], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { goal_ml } = req.body;
  try {
    const g = db.parsePositiveInt(goal_ml, 100, 10000);
    if (!g) {
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
async function searchGenericFoods(q, limit) {
  const term = (q || '').trim();
  if (!term) return [];

  try {
    const rows = await db.all(
      `SELECT id, name, category, source_name, source_url, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g, fiber_g_100g, sugar_g_100g, salt_g_100g, sodium_g_100g, quantity
       FROM generic_foods
       WHERE name LIKE ? OR category LIKE ?
       ORDER BY name ASC
       LIMIT ?`,
      `%${term}%`, `%${term}%`, limit
    );

    if (rows && rows.length) {
      return rows.map((row) => ({
        ...row,
        calories: Number(row.calories_per_100g || 0),
        proteins: Number(row.protein_g_100g || 0),
        carbs: Number(row.carbs_g_100g || 0),
        fats: Number(row.fat_g_100g || 0),
        fibers: Number(row.fiber_g_100g || 0),
        sugars: Number(row.sugar_g_100g || 0),
        salt: Number(row.salt_g_100g || 0),
        sodium: Number(row.sodium_g_100g || 0),
        _generic: true,
        sourceLabel: 'USDA / CIQUAL',
        quantity: row.quantity || '100 g'
      }));
    }
  } catch (error) {
    // ignore and fallback to bundled seed data
  }

  return loadReferenceFoods()
    .filter((food) => {
      const haystack = `${food.name || ''} ${food.category || ''}`.toLowerCase();
      return haystack.includes(term.toLowerCase());
    })
    .slice(0, limit)
    .map((food) => ({
      id: food.id,
      name: food.name,
      category: food.category || null,
      calories: Number(food.calories_per_100g || 0),
      proteins: Number(food.protein_g_100g || 0),
      carbs: Number(food.carbs_g_100g || 0),
      fats: Number(food.fat_g_100g || 0),
      fibers: Number(food.fiber_g_100g || 0),
      sugars: Number(food.sugar_g_100g || 0),
      salt: Number(food.salt_g_100g || 0),
      sodium: Number(food.sodium_g_100g || 0),
      _generic: true,
      sourceLabel: 'USDA / CIQUAL',
      quantity: food.quantity || '100 g'
    }));
}

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

    let localRows = [];
    try {
      const like = `%${q}%`;
      localRows = await db.all(
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
    } catch (dbError) {
      // ignore and fallback to OpenFoodFacts
    }

    const genericFoods = await searchGenericFoods(q, limit);
    const remoteResults = await searchOpenFoodFacts(q, limit);
    const merged = mergeNutritionResults({
      query: q,
      genericFoods,
      localFoods: (localRows || []).map((r) => ({
        ...r,
        _local: true,
        liquid: r.quantity ? /ml|cl|l\b/i.test(r.quantity) : false
      })),
      remoteFoods: remoteResults,
      limit
    });

    return res.json(merged);
  } catch (e) {
    res.status(500).json({ error: 'Recherche impossible pour le moment. Réessaie dans quelques secondes.' });
  }
});

// Recipes
router.get('/recipes', async (req, res) => {
  try {
    const systemUser = await db.get('SELECT id FROM users WHERE email = ? LIMIT 1', 'system@agoge.local');
    const systemUserId = systemUser ? Number(systemUser.id) : null;
    const params = [req.userId];
    const whereClause = systemUserId !== null ? 'WHERE r.user_id = ? OR r.user_id = ?' : 'WHERE r.user_id = ?';
    if (systemUserId !== null) params.push(systemUserId);

    const recipes = await db.all(
      `SELECT r.id, r.name, r.description, r.serving_size_g, r.calories, r.proteins, r.carbs, r.fats,
              JSON_ARRAYAGG(JSON_OBJECT('name', ri.name, 'grams', ri.grams, 'calories_per_100g', ri.calories_per_100g, 'protein_g_100g', ri.protein_g_100g, 'carbs_g_100g', ri.carbs_g_100g, 'fat_g_100g', ri.fat_g_100g)) AS ingredients
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       ${whereClause}
       GROUP BY r.id
       ORDER BY r.id DESC`,
      ...params
    );

    const normalized = recipes.map((recipe) => ({
      ...recipe,
      ingredients: recipe.ingredients ? JSON.parse(recipe.ingredients) : []
    }));

    res.json(normalized);
  } catch (e) {
    res.status(500).json({ error: 'Impossible de charger les recettes' });
  }
});

router.post('/recipes', validators.recipeCreate, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, description, ingredients = [] } = req.body;
    if (!name || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Nom et ingrédients requis' });
    }

    const lookupRows = await db.all('SELECT name, category, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g FROM generic_foods');
    const resolvedIngredients = resolveRecipeIngredients(ingredients, lookupRows);
    const totals = calculateRecipeTotals({ name, ingredients: resolvedIngredients });
    const recipeInfo = await db.run(
      `INSERT INTO recipes (user_id, name, description, serving_size_g, calories, proteins, carbs, fats)
       VALUES (?,?,?,?,?,?,?,?)`,
      req.userId, name, description || '', totals.serving_size_g, totals.calories, totals.proteins, totals.carbs, totals.fats
    );

    const recipeId = recipeInfo.lastInsertRowid;
    for (const ingredient of resolvedIngredients) {
      await db.run(
        `INSERT INTO recipe_ingredients (recipe_id, name, grams, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g)
         VALUES (?,?,?,?,?,?,?)`,
        recipeId, ingredient.name, ingredient.grams, ingredient.calories_per_100g || 0, ingredient.protein_g_100g || 0, ingredient.carbs_g_100g || 0, ingredient.fat_g_100g || 0
      );
    }

    res.status(201).json({ id: recipeId, ...totals, description: description || '', ingredients: resolvedIngredients });
  } catch (e) {
    res.status(500).json({ error: 'Impossible de créer la recette' });
  }
});

router.post('/recipes/:id/add', async (req, res) => {
  try {
    const recipe = await db.get('SELECT * FROM recipes WHERE id = ? AND user_id = ?', req.params.id, req.userId);
    if (!recipe) return res.status(404).json({ error: 'Recette introuvable' });

    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const info = await db.run(
      'INSERT INTO food_entries (user_id, date, food_name, quantity, unit, meal_type, calories, proteins, carbs, fats) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.userId, date, recipe.name, recipe.serving_size_g || 100, 'g', normalizeMealType(req.body.meal_type), recipe.calories || 0, recipe.proteins || 0, recipe.carbs || 0, recipe.fats || 0
    );
    const entry = await db.get('SELECT * FROM food_entries WHERE id = ?', info.lastInsertRowid);
    res.status(201).json({ entry, totals: await totalsForDate(req.userId, date), goal: await db.get('SELECT * FROM goals WHERE user_id = ?', req.userId) });
  } catch (e) {
    res.status(500).json({ error: 'Impossible d’ajouter la recette' });
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

