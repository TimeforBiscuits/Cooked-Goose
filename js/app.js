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
    'vegan dishes': { label: 'Vegan', emoji: '🌱', c: '#c3a6ff', t: '#000' },
    'latvian dishes': { label: 'Latvian', emoji: '🇱🇻', c: '#8c1d2c', t: '#fff' },
  };
  // Virtual categories pull from every recipe that matches, whatever section it lives in.
  // `after` places the tile next to a real category in the palette.
  const VIRTUAL_CATEGORIES = [
    { name: 'Any fish', label: 'Any Fish', emoji: '🎣', c: '#1a2a8c', t: '#fff', after: 'Shrimp dishes',
      match: (r) => r.tags.includes('fish') },
  ];
  const FALLBACK_STYLES = [
    { emoji: '🍽️', c: '#00bfa5', t: '#000' }, { emoji: '🍛', c: '#f50057', t: '#fff' },
    { emoji: '🥘', c: '#ffea00', t: '#000' }, { emoji: '🌮', c: '#651fff', t: '#fff' },
  ];

  let recipes = [];
  const byId = new Map();
  let categories = []; // [{ name, label, emoji, c, t, count }]
  let state = loadState();

  // cook's notes + ratings (local first, optional GitHub Gist sync)
  const journalListeners = new Set();
  let storage;
  try { storage = window.localStorage; } catch (e) { storage = { getItem: () => null, setItem: () => {} }; }
  const journal = window.CGJournal.createStore({
    storage,
    fetchImpl: window.fetch.bind(window),
    onChange: () => { if (recipes.length) renderWeek(); journalListeners.forEach((fn) => fn()); },
    onStatus: () => { renderSyncStatus(); journalListeners.forEach((fn) => fn()); },
  });
  const RATING_LABELS = ['', 'Never again', 'Meh', 'Solid', 'Really good', 'Honk-worthy!'];
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
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
    const known = new Set(P.FILTERS.map((f) => f.id));
    for (const d of DAYS) {
      s.days[d.id] = Object.assign(defaultDay(), s.days[d.id] || {});
      s.days[d.id].filters = (s.days[d.id].filters || []).filter((f) => known.has(f)); // drop retired filters
    }
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
    recipes = texts.flatMap((t) => P.parseMarkdown(t, { categoryMap: manifest.categories }));
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
    for (const v of VIRTUAL_CATEGORIES) {
      const count = recipes.filter(v.match).length;
      if (!count) continue;
      const at = categories.findIndex((c) => c.name === v.after);
      categories.splice(at < 0 ? categories.length : at + 1, 0, Object.assign({ count, virtual: true }, v));
    }
  }

  const catInfo = (name) => categories.find((c) => c.name === name) ||
    { name, label: name, emoji: '🍽️', c: '#ccc', t: '#000', count: 0 };
  function inCategory(name) {
    const v = VIRTUAL_CATEGORIES.find((x) => x.name === name);
    return recipes.filter(v ? v.match : (r) => r.category === name);
  }
  const catVars = (c) => `--c:${c.c};--t:${c.t}`;
  const filterLabel = (id) => (P.FILTERS.find((f) => f.id === id) || { label: id }).label;

  function usedIds(exceptDay) {
    return new Set(DAYS.filter((d) => d.id !== exceptDay).map((d) => state.days[d.id].recipeId).filter(Boolean));
  }

  function pickRecipe(cat, filters, excludeId, dayId) {
    const pool = inCategory(cat).filter((r) => r.id !== excludeId && P.passesFilters(r, filters));
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
        const bad = recipe ? P.filterConflicts(recipe, day.filters) : [];
        slot = `<div class="slot sunken" data-act="place">
          <span class="cat-chip" data-from="${d.id}" style="${catVars(cat)}" title="Drag to move to another day"><span>${cat.emoji}</span><span>${esc(cat.label)}</span></span>
          ${recipe
            ? `<button class="dish" data-act="open">${esc(recipe.title)}</button>${journal.rating(recipe.id) ? `<span class="day-stars" title="Your rating">${starText(journal.rating(recipe.id))}</span>` : ''}`
            : '<span class="warn">Recipe not found — try Shuffle.</span>'}
          ${bad.length ? `<span class="warn">⚠ ${esc(bad.join(', ').replace(/^./, (c) => c.toUpperCase()))}. Shuffle?</span>` : ''}
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
    } else if (act === 'open' && !selectedCat) {
      openRecipe(state.days[dayId].recipeId, dayId);
    } else if ((act === 'place' || act === 'open') && !e.target.closest('.cat-chip')) {
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
    if (win._onClose) win._onClose();
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
    let draft = '';
    let draftDate = todayISO();

    // only the journal parts redraw on sync, so a half-typed note is never lost
    const drawJournal = () => {
      const cur = journal.rating(r.id) || 0;
      $('[data-j="rating"]', body).innerHTML = `
        <span class="stars" role="radiogroup" aria-label="Your rating">
          ${[1, 2, 3, 4, 5].map((n) => `<button class="star${n <= cur ? ' on' : ''}" data-star="${n}" role="radio" aria-checked="${n === cur}" aria-label="${n} star${n > 1 ? 's' : ''}" title="${n === cur ? 'Tap again to clear' : RATING_LABELS[n]}">★</button>`).join('')}
        </span>
        <span class="rating-label">${cur ? esc(RATING_LABELS[cur]) : 'Not rated yet'}</span>`;
      const notes = journal.notes(r.id);
      $('[data-j="list"]', body).innerHTML = notes.length
        ? notes.map((n) => `
          <li class="cook-note">
            <div class="cook-note-body">
              <div class="note-date">📅 ${esc(fmtDate(n.date))}</div>
              <div class="note-text">${esc(n.text)}</div>
            </div>
            <button class="btn small" data-del="${esc(n.id)}" aria-label="Delete note"><span>🗑️</span></button>
          </li>`).join('')
        : '<li class="cook-note empty">No notes yet. Cooked it? Jot down what you\'d change next time.</li>';
      $('[data-j="sync"]', body).innerHTML = syncLine();
    };

    body.addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        const n = parseInt(star.dataset.star, 10);
        journal.setRating(r.id, n === journal.rating(r.id) ? null : n);
        return;
      }
      if (e.target.closest('[data-j="add"]')) {
        const ta = $('[data-j="text"]', body);
        if (!ta.value.trim()) { ta.focus(); return; }
        journal.addNote(r.id, $('[data-j="date"]', body).value || todayISO(), ta.value);
        draft = '';
        ta.value = '';
        toast('📝 Note saved');
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) {
        showDialog({
          title: 'Delete note', icon: '🗑️',
          html: '<p>Delete this note? This can\'t be undone.</p>',
          buttons: [
            { label: 'Delete', primary: true, onClick: () => journal.deleteNote(r.id, del.dataset.del) },
            { label: 'Cancel' },
          ],
        });
        return;
      }
      if (e.target.closest('[data-act="sync-setup"]')) openSync();
    });
    body.addEventListener('input', (e) => {
      if (e.target.matches('[data-j="text"]')) draft = e.target.value;
      if (e.target.matches('[data-j="date"]')) draftDate = e.target.value;
    });

    const draw = () => {
      const factor = servings / P.BASE_SERVINGS;
      body.innerHTML = `
        <div class="recipe-meta">
          <span class="cat-chip" style="${catVars(cat)}"><span>${cat.emoji}</span><span>${esc(cat.label)}</span></span>
          ${dayId ? `<span>· ${esc(DAYS.find((d) => d.id === dayId).name)}</span>` : ''}
        </div>
        <h2>${esc(r.title)}</h2>
        <div class="stars-row" data-j="rating"></div>
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
        ${servings !== P.BASE_SERVINGS ? `<p class="scaled-note">Ingredients are scaled for ${servings}. Directions are written for ${P.BASE_SERVINGS}, so any amounts mentioned there are for the original recipe; cooking times may need a little extra for larger batches.</p>` : ''}
        ${r.sources && r.sources.length ? `<details class="sources"><summary>Source notes</summary>${r.sources.map((src) => `<p>${mdLinks(src)}</p>`).join('')}</details>` : ''}
        <h3>Cook's notes</h3>
        <div class="note-form">
          <textarea class="win-input" data-j="text" rows="2" placeholder="e.g. Needs a little more cumin" aria-label="New note">${esc(draft)}</textarea>
          <div class="note-form-row">
            <label class="note-date-label">Cooked on <input type="date" class="win-input" data-j="date" value="${esc(draftDate)}"></label>
            <button class="btn" data-j="add"><span>📝 Add note</span></button>
          </div>
        </div>
        <ul class="notes-list" data-j="list"></ul>
        <p class="sync-line" data-j="sync"></p>`;
      drawJournal();
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
    journalListeners.add(drawJournal);
    win._onClose = () => journalListeners.delete(drawJournal);
    journal.scheduleSync(0);
  }

  /* ============ recipe book ============ */

  function openBook() {
    let current = categories[0] && categories[0].name;
    const body = document.createElement('div');
    body.className = 'book';
    const draw = () => {
      const list = inCategory(current);
      body.innerHTML = `
        <div class="book-cats sunken">${categories.map((c) => `
          <button data-cat="${esc(c.name)}" class="${c.name === current ? 'on' : ''}"><span>${c.emoji}</span>${esc(c.label)}</button>`).join('')}
        </div>
        <div class="book-list sunken">${list.map((r) => `
          <button data-id="${esc(r.id)}"><span>📄</span><span>${esc(r.title)}</span>${bookTags(r.id)}</button>`).join('')}
        </div>`;
    };
    body.addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      const r = e.target.closest('[data-id]');
      if (c) { current = c.dataset.cat; draw(); $('.book-list', body).scrollTop = 0; }
      if (r) openRecipe(r.dataset.id, null);
    });
    draw();
    const redraw = () => { const top = $('.book-list', body).scrollTop; draw(); $('.book-list', body).scrollTop = top; };
    journalListeners.add(redraw);
    let win;
    win = openWindow({ title: 'Recipe Book', body, foot: [button('Close', () => closeWindow(win), { primary: true })] });
    win._onClose = () => journalListeners.delete(redraw);
  }

  function bookTags(id) {
    const n = journal.rating(id), c = journal.notes(id).length;
    if (!n && !c) return '';
    return `<span class="tags">${n ? `<span class="book-stars">${starText(n)}</span>` : ''}${c ? ` 📝${c}` : ''}</span>`;
  }

  // escape, then turn [text](https://…) into links
  function mdLinks(text) {
    return esc(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* ============ dates ============ */

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return iso || '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  function ago(iso) {
    if (!iso) return 'never';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return fmtDate(iso.slice(0, 10));
  }

  /* ============ sync ============ */

  const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Cooked%20Goose%20sync';

  function syncLine() {
    const st = journal.status;
    if (!journal.connected) return '💾 Notes and ratings are saved on this device only. <button class="linkish" data-act="sync-setup">Set up sync</button> to see them everywhere.';
    if (st.state === 'error') return `⚠️ Sync problem: ${esc(st.message)} <button class="linkish" data-act="sync-setup">Sync settings</button>`;
    if (st.state === 'syncing') return '⏳ Syncing…';
    return '☁️ Synced across your devices.';
  }

  function renderSyncStatus() {
    const el = $('#sync-ind');
    if (!el) return;
    const st = journal.status;
    const map = { off: ['💾', 'Notes saved on this device only — tap to set up sync'], idle: ['☁️', 'Sync on'], syncing: ['⏳', 'Syncing…'], ok: ['☁️', 'Synced ' + ago(journal.lastSync)], error: ['⚠️', 'Sync problem: ' + st.message] };
    const [ico, label] = map[st.state] || map.off;
    el.textContent = ico;
    el.title = label;
    el.setAttribute('aria-label', label);
    el.classList.toggle('warn-ind', st.state === 'error');
  }

  function openSync() {
    const body = document.createElement('div');
    let win;
    let connectError = '';
    const draw = () => {
      const st = journal.status;
      if (!journal.connected) {
        body.innerHTML = `
          <div class="dialog-row"><div class="dialog-ico">☁️</div><div>
            <p><b>Share notes and ratings between your devices.</b></p>
            <p>Cooked Goose keeps them in a <b>secret GitHub Gist</b> on your GitHub account (a private-by-link file, separate from the public app). You need a GitHub token once per device — or use a setup link from a device that's already connected.</p>
            <ol class="steps">
              <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Create a token on GitHub ↗</a><br><span class="small">"gist" is already ticked. Set <b>Expiration</b> to "No expiration" (or a long date), then tap <b>Generate token</b> and copy it.</span></li>
              <li>Paste it here:
                <input type="password" class="win-input token-input" data-s="token" placeholder="ghp_…" autocomplete="off" autocapitalize="off" spellcheck="false">
              </li>
            </ol>
            ${connectError ? `<p class="warn">${esc(connectError)}</p>` : ''}
          </div></div>`;
        setFoot([button('Cancel', () => closeWindow(win)), button('Connect', connectNow, { primary: true })]);
      } else {
        body.innerHTML = `
          <div class="dialog-row"><div class="dialog-ico">${st.state === 'error' ? '⚠️' : '☁️'}</div><div>
            <p><b>${st.state === 'error' ? 'Sync problem' : st.state === 'syncing' ? 'Syncing…' : 'Sync is on'}</b></p>
            ${st.state === 'error' ? `<p class="warn">${esc(st.message)}</p>` : `<p>Last synced: ${esc(ago(journal.lastSync))}</p>`}
            <p><b>Add another device:</b> copy the setup link, send it to yourself (AirDrop, Notes…), and open it on the other device in the browser you use for Cooked Goose.</p>
            <p class="small">The link contains your token, so treat it like a password and don't share it with anyone else.</p>
          </div></div>`;
        setFoot([
          button('Disconnect', () => {
            showDialog({
              title: 'Disconnect sync', icon: '❓',
              html: '<p>Stop syncing on this device?</p><p>Notes stay on this device and in your gist; nothing is deleted.</p>',
              buttons: [{ label: 'Disconnect', primary: true, onClick: () => { journal.disconnect(); draw(); } }, { label: 'Cancel' }],
            });
          }),
          button('🔗 Copy setup link', async () => {
            const link = `${location.origin}${location.pathname}#sync=${encodeURIComponent(journal.token)}`;
            toast(await copyText(link) ? '🔗 Setup link copied' : 'Couldn\'t copy the link');
          }),
          button('🔄 Sync now', () => journal.syncNow()),
          button('Close', () => closeWindow(win), { primary: true }),
        ]);
      }
    };
    function setFoot(btns) { const f = $('.modal-foot', win); f.innerHTML = ''; f.append(...btns); }
    async function connectNow() {
      const input = $('[data-s="token"]', body);
      const token = input && input.value.trim();
      if (!token) { input && input.focus(); return; }
      connectError = '';
      await journal.connect(token);
      if (journal.status.state === 'ok') {
        toast('☁️ Sync connected!');
      } else {
        connectError = journal.status.message || 'Couldn\'t connect.';
        journal.disconnect();
      }
      draw();
    }
    win = openWindow({ title: 'Sync Settings', body, foot: [], cls: 'narrow' });
    journalListeners.add(draw);
    win._onClose = () => journalListeners.delete(draw);
    draw();
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
      const ok = await copyText(listText);
      if (ok) toast('📋 Shopping list copied to clipboard!');
      else showDialog({ title: 'Clipboard', icon: '⚠️', html: '<p>Couldn\'t reach the clipboard. Select the list and copy it manually.</p>', buttons: [{ label: 'OK', primary: true }] });
    }

    win = openWindow({ title: 'Shopping List Wizard', body, foot: [] });
    step1();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
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
      case 'sync': openSync(); break;
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
    renderSyncStatus();
    const pair = /^#sync=(.+)$/.exec(location.hash);
    if (pair) {
      history.replaceState(null, '', location.pathname + location.search);
      journal.connect(decodeURIComponent(pair[1])).then(() => {
        toast(journal.status.state === 'ok' ? '☁️ Sync connected on this device!' : '⚠️ Sync setup failed — see Start → Sync');
      });
    } else {
      journal.syncNow();
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) journal.scheduleSync(0); });

    await new Promise((res) => setTimeout(res, 300));
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 600);
  }

  boot();
})();
