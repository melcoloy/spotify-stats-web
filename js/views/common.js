import { DB } from '../data.js';
import { esc, fmt, dur, pct, entityCell, dateOfMinute } from '../ui.js';

// Liste classée compacte avec barre proportionnelle.
// metric : 'sec' (temps) ou 'streams'.
export function rankList(items, kind, metric = 'sec', { max = null, sub = null, fmtVal = null } = {}) {
  if (!items.length) return '<p class="empty">Rien sur cette période.</p>';
  const top = (max ?? Math.max(...items.map(e => e[metric]))) || 1;
  return `<ol class="rank">${items.map((e, i) => {
    const val = fmtVal ? fmtVal(e) : metric === 'sec' ? dur(e.sec) : `${fmt(e[metric])}×`;
    const extra = sub ? sub(e) : '';
    return `<li><span class="rk num">${i + 1}</span>${entityCell(kind, e.id)}<span class="rv num">${val}${extra ? `<small>${extra}</small>` : ''}</span><span class="rb" style="--w:${(e[metric] / top).toFixed(4)}"></span></li>`;
  }).join('')}</ol>`;
}

// Tableau complet triable.
export const COLS = {
  sec: { label: 'Temps', fmt: e => dur(e.sec), num: true },
  streams: { label: 'Streams', fmt: e => fmt(e.streams), num: true, tip: 'Écoutes de 30 s ou plus' },
  plays: { label: 'Lancements', fmt: e => fmt(e.plays), num: true },
  skipRate: { label: 'Passés', fmt: e => pct(e.skipRate), num: true, tip: 'Part des lancements interrompus avec le bouton Suivant' },
  doneRate: { label: 'Jusqu\'au bout', fmt: e => pct(e.doneRate), num: true, tip: 'Part des lancements écoutés jusqu\'à la fin du titre' },
  chosenRate: { label: 'Lancés exprès', fmt: e => pct(e.chosenRate), num: true, tip: 'Part des lancements démarrés en cliquant sur le titre (pas l\'enchaînement automatique)' },
  tracks: { label: 'Titres', fmt: e => fmt(e.tracks), num: true },
  first: { label: '1re écoute', fmt: e => dateOfMinute(e.first) },
  last: { label: 'Dernière', fmt: e => dateOfMinute(e.last) },
};

export function table(items, kind, { cols, sortKey, offset = 0 }) {
  const head = `<tr><th class="c-rk">#</th><th data-sort="name" class="${sortKey === 'name' ? 'on' : ''}">${kind === 'artist' ? 'Artiste' : kind === 'album' ? 'Album' : 'Titre'}</th>${cols.map(c => `<th data-sort="${c}" class="${COLS[c].num ? 'n' : ''} ${sortKey === c ? 'on' : ''}" ${COLS[c].tip ? `title="${esc(COLS[c].tip)}"` : ''}>${COLS[c].label}</th>`).join('')}</tr>`;
  const body = items.map((e, i) => `<tr><td class="c-rk num">${offset + i + 1}</td><td>${entityCell(kind, e.id)}</td>${cols.map(c => `<td class="${COLS[c].num ? 'n num' : 'num'}">${COLS[c].fmt(e)}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols.length + 2}" class="empty">Aucun résultat</td></tr>`}</tbody></table></div>`;
}

export function section(title, body, { eyebrow = '', right = '', id = '' } = {}) {
  return `<section class="block" ${id ? `id="${id}"` : ''}><div class="block-h"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h2>${title}</h2></div>${right ? `<div class="block-r">${right}</div>` : ''}</div>${body}</section>`;
}

export function platformItems(st) {
  const colors = ['var(--coral)', 'var(--e-mint)', 'var(--butter)', 'var(--e-sky)', 'var(--e-violet)', 'var(--e-pink)', 'var(--e-other)'];
  return DB.platforms.map((label, i) => ({ label, v: st.platform[i], c: colors[i] })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
}

export function bestSlot(heat) {
  let b = 0;
  for (let i = 1; i < 168; i++) if (heat[i] > heat[b]) b = i;
  return { dow: Math.floor(b / 24), hour: b % 24 };
}
