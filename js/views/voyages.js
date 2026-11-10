import { DB, indexRange } from '../data.js';
import { esc, fmt, dur, pct, kpi, dateFr, link, store } from '../ui.js';
import { section } from './common.js';
import { loc, LANG, LOCALE } from '../i18n.js';

let world = null;
async function loadWorld() {
  if (!world) world = await (await fetch('data/world.json')).json();
  return world;
}
const flag = code => /^[A-Z]{2}$/.test(code) && code !== 'ZZ' ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌐';

export function render(root, ctx) {
  root.innerHTML = `<div class="page"><div class="loading">${loc`Chargement de la carte…`}</div></div>`;
  let alive = true;
  loadWorld().then(w => { if (alive) draw(root, ctx, w); }).catch(err => {
    root.innerHTML = `<div class="page"><div class="error"><h2>${loc`Carte indisponible`}</h2><p>${esc(err.message)}</p></div></div>`;
  });
  return () => { alive = false; };
}

function countryName(w, code) {
  if (code === 'ZZ') return loc`Pays inconnu`;
  if (LANG !== 'fr') { try { return REGION.of(code) || w.names[code] || code; } catch { /* code inconnu */ } }
  return w.names[code] || code;
}
const REGION = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([LOCALE], { type: 'region' }) : { of: () => null };

function draw(root, ctx, w) {
  const { range } = ctx;
  const nC = DB.countries.length;
  const sec = new Float64Array(nC), plays = new Int32Array(nC);
  const artistBy = Array.from({ length: nC }, () => new Map()), trackBy = Array.from({ length: nC }, () => new Map());
  const daysBy = Array.from({ length: nC }, () => new Set());
  const dayCountry = new Map(); // jour -> Map(pays -> secondes)
  const [lo, hi] = indexRange(range);
  for (let i = lo; i < hi; i++) {
    const c = DB.C[i], s = DB.S[i], k = DB.K[i], a = DB.trackArtist[k], d = Math.floor(DB.T[i] / 1440);
    sec[c] += s; plays[c]++;
    artistBy[c].set(a, (artistBy[c].get(a) || 0) + s);
    trackBy[c].set(k, (trackBy[c].get(k) || 0) + s);
    daysBy[c].add(d);
    let m = dayCountry.get(d); if (!m) dayCountry.set(d, m = new Map());
    m.set(c, (m.get(c) || 0) + s);
  }
  // Pays « maison » : celui où tu as le plus écouté sur tout l'historique.
  const gC = DB.global.country;
  const home = gC.indexOf(Math.max(...gC));
  const top = map => { let b = -1, bv = 0; for (const [k, v] of map) if (v > bv) { bv = v; b = k; } return b; };
  const list = [...Array(nC).keys()].filter(c => sec[c] > 0).sort((a, b) => sec[b] - sec[a]);
  const total = list.reduce((x, c) => x + sec[c], 0) || 1;
  const abroad = list.filter(c => c !== home && DB.countries[c] !== 'ZZ');

  // Voyages : jours consécutifs (un jour de trou toléré) dominés par un pays étranger.
  const days = [...dayCountry.keys()].sort((a, b) => a - b);
  const trips = [];
  let cur = null;
  for (const d of days) {
    const c = top(dayCountry.get(d));
    const foreign = c !== home && DB.countries[c] !== 'ZZ';
    if (!foreign) { if (cur) { trips.push(cur); cur = null; } continue; }
    if (cur && d - cur.to <= 2) { cur.to = d; cur.days.push(d); }
    else { if (cur) trips.push(cur); cur = { from: d, to: d, days: [d] }; }
  }
  if (cur) trips.push(cur);
  const tripInfo = trips.map(t => {
    const cs = new Map(), as = new Map(), ts = new Map();
    let s = 0;
    const [a, b] = indexRange({ from: t.from, to: t.to });
    for (let i = a; i < b; i++) {
      const c = DB.C[i];
      if (c === home || DB.countries[c] === 'ZZ') continue;
      const k = DB.K[i], v = DB.S[i];
      s += v; cs.set(c, (cs.get(c) || 0) + v);
      as.set(DB.trackArtist[k], (as.get(DB.trackArtist[k]) || 0) + v);
      ts.set(k, (ts.get(k) || 0) + v);
    }
    // On ne garde que les pays qui pèsent vraiment dans le voyage (au moins 10 % du temps).
    return { ...t, sec: s, countries: [...cs].sort((x, y) => y[1] - x[1]).filter(([, v], i) => i === 0 || v >= 0.1 * s).map(x => x[0]), artist: top(as), track: top(ts) };
  }).filter(t => t.sec >= 600).reverse();

  const view = store.get('map-view', 'europe');
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>${loc`Tes voyages en musique`}</h1>
      <p class="lede">${loc`Spotify note le pays de connexion de chaque écoute. Ça dessine la carte de tes déplacements et ce que tu écoutais à chaque fois.`}</p></header>
    <div class="kpis">
      ${kpi(fmt(list.filter(c => DB.countries[c] !== 'ZZ').length), loc`Pays`)}
      ${kpi(dur(abroad.reduce((x, c) => x + sec[c], 0)), `${loc`Écoutés hors`} ` + esc(countryName(w, DB.countries[home])))}
      ${kpi(pct(abroad.reduce((x, c) => x + sec[c], 0) / total, 1), loc`De ton écoute à l'étranger`)}
      ${kpi(fmt(tripInfo.length), loc`Voyages repérés`)}
    </div>
    ${section(loc`La carte`, `<div class="seg map-seg" role="group" aria-label="${loc`Zone`}"><button type="button" data-v="europe" class="${view === 'europe' ? 'on' : ''}">${loc`Europe`}</button><button type="button" data-v="world" class="${view === 'world' ? 'on' : ''}">${loc`Monde`}</button></div>
      <div class="map" id="map"></div>
      <div class="map-scale"><span>${loc`Moins`}</span><i></i><span>${loc`Plus d'écoute`}</span><span class="home-key">${loc`<b></b>${esc(countryName(w, DB.countries[home]))} (chez toi)`}</span></div>`, { eyebrow: loc`Temps d'écoute par pays` })}
    <div class="cols2 cols-wide">
      ${section(loc`Pays par pays`, `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${loc`Pays`}</th><th class="n">${loc`Temps`}</th><th class="n">${loc`Jours`}</th><th>${loc`Artiste n°1`}</th><th>${loc`Titre n°1`}</th></tr></thead><tbody>
        ${list.map(c => `<tr><td><span class="ctry">${flag(DB.countries[c])} ${esc(countryName(w, DB.countries[c]))}</span></td><td class="n num">${dur(sec[c])}</td><td class="n num">${fmt(daysBy[c].size)}</td><td>${link('artist', top(artistBy[c]))}</td><td>${link('track', top(trackBy[c]))}</td></tr>`).join('')}
      </tbody></table></div>`, { eyebrow: loc`${list.length} pays` })}
      ${section(loc`Tes voyages`, tripInfo.length ? `<ol class="trips">${tripInfo.map(t => `<li>
          <div class="trip-h"><span class="trip-f">${t.countries.map(c => flag(DB.countries[c])).join(' ')}</span><b>${t.countries.map(c => esc(countryName(w, DB.countries[c]))).join(', ')}</b></div>
          <div class="trip-d">${loc`${t.from === t.to ? dateFr(t.from) : `${dateFr(t.from, true)} → ${dateFr(t.to, true)}`} · ${fmt(t.to - t.from + 1)} jour${t.to > t.from ? 's' : ''} · ${dur(t.sec)}`}</div>
          <div class="trip-m">${loc`En boucle : ${link('track', t.track)} · ${link('artist', t.artist)}`}</div></li>`).join('')}</ol>` : `<p class="empty">${loc`Aucun voyage sur cette période.`}</p>`, { eyebrow: loc`Du plus récent au plus ancien` })}
    </div>
  </div>`;

  const mapEl = root.querySelector('#map');
  const paint = v => {
    const m = w[v];
    const max = Math.max(1, ...abroad.map(c => sec[c]));
    const byCode = new Map(list.map(c => [DB.countries[c], c]));
    const fill = code => {
      const c = byCode.get(code);
      if (c === undefined) return 'var(--map-land)';
      if (c === home) return 'var(--butter)';
      const t = Math.log1p(sec[c]) / Math.log1p(max);
      return `color-mix(in srgb, var(--coral) ${Math.round(25 + 75 * t)}%, var(--map-land))`;
    };
    const tipOf = code => {
      const c = byCode.get(code);
      const name = esc(countryName(w, code));
      if (c === undefined) return name;
      return loc`${flag(code)} ${name}<br><b>${dur(sec[c])}</b> · ${fmt(daysBy[c].size)} jours<br>${esc(DB.artists[top(artistBy[c])])}`;
    };
    let s = `<svg viewBox="0 0 ${m.w} ${m.h}" class="map-svg" role="img" aria-label="${loc`Carte des pays d'écoute`}">`;
    for (const [code, d] of Object.entries(m.paths)) s += `<path d="${d}" fill="${fill(code)}" data-tip="${tipOf(code)}"/>`;
    if (m.dots) for (const [code, [x, y]] of Object.entries(m.dots)) if (byCode.has(code)) s += `<circle cx="${x}" cy="${y}" r="4" fill="${fill(code)}" stroke="var(--ink)" data-tip="${tipOf(code)}"/>`;
    mapEl.innerHTML = s + '</svg>';
  };
  paint(view);
  root.querySelector('.map-seg').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    store.set('map-view', b.dataset.v);
    root.querySelectorAll('.map-seg button').forEach(x => x.classList.toggle('on', x === b));
    paint(b.dataset.v);
  });
}
