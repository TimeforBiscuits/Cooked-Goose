# 🪿 Cooked Goose

A Windows 95–flavoured weekly dinner planner and shopping-list maker. Built for iPad and iPhone; it's a plain static site, hosted on GitHub Pages.

## What it does

- **Plan the week.** Drag a meal type (Dutch Oven, Pasta, Soup, Salmon…) onto a day, or tap a meal type and then tap a day. Cooked Goose picks a random dish from that category and tries not to repeat a dish already on the week.
- **Shuffle.** Don't fancy it? Hit 🔀 Shuffle for another dish from the same category.
- **Filters per day.** Shuffles and new picks respect them.
  - *No chicken / No fish / No salmon / No pork* skip dishes containing that food. *No fish* includes shrimp and other seafood. Stock doesn't count for these.
  - *Pescatarian / Vegetarian / Vegan* only allow dishes that fit the diet. For these, stock and fishy sauces (Worcestershire, fish sauce) **do** count, so a chicken-stock soup isn't vegetarian. *Vegan* also excludes dairy, eggs, honey and pesto; plant-based yogurt and soy milk are fine.
  - If a planned dish clashes with a filter you turn on later, the day shows a warning (e.g. "Not vegetarian. Shuffle?").
- **Servings per day.** Every recipe is written for 3 people; each day can be set to 2–6 and quantities scale.
- **Recipe viewer.** Tap a dish to see scaled ingredients and directions.
- **Shopping list.** Pick the days you're shopping for, and Cooked Goose combines all ingredients and groups them by type (Produce, Meat, Dairy…), with an optional *Pantry check* section for staples. 📋 copies it as plain text.
- Drag a dish's coloured category chip onto another day to move or swap dinners.
- **Ratings & cook's notes.** Open any recipe to give it 1–5 stars (tap the same star again to clear) and log dated notes each time you cook it ("Needs a little more cumin"). Ratings show on the planner and in the Recipe Book.

Your week plan saves on each device (browser storage). Notes and ratings save on the device too, and can sync across devices — see below.

## Syncing notes & ratings

Notes and ratings sync through a **secret GitHub Gist** (`cooked-goose-journal.json`) on your GitHub account — unlisted and separate from this public repo.

1. **Start → Sync Notes & Ratings…** (or tap the 💾 in the taskbar).
2. Tap **Create a token on GitHub** — the page opens with the `gist` permission pre-ticked. Set an expiration you're happy with, generate it, copy it, paste it into Cooked Goose and tap **Connect**. The gist is created automatically.
3. On another device, either paste the same token, or tap **Copy setup link** on a connected device and open that link on the new one.

Everything saves locally first, so it works offline and syncs when it can (on open, after each change, and when you come back to the app). If two devices change things at once, nothing is lost: notes from both are kept, deletions stick, and the most recent rating wins. The setup link contains your token, so only send it to yourself. To stop syncing on a device, use **Disconnect**; to revoke access entirely, delete the token at github.com → Settings → Developer settings → Tokens.

## Units

- Liquids are shown in **cups** (1 cup = 240 ml); small liquid amounts in tbsp/tsp.
- Small dry amounts stay in **tsp/tbsp**; everything else dry is in **grams**.
- Oven temperatures are °C.
- Scaled quantities are rounded to sensible amounts (½ onion, nearest 5–10 g, nearest ¼ tsp). The shopping list rounds whole items (onions, cans, lemons) up.

## Recipes

277 recipes in 13 categories: the original 11, plus **Vegan** (35) and **Latvian** (22, vegetarian and fish). The **Any Fish** tile picks from every dish containing fish or seafood (salmon, cod, herring, shrimp…), whatever its category. Latvian dishes include their source notes (tap *Source notes* in the recipe window).

## Adding recipes

1. Drop a new markdown file into `recipes/`, using the same format as `batch-01-2026-10-04.md`:
   - `## Category name`
   - `### 1. Recipe title`
   - `**Ingredients:** item; item; item.`
   - `**Directions:** …`
2. Add its filename to `recipes/index.json`. To rename or merge sections, map them under `"categories"` (e.g. both Latvian sections map to `"Latvian dishes"`). Footnotes like `[^L1]` in directions are shown as source notes.
3. Run `node tests/check.js`. It checks every recipe parses and prints how many dishes survive each filter. (The expected recipe count in that script will need bumping.)

New categories appear automatically with a fallback colour. Ingredients the classifier doesn't recognise land under *Produce* in the shopping list; add keywords in `js/parser.js` (`RULES`) if something lands in the wrong aisle.

## Versioning

The version shows in the taskbar tray and in **Start → About**. Bump it in `js/version.js` with each release.

## Hosting

Every push to `main` runs the checks and deploys to GitHub Pages via `.github/workflows/pages.yml`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

To run it locally: `python3 -m http.server`, then open http://localhost:8000. The recipes are fetched, so opening `index.html` directly from disk won't work.

On iPhone/iPad, use **Share → Add to Home Screen** for a full-screen app icon.
