const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');

test('seed nutrition data includes many foods and recipe macros', async () => {
  await db.init();

  const genericFoods = await db.all('SELECT name, calories_per_100g, protein_g_100g, carbs_g_100g, fat_g_100g FROM generic_foods ORDER BY id');
  const recipes = await db.all('SELECT name, calories, proteins, carbs, fats FROM recipes WHERE user_id = (SELECT id FROM users WHERE email = ? LIMIT 1) ORDER BY id', ['system@agoge.local']);

  assert.ok(genericFoods.length >= 20, `expected at least 20 generic foods, got ${genericFoods.length}`);
  assert.ok(recipes.length >= 5, `expected at least 5 seeded recipes, got ${recipes.length}`);

  const sampleFood = genericFoods.find((food) => food.name === 'Banane');
  assert.ok(sampleFood, 'Banane should be present');
  assert.ok(Number(sampleFood.calories_per_100g) > 0, 'Banane should have calories');

  const sampleRecipe = recipes.find((recipe) => recipe.name === 'Lasagnes bolognaises');
  assert.ok(sampleRecipe, 'Lasagnes bolognaises should be seeded');
  assert.ok(Number(sampleRecipe.calories) > 0, 'seeded recipe should have calories');
  assert.ok(Number(sampleRecipe.proteins) > 0, 'seeded recipe should have protein');
});
