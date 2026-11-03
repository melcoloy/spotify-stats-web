import { DB, ranking, computeStats, fullRange, byTrack } from '../data.js';
import { esc, fmt, dur, store, shuffleArr, pick, spotifyUrl } from '../ui.js';

const GAMES = {
  plusoumoins: { title: 'Plus ou moins', text: 'Deux artistes : lequel as-tu le plus écouté ? Enchaîne la plus longue série possible.', run: higherLower },
  annee: { title: 'Devine l\'année', text: 'Un titre s\'affiche : en quelle année l\'as-tu le plus écouté ?', run: g => quiz(g, yearQuestion, { key: 'annee' }) },
  artiste: { title: 'Qui chante ?', text: 'Retrouve l\'artiste de tes propres titres.', run: g => quiz(g, artistQuestion, { key: 'artiste' }) },
  blindtest: { title: 'Blind test', text: 'Un extrait de tes titres préférés, quatre propositions. Il faut une connexion internet.', run: g => quiz(g, blindQuestion, { key: 'blindtest', rounds: 8 }) },
  ordre: { title: 'Remets dans l\'ordre', text: 'Classe cinq artistes du plus écouté au moins écouté.', run: orderGame },
};

export function render(root, ctx) {
  const id = ctx.parts[1];
  if (id && GAMES[id]) {
    root.innerHTML = `<div class="page game-page"><a class="back" href="#/jeux">← Tous les jeux</a><h1>${GAMES[id].title}</h1><p class="lede">${GAMES[id].text}</p><div class="game" id="game"></div></div>`;
    return GAMES[id].run(root.querySelector('#game'));
  }
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">Jeux</div><h1>Tu connais ton Spotify ?</h1>
      <p class="lede">Des jeux construits uniquement sur ton historique. Les meilleurs scores restent enregistrés dans ce navigateur.</p></header>
    <div class="games">${Object.entries(GAMES).map(([k, g]) => `<a class="game-c" href="#/jeux/${k}"><h2>${g.title}</h2><p>${g.text}</p><span class="best">Record : <b class="num">${store.get('best-' + k, 0)}</b></span></a>`).join('')}</div>
  </div>`;
}

// ---------- outils communs ----------
const topArtists = n => ranking(DB.global, 'artist', 'sec', n);
const topTracks = n => ranking(DB.global, 'track', 'streams', n);

function saveBest(key, score) {
  const best = store.get('best-' + key, 0);
  if (score > best) { store.set('best-' + key, score); return true; }
  return false;
}

// ---------- quiz à 4 propositions ----------
function quiz(root, makeQuestion, { key, rounds = 10 } = {}) {
  let round = 0, score = 0, used = new Set();
  const next = () => {
    if (round >= rounds) return end();
    let q, tries = 0;
    do { q = makeQuestion(); tries++; } while (q && used.has(q.key) && tries < 30);
    if (!q) { root.innerHTML = '<p class="empty">Pas assez de données pour ce jeu.</p>'; return; }
    used.add(q.key);
    round++;
    root.innerHTML = `<div class="g-head"><span>Question <b class="num">${round}</b>/${rounds}</span><span>Score <b class="num">${score}</b></span></div>
      <div class="g-q">${q.prompt}</div>
      <div class="g-opts">${q.options.map((o, i) => `<button type="button" class="g-opt" data-i="${i}">${o.label}</button>`).join('')}</div>
      <div class="g-reveal" hidden></div>`;
    root.querySelector('.g-opts').addEventListener('click', e => {
      const b = e.target.closest('.g-opt');
      if (!b || root.querySelector('.g-opts').classList.contains('done')) return;
      const ok = q.options[+b.dataset.i].correct;
      if (ok) score++;
      root.querySelector('.g-opts').classList.add('done');
      root.querySelectorAll('.g-opt').forEach((x, i) => { x.disabled = true; if (q.options[i].correct) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      const rv = root.querySelector('.g-reveal');
      rv.innerHTML = `<p><b>${ok ? 'Bien vu.' : 'Raté.'}</b> ${q.reveal}</p><button type="button" class="btn" id="gnext">${round >= rounds ? 'Voir le score' : 'Question suivante'}</button>`;
      rv.hidden = false;
      rv.querySelector('#gnext').focus();
      rv.querySelector('#gnext').addEventListener('click', next);
    });
  };
  const end = () => {
    const rec = saveBest(key, score);
    root.innerHTML = `<div class="g-end"><p class="eyebrow">Score final</p><p class="g-score num">${score}<small>/${rounds}</small></p>
      <p>${rec ? 'Nouveau record !' : `Record : ${store.get('best-' + key, 0)}/${rounds}`}</p>
      <div class="g-actions"><button type="button" class="btn" id="again">Rejouer</button><a class="btn ghost" href="#/jeux">Autres jeux</a></div></div>`;
    root.querySelector('#again').addEventListener('click', () => { round = 0; score = 0; used = new Set(); next(); });
  };
  next();
}

function yearQuestion() {
  const pool = topTracks(300);
  const t = pick(pool);
  const st = computeStats(fullRange(), byTrack(t.id));
  const perYear = new Map();
  for (const [d, s] of st.days) { const y = new Date(d * 86400000).getUTCFullYear(); perYear.set(y, (perYear.get(y) || 0) + s); }
  const sorted = [...perYear].sort((a, b) => b[1] - a[1]);
  const answer = sorted[0][0];
  const allYears = [];
  for (let y = new Date(DB.firstDay * 86400000).getUTCFullYear(); y <= new Date(DB.lastDay * 86400000).getUTCFullYear(); y++) allYears.push(y);
  const opts = shuffleArr([answer, ...shuffleArr(allYears.filter(y => y !== answer)).slice(0, 3)]).sort((a, b) => a - b);
  return {
    key: t.id,
    prompt: `<p class="g-kick">En quelle année as-tu le plus écouté</p><p class="g-big">${esc(DB.tracks[t.id])}</p><p class="g-sub">${esc(DB.artists[DB.trackArtist[t.id]])}</p>`,
    options: opts.map(y => ({ label: String(y), correct: y === answer })),
    reveal: `C'était en <b>${answer}</b> (${dur(sorted[0][1])}).${sorted[1] ? ` Ensuite ${sorted[1][0]} (${dur(sorted[1][1])}).` : ''}`,
  };
}

function artistQuestion() {
  const t = pick(topTracks(400));
  const a = DB.trackArtist[t.id];
  const others = shuffleArr(topArtists(80).map(e => e.id).filter(x => x !== a)).slice(0, 3);
  const opts = shuffleArr([a, ...others]);
  return {
    key: t.id,
    prompt: `<p class="g-kick">Qui chante</p><p class="g-big">${esc(DB.tracks[t.id])}</p>`,
    options: opts.map(x => ({ label: esc(DB.artists[x]), correct: x === a })),
    reveal: `${esc(DB.tracks[t.id])}, de <b>${esc(DB.artists[a])}</b>. Tu l'as écouté ${fmt(t.streams)} fois.`,
  };
}

function blindQuestion() {
  const pool = topTracks(150).filter(e => DB.trackUri[e.id]);
  if (pool.length < 8) return null;
  const t = pick(pool);
  const others = shuffleArr(pool.filter(e => e.id !== t.id && DB.trackArtist[e.id] !== DB.trackArtist[t.id])).slice(0, 3);
  const opts = shuffleArr([t, ...others]);
  return {
    key: t.id,
    prompt: `<p class="g-kick">Lance l'extrait avec le bouton lecture, à droite</p>
      <div class="blind"><iframe title="Extrait mystère" src="https://open.spotify.com/embed/track/${DB.trackUri[t.id]}?theme=0" allow="autoplay; encrypted-media"></iframe><div class="blind-mask" aria-hidden="true">?</div></div>`,
    options: opts.map(e => ({ label: `${esc(DB.tracks[e.id])}<small>${esc(DB.artists[DB.trackArtist[e.id]])}</small>`, correct: e.id === t.id })),
    reveal: `C'était <b>${esc(DB.tracks[t.id])}</b> de ${esc(DB.artists[DB.trackArtist[t.id]])}. <a href="${spotifyUrl(t.id)}" target="_blank" rel="noopener">L'ouvrir dans Spotify</a>`,
  };
}

// ---------- plus ou moins ----------
function higherLower(root) {
  const pool = topArtists(150);
  let score = 0, left = pick(pool), right;
  const draw = () => {
    do { right = pick(pool); } while (right.id === left.id || Math.abs(right.sec - left.sec) < 600);
    root.innerHTML = `<div class="g-head"><span>Série <b class="num">${score}</b></span><span>Record <b class="num">${store.get('best-plusoumoins', 0)}</b></span></div>
      <div class="hl">
        <div class="hl-c"><p class="hl-n">${esc(DB.artists[left.id])}</p><p class="hl-v num">${dur(left.sec)}</p><p class="g-sub">d'écoute au total</p></div>
        <div class="hl-vs">vs</div>
        <div class="hl-c"><p class="hl-n">${esc(DB.artists[right.id])}</p><p class="hl-v num" id="hv">?</p>
          <div class="hl-b"><button type="button" class="btn" data-g="more">Plus</button><button type="button" class="btn" data-g="less">Moins</button></div></div>
      </div><div class="g-reveal" hidden></div>`;
    root.querySelector('.hl-b').addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const ok = (b.dataset.g === 'more') === (right.sec > left.sec);
      root.querySelectorAll('.hl-b button').forEach(x => { x.disabled = true; });
      root.querySelector('#hv').textContent = dur(right.sec);
      root.querySelector('#hv').classList.add(ok ? 'ok' : 'ko');
      const rv = root.querySelector('.g-reveal'); rv.hidden = false;
      if (ok) {
        score++;
        rv.innerHTML = `<p><b>Bien vu.</b></p><button type="button" class="btn" id="gnext">Suivant</button>`;
        rv.querySelector('#gnext').addEventListener('click', () => { left = right; draw(); });
      } else {
        const rec = saveBest('plusoumoins', score);
        rv.innerHTML = `<p><b>Perdu.</b> Série de ${score}${rec ? ', nouveau record !' : '.'}</p><button type="button" class="btn" id="gnext">Rejouer</button>`;
        rv.querySelector('#gnext').addEventListener('click', () => { score = 0; left = pick(pool); draw(); });
      }
      rv.querySelector('#gnext').focus();
    });
  };
  draw();
}

// ---------- remets dans l'ordre ----------
function orderGame(root) {
  const pool = topArtists(60);
  let total = 0, rounds = 0;
  const draw = () => {
    const five = shuffleArr(pool.slice()).slice(0, 5);
    const truth = five.slice().sort((a, b) => b.sec - a.sec).map(e => e.id);
    let chosen = [];
    const paint = () => {
      root.innerHTML = `<div class="g-head"><span>Manche <b class="num">${rounds + 1}</b></span><span>Points <b class="num">${total}</b></span></div>
        <p class="g-kick">Clique dans l'ordre, du plus écouté au moins écouté.</p>
        <div class="ord">${five.map(e => { const p = chosen.indexOf(e.id); return `<button type="button" class="ord-b ${p >= 0 ? 'on' : ''}" data-id="${e.id}" ${p >= 0 ? 'disabled' : ''}><span class="num">${p >= 0 ? p + 1 : ''}</span>${esc(DB.artists[e.id])}</button>`; }).join('')}</div>
        <div class="g-actions"><button type="button" class="btn ghost" id="undo" ${chosen.length ? '' : 'disabled'}>Annuler le dernier</button></div>
        <div class="g-reveal" hidden></div>`;
      root.querySelector('.ord').addEventListener('click', e => {
        const b = e.target.closest('.ord-b'); if (!b) return;
        chosen.push(+b.dataset.id);
        if (chosen.length === 5) return finish();
        paint();
      });
      root.querySelector('#undo').addEventListener('click', () => { chosen.pop(); paint(); });
    };
    const finish = () => {
      const good = chosen.filter((id, i) => truth[i] === id).length;
      total += good; rounds++;
      const rec = saveBest('ordre', total);
      root.innerHTML = `<div class="g-head"><span>Manche <b class="num">${rounds}</b></span><span>Points <b class="num">${total}</b></span></div>
        <p class="g-kick"><b>${good}/5</b> bien placés.</p>
        <ol class="ord-res">${truth.map((id, i) => `<li class="${chosen[i] === id ? 'ok' : 'ko'}"><span class="num">${i + 1}</span>${esc(DB.artists[id])}<small class="num">${dur(DB.global.artist.sec[id])}</small>${chosen[i] !== id ? `<em>tu avais mis ${esc(DB.artists[chosen[i]])}</em>` : ''}</li>`).join('')}</ol>
        <div class="g-actions"><button type="button" class="btn" id="gnext">Manche suivante</button><button type="button" class="btn ghost" id="reset">Recommencer à zéro</button></div>
        ${rec ? '<p class="note">Nouveau record de points.</p>' : ''}`;
      root.querySelector('#gnext').addEventListener('click', draw);
      root.querySelector('#reset').addEventListener('click', () => { total = 0; rounds = 0; draw(); });
    };
    paint();
  };
  draw();
}
