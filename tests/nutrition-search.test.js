const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeNutritionResults } = require('../server/foodSearch');

test('mergeNutritionResults prioritizes generic USDA/CIQUAL foods and preserves source metadata', () => {
  const result = mergeNutritionResults({
    query: 'poulet',
    genericFoods: [
      {
        id: 1,
        name: 'Poulet blanc',
        calories_per_100g: 165,
        protein_g_100g: 31,
        carbs_g_100g: 0,
        fat_g_100g: 3.6,
        fiber_g_100g: 0,
        sugar_g_100g: 0,
        salt_g_100g: 0.1,
        sodium_g_100g: 0.04,
        source_name: 'USDA',
        source_url: 'https://fdc.nal.usda.gov/'
      }
    ],
    localFoods: [
      {
        id: 'local-1',
        name: 'Poulet curry',
        calories: 240,
        proteins: 22,
        carbs: 8,
        fats: 14,
        fibers: 1,
        sugars: 2,
        salt: 0.4,
        sodium: 0.2,
        _local: true
      }
    ],
    remoteFoods: [
      {
        id: 'remote-1',
        name: 'Poulet rôti',
        calories: 200,
        proteins: 20,
        carbs: 0,
        fats: 12,
        _remote: true
      }
    ],
    limit: 5
  });

  assert.equal(result.length, 3);
  assert.equal(result[0].name, 'Poulet blanc');
  assert.equal(result[0].sourceLabel, 'USDA / CIQUAL');
  assert.equal(result[0]._generic, true);
  assert.equal(result[1].name, 'Poulet curry');
  assert.equal(result[2].name, 'Poulet rôti');
});
