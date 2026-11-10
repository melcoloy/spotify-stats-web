import { DB, years, isoToDay, dayToIso, yearRange } from '../data.js';
import { esc, fmt, dur, dateFr, MOIS, JOURS } from '../ui.js';
import { section } from './common.js';
import { loc } from '../i18n.js';

let dayTop = null;
function dayTopArtist() {
  if (dayTop) return dayTop;
  const m = new Map();
  for (let i = 0; i < DB.n; i++) {
    const d = Math.floor(DB.T[i] / 1440), a = DB.trackArtist[DB.K[i]];
    let x = m.get(d); if (!x) m.set(d, x = new Map());
    x.set(a, (x.get(a) || 0) + DB.S[i]);
  }
  dayTop = new Map();
  for (const [d, x] of m) { let b = -1, bv = 0; for (const [a, v] of x) if (v > bv) { bv = v; b = a; } dayTop.set(d, b); }
  return dayTop;
}

// Seuils de couleur : quantiles des jours actifs, pour que chaque niveau soit bien représenté.
function levels() {
  const v = [...DB.global.days.values()].sort((a, b) => a - b);
  const q = p => v[Math.floor(p * (v.length - 1))];
  return [q(0.25), q(0.5), q(0.75), q(0.92)];
}

export function render(root) {
  const days = DB.global.days, top = dayTopArtist(), lv = levels();
  const lvl = s => (!s ? 0 : s < lv[0] ? 1 : s < lv[1] ? 2 : s < lv[2] ? 3 : s < lv[3] ? 4 : 5);
  const ys = years().slice().reverse();
  const C = 15, G = 2, L = 30, T = 18;
  const grid = y => {
    const jan1 = isoToDay(`${y}-01-01`), dec31 = isoToDay(`${y}-12-31`);
    const off = (jan1 + 3) % 7; // lundi = 0
    const weeks = Math.ceil((dec31 - jan1 + 1 + off) / 7);
    const W = L + weeks * (C + G), H = T + 7 * (C + G);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="cal-svg" role="img" aria-label="${loc`Calendrier ${y}`}">`;
    [0, 2, 4, 6].forEach(r => { s += `<text x="${L - 6}" y="${T + r * (C + G) + C - 3}" text-anchor="end">${JOURS[r]}</text>`; });
    for (let m = 0; m < 12; m++) {
      const d = isoToDay(`${y}-${String(m + 1).padStart(2, '0')}-01`);
      const w = Math.floor((d - jan1 + off) / 7);
      s += `<text x="${L + w * (C + G)}" y="11">${MOIS[m]}</text>`;
    }
    for (let d = jan1; d <= dec31; d++) {
      const i = d - jan1 + off, w = Math.floor(i / 7), r = i % 7;
      const sec = days.get(d) || 0, out = d < DB.firstDay || d > DB.lastDay;
      const tip = out ? loc`${dateFr(d)}<br>hors de l'historique` : `${dateFr(d)}<br><b>${dur(sec)}</b>${sec ? `<br>${esc(DB.artists[top.get(d)])}` : ''}`;
      s += `<rect x="${L + w * (C + G)}" y="${T + r * (C + G)}" width="${C}" height="${C}" rx="3" class="cl${out ? ' out' : ` l${lvl(sec)}`}" data-day="${sec ? dayToIso(d) : ''}" data-tip="${esc(tip)}"/>`;
    }
    return s + '</svg>';
  };
  const yearStats = y => {
    const r = yearRange(y);
    let active = 0, tot = 0, best = 0, cur = 0, gap = 0, gcur = 0, we = 0, wd = 0, nwe = 0, nwd = 0;
    for (let d = r.from; d <= r.to; d++) {
      const s = days.get(d) || 0;
      const isWe = (d + 3) % 7 >= 5;
      if (isWe) { we += s; nwe++; } else { wd += s; nwd++; }
      if (s) { active++; tot += s; cur++; gcur = 0; if (cur > best) best = cur; } else { cur = 0; gcur++; if (gcur > gap) gap = gcur; }
    }
    return { active, total: r.to - r.from + 1, tot, best, gap, we: we / Math.max(1, nwe), wd: wd / Math.max(1, nwd) };
  };
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${loc`Calendrier`}</div><h1>${loc`Chaque jour de ton historique`}</h1>
      <p class="lede">${loc`Une case par jour, plus elle est vive plus tu as écouté. Les trous racontent les vacances sans réseau, les blocus ou les périodes calmes. Clique sur un jour pour voir tout ce que tu as écouté.`}</p></header>
    <div class="cal-legend"><span>${loc`Rien`}</span>${[0, 1, 2, 3, 4, 5].map(l => `<i class="cl l${l}"></i>`).join('')}<span>${loc`Beaucoup (plus de ${dur(lv[3])})`}</span></div>
    ${ys.map(y => { const s = yearStats(y); return section(String(y), `<div class="cal-wrap">${grid(y)}</div>
      <p class="note">${loc`${fmt(s.active)} jours sur ${fmt(s.total)} avec de la musique · série record ${fmt(s.best)} j · plus longue pause ${fmt(s.gap)} j · ${dur(s.wd)} par jour en semaine, ${dur(s.we)} le week-end`}</p>`, { eyebrow: dur(s.tot) }); }).join('')}
  </div>`;
  root.firstElementChild.addEventListener('click', e => {
    const c = e.target.closest('[data-day]');
    if (c && c.dataset.day) location.hash = '#/jour/' + c.dataset.day;
  });
}
