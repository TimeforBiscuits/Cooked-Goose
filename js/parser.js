/*
 * Cooked Goose — recipe parser, unit formatting, classification and filters.
 * Works in the browser (window.CGParser) and in Node (require) for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CGParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE_SERVINGS = 3;

  /* ---------- numbers ---------- */

  const VULGAR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  const NUM = '(?:\\d+(?:\\.\\d+)?[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])';
  const QTY_RE = new RegExp('^(' + NUM + ')(?:\\s*[–-]\\s*(' + NUM + '))?\\s+(.*)$');

  function toNumber(s) {
    let n = 0;
    const m = s.match(/^(\d+(?:\.\d+)?)?([½¼¾⅓⅔⅛])?$/);
    if (!m) return NaN;
    if (m[1]) n += parseFloat(m[1]);
    if (m[2]) n += VULGAR[m[2]];
    return n;
  }

  /* ---------- units ---------- */

  // unit word -> [kind, multiplier to base]
  const UNIT_WORDS = {
    g: ['mass', 1], kg: ['mass', 1000],
    ml: ['vol', 1], l: ['vol', 1000], litre: ['vol', 1000], litres: ['vol', 1000],
    liter: ['vol', 1000], liters: ['vol', 1000],
    cup: ['vol', 240], cups: ['vol', 240],
    tsp: ['spoon', 1], tbsp: ['spoon', 3],
    can: ['count', 1, 'can'], cans: ['count', 1, 'can'],
    jar: ['count', 1, 'jar'], jars: ['count', 1, 'jar'],
    sheet: ['count', 1, 'sheet'], sheets: ['count', 1, 'sheet'],
    pinch: ['count', 1, 'pinch'],
  };
  // trailing words that are really a unit: "2 garlic cloves", "2 celery stalks"
  const TRAILING_UNITS = { clove: 'clove', cloves: 'clove', stalk: 'stalk', stalks: 'stalk' };

  const NOTE_HINT = /\b(each|approximately|total|thick|cm|mm)\b/i;
  const SIZE_WORDS = /^(large|small|medium)\s+/i;

  /* ---------- words ---------- */

  function singular(word) {
    const w = word.toLowerCase();
    if (/(ss|us|is)$/.test(w)) return w;
    if (w === 'leaves') return 'leaf';
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function plural(word) {
    if (/(potato|tomato)$/.test(word)) return word + 'es';
    if (/(ch|sh|x|s)$/.test(word)) return word + 'es';
    if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
    return word + 's';
  }
  function lastWordMap(phrase, fn) {
    const parts = phrase.split(' ');
    parts[parts.length - 1] = fn(parts[parts.length - 1]);
    return parts.join(' ');
  }
  function keyFor(name) {
    let n = name.toLowerCase().replace(SIZE_WORDS, '').trim();
    n = n.replace(/^chopped tomatoes$/, 'tomatoes').replace(/^bell pepper/, 'pepper');
    return lastWordMap(n, singular);
  }

  /* ---------- ingredient parsing ---------- */

  function parseHead(text) {
    // text like "600 g stewing beef" or "1 onion" or "2 garlic cloves"
    const m = text.match(QTY_RE);
    if (!m) return { qty: null, kind: 'none', unitLabel: '', name: text.trim() };
    const min = toNumber(m[1]);
    const max = m[2] ? toNumber(m[2]) : min;
    let rest = m[3].trim();
    let kind = 'count', mult = 1, unitLabel = '';
    const uw = rest.match(/^([A-Za-z]+)\s+(.*)$/);
    if (uw && UNIT_WORDS[uw[1].toLowerCase()]) {
      const u = UNIT_WORDS[uw[1].toLowerCase()];
      kind = u[0]; mult = u[1]; unitLabel = u[2] || '';
      rest = uw[2];
    }
    rest = rest.replace(/^each\s+/, '');
    if (kind === 'count' && !unitLabel) {
      const t = rest.match(/^(.*\S)\s+(\w+)$/);
      if (t && TRAILING_UNITS[t[2].toLowerCase()]) {
        unitLabel = TRAILING_UNITS[t[2].toLowerCase()];
        rest = t[1];
      }
    }
    return { qty: { min: min * mult, max: max * mult }, kind, unitLabel, name: rest.trim() };
  }

  function splitAndQty(text) {
    // "1 onion and 2 carrots" -> ["1 onion", "2 carrots"]
    return text.split(new RegExp('\\s+and\\s+(?=' + NUM + '\\s)'));
  }

  function makeItem(head, notes) {
    const name = head.name;
    return {
      name,
      key: keyFor(name),
      qty: head.qty,
      kind: head.kind,
      unitLabel: head.unitLabel,
      note: notes.join(', '),
    };
  }

  function parseSegment(seg) {
    seg = seg.trim().replace(/\.$/, '').trim().replace(/^(approximately|about|roughly)\s+(?=\d)/i, '');
    if (!seg) return [];
    const out = [];

    // no quantity: "salt and pepper", "salt"
    if (!QTY_RE.test(seg)) {
      return seg.split(/\s+and\s+|,\s*/).filter(Boolean)
        .map((n) => makeItem({ qty: null, kind: 'none', unitLabel: '', name: n.trim() }, []));
    }

    // "1 tsp each cumin, ground coriander and paprika"
    const each = seg.match(new RegExp('^(' + NUM + '(?:\\s*[–-]\\s*' + NUM + ')?\\s+[A-Za-z]+)\\s+each\\s+(.+)$'));
    if (each) {
      const names = each[2].split(/,\s*|\s+and\s+/).filter(Boolean);
      return names.map((n) => makeItem(parseHead(each[1] + ' ' + n.trim()), []));
    }

    const parts = seg.split(/,\s*/);
    let pending = [];
    let lastWasNote = false;
    const flush = () => { pending = []; };
    for (const part of parts) {
      const isHead = QTY_RE.test(part) && !NOTE_HINT.test(part);
      if (isHead) {
        if (lastWasNote) flush();
        for (const h of splitAndQty(part)) {
          const item = makeItem(parseHead(h), []);
          out.push(item);
          pending.push(item);
        }
        lastWasNote = false;
      } else {
        const targets = pending.length ? pending : out.slice(-1);
        for (const t of targets) t.note = t.note ? t.note + ', ' + part : part;
        lastWasNote = true;
      }
    }
    return out;
  }

  function parseIngredients(line) {
    return line.split(';').flatMap(parseSegment);
  }

  /* ---------- markdown ---------- */

  function slug(s) {
    return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // opts.categoryMap renames sections, e.g. merging "Latvian fish dishes" into "Latvian dishes"
  function parseMarkdown(text, opts = {}) {
    const map = opts.categoryMap || {};
    const recipes = [];
    const footnotes = {};
    let category = null, current = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if ((m = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/))) {
        footnotes[m[1]] = m[2].trim();
      } else if ((m = line.match(/^##\s+(?!#)(.+)$/))) {
        category = map[m[1].trim()] || m[1].trim();
        current = null;
      } else if ((m = line.match(/^###\s+(?:\d+\.\s*)?(.+)$/)) && category) {
        current = { id: slug(category) + '--' + slug(m[1]), title: m[1].trim(), category, ingredients: [], ingredientsText: '', directions: '', refs: [] };
        recipes.push(current);
      } else if (current && (m = line.match(/^\*\*Ingredients:\*\*\s*(.+)$/))) {
        current.ingredientsText = m[1];
        current.ingredients = parseIngredients(m[1]);
      } else if (current && (m = line.match(/^\*\*Directions:\*\*\s*(.+)$/))) {
        current.refs = [...m[1].matchAll(/\[\^([^\]]+)\]/g)].map((x) => x[1]);
        current.directions = m[1].replace(/\s*\[\^[^\]]+\]/g, '').trim();
      }
    }
    for (const r of recipes) {
      r.tags = tagsFor(r);
      r.sources = r.refs.map((k) => footnotes[k]).filter(Boolean);
      delete r.refs;
    }
    return recipes.filter((r) => r.ingredients.length);
  }

  /* ---------- filters ---------- */

  // "No …" filters exclude dishes containing that food (stock doesn't count).
  // Diet filters only allow dishes that fit the diet (stock does count).
  const FILTERS = [
    { id: 'chicken', label: 'No chicken', excludes: ['chicken'], conflict: 'contains chicken' },
    { id: 'fish', label: 'No fish', excludes: ['fish'], conflict: 'contains fish' },
    { id: 'salmon', label: 'No salmon', excludes: ['salmon'], conflict: 'contains salmon' },
    { id: 'pork', label: 'No pork', excludes: ['pork'], conflict: 'contains pork' },
    { id: 'pescatarian', label: 'Pescatarian', excludes: ['meat'], conflict: 'not pescatarian' },
    { id: 'vegetarian', label: 'Vegetarian', excludes: ['meat', 'seafood'], conflict: 'not vegetarian' },
    { id: 'vegan', label: 'Vegan', excludes: ['meat', 'seafood', 'animal'], conflict: 'not vegan' },
  ];
  const FILTER_BY_ID = Object.fromEntries(FILTERS.map((f) => [f.id, f]));

  const FISH = /\b(salmon|cod|tuna|sardines?|anchov\w*|mackerel|trout|haddock|hake|halibut|pollock|sea bass|bass|sea bream|plaice|sole|tilapia|monkfish|swordfish|white fish|fish|herring|sprats?|shrimps?|prawns?|mussels?|clams?|scallops?|squid|calamari|crab|lobster|seafood)\b/;
  const MEAT = /\b(chicken|turkey|duck|beef|steaks?|veal|short ribs?|brisket|sirloin|ribeye|pork|ham|bacon|sausages?|chorizo|pancetta|prosciutto|salami|lardons?|gammon|speck|nduja|lamb|mutton|venison|mince|shanks?|gelatine?)\b/;
  const ANIMAL = /\b(milk|cream|butter|cheese|parmesan|cheddar|feta|mozzarella|ricotta|halloumi|gouda|mascarpone|quark|paneer|burrata|yogh?urt|skyr|kefir|eggs?|egg yolks?|honey|mayonnaise|crème fraîche|creme fraiche|ghee|buttermilk|pesto)\b/;

  const TAG_RULES = {
    // simple "No …" filters: stock and sauces don't count
    chicken: { re: /\bchicken\b/, skip: /\b(stock|broth|bouillon)\b/ },
    salmon: { re: /\bsalmon\b/, skip: /\b(stock|broth)\b/ },
    fish: { re: FISH, skip: /\b(stock|broth|bouillon|fish sauce)\b/ },
    pork: { re: /\b(pork|ham|bacon|sausages?|chorizo|pancetta|prosciutto|salami|lardons?|gammon|speck|nduja)\b/, skip: /\b(stock|broth|chicken sausages?)\b/ },
    // diet filters: stock and fishy sauces do count, unless a vegetable option is offered
    meat: { re: MEAT, skip: /\bor vegetable\b/ },
    seafood: { re: new RegExp(FISH.source + '|\\b(worcestershire|fish sauce)\\b'), skip: /\bor vegetable\b/ },
    animal: { re: ANIMAL, skip: /\b(plant-based|vegan|soy|oat|almond|coconut|peanut butter|butter beans?|butternut|cocoa butter)\b/ },
  };

  function tagsFor(recipe) {
    const tags = new Set();
    for (const ing of recipe.ingredients) {
      const n = ing.name.toLowerCase();
      for (const [id, rule] of Object.entries(TAG_RULES)) {
        if (rule.re.test(n) && !rule.skip.test(n)) tags.add(id);
      }
    }
    return [...tags];
  }

  // unknown filter ids (e.g. ones removed in an update) are ignored
  function filterConflicts(recipe, filters) {
    return (filters || []).map((id) => FILTER_BY_ID[id])
      .filter((f) => f && f.excludes.some((t) => recipe.tags.includes(t)))
      .map((f) => f.conflict);
  }

  function passesFilters(recipe, filters) {
    return filterConflicts(recipe, filters).length === 0;
  }

  /* ---------- formatting ---------- */

  const FRACTIONS = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];

  function fraction(x, allowed) {
    // nearest "nice" number using the allowed fractional parts
    const set = FRACTIONS.filter(([v]) => allowed.includes(v) || v === 0 || v === 1);
    let whole = Math.floor(x), frac = x - whole, best = set[0], bestD = Infinity;
    for (const f of set) {
      const d = Math.abs(frac - f[0]);
      if (d < bestD - 1e-9) { best = f; bestD = d; }
    }
    if (best[0] === 1) { whole += 1; best = [0, '']; }
    if (whole === 0 && !best[1]) return { text: '0', value: 0 };
    return { text: (whole ? String(whole) : '') + best[1], value: whole + best[0] };
  }
  const ALL_FRACS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];

  function roundGrams(g) {
    if (g < 100) return Math.max(5, Math.round(g / 5) * 5);
    if (g < 1000) return Math.round(g / 10) * 10;
    return Math.round(g / 50) * 50;
  }
  function fmtGrams(g) {
    const r = roundGrams(g);
    if (r >= 1000) return (r / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kg';
    return r + ' g';
  }
  function fmtSpoons(tsp) {
    if (tsp >= 2.99) {
      const f = fraction(tsp / 3, ALL_FRACS);
      return f.text + ' tbsp';
    }
    const f = fraction(tsp, [0.25, 0.5, 0.75]);
    if (f.value === 0) return '⅛ tsp';
    return f.text + ' tsp';
  }
  function fmtVolume(ml) {
    if (ml < 60) return fmtSpoons(ml / 5);
    const f = fraction(ml / 240, ALL_FRACS);
    return f.text + (f.value > 1 ? ' cups' : ' cup');
  }
  function fmtCount(n, mode) {
    if (mode === 'shop') return String(Math.max(1, Math.ceil(n - 0.05)));
    const f = fraction(n, [0.5]);
    return f.value === 0 ? '½' : f.text;
  }
  function countValue(n, mode) {
    if (mode === 'shop') return Math.max(1, Math.ceil(n - 0.05));
    return Math.max(0.5, fraction(n, [0.5]).value);
  }

  function fmtAmount(kind, value, mode) {
    switch (kind) {
      case 'mass': return fmtGrams(value);
      case 'vol': return fmtVolume(value);
      case 'spoon': return fmtSpoons(value);
      case 'count': return fmtCount(value, mode);
      default: return '';
    }
  }

  // "3 onions", "2 cans tomatoes", "450 g salmon", "1⅓ cups chicken stock"
  function phrase(item, min, max, mode) {
    const name = item.name;
    if (item.kind === 'none' || min == null) return name;
    let amt;
    if (item.kind === 'count') {
      const lo = countValue(min, mode), hi = countValue(max, mode);
      const amtText = lo === hi || mode === 'shop' ? fmtCount(max, mode) : fmtCount(min, mode) + '–' + fmtCount(max, mode);
      const many = (mode === 'shop' ? hi : lo) > 1;
      if (item.unitLabel) {
        const u = item.unitLabel === 'pinch' ? (many ? 'pinches' : 'pinch') : (many ? item.unitLabel + 's' : item.unitLabel);
        return amtText + ' ' + (item.unitLabel === 'clove' || item.unitLabel === 'stalk' ? name + ' ' + u : u + ' ' + name);
      }
      const nm = many ? lastWordMap(lastWordMap(name, singular), plural) : (lo <= 1 ? lastWordMap(name, singular) : name);
      return amtText + ' ' + nm;
    }
    const a = fmtAmount(item.kind, min, mode), b = fmtAmount(item.kind, max, mode);
    amt = a === b || mode === 'shop' ? b : a.replace(/\s.*$/, '') + '–' + b;
    return amt + ' ' + name;
  }

  function scaledPhrase(item, factor) {
    if (!item.qty) return item.name;
    return phrase(item, item.qty.min * factor, item.qty.max * factor, 'recipe');
  }

  function convertDirections(text) {
    return text.replace(/(\d+(?:\.\d+)?)\s*(ml|litres?|liters?)\b/g, (m, n, u) => {
      const ml = parseFloat(n) * (/^l/.test(u) ? 1000 : 1);
      return fmtVolume(ml);
    });
  }

  /* ---------- shopping categories ---------- */

  const GROUPS = [
    'Produce', 'Fresh herbs', 'Meat & poultry', 'Fish & seafood', 'Dairy, eggs & chilled',
    'Bread & bakery', 'Grains, pasta & pulses', 'Tins, jars & stock', 'Nuts, seeds & dried fruit',
    'Frozen', 'Wine & other', 'Pantry check',
  ];

  const HERBS = /\b(basil|parsley|dill|coriander|cilantro|mint|chives|tarragon|sage|rosemary|thyme|oregano|marjoram)\b/;
  const RULES = [
    ['Frozen', /\bfrozen\b/],
    ['Pantry check', /\b(salt|black pepper|yeast|saffron|oil|vinegar|soy sauce|honey|worcestershire|mustard|curry powder|curry paste|chili flakes|chilli flakes|chili powder|cumin|paprika|cinnamon|turmeric|nutmeg|caraway|garam masala|bay leaf|bay leaves|flour|sugar|fish sauce|tomato paste|cornflour|cornstarch|cayenne|five-spice|allspice|cardamom|fennel seeds|mustard seeds|ground coriander|ground ginger|baking|maple syrup|vanilla|sriracha|hoisin|mirin|sesame seeds|potato starch)\b/],
    ['Tins, jars & stock', /\b(stock|broth|passata|jarred|from a jar|coconut milk|olives?|capers?|pesto|artichoke|peanut butter|tahini|harissa|sun-dried|chutney|salsa|tomato puree|pineapple|horseradish|gherkins?|pickles?|canned|mayonnaise)\b/],
    ['Meat & poultry', /\b(chicken|beef|steaks?|pork|ham|bacon|sausages?|turkey|lamb|mince|chorizo|duck|veal|venison|short ribs?|shanks?|pancetta|prosciutto|salami|lardons?|gammon|sirloin)\b/],
    ['Fish & seafood', FISH],
    ['Grains, pasta & pulses', /\b(rice|couscous|bulgur|quinoa|barley|oats|lentils|polenta|farro|freekeh|noodles?|pasta|spaghetti|tagliatelle|fusilli|penne|rigatoni|orzo|lasagne|cannelloni|macaroni|linguine|soba|split peas|dried [\w ]*peas)\b/],
    ['Dairy, eggs & chilled', /\b(milk|cream|yogh?urt|cheese|parmesan|cheddar|feta|mozzarella|ricotta|halloumi|gouda|mascarpone|butter|eggs?|crème fraîche|creme fraiche|quark|paneer|tofu|tortellini|puff pastry|hummus|gnocchi|burrata|skyr|kefir|sour cream)\b/],
    ['Bread & bakery', /\b(bread|buns?|tortillas?|pitta|pita|naan|wraps?|breadcrumbs|filo|phyllo|baguette|rolls?|flatbreads?|pitas?|ciabatta|sourdough|crackers?)\b/],
    ['Nuts, seeds & dried fruit', /\b(almonds?|walnuts?|pine nuts|cashews?|peanuts?|pistachios?|hazelnuts?|pecans?|pumpkin seeds|sunflower seeds|seeds|apricots|raisins|sultanas|dates|cranberries|prunes|figs)\b/],
    ['Wine & other', /\b(wine|beer|cider|sherry|brandy|port)\b/],
  ];

  function classify(item) {
    const n = item.name.toLowerCase();
    if (item.kind === 'none') {
      if (/^(black )?pepper$/.test(n)) return 'Pantry check';
    }
    if (item.unitLabel === 'can' || item.unitLabel === 'jar') return 'Tins, jars & stock';
    if (/\b(sugar snap|green beans|runner beans|broad beans|edamame beans)\b/.test(n) && !/frozen/.test(n)) return 'Produce';
    if (HERBS.test(n) && /\bdried\b/.test(n)) return 'Pantry check';
    if (HERBS.test(n) && !/\b(ground|pesto)\b/.test(n)) {
      return item.kind === 'spoon' ? 'Pantry check' : 'Fresh herbs';
    }
    if (/\bginger\b/.test(n) && item.kind !== 'spoon') return 'Produce';
    for (const [group, re] of RULES) if (re.test(n)) return group;
    return 'Produce';
  }

  /* ---------- shopping list ---------- */

  // entries: [{ recipe, servings }]
  function buildShoppingList(entries) {
    const map = new Map();
    for (const { recipe, servings } of entries) {
      const factor = servings / BASE_SERVINGS;
      for (const ing of recipe.ingredients) {
        if (/^(lukewarm |hot |cold |boiling |warm )?water$/i.test(ing.name)) continue;
        const group = classify(ing);
        const k = group + '|' + ing.key;
        if (!map.has(k)) map.set(k, { group, key: ing.key, name: ing.name, amounts: new Map(), notes: new Set(), dishes: new Set() });
        const e = map.get(k);
        e.dishes.add(recipe.title);
        if (/\beach\b/.test(ing.note)) e.notes.add(ing.note.replace(/\s+and approximately.*$/, ''));
        const uk = ing.kind + '|' + ing.unitLabel;
        if (!e.amounts.has(uk)) e.amounts.set(uk, { kind: ing.kind, unitLabel: ing.unitLabel, total: 0, any: false, name: ing.name });
        const a = e.amounts.get(uk);
        if (ing.qty) { a.total += ing.qty.max * factor; a.any = true; }
      }
    }
    const groups = GROUPS.map((g) => ({ name: g, items: [] }));
    for (const e of map.values()) {
      const parts = [...e.amounts.values()];
      let text;
      const withQty = parts.filter((p) => p.any);
      if (!withQty.length) {
        text = e.name;
      } else if (withQty.length === 1) {
        const p = withQty[0];
        text = phrase({ name: p.name, kind: p.kind, unitLabel: p.unitLabel }, p.total, p.total, 'shop');
      } else {
        const display = e.name.charAt(0).toUpperCase() + e.name.slice(1);
        text = display + ': ' + withQty.map((p) => {
          if (p.kind === 'count') {
            const n = fmtCount(p.total, 'shop');
            return p.unitLabel ? n + ' ' + (n === '1' ? p.unitLabel : p.unitLabel + 's') : n;
          }
          return fmtAmount(p.kind, p.total, 'shop');
        }).join(' + ');
      }
      if (e.notes.size) text += ' (' + [...e.notes].join('; ') + ')';
      groups.find((g) => g.name === e.group).items.push({ text, dishes: [...e.dishes], key: e.key });
    }
    for (const g of groups) g.items.sort((a, b) => a.key.localeCompare(b.key));
    return groups.filter((g) => g.items.length);
  }

  return {
    BASE_SERVINGS, FILTERS, GROUPS,
    parseMarkdown, parseIngredients, passesFilters, filterConflicts, tagsFor, classify,
    scaledPhrase, convertDirections, buildShoppingList, fmtVolume, fmtSpoons, fmtGrams,
  };
});
