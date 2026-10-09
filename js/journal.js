/*
 * Cooked Goose — recipe journal (cook's notes + star ratings).
 *
 * Saved locally first (localStorage), then optionally synced to a secret
 * GitHub Gist so every device sees the same notes. Merging is conflict-free:
 * notes are unioned by id (deletes are kept as tombstones) and a rating is
 * last-write-wins by timestamp.
 *
 * The pure merge helpers also load in Node for tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CGJournal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILE = 'cooked-goose-journal.json';
  const API = 'https://api.github.com';

  /* ============ pure data helpers ============ */

  function empty() { return { version: 1, recipes: {} }; }

  function normalize(j) {
    const out = empty();
    const recipes = (j && j.recipes) || {};
    for (const id of Object.keys(recipes).sort()) {
      const r = recipes[id] || {};
      const entry = {};
      if (r.ratedAt) {
        entry.rating = Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 ? r.rating : null;
        entry.ratedAt = String(r.ratedAt);
      }
      const notes = Array.isArray(r.notes) ? r.notes.filter((n) => n && n.id) : [];
      if (notes.length) {
        entry.notes = notes.map((n) => (n.deleted
          ? { id: String(n.id), deleted: true, createdAt: String(n.createdAt || '') }
          : { id: String(n.id), date: String(n.date || ''), text: String(n.text || ''), createdAt: String(n.createdAt || '') }))
          .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
      }
      if (entry.ratedAt || entry.notes) out.recipes[id] = entry;
    }
    return out;
  }

  function merge(a, b) {
    a = normalize(a); b = normalize(b);
    const out = { version: 1, recipes: {} };
    const ids = new Set([...Object.keys(a.recipes), ...Object.keys(b.recipes)]);
    for (const id of ids) {
      const ra = a.recipes[id] || {}, rb = b.recipes[id] || {};
      const entry = {};
      const winner = (rb.ratedAt || '') > (ra.ratedAt || '') ? rb : ra;
      if (winner.ratedAt) { entry.rating = winner.rating; entry.ratedAt = winner.ratedAt; }
      const notes = new Map();
      for (const n of [...(ra.notes || []), ...(rb.notes || [])]) {
        const prev = notes.get(n.id);
        if (!prev || n.deleted) notes.set(n.id, prev && prev.deleted ? prev : n);
      }
      if (notes.size) entry.notes = [...notes.values()];
      out.recipes[id] = entry;
    }
    return normalize(out);
  }

  const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ============ store + sync (browser) ============ */

  function createStore({ storage, fetchImpl, onChange = () => {}, onStatus = () => {} }) {
    const KEY = 'cookedGoose.journal.v1';
    const SYNC_KEY = 'cookedGoose.sync.v1';

    const read = (k) => { try { return JSON.parse(storage.getItem(k)); } catch (e) { return null; } };
    const write = (k, v) => { try { storage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

    let data = normalize(read(KEY) || empty());
    let sync = Object.assign({ token: '', gistId: '', lastSync: '' }, read(SYNC_KEY) || {});
    let status = { state: sync.token ? 'idle' : 'off', message: '' };
    let running = false, again = false, timer = 0;

    function setStatus(state, message = '') {
      status = { state, message };
      onStatus(status);
    }
    function saveLocal() { write(KEY, data); }
    function saveSync() { write(SYNC_KEY, sync); }

    /* --- reading --- */
    function entry(id) { return data.recipes[id] || {}; }
    function rating(id) { return entry(id).rating || null; }
    function notes(id) {
      return (entry(id).notes || []).filter((n) => !n.deleted)
        .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
    }

    /* --- writing --- */
    function mutate(id, fn) {
      const e = data.recipes[id] = data.recipes[id] || {};
      fn(e);
      data = normalize(data);
      saveLocal();
      onChange();
      scheduleSync();
    }
    function setRating(id, value) {
      mutate(id, (e) => { e.rating = value || null; e.ratedAt = new Date().toISOString(); });
    }
    function addNote(id, date, text) {
      const t = String(text || '').trim();
      if (!t) return;
      mutate(id, (e) => { (e.notes = e.notes || []).push({ id: uid(), date, text: t, createdAt: new Date().toISOString() }); });
    }
    function deleteNote(id, noteId) {
      mutate(id, (e) => {
        e.notes = (e.notes || []).map((n) => (n.id === noteId ? { id: n.id, deleted: true, createdAt: n.createdAt } : n));
      });
    }

    /* --- GitHub Gist sync --- */
    async function api(path, opts = {}) {
      const res = await fetchImpl(API + path, Object.assign({}, opts, {
        cache: 'no-store',
        headers: Object.assign({
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + sync.token,
        }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      }));
      if (!res.ok) {
        const err = new Error(
          res.status === 401 ? 'GitHub rejected the token. It may have expired — create a new one.'
            : res.status === 403 || res.status === 404 ? 'The token can\'t reach gists. Make sure the "gist" box was ticked.'
              : `GitHub error ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    }

    async function findOrCreateGist() {
      for (let page = 1; page <= 10; page++) {
        const list = await api(`/gists?per_page=100&page=${page}`);
        const hit = list.find((g) => g.files && g.files[FILE]);
        if (hit) return hit.id;
        if (list.length < 100) break;
      }
      const created = await api('/gists', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Cooked Goose journal — cook\'s notes and ratings',
          public: false,
          files: { [FILE]: { content: JSON.stringify(data, null, 1) } },
        }),
      });
      return created.id;
    }

    async function readGist() {
      const g = await api('/gists/' + sync.gistId);
      const f = g.files && g.files[FILE];
      if (!f) return empty();
      let text = f.content;
      if (f.truncated && f.raw_url) text = await (await fetchImpl(f.raw_url, { cache: 'no-store' })).text();
      try { return JSON.parse(text); } catch (e) { return empty(); }
    }

    async function writeGist(j) {
      await api('/gists/' + sync.gistId, {
        method: 'PATCH',
        body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(j, null, 1) } } }),
      });
    }

    async function syncNow() {
      if (!sync.token) { setStatus('off'); return; }
      if (running) { again = true; return; }
      running = true;
      clearTimeout(timer);
      setStatus('syncing');
      try {
        if (!sync.gistId) { sync.gistId = await findOrCreateGist(); saveSync(); }
        let remote;
        try {
          remote = await readGist();
        } catch (e) {
          if (e.status !== 404) throw e;
          sync.gistId = await findOrCreateGist(); // gist was deleted; start a new one
          saveSync();
          remote = await readGist();
        }
        const merged = merge(data, remote);
        if (!same(merged, data)) { data = merged; saveLocal(); onChange(); }
        if (!same(merged, remote)) await writeGist(merged);
        sync.lastSync = new Date().toISOString();
        saveSync();
        setStatus('ok');
      } catch (e) {
        setStatus('error', e.message || 'Sync failed');
      } finally {
        running = false;
        if (again) { again = false; syncNow(); }
      }
    }

    function scheduleSync(delay = 1200) {
      if (!sync.token) return;
      clearTimeout(timer);
      timer = setTimeout(syncNow, delay);
    }

    function connect(token) {
      sync = { token: String(token || '').trim(), gistId: '', lastSync: '' };
      saveSync();
      return syncNow();
    }
    function disconnect() {
      sync = { token: '', gistId: '', lastSync: '' };
      saveSync();
      setStatus('off');
    }

    return {
      rating, notes, setRating, addNote, deleteNote,
      syncNow, scheduleSync, connect, disconnect,
      get connected() { return !!sync.token; },
      get token() { return sync.token; },
      get lastSync() { return sync.lastSync; },
      get status() { return status; },
    };
  }

  return { FILE, empty, normalize, merge, same, createStore };
});
