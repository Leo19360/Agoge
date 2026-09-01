const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRecipeTotals } = require('../server/recipeEngine');

test('calculateRecipeTotals sums ingredient macros and uses total grams as serving size', () => {
  const recipe = calculateRecipeTotals({
    name: 'Bowl poulet riz',
    ingredients: [
      { name: 'Poulet blanc', grams: 200, calories_per_100g: 165, protein_g_100g: 31, carbs_g_100g: 0, fat_g_100g: 3.6 },
      { name: 'Riz blanc cuit', grams: 250, calories_per_100g: 130, protein_g_100g: 2.7, carbs_g_100g: 28.2, fat_g_100g: 0.3 }
    ]
  });

  assert.equal(recipe.serving_size_g, 450);
  assert.equal(Math.round(recipe.calories), 655);
  assert.equal(Math.round(recipe.proteins), 69);
  assert.equal(Math.round(recipe.carbs), 71);
  assert.equal(Math.round(recipe.fats), 8);
});
