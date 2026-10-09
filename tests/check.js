// Sanity checks for the recipe parser. Run: node tests/check.js
const fs = require('fs');
const path = require('path');
const P = require('../js/parser.js');

const dir = path.join(__dirname, '..', 'recipes');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const recipes = manifest.files.flatMap((f) => P.parseMarkdown(fs.readFileSync(path.join(dir, f), 'utf8'), { categoryMap: manifest.categories }));

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAIL:', msg); }
}
const byTitle = (t) => recipes.find((r) => r.title === t);
const tags = (t) => byTitle(t).tags.sort().join(',');

check(recipes.length === 277, `expected 277 recipes, got ${recipes.length}`);
const inCat = (c) => recipes.filter((r) => r.category === c);
check(inCat('Vegan dishes').length === 35, 'vegan category has 35 dishes');
check(inCat('Latvian dishes').length === 22, 'both Latvian sections merge into one category');
check(!recipes.some((r) => /\[\^/.test(r.directions)), 'footnote markers stripped from directions');
check(inCat('Latvian dishes').every((r) => r.sources.length === 1), 'Latvian dishes carry their source notes');
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
const ok = (t, f) => P.passesFilters(byTitle(t), f);
check(!ok('Chicken Cacciatore', ['chicken']), 'no chicken blocks cacciatore');
check(ok('French Lentil, Sausage and Vegetable Stew', ['chicken']), 'chicken stock does not count for No chicken');
check(!ok('French Lentil, Sausage and Vegetable Stew', ['pork']), 'sausage counts as pork');
check(!ok('Coconut, Lime and Shrimp Soup', ['fish']), 'shrimp counts as fish');
check(!ok('Soy-Ginger Salmon Rice Bowls', ['salmon']), 'salmon blocked');
check(ok('Soy-Ginger Salmon Rice Bowls', ['pescatarian']) && !ok('Soy-Ginger Salmon Rice Bowls', ['vegetarian']), 'salmon is pescatarian, not vegetarian');
check(!ok('Beef Bourguignon', ['pescatarian']), 'beef is not pescatarian');
check(inCat('Vegan dishes').every((r) => P.passesFilters(r, ['vegan'])), 'every vegan dish passes Vegan');
check(inCat('Vegetarian dishes').every((r) => P.passesFilters(r, ['vegetarian'])), 'every vegetarian dish passes Vegetarian');
check(!ok('Lemon, Pea and Ricotta Pasta', ['vegan']) && ok('Lemon, Pea and Ricotta Pasta', ['vegetarian']), 'ricotta: vegetarian, not vegan');
check(!ok('Siļķe kažokā — Layered Herring, Beetroot and Apple Salad', ['vegetarian']), 'herring is not vegetarian');
check(P.passesFilters({ tags: ['meat'] }, ['beef', 'rice', 'noodles']), 'retired filter ids are ignored');
const stockOnly = recipes.find((r) => r.ingredients.some((i) => /chicken stock/.test(i.name)) && !r.ingredients.some((i) => /chicken(?! stock)|beef|pork|turkey|sausage|ham|bacon|lamb/.test(i.name.toLowerCase())));
if (stockOnly) check(!P.passesFilters(stockOnly, ['vegetarian']), `chicken stock counts for Vegetarian (${stockOnly.title})`);

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

// journal merge (notes + ratings sync)
const J = require('../js/journal.js');
const devA = { recipes: { x: { rating: 4, ratedAt: '2026-10-09T10:00:00Z', notes: [{ id: 'n1', date: '2026-10-09', text: 'More cumin', createdAt: '2026-10-09T10:00:00Z' }] } } };
const devB = { recipes: { x: { rating: 2, ratedAt: '2026-10-09T09:00:00Z', notes: [{ id: 'n1', deleted: true, createdAt: '2026-10-09T10:00:00Z' }, { id: 'n2', date: '2026-10-08', text: 'Two cups couscous', createdAt: '2026-10-08T18:00:00Z' }] }, y: { rating: 5, ratedAt: '2026-10-01T00:00:00Z' } } };
const m1 = J.merge(devA, devB), m2 = J.merge(devB, devA);
check(J.same(m1, m2), 'merge is order-independent');
check(m1.recipes.x.rating === 4, 'newest rating wins');
check(m1.recipes.y.rating === 5, 'ratings from both devices kept');
check(m1.recipes.x.notes.find((n) => n.id === 'n1').deleted === true, 'deleted note stays deleted');
check(m1.recipes.x.notes.some((n) => n.id === 'n2' && n.text === 'Two cups couscous'), 'notes from both devices kept');
check(J.same(J.merge(m1, m1), m1), 'merge is idempotent');
const cleared = J.merge(m1, { recipes: { x: { rating: null, ratedAt: '2026-10-10T00:00:00Z' } } });
check(cleared.recipes.x.rating === null, 'clearing a rating syncs');

// coverage report
console.log(`${recipes.length} recipes parsed`);
const cats = [...new Set(recipes.map((r) => r.category))];
console.log('\nRecipes left per category when each filter is on:');
console.log('category'.padEnd(28) + P.FILTERS.map((f) => f.id.padStart(12)).join(''));
for (const c of cats) {
  const rs = recipes.filter((r) => r.category === c);
  console.log(`${c} (${rs.length})`.padEnd(28) + P.FILTERS.map((f) => String(rs.filter((r) => P.passesFilters(r, [f.id])).length).padStart(12)).join(''));
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
