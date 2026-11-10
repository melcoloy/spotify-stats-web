import { DB, years, yearRange, fullRange, ranking, discoveries, coverOf } from '../data.js';
import { esc, fmt, dur, pct, dateFr, JOURS_LONG, spotifyUrl, store, hourLabel } from '../ui.js';
import { bestSlot } from './common.js';
import { loc } from '../i18n.js';

const SLIDE_MS = 7000;
const BG = ['#2A1E6B', '#C2412F', '#123F5A', '#6B1F4C', '#1F5A43', '#4A2A86', '#8A5A00', '#14324F', '#5C1E2E', '#2E3F12', '#3B2470', '#191433'];

export function render(root, ctx) {
  const ys = years();
  const y = ctx.parts[1];
  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${loc`Wrapped`}</div><h1>${loc`Ton récap, version story`}</h1>
      <p class="lede">${loc`Choisis une année et laisse défiler. Clique à droite pour avancer, à gauche pour revenir, maintiens pour mettre en pause. Flèches du clavier et Échap marchent aussi.`}</p></header>
    <div class="wr-pick">${ys.slice().reverse().map(yy => {
      const st = ctx.statsFor(yearRange(yy));
      const a = st.plays ? ranking(st, 'artist', 'sec', 1)[0] : null;
      return `<a class="wr-y" href="#/wrapped/${yy}" style="--bg:${BG[yy % BG.length]}"><span class="num">${yy}</span><small>${a ? esc(DB.artists[a.id]) : '—'} · ${dur(st.sec)}</small></a>`;
    }).join('')}
      <a class="wr-y all" href="#/wrapped/tout" style="--bg:#120F24"><span>${loc`Tout`}</span><small>${ys[0]} → ${ys[ys.length - 1]}</small></a>
    </div>
  </div>`;
  if (!y) return;
  const range = y === 'tout' ? fullRange() : ys.includes(+y) ? yearRange(+y) : null;
  if (!range) return;
  return openStory(ctx, range, y === 'tout' ? 'tout' : +y);
}

function buildSlides(ctx, range, label) {
  const st = ctx.statsFor(range);
  const isAll = label === 'tout';
  const title = isAll ? loc`depuis le début` : loc`en ${label}`;
  const A = ranking(st, 'artist', 'sec', 5), T = ranking(st, 'track', 'streams', 5), AL = ranking(st, 'album', 'sec', 3);
  const disc = isAll ? [] : discoveries(st);
  const slot = bestSlot(st.heat);
  const prevY = !isAll && ys().includes(label - 1) ? ctx.statsFor(yearRange(label - 1)) : null;
  const top = A[0], topT = T[0];
  const topArtistDays = (() => {
    let n = 0;
    const g = DB.trackArtist;
    const days = new Set();
    const lo = range.from * 1440, hi = (range.to + 1) * 1440;
    for (let i = 0; i < DB.n; i++) { const m = DB.T[i]; if (m < lo) continue; if (m >= hi) break; if (g[DB.K[i]] === top.id) days.add(Math.floor(m / 1440)); }
    n = days.size; return n;
  })();
  const minutes = st.sec / 60;
  const persona = personaOf(st, top, disc.length);

  const S = [];
  S.push(`<div class="s-center"><p class="s-kick a1">${loc`Ton année musicale`}</p><h1 class="s-giant a2">${isAll ? loc`Tout` : label}</h1><p class="s-p a3">${isAll ? loc`De ${dateFr(range.from, true)} à ${dateFr(range.to, true)}.` : loc`On regarde ce que tu as vraiment écouté.`}</p></div>`);
  S.push(`<div class="s-center"><p class="s-kick a1">${loc`Tu as écouté`}</p><h1 class="s-giant num a2" data-count="${Math.round(minutes)}">0</h1><p class="s-big a3">${loc`minutes de musique ${title}`}</p>
    <p class="s-p a4">${loc`Soit ${fmt(minutes / 1440, 1)} jours complets.${prevY && prevY.sec ? ` ${loc`C'est ${st.sec >= prevY.sec ? loc`${fmt(100 * (st.sec / prevY.sec - 1))} % de plus` : loc`${fmt(100 * (1 - st.sec / prevY.sec))} % de moins`} qu'en ${label - 1}.`}` : ''}`}</p></div>`);
  const img = (kind, id, cls) => { const u = coverOf(kind, id); return u ? `<img class="s-cover ${cls}" src="${u}" alt="">` : ''; };
  S.push(`<div class="s-center">${img('artist', top.id, 'round a1')}<p class="s-kick a1">${loc`Ton artiste ${isAll ? loc`de tous les temps` : loc`de l'année`}`}</p><h1 class="s-name a2">${esc(DB.artists[top.id])}</h1>
    <p class="s-big num a3">${dur(top.sec)}</p><p class="s-p a4">${loc`${pct(top.sec / st.sec)} de ton écoute, réparties sur ${fmt(topArtistDays)} jours différents.`}</p></div>`);
  S.push(`<div><p class="s-kick a1">${loc`Tes artistes préférés`}</p><ol class="s-list">${A.map((e, i) => `<li class="a${i + 2}"><span class="num">${i + 1}</span><b>${esc(DB.artists[e.id])}</b><small class="num">${dur(e.sec)}</small></li>`).join('')}</ol></div>`);
  S.push(`<div class="s-center">${img('track', topT.id, 'a1')}<p class="s-kick a1">${loc`Ton titre ${isAll ? loc`de tous les temps` : loc`de l'année`}`}</p><h1 class="s-name a2">${esc(DB.tracks[topT.id])}</h1><p class="s-p a3">${esc(DB.artists[DB.trackArtist[topT.id]])}</p>
    <p class="s-big num a4">${loc`${fmt(topT.streams)} écoutes`}</p>${spotifyUrl(topT.id) ? `<p class="a5"><a class="s-btn" href="${spotifyUrl(topT.id)}" target="_blank" rel="noopener">${loc`L'écouter sur Spotify`}</a></p>` : ''}</div>`);
  S.push(`<div><p class="s-kick a1">${loc`Tes titres préférés`}</p><ol class="s-list">${T.map((e, i) => `<li class="a${i + 2}"><span class="num">${i + 1}</span><b>${esc(DB.tracks[e.id])}<small>${esc(DB.artists[DB.trackArtist[e.id]])}</small></b><small class="num">${fmt(e.streams)}×</small></li>`).join('')}</ol></div>`);
  S.push(`<div class="s-center">${img('album', AL[0].id, 'a1')}<p class="s-kick a1">${loc`L'album que tu as usé`}</p><h1 class="s-name a2">${esc(DB.albums[AL[0].id])}</h1><p class="s-p a3">${esc(DB.artists[DB.albumArtist[AL[0].id]])} · ${dur(AL[0].sec)}</p>
    ${AL.length > 1 ? `<p class="s-p a4">${loc`Juste derrière : ${AL.slice(1).map(e => `<b>${esc(DB.albums[e.id])}</b>`).join(` ${loc`et`} `)}.`}</p>` : ''}</div>`);
  if (!isAll) {
    S.push(disc.length ? `<div class="s-center"><p class="s-kick a1">${loc`Découvertes`}</p><h1 class="s-giant num a2">${fmt(disc.length)}</h1><p class="s-big a3">${loc`nouveaux artistes`}</p>
      <p class="s-p a4">${loc`Ta plus belle trouvaille : <b>${esc(DB.artists[disc[0].id])}</b> (${dur(disc[0].sec)})${disc[1] ? loc`, suivie de <b>${esc(DB.artists[disc[1].id])}</b>` : ''}.`}</p></div>`
      : `<div class="s-center"><p class="s-kick a1">${loc`Découvertes`}</p><h1 class="s-name a2">${loc`Aucune`}</h1><p class="s-p a3">${loc`Tu es resté fidèle à tes artistes.`}</p></div>`);
  }
  const nightShare = st.night / st.sec;
  S.push(`<div class="s-center"><p class="s-kick a1">${loc`Ton moment`}</p><h1 class="s-name a2">${loc`Le ${JOURS_LONG[slot.dow]}, vers ${hourLabel(slot.hour)}`}</h1>
    <div class="s-hours a3">${hoursBars(st.heat)}</div><p class="s-p a4">${loc`${pct(nightShare)} de ton écoute tombe entre minuit et 5 h${nightShare > 0.12 ? loc`. Un vrai oiseau de nuit.` : '.'}`}</p></div>`);
  S.push(`<div class="s-center"><p class="s-kick a1">${loc`Ton record`}</p><h1 class="s-giant num a2">${dur(st.bestDay.sec)}</h1><p class="s-big a3">${loc`le ${dateFr(st.bestDay.day)}`}</p>
    <p class="s-p a4">${loc`Et ta plus longue série : ${fmt(st.streak.len)} jours d'affilée avec de la musique.`}</p></div>`);
  S.push(`<div class="s-center"><p class="s-kick a1">${loc`Ton profil d'auditeur`}</p><h1 class="s-name a2">${persona.name}</h1><p class="s-p a3">${persona.text}</p></div>`);
  S.push(`<div class="s-sum"><p class="s-kick a1">${isAll ? loc`Ton historique en résumé` : loc`Ton ${label} en résumé`}</p>
    <div class="sum-grid a2">
      <div>${loc`<small>Artistes</small>`}<ol>${A.map(e => `<li>${esc(DB.artists[e.id])}</li>`).join('')}</ol></div>
      <div>${loc`<small>Titres</small>`}<ol>${T.map(e => `<li>${esc(DB.tracks[e.id])}</li>`).join('')}</ol></div>
      <div>${loc`<small>Minutes</small>`}<b class="num">${fmt(minutes)}</b></div>
      <div>${loc`<small>Profil</small><b>${persona.name}</b>`}</div>
    </div><p class="a3"><button type="button" class="s-btn s-png">${loc`Enregistrer en image`}</button></p></div>`);
  S.summary = {
    title: isAll ? loc`Tout mon Spotify` : loc`Mon ${label} sur Spotify`,
    sub: isAll ? `${dateFr(range.from, true)} → ${dateFr(range.to, true)}` : loc`Wrapped perso`,
    artists: A.map(e => DB.artists[e.id]), tracks: T.map(e => [DB.tracks[e.id], DB.artists[DB.trackArtist[e.id]]]),
    minutes: Math.round(minutes), persona: persona.name, topAlbum: DB.albums[AL[0].id],
    file: loc`wrapped-${isAll ? 'tout' : label}.png`,
  };
  return S;
}
const ys = () => years();

function personaOf(st, top, nDisc) {
  const share = top.sec / st.sec, skip = st.skips / st.plays, perHour = st.nArtists / Math.max(1, st.sec / 3600);
  if (share > 0.3) return { name: loc`Le fidèle`, text: loc`Près d'un tiers de ton écoute pour un seul artiste. Quand tu aimes, tu ne fais pas semblant.` };
  if (skip > 0.35) return { name: loc`Le zappeur`, text: loc`Tu passes ${pct(skip)} des titres avec le bouton Suivant. Tu sais ce que tu veux, et vite.` };
  if (nDisc > 120 || perHour > 0.9) return { name: loc`L'explorateur`, text: loc`${fmt(st.nArtists)} artistes différents. Tu passes ton temps à chercher le prochain son.` };
  if (st.night / st.sec > 0.15) return { name: loc`L'oiseau de nuit`, text: loc`Une grosse part de ton écoute se passe après minuit.` };
  if (share > 0.15) return { name: loc`Le passionné`, text: loc`Un artiste en tête bien installé, mais toujours de la place pour le reste.` };
  return { name: loc`L'éclectique`, text: loc`Pas de favori écrasant : ton écoute se répartit sur beaucoup d'artistes.` };
}

function hoursBars(heat) {
  const v = [];
  for (let h = 0; h < 24; h++) { let s = 0; for (let d = 0; d < 7; d++) s += heat[d * 24 + h]; v.push(s); }
  const max = Math.max(...v) || 1;
  return v.map((s, h) => `<span style="--h:${(s / max).toFixed(3)}" title="${h} h"></span>`).join('');
}

function openStory(ctx, range, label) {
  const slides = buildSlides(ctx, range, label);
  const el = document.createElement('div');
  el.className = 'story-ov';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', loc`Wrapped ${label}`);
  el.innerHTML = `<div class="story">
    <div class="s-prog">${slides.map(() => '<span><i></i></span>').join('')}</div>
    <button type="button" class="s-close" aria-label="${loc`Fermer`}">×</button>
    <button type="button" class="s-pause" aria-label="${loc`Pause`}">❚❚</button>
    ${slides.map((s, i) => `<div class="slide" style="--bg:${BG[(i + (label === 'tout' ? 0 : label)) % BG.length]}">${s}</div>`).join('')}
    <div class="s-nav"><button type="button" class="s-prev" aria-label="${loc`Précédent`}"></button><button type="button" class="s-next" aria-label="${loc`Suivant`}"></button></div>
  </div>`;
  document.body.appendChild(el);
  document.body.classList.add('no-scroll');
  const els = el.querySelectorAll('.slide'), bars = el.querySelectorAll('.s-prog i');
  let i = 0, t0 = 0, elapsed = 0, paused = false, raf = 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const show = n => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    els.forEach((s, k) => s.classList.toggle('on', k === i));
    bars.forEach((b, k) => { b.style.transform = `scaleX(${k < i ? 1 : 0})`; });
    elapsed = 0; t0 = performance.now();
    const c = els[i].querySelector('[data-count]');
    if (c) countUp(c, +c.dataset.count, reduce);
  };
  const tick = now => {
    if (!paused) {
      const p = (elapsed + now - t0) / SLIDE_MS;
      bars[i].style.transform = `scaleX(${Math.min(1, p)})`;
      if (p >= 1) { if (i < slides.length - 1) show(i + 1); else { paused = true; el.querySelector('.s-pause').textContent = '▶'; } }
    }
    raf = requestAnimationFrame(tick);
  };
  const setPause = v => {
    if (v === paused) return;
    if (v) elapsed += performance.now() - t0; else t0 = performance.now();
    paused = v;
    el.querySelector('.s-pause').textContent = v ? '▶' : '❚❚';
  };
  const close = () => { location.hash = '#/wrapped'; };
  let downAt = 0;
  el.querySelector('.s-nav').addEventListener('pointerdown', () => { downAt = performance.now(); setPause(true); });
  el.querySelector('.s-nav').addEventListener('pointerup', e => {
    const long = performance.now() - downAt > 300;
    setPause(false);
    if (long) return;
    if (e.target.closest('.s-next')) show(i + 1); else if (e.target.closest('.s-prev')) show(i - 1);
  });
  el.querySelector('.s-close').addEventListener('click', close);
  el.querySelector('.s-png')?.addEventListener('click', e => { e.stopPropagation(); exportPng(slides.summary, e.currentTarget); });
  el.querySelector('.s-pause').addEventListener('click', () => setPause(!paused));
  const onKey = e => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'p') setPause(!paused);
  };
  const onVis = () => setPause(document.hidden);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  show(0);
  raf = requestAnimationFrame(tick);
  store.set('last-wrapped', label);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('no-scroll');
    el.remove();
  };
}

function countUp(node, target, reduce) {
  if (reduce) { node.textContent = fmt(target); return; }
  const t0 = performance.now(), d = 1400;
  const step = now => {
    const p = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - p, 3);
    node.textContent = fmt(target * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- export en image (1080 × 1920, format story) ----------
async function exportPng(d, btn) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  try { await document.fonts.ready; } catch { /* rien */ }
  const bg = g.createRadialGradient(W * 0.85, 0, 50, W * 0.6, H * 0.3, H);
  bg.addColorStop(0, '#6B4FD8'); bg.addColorStop(0.45, '#2A1E6B'); bg.addColorStop(1, '#120F24');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // Barres décoratives, rappel du logo.
  [[0.55, '#FF6B57'], [1, '#FFD166'], [0.75, '#FF6B57']].forEach(([h, col], i) => { g.fillStyle = col; g.fillRect(90 + i * 30, 170 - 70 * h, 20, 70 * h); });
  const font = (w, size, fam = 'Bricolage Grotesque') => `${w} ${size}px "${fam}", "Arial Black", sans-serif`;
  const fit = (text, max, w, size, fam) => { let s = size; g.font = font(w, s, fam); while (g.measureText(text).width > max && s > 20) { s -= 2; g.font = font(w, s, fam); } return s; };
  g.fillStyle = '#FFFFFF'; g.textBaseline = 'alphabetic';
  g.font = font(500, 34, 'JetBrains Mono'); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(d.sub.toUpperCase(), 90, 250);
  g.fillStyle = '#FFFFFF'; fit(d.title, W - 180, 800, 96); g.fillText(d.title, 90, 350);
  const col = (x, label, items, y0) => {
    g.font = font(500, 28, 'JetBrains Mono'); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(label, x, y0);
    items.forEach((it, i) => {
      const y = y0 + 80 + i * 108;
      g.font = font(800, 44); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(String(i + 1), x, y);
      const name = Array.isArray(it) ? it[0] : it;
      g.fillStyle = '#FFFFFF'; fit(name, 380, 800, 40); g.fillText(name, x + 50, y);
      if (Array.isArray(it)) { g.font = font(400, 26, 'Figtree'); g.fillStyle = 'rgba(255,255,255,.7)'; fit(it[1], 380, 400, 26, 'Figtree'); g.fillText(it[1], x + 50, y + 36); }
    });
  };
  col(90, 'ARTISTES', d.artists, 520);
  col(560, 'TITRES', d.tracks, 520);
  g.font = font(500, 28, 'JetBrains Mono'); g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillText('MINUTES', 90, 1180); g.fillText('PROFIL', 560, 1180);
  g.fillStyle = '#FFD166'; g.font = font(800, 110); g.fillText(fmt(d.minutes), 90, 1300);
  g.fillStyle = '#FFFFFF'; fit(d.persona, 440, 800, 64); g.fillText(d.persona, 560, 1290);
  g.font = font(500, 28, 'JetBrains Mono'); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('ALBUM', 90, 1440);
  g.fillStyle = '#FFFFFF'; fit(d.topAlbum, W - 180, 800, 56); g.fillText(d.topAlbum, 90, 1515);
  g.font = font(500, 26, 'JetBrains Mono'); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillText(loc`Spotify Stats · projet indépendant, non affilié à Spotify`, 90, H - 110);
  c.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = d.file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    if (btn) { const t = btn.textContent; btn.textContent = loc`Image enregistrée`; setTimeout(() => { btn.textContent = t; }, 2500); }
  }, 'image/png');
}
