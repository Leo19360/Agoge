function calculateRecipeTotals({ name, ingredients = [] }) {
  const totalGrams = ingredients.reduce((sum, ingredient) => sum + Number(ingredient.grams || 0), 0);
  const totals = ingredients.reduce(
    (acc, ingredient) => {
      const grams = Number(ingredient.grams || 0);
      if (!grams) return acc;
      const ratio = grams / 100;
      return {
        calories: acc.calories + (Number(ingredient.calories_per_100g || 0) * ratio),
        proteins: acc.proteins + (Number(ingredient.protein_g_100g || 0) * ratio),
        carbs: acc.carbs + (Number(ingredient.carbs_g_100g || 0) * ratio),
        fats: acc.fats + (Number(ingredient.fat_g_100g || 0) * ratio)
      };
    },
    { calories: 0, proteins: 0, carbs: 0, fats: 0 }
  );

  return {
    name: name || 'Recette',
    serving_size_g: totalGrams,
    calories: Number(totals.calories.toFixed(2)),
    proteins: Number(totals.proteins.toFixed(2)),
    carbs: Number(totals.carbs.toFixed(2)),
    fats: Number(totals.fats.toFixed(2))
  };
}

function resolveRecipeIngredients(ingredients, lookupRows = []) {
  const rows = Array.isArray(lookupRows) ? lookupRows : [];
  return ingredients.map((ingredient) => {
    const name = String(ingredient.name || '').trim();
    const match = rows.find((row) => {
      const haystack = `${row.name || ''} ${row.category || ''}`.toLowerCase();
      return haystack.includes(name.toLowerCase());
    });

    if (!match) return ingredient;
    return {
      ...ingredient,
      calories_per_100g: ingredient.calories_per_100g || Number(match.calories_per_100g || 0),
      protein_g_100g: ingredient.protein_g_100g || Number(match.protein_g_100g || 0),
      carbs_g_100g: ingredient.carbs_g_100g || Number(match.carbs_g_100g || 0),
      fat_g_100g: ingredient.fat_g_100g || Number(match.fat_g_100g || 0)
    };
  });
}

module.exports = { calculateRecipeTotals, resolveRecipeIngredients };
