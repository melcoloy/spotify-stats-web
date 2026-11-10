import { DB, ranking, nameOf, artistOf } from '../data.js';
import { esc, fmt, store } from '../ui.js';
import { table } from './common.js';
import { loc } from '../i18n.js';

const TYPES = [['artist', loc`Artistes`], ['track', loc`Titres`], ['album', loc`Albums`]];
const COLS = {
  artist: ['sec', 'streams', 'tracks', 'skipRate', 'doneRate', 'first', 'last'],
  track: ['sec', 'streams', 'plays', 'skipRate', 'doneRate', 'chosenRate', 'first', 'last'],
  album: ['sec', 'streams', 'tracks', 'skipRate', 'doneRate', 'first', 'last'],
};
const PAGE = 50;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function render(root, ctx) {
  const { params, range, statsFor } = ctx;
  const type = TYPES.some(t => t[0] === params.type) ? params.type : store.get('rk-type', 'artist');
  const sort = params.sort || store.get('rk-sort-' + type, 'sec');
  const st = statsFor(range);
  const all = ranking(st, type, sort);
  let shown = PAGE, q = params.q || '', minStreams = store.get('rk-min', 0);

  root.innerHTML = `<div class="page">
    <header class="page-h">
      <div class="eyebrow">${esc(ctx.periodLabel)}</div>
      <h1>${loc`Classements`}</h1>
    </header>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="${loc`Type de classement`}">${TYPES.map(([k, l]) => `<a href="#/classements?type=${k}" class="${k === type ? 'on' : ''}">${l}</a>`).join('')}</div>
      <label class="filter"><span class="sr-only">${loc`Filtrer`}</span><input type="search" id="rkq" placeholder="${loc`Filtrer ${type === 'artist' ? 'les artistes' : type === 'album' ? 'les albums' : 'les titres'}…`}" value="${esc(q)}"></label>
      <label class="filter small">${loc`Streams min.`} <input type="number" id="rkmin" min="0" step="1" value="${minStreams}"></label>
    </div>
    <p class="note" id="rkcount"></p>
    <div id="rktbl"></div>
    <div class="more-row"><button type="button" id="rkmore" class="btn">${loc`Afficher 50 de plus`}</button></div>
  </div>`;

  const draw = () => {
    const nq = norm(q.trim());
    let rows = all;
    if (minStreams > 0) rows = rows.filter(e => e.streams >= minStreams);
    // Un taux de zap sur 2 lancements ne veut rien dire : on exige un minimum.
    const zapFloor = ['skipRate', 'doneRate', 'chosenRate'].includes(sort) ? 10 : 0;
    if (zapFloor) rows = rows.filter(e => e.plays >= zapFloor);
    rows = rows.map((e, i) => ({ ...e, rank: i }));
    if (nq) rows = rows.filter(e => norm(nameOf(type, e.id)).includes(nq) || (type !== 'artist' && norm(DB.artists[artistOf(type, e.id)]).includes(nq)));
    const page = rows.slice(0, shown);
    // On garde le rang d'origine dans le classement même quand on filtre.
    const html = table(page, type, { cols: COLS[type], sortKey: sort, offset: 0 });
    root.querySelector('#rktbl').innerHTML = html;
    root.querySelectorAll('#rktbl tbody tr').forEach((tr, i) => { const c = tr.querySelector('.c-rk'); if (c && page[i]) c.textContent = page[i].rank + 1; });
    root.querySelector('#rkcount').textContent = loc`${fmt(rows.length)} ${type === 'artist' ? loc`artistes` : type === 'album' ? loc`albums` : loc`titres`}${nq || minStreams ? ' ' + loc`correspondent` : ''} · tri : ${sortLabel(sort)}${zapFloor ? ` ${loc`(au moins ${zapFloor} lancements)`}` : ''} · clique sur un en-tête pour trier`;
    root.querySelector('#rkmore').hidden = rows.length <= shown;
  };

  root.querySelector('#rktbl').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    store.set('rk-sort-' + type, th.dataset.sort);
    location.hash = `#/classements?type=${type}&sort=${th.dataset.sort}${q ? '&q=' + encodeURIComponent(q) : ''}`;
  });
  root.querySelector('#rkq').addEventListener('input', e => { q = e.target.value; shown = PAGE; draw(); });
  root.querySelector('#rkmin').addEventListener('input', e => { minStreams = Math.max(0, +e.target.value || 0); store.set('rk-min', minStreams); shown = PAGE; draw(); });
  root.querySelector('#rkmore').addEventListener('click', () => { shown += PAGE; draw(); });
  store.set('rk-type', type);
  draw();
}

function sortLabel(k) {
  return { sec: loc`temps d'écoute`, streams: loc`streams`, plays: loc`lancements`, skipRate: loc`part passée`, doneRate: loc`part écoutée jusqu'au bout`, chosenRate: loc`part lancée exprès`, tracks: loc`nombre de titres`, first: loc`première écoute`, last: loc`dernière écoute`, name: loc`nom` }[k] || k;
}
