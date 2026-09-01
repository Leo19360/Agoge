const path = require('path');
const fs = require('fs');

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildSearchTerms(query) {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreFood(name, terms) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) return -1;
  let score = 0;
  for (const term of terms) {
    // exact whole-name match
    if (normalizedName === term) score += 100;
    // starts with (likely primary name)
    if (normalizedName.startsWith(term)) score += 50;
    // token match (separate word)
    const words = normalizedName.split(/\s+/);
    if (words.includes(term)) score += 30;
    // anywhere includes (composition match)
    if (normalizedName.includes(term)) score += 5;
  }
  return score;
}

function toGenericFoodRow(row) {
  return {
    id: row.id,
    name: row.name || row.food_name || row.display_name || 'Aliment',
    brands: '',
    quantity: row.quantity || '100 g',
    image: row.image_url || '',
    calories: Number(row.calories_per_100g ?? row.calories ?? row.kcal_100g ?? 0) || 0,
    proteins: Number(row.protein_g_100g ?? row.proteins_100g ?? row.protein_100g ?? 0) || 0,
    carbs: Number(row.carbs_g_100g ?? row.carbohydrates_100g ?? row.carbs_100g ?? 0) || 0,
    fats: Number(row.fat_g_100g ?? row.fats_100g ?? row.lipids_100g ?? 0) || 0,
    fibers: Number(row.fiber_g_100g ?? row.fibers_100g ?? 0) || 0,
    sugars: Number(row.sugar_g_100g ?? row.sugars_100g ?? 0) || 0,
    salt: Number(row.salt_g_100g ?? row.salt_100g ?? 0) || 0,
    sodium: Number(row.sodium_g_100g ?? row.sodium_100g ?? 0) || 0,
    nutriscore: '',
    nova: null,
    ingredients: '',
    allergens: '',
    _generic: true,
    sourceLabel: 'USDA / CIQUAL',
    sourceName: row.source_name || 'USDA',
    sourceUrl: row.source_url || ''
  };
}

function mergeNutritionResults({ query, genericFoods = [], localFoods = [], remoteFoods = [], limit = 20 }) {
  const terms = buildSearchTerms(query);
  const merged = [];

  for (const food of genericFoods) {
    const candidate = toGenericFoodRow(food);
    candidate._relevance = scoreFood(candidate.name, terms);
    // filter out items with no meaningful nutrition values
    if ((candidate.calories || candidate.proteins || candidate.carbs || candidate.fats) === 0) continue;
    if (candidate._relevance > 0 || terms.length === 0) merged.push(candidate);
  }

  for (const food of localFoods) {
    const candidate = {
      ...food,
      _relevance: scoreFood(food.name || '', terms)
    };
    if ((candidate.calories || candidate.proteins || candidate.carbs || candidate.fats) === 0) continue;
    if (candidate._relevance > 0 || terms.length === 0) merged.push(candidate);
  }

  for (const food of remoteFoods) {
    const candidate = {
      ...food,
      _relevance: scoreFood(food.name || '', terms)
    };
    if ((candidate.calories || candidate.proteins || candidate.carbs || candidate.fats) === 0) continue;
    if (candidate._relevance > 0 || terms.length === 0) merged.push(candidate);
  }

  return merged
    .sort((a, b) => {
      // Prefer exact relevance first
      if ((b._relevance || 0) !== (a._relevance || 0)) return (b._relevance || 0) - (a._relevance || 0);
      // Prefer local foods (user-added) then generic, then remote
      const aPriority = a._local ? 2 : a._generic ? 1 : 0;
      const bPriority = b._local ? 2 : b._generic ? 1 : 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      // Fallback to calories as tie-breaker
      return (b.calories || 0) - (a.calories || 0);
    })
    .slice(0, limit);
}

function loadReferenceFoods() {
  const filePath = path.join(__dirname, '..', 'data', 'generic_foods_seed.json');
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

module.exports = {
  mergeNutritionResults,
  loadReferenceFoods,
  normalizeText,
  buildSearchTerms,
  scoreFood,
  toGenericFoodRow
};
