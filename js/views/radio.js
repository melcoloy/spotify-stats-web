import { DB, ranking, radio, transitions } from '../data.js';
import { esc, fmt, pct, thumb, link, href, store, pick } from '../ui.js';
import { section } from './common.js';
import { loc } from '../i18n.js';

export function render(root, ctx) {
  const p = ctx.params;
  // Les titres avec un lien Spotify d'abord (ils ont un lecteur), mais tous restent possibles.
  const top = ranking(DB.global, 'track', 'streams', 600);
  const seed = Number.isInteger(+p.seed) && p.seed !== undefined ? +p.seed : store.get('radio-seed', top[0].id);
  const len = [10, 20, 40].includes(+p.len) ? +p.len : store.get('radio-len', 20);
  const audace = Math.min(1, Math.max(0.05, p.a !== undefined ? +p.a : store.get('radio-audace', 0.4)));
  store.set('radio-seed', seed); store.set('radio-len', len); store.set('radio-audace', audace);
  const label = k => `${DB.tracks[k]} — ${DB.artists[DB.trackArtist[k]]}`;
  let list = radio(seed, len, audace);
  let cur = 0;

  // Enchaînements les plus fréquents de tout l'historique.
  const pairs = [];
  for (const e of top.slice(0, 400)) {
    const t = transitions(e.id);
    if (t[0] && t[0].n >= 8) pairs.push({ a: e.id, b: t[0].id, n: t[0].n, p: t[0].p });
  }
  pairs.sort((x, y) => y.n - x.n);
  const predictable = pairs.filter(x => x.n >= 10).sort((x, y) => y.p - x.p).slice(0, 8);

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${loc`Radio perso`}</div><h1>${loc`Le prochain titre`}</h1>
      <p class="lede">${loc`Le site a appris, sur tes ${fmt(DB.sessionStart.length)} sessions, quel titre tu lances après quel autre (une chaîne de Markov). Choisis un titre de départ : la radio enchaîne ensuite comme toi tu l'aurais fait.`}</p></header>
    <datalist id="track-list">${top.map(e => `<option value="${esc(label(e.id))}"></option>`).join('')}</datalist>
    <div class="radio-ctl">
      <label class="filter" for="seedIn">${loc`Titre de départ`} <input id="seedIn" list="track-list" value="${esc(label(seed))}" autocomplete="off"></label>
      <button type="button" class="btn ghost" id="rnd">${loc`Au hasard`}</button>
      <label class="filter small" for="lenSel">${loc`Longueur`} <select id="lenSel">${[10, 20, 40].map(v => `<option value="${v}" ${v === len ? 'selected' : ''}>${loc`${v} titres`}</option>`).join('')}</select></label>
      <label class="filter small" for="aud">${loc`Prévisible`} <input type="range" id="aud" min="0.05" max="1" step="0.05" value="${audace}"> ${loc`Surprenant`}</label>
      <button type="button" class="btn" id="again">${loc`Relancer`}</button>
    </div>
    <div class="radio">
      <div class="radio-player"><div id="player"></div>
        <div class="radio-btns"><button type="button" class="btn ghost small" id="prevT">${loc`← Précédent`}</button><span id="pos" class="num"></span><button type="button" class="btn ghost small" id="nextT">${loc`Suivant →`}</button></div>
        <p class="note">${DB.meta.demo ? loc`Pas de lecteur avec les données d'exemple : les titres sont inventés.` : loc`Le lecteur Spotify passe par ton compte : ces écoutes comptent dans ton historique.`}</p></div>
      <ol class="radio-list" id="rlist"></ol>
    </div>
    <div class="cols2">
      ${section(loc`Tes enchaînements fétiches`, `<ol class="pairs">${pairs.slice(0, 10).map(x => `<li><span class="ent">${link('track', x.a, 'ent-name')}<small>${esc(DB.artists[DB.trackArtist[x.a]])}</small></span><span class="arrow">→</span><span class="ent">${link('track', x.b, 'ent-name')}<small>${esc(DB.artists[DB.trackArtist[x.b]])}</small></span><span class="num">${fmt(x.n)}×</span></li>`).join('')}</ol>`, { eyebrow: loc`Les paires que tu enchaînes le plus` })}
      ${section(loc`Tes titres les plus prévisibles`, `<ol class="pairs">${predictable.map(x => `<li><span class="ent">${link('track', x.a, 'ent-name')}<small>${esc(DB.artists[DB.trackArtist[x.a]])}</small></span><span class="arrow">→</span><span class="ent">${link('track', x.b, 'ent-name')}<small>${esc(DB.artists[DB.trackArtist[x.b]])}</small></span><span class="num">${pct(x.p)}</span></li>`).join('')}</ol>`, { eyebrow: loc`Après eux, c'est presque toujours le même` })}
    </div>
  </div>`;

  const byLabel = new Map(top.map(e => [label(e.id).toLowerCase(), e.id]));
  const go = (s, l = len, a = audace) => { location.hash = `#/radio?seed=${s}&len=${l}&a=${a}`; };
  const draw = () => {
    root.querySelector('#rlist').innerHTML = list.map((x, i) => `<li class="${i === cur ? 'on' : ''}" data-i="${i}"><span class="rk num">${i + 1}</span>${thumb('track', x.id, 'sm')}<span class="ent"><span class="ent-name">${esc(DB.tracks[x.id])}</span><small>${esc(DB.artists[DB.trackArtist[x.id]])}</small></span>
      <span class="rp" title="${i === 0 ? '' : x.via === 'titre' ? loc`Part des fois où tu as enchaîné ce titre après le précédent, parmi les 12 suites les plus fréquentes` : loc`Aucun enchaînement connu : la radio passe à l'artiste que tu écoutes souvent ensuite`}">${i === 0 ? loc`départ` : x.via === 'titre' ? pct(x.p) : loc`via l'artiste`}</span><a class="rgo" href="${href('track', x.id)}" title="${loc`Page du titre`}">↗</a></li>`).join('');
    const u = DB.trackUri[list[cur].id];
    root.querySelector('#player').innerHTML = u ? `<iframe class="embed" title="${loc`Lecteur Spotify`}" src="https://open.spotify.com/embed/track/${u}?theme=0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>` : `<p class="empty">${loc`Pas de lien Spotify pour ce titre.`}</p>`;
    root.querySelector('#pos').textContent = `${cur + 1} / ${list.length}`;
  };
  root.querySelector('#rlist').addEventListener('click', e => {
    if (e.target.closest('.rgo')) return;
    const li = e.target.closest('li[data-i]'); if (!li) return;
    cur = +li.dataset.i; draw();
  });
  root.querySelector('#prevT').addEventListener('click', () => { cur = Math.max(0, cur - 1); draw(); });
  root.querySelector('#nextT').addEventListener('click', () => { cur = Math.min(list.length - 1, cur + 1); draw(); });
  root.querySelector('#again').addEventListener('click', () => { list = radio(seed, len, audace); cur = 0; draw(); });
  root.querySelector('#rnd').addEventListener('click', () => go(pick(top.slice(0, 300)).id));
  root.querySelector('#lenSel').addEventListener('change', e => go(seed, +e.target.value));
  root.querySelector('#aud').addEventListener('change', e => go(seed, len, +e.target.value));
  root.querySelector('#seedIn').addEventListener('change', e => {
    const id = byLabel.get(e.target.value.trim().toLowerCase());
    if (id === undefined) { e.target.setCustomValidity(loc`Choisis un titre dans la liste`); e.target.reportValidity(); return; }
    go(id);
  });
  root.querySelector('#seedIn').addEventListener('input', e => e.target.setCustomValidity(''));
  draw();
}
