/* Cooked Goose 95 — app */
(function () {
  'use strict';

  const P = window.CGParser;
  const VERSION = window.CG_VERSION || 'dev';
  const STORE_KEY = 'cookedGoose.v1';
  const SERVING_OPTIONS = [2, 3, 4, 5, 6];

  const DAYS = [
    { id: 'mon', short: 'Mon', name: 'Monday' },
    { id: 'tue', short: 'Tue', name: 'Tuesday' },
    { id: 'wed', short: 'Wed', name: 'Wednesday' },
    { id: 'thu', short: 'Thu', name: 'Thursday' },
    { id: 'fri', short: 'Fri', name: 'Friday' },
    { id: 'sat', short: 'Sat', name: 'Saturday' },
    { id: 'sun', short: 'Sun', name: 'Sunday' },
  ];

  // Looks for known categories; anything new in a future recipe file gets a fallback style.
  const CATEGORY_STYLE = {
    'dutch oven dishes': { label: 'Dutch Oven', emoji: '🍲', c: '#ff5a1f', t: '#fff' },
    'pastas': { label: 'Pasta', emoji: '🍝', c: '#ffd60a', t: '#000' },
    'soups': { label: 'Soup', emoji: '🥣', c: '#ff8fd0', t: '#000' },
    'salmon dishes': { label: 'Salmon', emoji: '🐟', c: '#ff9966', t: '#000' },
    'shrimp dishes': { label: 'Shrimp', emoji: '🦐', c: '#ff3d7f', t: '#fff' },
    'salads': { label: 'Salad', emoji: '🥗', c: '#8cf02c', t: '#000' },
    'quick-and-easy dishes': { label: 'Quick & Easy', emoji: '⚡', c: '#3d5afe', t: '#fff' },
    'steak dishes': { label: 'Steak', emoji: '🥩', c: '#c2132f', t: '#fff' },
    'chicken dishes': { label: 'Chicken', emoji: '🍗', c: '#ffae00', t: '#000' },
    'vegetarian dishes': { label: 'Veggie', emoji: '🥕', c: '#12b358', t: '#fff' },
    'ambitious step-up dishes': { label: 'Ambitious', emoji: '🏆', c: '#8e2de2', t: '#fff' },
  };
  const FALLBACK_STYLES = [
    { emoji: '🍽️', c: '#00bfa5', t: '#000' }, { emoji: '🍛', c: '#f50057', t: '#fff' },
    { emoji: '🥘', c: '#ffea00', t: '#000' }, { emoji: '🌮', c: '#651fff', t: '#fff' },
  ];

  let recipes = [];
  const byId = new Map();
  let categories = []; // [{ name, label, emoji, c, t, count }]
  let state = loadState();
  let selectedCat = null; // for tap-to-place
  const openFilterPanels = new Set();

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ============ state ============ */

  function defaultDay() { return { cat: null, recipeId: null, servings: P.BASE_SERVINGS, filters: [] }; }

  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    s = s && typeof s === 'object' ? s : {};
    s.days = s.days || {};
    for (const d of DAYS) s.days[d.id] = Object.assign(defaultDay(), s.days[d.id] || {});
    s.shop = Object.assign({ days: [], pantry: true }, s.shop || {});
    return s;
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode etc. */ }
  }

  /* ============ recipes ============ */

  async function loadRecipes() {
    const res = await fetch('recipes/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load recipes/index.json');
    const manifest = await res.json();
    const texts = await Promise.all(manifest.files.map(async (f) => {
      const r = await fetch('recipes/' + f, { cache: 'no-cache' });
      if (!r.ok) throw new Error('Could not load recipes/' + f);
      return r.text();
    }));
    recipes = texts.flatMap((t) => P.parseMarkdown(t));
    byId.clear();
    for (const r of recipes) byId.set(r.id, r);
    const seen = new Map();
    let fb = 0;
    for (const r of recipes) {
      if (!seen.has(r.category)) {
        const style = CATEGORY_STYLE[r.category.toLowerCase()] ||
          Object.assign({ label: r.category.replace(/\s+dishes$/i, '') }, FALLBACK_STYLES[fb++ % FALLBACK_STYLES.length]);
        seen.set(r.category, Object.assign({ name: r.category, count: 0 }, style));
      }
      seen.get(r.category).count++;
    }
    categories = [...seen.values()];
  }

  const catInfo = (name) => categories.find((c) => c.name === name) ||
    { name, label: name, emoji: '🍽️', c: '#ccc', t: '#000', count: 0 };
  const catVars = (c) => `--c:${c.c};--t:${c.t}`;
  const filterLabel = (id) => (P.FILTERS.find((f) => f.id === id) || { label: id }).label;

  function usedIds(exceptDay) {
    return new Set(DAYS.filter((d) => d.id !== exceptDay).map((d) => state.days[d.id].recipeId).filter(Boolean));
  }

  function pickRecipe(cat, filters, excludeId, dayId) {
    const pool = recipes.filter((r) => r.category === cat && r.id !== excludeId && P.passesFilters(r, filters));
    if (!pool.length) return null;
    const used = usedIds(dayId);
    const fresh = pool.filter((r) => !used.has(r.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  /* ============ actions ============ */

  function assignCategory(dayId, cat) {
    const day = state.days[dayId];
    const pick = pickRecipe(cat, day.filters, null, dayId);
    const dayName = DAYS.find((d) => d.id === dayId).name;
    if (!pick) { noMatchDialog(dayId, cat); return; }
    day.cat = cat;
    day.recipeId = pick.id;
    saveState();
    renderWeek();
    setStatus(`${dayName}: ${pick.title}`);
    flashDay(dayId);
  }

  function shuffleDay(dayId) {
    const day = state.days[dayId];
    if (!day.cat) return;
    const pick = pickRecipe(day.cat, day.filters, day.recipeId, dayId);
    if (!pick) {
      const current = byId.get(day.recipeId);
      if (current && P.passesFilters(current, day.filters)) {
        showDialog({
          title: 'Cooked Goose', icon: 'ℹ️',
          html: `<p>That's the only <b>${esc(catInfo(day.cat).label)}</b> dish that fits ${esc(DAYS.find((d) => d.id === dayId).name)}'s filters.</p>`,
          buttons: [{ label: 'OK', primary: true }],
        });
      } else {
        noMatchDialog(dayId, day.cat);
      }
      return;
    }
    day.recipeId = pick.id;
    saveState();
    renderWeek();
    setStatus(`Shuffled! ${DAYS.find((d) => d.id === dayId).name}: ${pick.title}`);
    flashDay(dayId);
    return pick;
  }

  function clearDay(dayId) {
    Object.assign(state.days[dayId], { cat: null, recipeId: null });
    saveState();
    renderWeek();
  }

  function moveMeal(from, to) {
    if (from === to) return;
    const a = state.days[from], b = state.days[to];
    [a.cat, b.cat] = [b.cat, a.cat];
    [a.recipeId, b.recipeId] = [b.recipeId, a.recipeId];
    saveState();
    renderWeek();
    flashDay(to);
    setStatus(b.recipeId && a.recipeId ? 'Swapped dinners.' : 'Moved dinner.');
  }

  function noMatchDialog(dayId, cat) {
    const day = DAYS.find((d) => d.id === dayId);
    const filters = state.days[dayId].filters.map(filterLabel).join(', ');
    showDialog({
      title: 'Cooked Goose', icon: '⚠️',
      html: `<p><b>Cooked Goose has performed an illegal operation.</b></p>
             <p>No <b>${esc(catInfo(cat).label)}</b> dishes match ${esc(day.name)}'s filters${filters ? ` (${esc(filters)})` : ''}.</p>
             <p>Try loosening the filters or picking another meal type.</p>`,
      buttons: [
        { label: 'Edit filters', onClick: () => { openFilterPanels.add(dayId); renderWeek(); } },
        { label: 'OK', primary: true },
      ],
    });
  }

  /* ============ rendering ============ */

  function renderPalette() {
    $('#palette').innerHTML = categories.map((c) => `
      <button class="tile${selectedCat === c.name ? ' selected' : ''}" data-cat="${esc(c.name)}" style="${catVars(c)}"
              aria-pressed="${selectedCat === c.name}" title="${esc(c.name)} (${c.count})">
        <span class="emoji">${c.emoji}</span><span>${esc(c.label)}</span>
      </button>`).join('');
  }

  function todayId() {
    return DAYS[(new Date().getDay() + 6) % 7].id;
  }

  function renderWeek() {
    const today = todayId();
    $('#week').innerHTML = DAYS.map((d) => {
      const day = state.days[d.id];
      const recipe = day.recipeId ? byId.get(day.recipeId) : null;
      const cat = day.cat ? catInfo(day.cat) : null;
      const nFilters = day.filters.length;
      const panelOpen = openFilterPanels.has(d.id);
      let slot;
      if (!day.cat) {
        const msg = selectedCat ? `Tap to add<br><b>${esc(catInfo(selectedCat).label)}</b>` : 'Drop a meal here';
        slot = `<div class="slot sunken empty" data-act="place"><span class="drop-ico">🍽️</span><span>${msg}</span></div>`;
      } else {
        const bad = recipe && !P.passesFilters(recipe, day.filters)
          ? recipe.tags.filter((t) => day.filters.includes(t)).map((t) => filterLabel(t).replace(/^No /, '')) : [];
        slot = `<div class="slot sunken" data-act="place">
          <span class="cat-chip" data-from="${d.id}" style="${catVars(cat)}" title="Drag to move to another day"><span>${cat.emoji}</span><span>${esc(cat.label)}</span></span>
          ${recipe
            ? `<button class="dish" data-act="open">${esc(recipe.title)}</button>`
            : '<span class="warn">Recipe not found — try Shuffle.</span>'}
          ${bad.length ? `<span class="warn">⚠ Contains ${esc(bad.join(', '))}. Shuffle?</span>` : ''}
          ${nFilters && !panelOpen ? `<div class="active-filters">${day.filters.map((f) => `<span>${esc(filterLabel(f))}</span>`).join('')}</div>` : ''}
        </div>`;
      }
      const panel = panelOpen ? `
        <div class="filters-panel">
          ${P.FILTERS.map((f) => `
            <label class="check"><input type="checkbox" data-act="filter" value="${f.id}" ${day.filters.includes(f.id) ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}
        </div>` : '';
      return `
        <article class="day${d.id === today ? ' today' : ''}${selectedCat ? ' tap-target' : ''}" data-day="${d.id}" aria-label="${d.name}">
          <div class="day-head">
            <span class="day-name"><span class="day-full">${d.name}</span><span class="day-short">${d.short}</span></span>
            <button class="btn filter-btn${nFilters ? ' on' : ''}" data-act="filters" aria-expanded="${panelOpen}">Filters${nFilters ? ` (${nFilters})` : ''} ${panelOpen ? '▲' : '▼'}</button>
          </div>
          ${panel}
          ${slot}
          <div class="day-foot">
            <button class="btn" data-act="shuffle" ${day.cat ? '' : 'disabled'}><span>🔀 Shuffle</span></button>
            <button class="btn clear" data-act="clear" aria-label="Clear ${d.name}" ${day.cat ? '' : 'disabled'}><span>✕</span></button>
            <label class="servings"><span aria-hidden="true">👥</span>
              <select data-act="servings" aria-label="People on ${d.name}">
                ${SERVING_OPTIONS.map((n) => `<option value="${n}" ${n === day.servings ? 'selected' : ''}>${n} people</option>`).join('')}
              </select>
            </label>
          </div>
        </article>`;
    }).join('');
    renderStatusCount();
  }

  function renderStatusCount() {
    const n = DAYS.filter((d) => state.days[d.id].recipeId).length;
    $('#status-count').textContent = `${n} of 7 dinners planned`;
  }

  function setStatus(msg) { $('#status-msg').textContent = msg; }

  function flashDay(dayId) {
    const el = $(`.day[data-day="${dayId}"] .slot`);
    if (!el || !el.animate) return;
    el.animate([{ background: '#fff9a0' }, { background: '#fff' }], { duration: 600 });
  }

  function selectCategory(cat) {
    selectedCat = selectedCat === cat ? null : cat;
    renderPalette();
    renderWeek();
    setStatus(selectedCat ? `${catInfo(selectedCat).label} selected — now tap a day.` : 'Ready');
  }

  /* ============ week events ============ */

  $('#week').addEventListener('click', (e) => {
    const dayEl = e.target.closest('.day');
    if (!dayEl) return;
    const dayId = dayEl.dataset.day;
    const actEl = e.target.closest('[data-act]');
    const act = actEl && actEl.dataset.act;
    if (act === 'filters') {
      openFilterPanels.has(dayId) ? openFilterPanels.delete(dayId) : openFilterPanels.add(dayId);
      renderWeek();
    } else if (act === 'shuffle') {
      shuffleDay(dayId);
    } else if (act === 'clear') {
      clearDay(dayId);
    } else if (act === 'open') {
      openRecipe(state.days[dayId].recipeId, dayId);
    } else if (act === 'place' && !e.target.closest('.cat-chip')) {
      if (selectedCat) {
        const cat = selectedCat;
        selectedCat = null;
        renderPalette();
        renderWeek();
        setStatus('Ready');
        assignCategory(dayId, cat);
      } else if (!state.days[dayId].cat) {
        setStatus('Pick a meal type first — tap one in the Meal types box.');
      }
    }
  });

  $('#week').addEventListener('change', (e) => {
    const dayEl = e.target.closest('.day');
    if (!dayEl) return;
    const day = state.days[dayEl.dataset.day];
    if (e.target.dataset.act === 'filter') {
      const v = e.target.value;
      day.filters = e.target.checked ? [...new Set([...day.filters, v])] : day.filters.filter((f) => f !== v);
      saveState();
      renderWeek();
    } else if (e.target.dataset.act === 'servings') {
      day.servings = parseInt(e.target.value, 10) || P.BASE_SERVINGS;
      saveState();
      setStatus(`${DAYS.find((d) => d.id === dayEl.dataset.day).name}: cooking for ${day.servings}.`);
    }
  });

  /* ============ drag & drop (pointer events: mouse, pencil and touch) ============ */

  let drag = null;
  const ghost = $('#drag-ghost');
  const scroller = $('#planner-scroll');

  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const tile = e.target.closest('.tile[data-cat]');
    const chip = e.target.closest('.cat-chip[data-from]');
    if (!tile && !chip) return;
    const from = chip ? chip.dataset.from : null;
    drag = {
      kind: tile ? 'cat' : 'move',
      cat: tile ? tile.dataset.cat : state.days[from].cat,
      from, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, over: null, raf: 0,
    };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 8) return;
      startDrag();
    }
    e.preventDefault();
    moveGhost();
    hitTest();
  }, { passive: false });

  document.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    endDrag();
    if (d.active) {
      if (d.over) d.kind === 'cat' ? assignCategory(d.over, d.cat) : moveMeal(d.from, d.over);
    } else if (d.kind === 'cat') {
      selectCategory(d.cat);
    } else if (d.kind === 'move' && state.days[d.from].recipeId) {
      openRecipe(state.days[d.from].recipeId, d.from);
    }
  });
  document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) endDrag(); });

  function startDrag() {
    drag.active = true;
    const c = catInfo(drag.cat);
    ghost.innerHTML = `<div class="tile" style="${catVars(c)}"><span class="emoji">${c.emoji}</span><span>${esc(c.label)}</span></div>`;
    ghost.hidden = false;
    document.body.style.cursor = 'grabbing';
    const loop = () => {
      if (!drag || !drag.active) return;
      const r = scroller.getBoundingClientRect();
      const edge = 70;
      let dy = 0;
      if (drag.y < r.top + edge) dy = -Math.ceil((r.top + edge - drag.y) / 5);
      else if (drag.y > r.bottom - edge) dy = Math.ceil((drag.y - (r.bottom - edge)) / 5);
      if (dy) { scroller.scrollTop += dy; hitTest(); }
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
  }

  function moveGhost() {
    ghost.style.left = drag.x + 'px';
    ghost.style.top = drag.y + 'px';
  }

  function hitTest() {
    const el = document.elementFromPoint(drag.x, drag.y);
    const dayEl = el && el.closest('.day');
    const over = dayEl ? dayEl.dataset.day : null;
    if (over === drag.over) return;
    document.querySelectorAll('.day.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (dayEl) dayEl.classList.add('drop-target');
    drag.over = over;
  }

  function endDrag() {
    if (drag && drag.raf) cancelAnimationFrame(drag.raf);
    document.querySelectorAll('.day.drop-target').forEach((n) => n.classList.remove('drop-target'));
    ghost.hidden = true;
    document.body.style.cursor = '';
    drag = null;
  }

  /* ============ windows & dialogs ============ */

  const layer = $('#modal-layer');

  function openWindow({ title, icon = 'assets/favicon.png', body, foot, cls = '' }) {
    const win = document.createElement('section');
    win.className = `window modal ${cls}`;
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', title);
    win.innerHTML = `
      <header class="titlebar">
        <img src="${icon}" alt="" class="tb-icon">
        <span class="tb-title">${esc(title)}</span>
        <button class="tb-close" aria-label="Close">×</button>
      </header>
      <div class="modal-body"></div>
      <footer class="modal-foot"></footer>`;
    const b = $('.modal-body', win), f = $('.modal-foot', win);
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
    if (foot) f.append(...foot); else f.remove();
    $('.tb-close', win).addEventListener('click', () => closeWindow(win));
    layer.append(win);
    layer.hidden = false;
    closeStartMenu();
    return win;
  }

  function closeWindow(win) {
    win.remove();
    if (!layer.children.length) layer.hidden = true;
  }

  function button(label, onClick, { primary = false, cls = '' } = {}) {
    const b = document.createElement('button');
    b.className = `btn ${primary ? 'primary' : ''} ${cls}`;
    b.innerHTML = `<span>${label}</span>`;
    b.addEventListener('click', onClick);
    return b;
  }

  function showDialog({ title, icon = 'ℹ️', html, buttons }) {
    let win;
    const foot = buttons.map((bt) => button(esc(bt.label), () => { closeWindow(win); bt.onClick && bt.onClick(); }, { primary: bt.primary }));
    win = openWindow({
      title, cls: 'narrow',
      body: `<div class="dialog-row"><div class="dialog-ico">${icon}</div><div>${html}</div></div>`,
      foot,
    });
    const primary = $('.btn.primary', win);
    if (primary) primary.focus();
    return win;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.append(t);
    setTimeout(() => t.remove(), 2200);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#start-menu').hidden) { closeStartMenu(); return; }
    if (selectedCat) { selectCategory(selectedCat); return; }
    const top = layer.lastElementChild;
    if (top) closeWindow(top);
  });

  /* ============ recipe viewer ============ */

  function openRecipe(recipeId, dayId) {
    const r = byId.get(recipeId);
    if (!r) return;
    let servings = dayId ? state.days[dayId].servings : P.BASE_SERVINGS;
    const cat = catInfo(r.category);
    const body = document.createElement('div');
    body.className = 'notepad sunken';

    const draw = () => {
      const factor = servings / P.BASE_SERVINGS;
      body.innerHTML = `
        <div class="recipe-meta">
          <span class="cat-chip" style="${catVars(cat)}"><span>${cat.emoji}</span><span>${esc(cat.label)}</span></span>
          ${dayId ? `<span>· ${esc(DAYS.find((d) => d.id === dayId).name)}</span>` : ''}
        </div>
        <h2>${esc(r.title)}</h2>
        <div class="recipe-meta">
          <label class="servings">Serves
            <select class="win" data-r="servings">
              ${SERVING_OPTIONS.map((n) => `<option value="${n}" ${n === servings ? 'selected' : ''}>${n} people</option>`).join('')}
            </select>
          </label>
        </div>
        <h3>Ingredients</h3>
        <ul>${r.ingredients.map((i) => {
          const txt = P.scaledPhrase(i, factor);
          return `<li>${esc(txt)}${i.note ? `<span class="note">, ${esc(i.note)}</span>` : ''}</li>`;
        }).join('')}</ul>
        <h3>Directions</h3>
        <p class="directions">${esc(P.convertDirections(r.directions))}</p>
        ${servings !== P.BASE_SERVINGS ? `<p class="scaled-note">Ingredients are scaled for ${servings}. Directions are written for ${P.BASE_SERVINGS}, so any amounts mentioned there are for the original recipe; cooking times may need a little extra for larger batches.</p>` : ''}`;
      $('select', body).addEventListener('change', (e) => {
        servings = parseInt(e.target.value, 10);
        if (dayId) {
          state.days[dayId].servings = servings;
          saveState();
          renderWeek();
        }
        draw();
      });
    };
    draw();

    let win;
    const foot = [];
    if (dayId) {
      foot.push(button('🔀 Shuffle', () => {
        const pick = shuffleDay(dayId);
        if (pick) { closeWindow(win); openRecipe(pick.id, dayId); }
      }));
    }
    foot.push(button('Close', () => closeWindow(win), { primary: true }));
    win = openWindow({ title: `${r.title}.txt — Notepad`, body, foot });
    $('.modal-body', win).scrollTop = 0;
  }

  /* ============ recipe book ============ */

  function openBook() {
    let current = categories[0] && categories[0].name;
    const body = document.createElement('div');
    body.className = 'book';
    const draw = () => {
      const list = recipes.filter((r) => r.category === current);
      body.innerHTML = `
        <div class="book-cats sunken">${categories.map((c) => `
          <button data-cat="${esc(c.name)}" class="${c.name === current ? 'on' : ''}"><span>${c.emoji}</span>${esc(c.label)}</button>`).join('')}
        </div>
        <div class="book-list sunken">${list.map((r) => `
          <button data-id="${esc(r.id)}"><span>📄</span><span>${esc(r.title)}</span></button>`).join('')}
        </div>`;
    };
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      const r = e.target.closest('[data-id]');
      if (c) { current = c.dataset.cat; draw(); $('.book-list', body).scrollTop = 0; }
      if (r) openRecipe(r.dataset.id, null);
    });
    draw();
    let win;
    win = openWindow({ title: 'Recipe Book', body, foot: [button('Close', () => closeWindow(win), { primary: true })] });
  }

  /* ============ shopping list wizard ============ */

  function openShopping() {
    const planned = DAYS.filter((d) => state.days[d.id].recipeId && byId.get(state.days[d.id].recipeId));
    if (!planned.length) {
      showDialog({
        title: 'Shopping List Wizard', icon: '🛒',
        html: '<p>There\'s nothing on the menu yet!</p><p>Drag a few meal types onto the week first, then come back for your list.</p>',
        buttons: [{ label: 'OK', primary: true }],
      });
      return;
    }
    const plannedIds = planned.map((d) => d.id);
    let chosen = new Set(state.shop.days.filter((id) => plannedIds.includes(id)));
    if (!chosen.size) chosen = new Set(plannedIds);
    let pantry = state.shop.pantry !== false;

    const body = document.createElement('div');
    let win;
    const back = button('&lt; Back', () => step1());
    const next = button('Next &gt;', () => step2(), { primary: true });
    const copy = button('📋 Copy to clipboard', () => copyList(), { primary: true });
    const cancel = button('Close', () => closeWindow(win));
    let listText = '';

    const remember = () => {
      state.shop.days = [...chosen];
      state.shop.pantry = pantry;
      saveState();
    };

    function setFoot(btns) {
      const f = $('.modal-foot', win);
      f.innerHTML = '';
      f.append(...btns);
    }

    function step1() {
      body.innerHTML = `
        <div class="wizard">
          <div class="wizard-art sunken"><img src="assets/logo.png" alt=""></div>
          <div>
            <h2>Which days are you shopping for?</h2>
            <p>Tick the dinners to include. Ingredients are combined and sorted by aisle.</p>
            <div class="quick-picks">
              <button class="btn small" data-q="mon,tue,wed">Mon–Wed</button>
              <button class="btn small" data-q="thu,fri">Thu–Fri</button>
              <button class="btn small" data-q="thu,fri,sat,sun">Thu–Sun</button>
              <button class="btn small" data-q="all">Whole week</button>
              <button class="btn small" data-q="none">None</button>
            </div>
            <div class="day-picks">
              ${DAYS.map((d) => {
                const day = state.days[d.id];
                const r = day.recipeId && byId.get(day.recipeId);
                return `<label class="check">
                  <input type="checkbox" value="${d.id}" ${r ? '' : 'disabled'} ${r && chosen.has(d.id) ? 'checked' : ''}>
                  <span><b>${d.name}</b><br><span class="dish-small">${r ? `${esc(r.title)} · ${day.servings} ppl` : '(nothing planned)'}</span></span>
                </label>`;
              }).join('')}
            </div>
            <label class="check"><input type="checkbox" data-pantry ${pantry ? 'checked' : ''}><span>Include a <b>Pantry check</b> section (salt, oil, spices…)</span></label>
          </div>
        </div>`;
      setFoot([cancel, next]);
      next.disabled = !chosen.size;
    }

    body.addEventListener('change', (e) => {
      if (e.target.matches('[data-pantry]')) pantry = e.target.checked;
      else if (e.target.type === 'checkbox') e.target.checked ? chosen.add(e.target.value) : chosen.delete(e.target.value);
      next.disabled = !chosen.size;
      remember();
    });
    body.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (!q) return;
      const v = q.dataset.q;
      const want = v === 'all' ? plannedIds : v === 'none' ? [] : v.split(',');
      chosen = new Set(want.filter((id) => plannedIds.includes(id)));
      remember();
      step1();
    });

    function step2() {
      remember();
      const days = DAYS.filter((d) => chosen.has(d.id));
      const entries = days.map((d) => ({ recipe: byId.get(state.days[d.id].recipeId), servings: state.days[d.id].servings, day: d }));
      let groups = P.buildShoppingList(entries);
      if (!pantry) groups = groups.filter((g) => g.name !== 'Pantry check');

      const dayList = days.map((d) => d.short).join(', ');
      listText = [
        'COOKED GOOSE SHOPPING LIST',
        `${dayList} (${entries.length} dinner${entries.length === 1 ? '' : 's'})`,
        ...entries.map((e) => `  ${e.day.short}: ${e.recipe.title} (${e.servings} ppl)`),
        '',
        ...groups.flatMap((g) => [g.name.toUpperCase(), ...g.items.map((i) => `- ${i.text}`), '']),
      ].join('\n').trim() + '\n';

      body.innerHTML = `
        <div class="shop-for"><b>${esc(dayList)}</b> — ${entries.map((e) => esc(e.recipe.title)).join(' · ')}</div>
        <div class="shoplist sunken">
          ${groups.map((g) => `
            <h3>${esc(g.name)}</h3>
            ${g.items.map((i) => `<label class="check" title="${esc(i.dishes.join(', '))}"><input type="checkbox"><span>${esc(i.text)}</span></label>`).join('')}`).join('')}
        </div>`;
      $('.shoplist', body).addEventListener('change', (e) => e.stopPropagation());
      setFoot([back, cancel, copy]);
      $('.modal-body', win).scrollTop = 0;
    }

    async function copyList() {
      let ok = false;
      try {
        await navigator.clipboard.writeText(listText);
        ok = true;
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = listText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.append(ta);
        ta.select();
        ta.setSelectionRange(0, listText.length);
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
      }
      if (ok) toast('📋 Shopping list copied to clipboard!');
      else showDialog({ title: 'Clipboard', icon: '⚠️', html: '<p>Couldn\'t reach the clipboard. Select the list and copy it manually.</p>', buttons: [{ label: 'OK', primary: true }] });
    }

    win = openWindow({ title: 'Shopping List Wizard', body, foot: [] });
    step1();
  }

  /* ============ start menu, toolbar, misc ============ */

  const startBtn = $('#start-btn');
  const startMenu = $('#start-menu');
  function closeStartMenu() {
    startMenu.hidden = true;
    startBtn.classList.remove('pressed');
    startBtn.setAttribute('aria-expanded', 'false');
  }
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = startMenu.hidden;
    startMenu.hidden = !open;
    startBtn.classList.toggle('pressed', open);
    startBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!startMenu.hidden && !startMenu.contains(e.target)) closeStartMenu();
  });

  function runAction(action) {
    closeStartMenu();
    switch (action) {
      case 'shopping': openShopping(); break;
      case 'book': openBook(); break;
      case 'planner':
        while (layer.lastElementChild) closeWindow(layer.lastElementChild);
        break;
      case 'clear-week':
        showDialog({
          title: 'Clear Week', icon: '🗑️',
          html: '<p>Clear all seven dinners?</p><p>Filters and serving sizes will stay as they are.</p>',
          buttons: [
            { label: 'Yes', primary: true, onClick: () => { for (const d of DAYS) clearDay(d.id); setStatus('Week cleared. Fresh start!'); } },
            { label: 'No' },
          ],
        });
        break;
      case 'about':
        showDialog({
          title: 'About Cooked Goose', icon: `<img src="assets/logo.png" alt="" style="width:72px;border-radius:50%">`,
          html: `<p><b>Cooked Goose 95</b><br>Version ${esc(VERSION)}</p>
                 <p>${recipes.length} recipes in ${categories.length} categories.<br>All recipes serve ${P.BASE_SERVINGS} unless you say otherwise.</p>
                 <p style="font-size:12px;color:#555">Your plan is saved on this device.</p>`,
          buttons: [{ label: 'OK', primary: true }],
        });
        break;
    }
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a) runAction(a.dataset.action);
  });
  $('#task-planner').addEventListener('click', () => runAction('planner'));

  function tickClock() {
    $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /* ============ boot ============ */

  async function boot() {
    document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = 'v' + VERSION; });
    tickClock();
    setInterval(tickClock, 15000);

    const bootEl = $('#boot'), bar = $('#boot-bar'), msg = $('#boot-msg');
    const steps = ['Starting Cooked Goose…', 'Loading recipe arsenal…', 'Plucking feathers…', 'Preheating oven to 180°C…', 'Sharpening knives…'];
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      msg.textContent = steps[i];
      bar.style.width = Math.min(90, (i + 1) * 20) + '%';
    }, 340);
    bar.style.width = '10%';
    const minTime = new Promise((res) => setTimeout(res, 1700));
    let skip;
    const skipped = new Promise((res) => { skip = res; });

    try {
      await loadRecipes();
    } catch (err) {
      clearInterval(timer);
      msg.textContent = 'Error: ' + err.message + '. Refresh to try again.';
      return;
    }
    bootEl.addEventListener('click', () => skip());
    await Promise.race([minTime, skipped]);
    clearInterval(timer);
    bar.style.width = '100%';
    msg.textContent = `Ready! ${recipes.length} recipes loaded.`;

    renderPalette();
    renderWeek();
    setStatus('Ready — drag a meal type onto a day.');

    await new Promise((res) => setTimeout(res, 300));
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 600);
  }

  boot();
})();
