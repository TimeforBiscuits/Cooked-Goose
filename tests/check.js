// Sanity checks for the recipe parser. Run: node tests/check.js
const fs = require('fs');
const path = require('path');
const P = require('../js/parser.js');

const dir = path.join(__dirname, '..', 'recipes');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const recipes = manifest.files.flatMap((f) => P.parseMarkdown(fs.readFileSync(path.join(dir, f), 'utf8')));

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
const byTitle = (t) => recipes.find((r) => r.title === t);
const tags = (t) => byTitle(t).tags.sort().join(',');

check(recipes.length === 220, `expected 220 recipes, got ${recipes.length}`);
const ids = new Set(recipes.map((r) => r.id));
check(ids.size === recipes.length, 'recipe ids are unique');

for (const r of recipes) {
  check(r.directions.length > 20, `${r.title}: has directions`);
  for (const i of r.ingredients) {
    check(i.name && !/^[\d½¼¾⅓⅔]/.test(i.name), `${r.title}: odd ingredient name "${i.name}"`);
    check(!/^(cm|mm)\b/.test(i.name), `${r.title}: measurement parsed as ingredient "${i.name}"`);
  }
}

// filters
check(tags('Chicken Cacciatore') === 'chicken,noodles', 'cacciatore tags: ' + tags('Chicken Cacciatore'));
check(tags('French Lentil, Sausage and Vegetable Stew') === 'pork', 'chicken stock does not count: ' + tags('French Lentil, Sausage and Vegetable Stew'));
check(tags('Coconut, Lime and Shrimp Soup') === 'fish,noodles', 'shrimp is fish, rice noodles are noodles not rice: ' + tags('Coconut, Lime and Shrimp Soup'));
check(tags('Soy-Ginger Salmon Rice Bowls') === 'fish,rice,salmon', 'salmon bowl tags: ' + tags('Soy-Ginger Salmon Rice Bowls'));
check(tags('Beef Bourguignon') === 'beef', 'bourguignon tags: ' + tags('Beef Bourguignon'));
check(tags('Red Lentil, Sweet Potato and Coconut Curry') === '', 'veg curry has no tags');

// scaling + units
const ing = (t, name) => byTitle(t).ingredients.find((i) => i.name === name);
const bb = 'Beef Bourguignon';
check(P.scaledPhrase(ing(bb, 'onion'), 2 / 3) === '½ onion', 'scale onion down: ' + P.scaledPhrase(ing(bb, 'onion'), 2 / 3));
check(P.scaledPhrase(ing(bb, 'onion'), 2) === '2 onions', 'scale onion up');
check(P.scaledPhrase(ing(bb, 'red wine'), 1) === '1 cup red wine', 'ml -> cups: ' + P.scaledPhrase(ing(bb, 'red wine'), 1));
check(P.scaledPhrase(ing(bb, 'olive oil'), 2 / 3) === '2 tsp olive oil', 'tbsp -> tsp: ' + P.scaledPhrase(ing(bb, 'olive oil'), 2 / 3));
check(P.scaledPhrase(ing(bb, 'stewing beef'), 4 / 3) === '800 g stewing beef', 'grams scale');
check(P.scaledPhrase(ing(bb, 'garlic'), 1) === '2 garlic cloves', 'cloves: ' + P.scaledPhrase(ing(bb, 'garlic'), 1));
check(P.convertDirections('add 150 ml water') === 'add ⅔ cup water', 'directions convert: ' + P.convertDirections('add 150 ml water'));

// shopping list
const list = P.buildShoppingList([{ recipe: byTitle(bb), servings: 3 }, { recipe: byTitle('Chicken Cacciatore'), servings: 3 }]);
const flat = list.flatMap((g) => g.items.map((i) => g.name + ': ' + i.text));
check(flat.includes('Produce: 2 onions'), 'onions combine across dishes');
check(flat.some((t) => t.startsWith('Pantry check: ') && /olive oil/.test(t)), 'olive oil in pantry');

// coverage report
console.log(`${recipes.length} recipes parsed`);
const cats = [...new Set(recipes.map((r) => r.category))];
console.log('\nRecipes left per category when each filter is on:');
console.log('category'.padEnd(28) + P.FILTERS.map((f) => f.id.padStart(8)).join(''));
for (const c of cats) {
  const rs = recipes.filter((r) => r.category === c);
  console.log(`${c} (${rs.length})`.padEnd(28) + P.FILTERS.map((f) => String(rs.filter((r) => P.passesFilters(r, [f.id])).length).padStart(8)).join(''));
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
