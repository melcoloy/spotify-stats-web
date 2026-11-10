import { DB, ingest, computeStats, fullRange, yearRange, years, isoToDay, dayToIso, search, ranking, artistOf } from './data.js';
import { esc, dur, dateFr, fmt, store, KIND_LABEL, href, setEraArtists, thumb } from './ui.js';
import { setupTooltips } from './charts.js';
import { importFiles, buildFromDocs, excludeWindow } from './importer.js';
import { demoDocs } from './demo.js';
import { loadCovers } from './covers.js';
import { loadSaved, save, clearSaved } from './store.js';
import * as overview from './views/overview.js';
import * as rankings from './views/rankings.js';
import * as explore from './views/explore.js';
import * as entity from './views/entity.js';
import * as timeline from './views/timeline.js';
import * as wrapped from './views/wrapped.js';
import * as sessions from './views/sessions.js';
import * as jour from './views/jour.js';
import * as cejour from './views/cejour.js';
import * as calendrier from './views/calendrier.js';
import * as comparer from './views/comparer.js';
import * as obsessions from './views/obsessions.js';
import * as albums from './views/albums.js';
import * as reseau from './views/reseau.js';
import * as voyages from './views/voyages.js';
import * as podcasts from './views/podcasts.js';
import * as radioView from './views/radio.js';
import * as games from './views/games.js';
import * as spotifyView from './views/spotify.js';
import { loc, applyStatic, langSwitch } from './i18n.js';

const view = document.getElementById('view');

// ---------- période ----------
let period = store.get('period', { preset: 'all' });

function resolveRange(p) {
  const last = DB.lastDay;
  const clamp = r => ({ from: Math.max(DB.firstDay, Math.min(r.from, last)), to: Math.max(DB.firstDay, Math.min(r.to, last)) });
  if (p.preset === 'all') return fullRange();
  if (p.preset.startsWith('y')) return yearRange(+p.preset.slice(1));
  if (p.preset === 'last30') return clamp({ from: last - 29, to: last });
  if (p.preset === 'last90') return clamp({ from: last - 89, to: last });
  if (p.preset === 'last365') return clamp({ from: last - 364, to: last });
  if (p.preset === 'custom' && p.from && p.to) {
    const a = isoToDay(p.from), b = isoToDay(p.to);
    return clamp({ from: Math.min(a, b), to: Math.max(a, b) });
  }
  return fullRange();
}

export function periodLabel(range) {
  if (range.from === DB.firstDay && range.to === DB.lastDay) return loc`Depuis le début`;
  const y0 = dateFr(range.from, true), y1 = dateFr(range.to, true);
  return `${y0} → ${y1}`;
}

function setupPeriod() {
  const sel = document.getElementById('preset');
  const opts = [['all', loc`Tout l'historique`], ['last30', loc`30 derniers jours`], ['last90', loc`3 derniers mois`], ['last365', loc`12 derniers mois`]];
  years().slice().reverse().forEach(y => opts.push(['y' + y, String(y)]));
  opts.push(['custom', loc`Dates personnalisées…`]);
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  const from = document.getElementById('from'), to = document.getElementById('to');
  from.min = to.min = dayToIso(DB.firstDay);
  from.max = to.max = dayToIso(DB.lastDay);
  const sync = () => {
    sel.value = period.preset;
    const r = resolveRange(period);
    document.getElementById('customDates').hidden = period.preset !== 'custom';
    from.value = dayToIso(r.from); to.value = dayToIso(r.to);
  };
  sel.addEventListener('change', () => {
    period = { preset: sel.value };
    if (sel.value === 'custom') { const r = resolveRange({ preset: 'last365' }); period.from = dayToIso(r.from); period.to = dayToIso(r.to); }
    store.set('period', period); sync(); render();
  });
  const onDate = () => {
    if (!from.value || !to.value) return;
    period = { preset: 'custom', from: from.value, to: to.value };
    store.set('period', period); render();
  };
  from.addEventListener('change', onDate); to.addEventListener('change', onDate);
  sync();
}

// Permet aux vues de changer la période (ex. clic sur une année).
export function setPeriod(p) {
  period = p; store.set('period', p);
  document.getElementById('preset').value = p.preset;
  document.getElementById('customDates').hidden = p.preset !== 'custom';
  render();
}

// ---------- cache de statistiques ----------
const cache = new Map();
export function statsFor(range, opts = {}) {
  const key = `${range.from}-${range.to}-${opts.eras ? 1 : 0}`;
  if (!cache.has(key)) {
    if (cache.size > 30) cache.clear();
    cache.set(key, computeStats(range, null, opts));
  }
  return cache.get(key);
}

// ---------- recherche globale ----------
function setupSearch() {
  const q = document.getElementById('q'), box = document.getElementById('searchRes');
  let items = [], active = -1;
  const draw = () => {
    if (!items.length) { box.innerHTML = q.value.trim() ? `<div class="sr-empty">${loc`Aucun résultat`}</div>` : ''; box.hidden = !q.value.trim(); return; }
    box.innerHTML = items.map((r, i) => {
      const sub = r.kind === 'artist' ? '' : ` · ${esc(DB.artists[artistOf(r.kind, r.id)])}`;
      const name = r.kind === 'artist' ? DB.artists[r.id] : r.kind === 'album' ? DB.albums[r.id] : DB.tracks[r.id];
      return `<a href="${href(r.kind, r.id)}" class="${i === active ? 'on' : ''}" data-i="${i}">${thumb(r.kind, r.id, 'sm')}<span class="sr-kind">${KIND_LABEL[r.kind]}</span><span class="sr-name">${esc(name)}<small>${sub}</small></span><span class="sr-v">${dur(r.sec)}</span></a>`;
    }).join('') + `<a href="#/explorer?q=${encodeURIComponent(q.value.trim())}" class="sr-all">${loc`Voir tous les résultats`}</a>`;
    box.hidden = false;
  };
  q.addEventListener('input', () => { items = search(q.value, 8); active = -1; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(-1, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (active >= 0) location.hash = href(items[active].kind, items[active].id);
      else if (q.value.trim()) location.hash = `#/explorer?q=${encodeURIComponent(q.value.trim())}`;
      close();
    } else if (e.key === 'Escape') close();
  });
  const close = () => { box.hidden = true; q.value = ''; items = []; q.blur(); };
  box.addEventListener('click', () => { box.hidden = true; q.value = ''; items = []; });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });
}

// ---------- routeur ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { parts, params };
}

const ROUTES = {
  '': ['overview', overview, true],
  classements: ['rankings', rankings, true],
  explorer: ['explore', explore, false],
  artiste: ['explore', entity, true],
  album: ['explore', entity, true],
  titre: ['explore', entity, true],
  chronologie: ['timeline', timeline, false],
  calendrier: ['calendrier', calendrier, false],
  jour: ['calendrier', jour, false],
  'ce-jour-la': ['cejour', cejour, false],
  sessions: ['sessions', sessions, true],
  wrapped: ['wrapped', wrapped, false],
  comparer: ['comparer', comparer, false],
  obsessions: ['obsessions', obsessions, true],
  albums: ['albums', albums, true],
  reseau: ['reseau', reseau, true],
  voyages: ['voyages', voyages, true],
  podcasts: ['podcasts', podcasts, true],
  radio: ['radio', radioView, false],
  jeux: ['games', games, false],
  spotify: ['spotify', spotifyView, false],
};

let cleanup = null;
export function render() {
  const { parts, params } = parseHash();
  const route = ROUTES[parts[0] || ''] || ROUTES[''];
  const [navKey, mod, usesPeriod] = route;
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === navKey));
  document.getElementById('periodBar').classList.toggle('off', !usesPeriod);
  if (cleanup) { try { cleanup(); } catch { /* rien */ } cleanup = null; }
  const range = resolveRange(period);
  const ctx = { parts, params, range, period, statsFor, setPeriod, rerender: render, periodLabel: periodLabel(range) };
  view.innerHTML = '';
  view.className = 'view-' + navKey;
  try {
    cleanup = mod.render(view, ctx) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="error"><h2>${loc`Cette page n'a pas pu s'afficher`}</h2><p>${esc(err.message)}</p></div>`;
  }
}

let lastHash = '';
window.addEventListener('hashchange', () => {
  const base = location.hash.split('?')[0];
  if (base !== lastHash) window.scrollTo(0, 0);
  lastHash = base;
  render();
});

// ---------- démarrage ----------
let CURRENT = null;
function boot(j) {
  CURRENT = j;
  ingest(j);
  // Couleurs des ères : les artistes qui ont dominé le plus de mois.
  const st = statsFor(fullRange(), { eras: true });
  const count = new Map();
  for (const [, mm] of st.monthArtist) {
    let best = -1, bs = 0;
    for (const [a, v] of mm) if (v > bs) { bs = v; best = a; }
    count.set(best, (count.get(best) || 0) + 1);
  }
  const eraIds = [...count].sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const topIds = ranking(st, 'artist', 'sec', 8).map(e => e.id);
  setEraArtists([...new Set([...eraIds.slice(0, 6), ...topIds])].slice(0, 8));

  document.getElementById('sideFoot').textContent = `${dateFr(DB.firstDay, true)} → ${dateFr(DB.lastDay, true)}`;
  document.body.classList.remove('importing');
  document.getElementById('importScreen').hidden = true;
  setupTooltips();
  setupPeriod();
  setupSearch();
  setupReset();
  if (j.meta.demo) {
    const pill = document.createElement('div');
    pill.className = 'demo-pill';
    pill.innerHTML = `${loc`Données d'exemple d'un auditeur fictif`} <button type="button" class="btn small">${loc`Importer les miennes`}</button>`;
    pill.querySelector('button').addEventListener('click', () => {
      const u = new URL(location.href); u.searchParams.delete('demo'); u.hash = '';
      if (u.search === location.search) { location.hash = ''; location.reload(); } else location.href = u.toString();
    });
    document.getElementById('topbar').appendChild(pill);
    document.getElementById('resetData').hidden = true;
  }
  lastHash = location.hash.split('?')[0];
  render();
  // Pochettes en tâche de fond ; on redessine la page une fois reçues.
  loadCovers(() => {
    // On ne redessine que les pages sans état en cours (pas un jeu, la radio ou une story).
    const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const safe = ['', 'classements', 'explorer', 'artiste', 'album', 'titre', 'chronologie', 'albums', 'obsessions', 'ce-jour-la', 'jour', 'sessions'];
    if (safe.includes(page) && !['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) render();
  }).catch(() => { /* pas de pochettes */ });
}

// Bandeau « écoutes suspectes » : retire la plage choisie, enregistre et recharge.
window.addEventListener('exclude-window', async e => {
  const w = CURRENT?.meta.anomalies?.[e.detail];
  if (!w) return;
  const next = excludeWindow(CURRENT, w);
  if (!next.meta.demo) await save(next);
  cache.clear();
  location.reload();
});

// Bouton « Changer de données » : efface la copie locale et revient à l'écran d'import.
function setupReset() {
  const b = document.getElementById('resetData');
  let armed = false, timer = 0;
  b.addEventListener('click', async () => {
    if (!armed) {
      armed = true; b.textContent = loc`Cliquer encore pour confirmer`;
      timer = setTimeout(() => { armed = false; b.textContent = loc`Changer de données`; }, 4000);
      return;
    }
    clearTimeout(timer);
    await clearSaved();
    location.hash = '';
    location.reload();
  });
}

function showImport() {
  document.body.classList.add('importing');
  const box = document.getElementById('importScreen');
  box.hidden = false;
  const input = box.querySelector('#files'), drop = box.querySelector('.drop'), status = box.querySelector('#importStatus');
  const handle = async files => {
    if (!files || !files.length) return;
    drop.classList.add('busy');
    status.className = 'imp-status';
    try {
      const j = await importFiles(files, msg => { status.textContent = msg; });
      status.textContent = loc`${fmt(j.meta.count)} écoutes trouvées. Calcul des statistiques…`;
      await new Promise(r => setTimeout(r, 30));
      const kept = box.querySelector('#remember').checked ? await save(j) : false;
      boot(j);
      if (box.querySelector('#remember').checked && !kept) console.warn(loc`Impossible de garder les données dans ce navigateur.`);
    } catch (err) {
      console.error(err);
      status.className = 'imp-status err';
      status.textContent = loc`Import impossible : ${err.message}`;
    } finally {
      drop.classList.remove('busy');
    }
  };
  input.addEventListener('change', () => handle(input.files));
  box.querySelector('#demoBtn').addEventListener('click', () => {
    status.className = 'imp-status';
    status.textContent = loc`Génération des données d'exemple…`;
    setTimeout(() => {
      const j = buildFromDocs(demoDocs());
      j.meta.demo = true;
      boot(j);
    }, 20);
  });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handle(e.dataTransfer.files));
}

async function start() {
  applyStatic();
  for (const id of ['impLang', 'sideLang']) { const el = document.getElementById(id); if (el) el.innerHTML = langSwitch(); }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* le site marche sans */ });
  }
  // Lien direct vers la démo : ?demo (pratique pour le README).
  if (new URLSearchParams(location.search).has('demo')) {
    const j = buildFromDocs(demoDocs());
    j.meta.demo = true;
    boot(j);
    return;
  }
  const saved = await loadSaved();
  if (saved) {
    try { boot(saved); return; } catch (err) { console.error(err); await clearSaved(); }
  }
  showImport();
}
start();
