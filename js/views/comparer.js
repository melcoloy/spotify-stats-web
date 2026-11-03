import { DB, computeStats, ranking, discoveries, years, yearRange, fullRange, isoToDay, dayToIso, byArtist, previousRange } from '../data.js';
import { esc, fmt, dur, pct, dateFr, link, entityCell, monthLabel, href } from '../ui.js';
import { section } from './common.js';

const CA = 'var(--coral)', CB = 'var(--e-sky)';

export function render(root, ctx) {
  const p = ctx.params;
  const mode = p.mode === 'artistes' ? 'artistes' : 'periodes';
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">Comparer</div><h1>Face à face</h1>
      <p class="lede">Mets deux périodes ou deux artistes côte à côte.</p></header>
    <div class="toolbar"><div class="seg" role="group" aria-label="Que comparer"><a href="#/comparer?mode=periodes" class="${mode === 'periodes' ? 'on' : ''}">Deux périodes</a><a href="#/comparer?mode=artistes" class="${mode === 'artistes' ? 'on' : ''}">Deux artistes</a></div></div>
    <div id="cmp"></div>
  </div>`;
  const out = root.querySelector('#cmp');
  if (mode === 'periodes') periods(out, p);
  else artists(out, p);
}

// ---------- deux périodes ----------
function periodOptions() {
  const ys = years();
  return [['last30', '30 derniers jours'], ['prev30', '30 jours d\'avant'], ['last365', '12 derniers mois'], ['prev365', '12 mois d\'avant'], ...ys.slice().reverse().map(y => ['y' + y, String(y)]), ['all', 'Tout l\'historique']];
}
function resolve(code) {
  const last = DB.lastDay;
  if (code === 'all') return fullRange();
  if (code === 'last30') return { from: last - 29, to: last };
  if (code === 'prev30') return previousRange({ from: last - 29, to: last });
  if (code === 'last365') return { from: last - 364, to: last };
  if (code === 'prev365') return previousRange({ from: last - 364, to: last });
  if (/^y\d{4}$/.test(code)) return yearRange(+code.slice(1));
  const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(code || '');
  if (m) return { from: Math.max(DB.firstDay, isoToDay(m[1])), to: Math.min(DB.lastDay, isoToDay(m[2])) };
  return null;
}
function periods(out, p) {
  const ys = years();
  const aCode = p.a || 'y' + ys[ys.length - 2], bCode = p.b || 'y' + ys[ys.length - 1];
  const A = resolve(aCode) || yearRange(ys[ys.length - 2]), B = resolve(bCode) || yearRange(ys[ys.length - 1]);
  const picker = (id, code, r) => {
    const opts = periodOptions();
    const custom = !opts.some(o => o[0] === code);
    return `<div class="cmp-pick" style="--c:${id === 'a' ? CA : CB}"><span class="cmp-tag">${id.toUpperCase()}</span>
      <select id="sel-${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === code ? 'selected' : ''}>${l}</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>Dates personnalisées…</option></select>
      <span class="cmp-dates" ${custom ? '' : 'hidden'}><input type="date" id="from-${id}" value="${dayToIso(r.from)}" min="${dayToIso(DB.firstDay)}" max="${dayToIso(DB.lastDay)}"> → <input type="date" id="to-${id}" value="${dayToIso(r.to)}" min="${dayToIso(DB.firstDay)}" max="${dayToIso(DB.lastDay)}"></span>
      <small>${dateFr(r.from, true)} → ${dateFr(r.to, true)} · ${fmt(r.to - r.from + 1)} jours</small></div>`;
  };
  const sa = computeStats(A), sb = computeStats(B);
  const da = A.to - A.from + 1, db = B.to - B.from + 1;
  const rows = [
    ['Temps d\'écoute', sa.sec, sb.sec, dur],
    ['Temps par jour (moyenne)', sa.sec / da, sb.sec / db, dur],
    ['Streams', sa.streams, sb.streams, fmt],
    ['Titres différents', sa.nTracks, sb.nTracks, fmt],
    ['Artistes différents', sa.nArtists, sb.nArtists, fmt],
    ['Nouveaux artistes', discoveries(sa).length, discoveries(sb).length, fmt],
    ['Jours avec de la musique', sa.activeDays / da, sb.activeDays / db, v => pct(v)],
    ['Passés avec Suivant', sa.skips / (sa.plays || 1), sb.skips / (sb.plays || 1), v => pct(v), true],
    ['Écoutés jusqu\'au bout', sa.completes / (sa.plays || 1), sb.completes / (sb.plays || 1), v => pct(v)],
    ['En aléatoire', sa.shuffle / (sa.plays || 1), sb.shuffle / (sb.plays || 1), v => pct(v)],
    ['Entre minuit et 5 h', sa.night / (sa.sec || 1), sb.night / (sb.sec || 1), v => pct(v)],
  ];
  const ta = ranking(sa, 'artist', 'sec', 25), tb = ranking(sb, 'artist', 'sec', 25);
  const setA = new Set(ta.map(e => e.id)), setB = new Set(tb.map(e => e.id));
  const onlyA = ta.filter(e => !setB.has(e.id)).slice(0, 8), onlyB = tb.filter(e => !setA.has(e.id)).slice(0, 8);
  const both = ta.filter(e => setB.has(e.id));
  // Colonne B : évolution depuis A. Colonne A : où l'artiste se retrouve dans B.
  const list = (items, other, c, isB) => `<ol class="rank cmp-rank">${items.slice(0, 10).map((e, i) => {
    const j = other.findIndex(x => x.id === e.id);
    const mv = isB
      ? (j < 0 ? '<span class="mv new">nouveau</span>' : j === i ? '<span class="mv">=</span>' : `<span class="mv ${j > i ? 'up' : 'down'}">${j > i ? '▲' : '▼'} ${Math.abs(j - i)}</span>`)
      : `<span class="mv">${j < 0 ? 'hors top 25 en B' : `n°${j + 1} en B`}</span>`;
    return `<li><span class="rk num">${i + 1}</span>${entityCell('artist', e.id)}<span class="rv num">${dur(e.sec)}${mv}</span><span class="rb" style="--w:${(e.sec / items[0].sec).toFixed(3)};--bar:${c}"></span></li>`;
  }).join('')}</ol>`;

  out.innerHTML = `<div class="cmp-picks">${picker('a', aCode, A)}${picker('b', bCode, B)}</div>
    <div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th></th><th class="n" style="color:${CA}">A</th><th class="n" style="color:${CB}">B</th><th class="n">Écart</th></tr></thead><tbody>
      ${rows.map(([label, a, b, f, invert]) => {
        const r = a ? b / a - 1 : null;
        const cls = r == null || Math.abs(r) < 0.005 ? 'flat' : (r > 0) !== !!invert ? 'up' : 'down';
        return `<tr><td>${label}</td><td class="n num">${f(a)}</td><td class="n num">${f(b)}</td><td class="n">${r == null ? '—' : `<span class="delta ${cls}">${r > 0 ? '+' : r < 0 ? '−' : ''}${fmt(Math.abs(100 * r))} %</span>`}</td></tr>`;
      }).join('')}
    </tbody></table></div>
    <p class="note">Les moyennes par jour et les pourcentages permettent de comparer des périodes de longueurs différentes.</p>
    <div class="cols2">
      ${section('Top artistes A', list(ta, tb, CA, false), { eyebrow: 'Et leur place en B' })}
      ${section('Top artistes B', list(tb, ta, CB, true), { eyebrow: 'Évolution depuis A' })}
    </div>
    <div class="cols3">
      ${section('Seulement dans A', chips(onlyA), { eyebrow: 'Dans le top 25 de A, absents du top 25 de B' })}
      ${section('Dans les deux', chips(both.slice(0, 12)), { eyebrow: `${both.length} artistes en commun` })}
      ${section('Seulement dans B', chips(onlyB), { eyebrow: 'Dans le top 25 de B, absents du top 25 de A' })}
    </div>
    ${section('À quelle heure', `<div class="chart">${hourLines(sa.heat, sb.heat)}</div><div class="legend"><span><i style="background:${CA}"></i>A</span><span><i style="background:${CB}"></i>B</span></div><p class="note">Part de l'écoute de chaque période qui tombe à chaque heure.</p>`, { eyebrow: 'Profil horaire' })}`;

  const go = (id, code) => {
    const next = { a: aCode, b: bCode, [id]: code };
    location.hash = `#/comparer?mode=periodes&a=${next.a}&b=${next.b}`;
  };
  ['a', 'b'].forEach(id => {
    out.querySelector('#sel-' + id).addEventListener('change', e => {
      if (e.target.value === 'custom') { out.querySelector(`#sel-${id}`).parentElement.querySelector('.cmp-dates').hidden = false; return; }
      go(id, e.target.value);
    });
    const onDate = () => {
      const f = out.querySelector('#from-' + id).value, t = out.querySelector('#to-' + id).value;
      if (f && t) go(id, `${f <= t ? f : t}_${f <= t ? t : f}`);
    };
    out.querySelector('#from-' + id).addEventListener('change', onDate);
    out.querySelector('#to-' + id).addEventListener('change', onDate);
  });
}

function chips(items) {
  if (!items.length) return '<p class="empty">Personne</p>';
  return `<div class="chips">${items.map(e => `<a class="chip" href="${href('artist', e.id)}">${esc(DB.artists[e.id])}</a>`).join('')}</div>`;
}

function hourProfile(heat) {
  const v = [];
  for (let h = 0; h < 24; h++) { let s = 0; for (let d = 0; d < 7; d++) s += heat[d * 24 + h]; v.push(s); }
  const t = v.reduce((a, b) => a + b, 0) || 1;
  return v.map(x => x / t);
}
function hourLines(ha, hb) {
  const a = hourProfile(ha), b = hourProfile(hb);
  return lines([{ v: a, c: CA }, { v: b, c: CB }], Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? h + ' h' : '')), v => pct(v), (i, s) => `${i} h<br>A : <b>${pct(a[i], 1)}</b><br>B : <b>${pct(b[i], 1)}</b>`);
}

// Courbes multiples sur un même axe.
function lines(series, ticks, yf, tipAt) {
  const W = 900, H = 240, L = 50, B = 24, T = 12, R = 10;
  const n = series[0].v.length;
  const max = Math.max(...series.flatMap(s => s.v)) || 1;
  const x = i => L + (W - L - R) * i / Math.max(1, n - 1), y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img">`;
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${yf(v)}</text>`; }
  ticks.forEach((t, i) => { if (t) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(t)}</text>`; });
  for (const se of series) s += `<path d="${se.v.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${se.c}" stroke-width="2.5" stroke-linejoin="round"/>`;
  for (let i = 0; i < n; i++) s += `<rect x="${(x(i) - (W - L - R) / n / 2).toFixed(1)}" y="${T}" width="${((W - L - R) / n).toFixed(1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(tipAt(i))}"/>`;
  return s + '</svg>';
}

// ---------- deux artistes ----------
function artists(out, p) {
  const top = ranking(DB.global, 'artist', 'sec', 600);
  const a = Number.isInteger(+p.a) && p.a !== undefined ? +p.a : top[0].id;
  const b = Number.isInteger(+p.b) && p.b !== undefined ? +p.b : top[1].id;
  const sa = computeStats(fullRange(), byArtist(a)), sb = computeStats(fullRange(), byArtist(b));
  const picker = (id, cur) => `<div class="cmp-pick" style="--c:${id === 'a' ? CA : CB}"><span class="cmp-tag">${id.toUpperCase()}</span>
    <input id="in-${id}" list="art-list" value="${esc(DB.artists[cur])}" autocomplete="off" aria-label="Artiste ${id.toUpperCase()}"></div>`;
  // Mois communs pour les deux courbes cumulées.
  const d0 = new Date(DB.firstDay * 86400000), d1 = new Date(DB.lastDay * 86400000);
  const k0 = d0.getUTCFullYear() * 12 + d0.getUTCMonth(), k1 = d1.getUTCFullYear() * 12 + d1.getUTCMonth();
  const cum = st => { let acc = 0; const v = []; for (let k = k0; k <= k1; k++) { acc += (st.months.get(k) || 0) / 3600; v.push(acc); } return v; };
  const ca = cum(sa), cb = cum(sb);
  const ticks = []; for (let k = k0; k <= k1; k++) ticks.push(k % 12 === 0 ? String(k / 12) : '');
  const rowsK = [
    ['Temps d\'écoute', dur(sa.sec), dur(sb.sec)],
    ['Streams', fmt(sa.streams), fmt(sb.streams)],
    ['Titres écoutés', fmt(sa.nTracks), fmt(sb.nTracks)],
    ['Jours d\'écoute', fmt(sa.activeDays), fmt(sb.activeDays)],
    ['Passés avec Suivant', pct(sa.skips / sa.plays), pct(sb.skips / sb.plays)],
    ['Jusqu\'au bout', pct(sa.completes / sa.plays), pct(sb.completes / sb.plays)],
    ['Première écoute', dateFr(Math.floor(DB.global.artist.first[a] / 1440), true), dateFr(Math.floor(DB.global.artist.first[b] / 1440), true)],
    ['Meilleur mois', bestMonth(sa), bestMonth(sb)],
  ];
  out.innerHTML = `<datalist id="art-list">${top.map(e => `<option value="${esc(DB.artists[e.id])}"></option>`).join('')}</datalist>
    <div class="cmp-picks">${picker('a', a)}${picker('b', b)}</div>
    <div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th></th><th class="n">${link('artist', a)}</th><th class="n">${link('artist', b)}</th></tr></thead><tbody>
      ${rowsK.map(([l, x, y]) => `<tr><td>${l}</td><td class="n num">${x}</td><td class="n num">${y}</td></tr>`).join('')}
    </tbody></table></div>
    ${section('La course', `<div class="chart">${lines([{ v: ca, c: CA }, { v: cb, c: CB }], ticks, v => fmt(v) + ' h', i => `${monthLabel(k0 + i)}<br>${esc(DB.artists[a])} : <b>${fmt(ca[i])} h</b><br>${esc(DB.artists[b])} : <b>${fmt(cb[i])} h</b>`)}</div>
      <div class="legend"><span><i style="background:${CA}"></i>${esc(DB.artists[a])}</span><span><i style="background:${CB}"></i>${esc(DB.artists[b])}</span></div>`, { eyebrow: 'Temps cumulé depuis le début' })}
    ${section('À quelle heure', `<div class="chart">${hourLines(sa.heat, sb.heat)}</div><div class="legend"><span><i style="background:${CA}"></i>${esc(DB.artists[a])}</span><span><i style="background:${CB}"></i>${esc(DB.artists[b])}</span></div>`, { eyebrow: 'Profil horaire' })}
    <div class="cols2">
      ${section(`Titres de ${esc(DB.artists[a])}`, `<ol class="rank">${ranking(sa, 'track', 'sec', 10).map((e, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('track', e.id)}<span class="rv num">${dur(e.sec)}</span></li>`).join('')}</ol>`, { eyebrow: 'Top 10' })}
      ${section(`Titres de ${esc(DB.artists[b])}`, `<ol class="rank">${ranking(sb, 'track', 'sec', 10).map((e, i) => `<li><span class="rk num">${i + 1}</span>${entityCell('track', e.id)}<span class="rv num">${dur(e.sec)}</span></li>`).join('')}</ol>`, { eyebrow: 'Top 10' })}
    </div>`;
  const byName = new Map(DB.artists.map((n, i) => [n.toLowerCase(), i]));
  ['a', 'b'].forEach(id => {
    out.querySelector('#in-' + id).addEventListener('change', e => {
      const v = byName.get(e.target.value.trim().toLowerCase());
      if (v === undefined) { e.target.setCustomValidity('Artiste introuvable dans ton historique'); e.target.reportValidity(); return; }
      const next = { a, b, [id]: v };
      location.hash = `#/comparer?mode=artistes&a=${next.a}&b=${next.b}`;
    });
    out.querySelector('#in-' + id).addEventListener('input', e => e.target.setCustomValidity(''));
  });
}
function bestMonth(st) {
  let best = null;
  for (const [m, s] of st.months) if (!best || s > best[1]) best = [m, s];
  return best ? `${monthLabel(best[0])} (${dur(best[1])})` : '—';
}
