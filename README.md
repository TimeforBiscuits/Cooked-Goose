# 🪿 Cooked Goose

A Windows 95–flavoured weekly dinner planner and shopping-list maker. Built for iPad and iPhone; it's a plain static site, hosted on GitHub Pages.

## What it does

- **Plan the week.** Drag a meal type (Dutch Oven, Pasta, Soup, Salmon…) onto a day, or tap a meal type and then tap a day. Cooked Goose picks a random dish from that category and tries not to repeat a dish already on the week.
- **Shuffle.** Don't fancy it? Hit 🔀 Shuffle for another dish from the same category.
- **Filters per day.** No chicken / fish / salmon / beef / pork / rice / noodles. Shuffles and new picks skip dishes that contain the filtered food.
  - *No fish* includes shrimp and other seafood.
  - *No noodles* includes all pasta (and gnocchi), but not couscous.
  - *No rice* blocks rice only (rice noodles are caught by *No noodles*).
  - Stock never counts, so a beef-stock soup survives *No beef*.
- **Servings per day.** Every recipe is written for 3 people; each day can be set to 2–6 and quantities scale.
- **Recipe viewer.** Tap a dish to see scaled ingredients and directions.
- **Shopping list.** Pick the days you're shopping for, and Cooked Goose combines all ingredients and groups them by type (Produce, Meat, Dairy…), with an optional *Pantry check* section for staples. 📋 copies it as plain text.
- Drag a dish's coloured category chip onto another day to move or swap dinners.

Your plan saves automatically on each device (browser storage); plans don't sync between devices.

## Units

- Liquids are shown in **cups** (1 cup = 240 ml); small liquid amounts in tbsp/tsp.
- Small dry amounts stay in **tsp/tbsp**; everything else dry is in **grams**.
- Oven temperatures are °C.
- Scaled quantities are rounded to sensible amounts (½ onion, nearest 5–10 g, nearest ¼ tsp). The shopping list rounds whole items (onions, cans, lemons) up.

## Adding recipes

1. Drop a new markdown file into `recipes/`, using the same format as `batch-01-2026-10-04.md`:
   - `## Category name`
   - `### 1. Recipe title`
   - `**Ingredients:** item; item; item.`
   - `**Directions:** …`
2. Add its filename to `recipes/index.json`.
3. Run `node tests/check.js`. It checks every recipe parses and prints how many dishes survive each filter. (The expected recipe count in that script will need bumping.)

New categories appear automatically with a fallback colour. Ingredients the classifier doesn't recognise land under *Produce* in the shopping list; add keywords in `js/parser.js` (`RULES`) if something lands in the wrong aisle.

## Versioning

The version shows in the taskbar tray and in **Start → About**. Bump it in `js/version.js` with each release.

## Hosting

Every push to `main` runs the checks and deploys to GitHub Pages via `.github/workflows/pages.yml`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

To run it locally: `python3 -m http.server`, then open http://localhost:8000. The recipes are fetched, so opening `index.html` directly from disk won't work.

On iPhone/iPad, use **Share → Add to Home Screen** for a full-screen app icon.
