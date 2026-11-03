import { DB, search, ranking, artistOf } from '../data.js';
import { esc, dur, fmt, dateOfMinute, href, KIND_LABEL, shuffleArr, thumb } from '../ui.js';

export function render(root, ctx) {
  const q = ctx.params.q || '';
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">Explorer</div><h1>Fouille ton historique</h1>
      <p class="lede">Chaque artiste, album et titre a sa propre page : courbe d'écoute, premières et dernières écoutes, heures préférées, titres favoris. Tape un nom ou pioche dans les suggestions.</p></header>
    <div class="big-search"><label for="xq" class="sr-only">Rechercher</label><input id="xq" type="search" placeholder="Un artiste, un titre, un album…" value="${esc(q)}" autocomplete="off"></div>
    <div id="xres"></div>
  </div>`;
  const input = root.querySelector('#xq'), out = root.querySelector('#xres');
  const draw = () => {
    const v = input.value.trim();
    if (!v) { out.innerHTML = suggestions(); return; }
    const res = search(v, 90);
    if (!res.length) { out.innerHTML = `<p class="empty">Rien ne correspond à « ${esc(v)} ».</p>`; return; }
    const groups = { artist: [], album: [], track: [] };
    res.forEach(r => groups[r.kind].push(r));
    out.innerHTML = `<div class="cols3">${['artist', 'track', 'album'].map(k => `<section class="block"><div class="block-h"><h2>${KIND_LABEL[k]}s <small class="num">${groups[k].length}</small></h2></div>
      ${groups[k].length ? `<ul class="xlist">${groups[k].slice(0, 25).map(r => item(r.kind, r.id)).join('')}</ul>` : '<p class="empty">Aucun</p>'}</section>`).join('')}</div>`;
  };
  input.addEventListener('input', () => { history.replaceState(null, '', `#/explorer${input.value.trim() ? '?q=' + encodeURIComponent(input.value.trim()) : ''}`); draw(); });
  out.addEventListener('click', e => { if (e.target.closest('#reroll')) { e.preventDefault(); draw(); } });
  draw();
  input.focus();
}

function item(kind, id) {
  const g = DB.global[kind];
  const sub = kind === 'artist' ? `${fmt(g.tracks[id])} titres` : esc(DB.artists[artistOf(kind, id)]);
  const name = kind === 'artist' ? DB.artists[id] : kind === 'album' ? DB.albums[id] : DB.tracks[id];
  return `<li><a href="${href(kind, id)}">${thumb(kind, id, 'sm')}<span class="xn">${esc(name)}<small>${sub}</small></span><span class="xv num">${dur(g.sec[id])}</span></a></li>`;
}

function suggestions() {
  const g = DB.global;
  const lastMin = DB.lastDay * 1440;
  const arts = ranking(g, 'artist', 'sec');
  const forgotten = arts.filter(e => e.sec >= 3 * 3600 && lastMin - e.last > 365 * 1440).slice(0, 12);
  const tracks = ranking(g, 'track', 'streams');
  const forgottenT = tracks.filter(e => e.streams >= 25 && lastMin - e.last > 365 * 1440).slice(0, 12);
  const random = shuffleArr(arts.slice(0, 250)).slice(0, 12);
  const card = (title, sub, list, kind, meta) => `<section class="block"><div class="block-h"><div><h2>${title}</h2><p class="note">${sub}</p></div></div>
    <ul class="xlist">${list.map(e => `<li><a href="${href(kind, e.id)}">${thumb(kind, e.id, 'sm')}<span class="xn">${esc(kind === 'artist' ? DB.artists[e.id] : DB.tracks[e.id])}<small>${meta(e)}</small></span><span class="xv num">${kind === 'artist' ? dur(e.sec) : fmt(e.streams) + '×'}</span></a></li>`).join('') || '<li class="empty">Personne</li>'}</ul></section>`;
  return `<div class="cols3">
    ${card('Artistes oubliés', 'Au moins 3 h d\'écoute, mais plus rien depuis un an.', forgotten, 'artist', e => 'Dernière écoute : ' + dateOfMinute(e.last))}
    ${card('Titres oubliés', 'Au moins 25 streams, mais plus rien depuis un an.', forgottenT, 'track', e => esc(DB.artists[DB.trackArtist[e.id]]) + ' · ' + dateOfMinute(e.last))}
    ${card('Au hasard', 'Douze artistes tirés parmi tes 250 premiers. <a href="#" id="reroll">Relancer</a>', random, 'artist', e => fmt(e.tracks) + ' titres écoutés')}
  </div>`;
}
