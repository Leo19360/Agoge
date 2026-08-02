const fs = require('fs');
const readline = require('readline');
const path = require('path');

const CSV_FILE = path.join(__dirname, '..', 'en.openfoodfacts.org.products.csv');

const TARGETS = {
  code: 0,
  product_name: 11,
  generic_name: 12,
  brands: 22,
  quantity: 13,
  categories: 27,
  countries_en: 50,
  ingredients_text: 52,
  allergens: 55,
  nutriscore_grade: 80,
  nova_group: 81,
  image_url: 127,
  image_small_url: 128,
  energy_kj_100g: 130,
  energy_kcal_100g: 131,
  fat_100g: 135,
  saturated_fat_100g: 136,
  carbohydrates_100g: 179,
  sugars_100g: 180,
  fiber_100g: 207,
  proteins_100g: 214,
  salt_100g: 217,
  sodium_100g: 219,
  unique_scans_n: 230
};

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(CSV_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    const header = line.split('\t');
    console.log('Nombre de colonnes:', header.length);
    console.log('--- Header complet (index: nom) ---');
    header.forEach((h, i) => console.log(`${i}: ${h}`));
    console.log('--- Mapping actuel vs header ---');
    for (const [col, idx] of Object.entries(TARGETS)) {
      const actual = header[idx];
      const match = actual === col ? 'OK' : '<<< MISMATCH (header dit: "' + actual + '")';
      console.log(`${col} -> index ${idx} : ${match}`);
    }
    break;
  }
  rl.close();
})();
