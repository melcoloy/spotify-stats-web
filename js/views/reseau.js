import { DB, coListenGraph, louvain } from '../data.js';
import { esc, fmt, dur, store, href } from '../ui.js';
import { section } from './common.js';
import { loc } from '../i18n.js';

const PALETTE = ['#FF6B57', '#FFD166', '#6EC5FF', '#B892FF', '#5EE6A8', '#E8457A', '#FF9F43', '#9AD0EC', '#F78FB3', '#C9E265'];

export function render(root, ctx) {
  const size = store.get('net-size', 80);
  const g = coListenGraph(ctx.range, size);
  if (g.nodes.length < 3 || !g.edges.length) {
    root.innerHTML = `<div class="page"><header class="page-h"><h1>${loc`Ton réseau d'artistes`}</h1></header><div class="empty-page"><p>${loc`Pas assez de sessions sur cette période pour relier tes artistes. Élargis la période.`}</p></div></div>`;
    return;
  }
  const comm = louvain(g.nodes.length, g.edges);
  // Communautés triées par temps d'écoute, nommées d'après leur artiste principal.
  const groups = new Map();
  g.nodes.forEach((nd, i) => { const c = comm[i]; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(nd); });
  const clusters = [...groups.values()].map(list => ({ list: list.sort((a, b) => b.sec - a.sec), sec: list.reduce((x, n) => x + n.sec, 0) }))
    .sort((a, b) => b.sec - a.sec);
  clusters.forEach((c, ci) => { c.color = c.list.length > 1 ? PALETTE[ci % PALETTE.length] : '#5A5385'; c.list.forEach(n => { n.c = ci; }); });
  const multi = clusters.filter(c => c.list.length > 1);
  const degree = new Map();
  g.edges.forEach(e => { degree.set(e.a, (degree.get(e.a) || 0) + 1); degree.set(e.b, (degree.get(e.b) || 0) + 1); });
  const bridges = g.nodes.map((n, i) => {
    const cs = new Set(g.edges.filter(e => e.a === i || e.b === i).map(e => g.nodes[e.a === i ? e.b : e.a].c));
    cs.delete(n.c);
    return { n, k: cs.size };
  }).filter(x => x.k >= 2).sort((a, b) => b.k - a.k || b.n.sec - a.n.sec).slice(0, 6);

  root.innerHTML = `<div class="page">
    <header class="page-h"><div class="eyebrow">${esc(ctx.periodLabel)}</div><h1>${loc`Ton réseau d'artistes`}</h1>
      <p class="lede">${loc`Deux artistes sont reliés quand tu les écoutes souvent dans les mêmes sessions. L'algorithme de Louvain regroupe ensuite les artistes en communautés : tes « blocs » musicaux. Plus le trait est épais, plus le lien est fort.`}</p></header>
    <div class="toolbar"><label class="filter small" for="netSize">${loc`Artistes affichés`} <select id="netSize">${[40, 80, 120].map(v => `<option value="${v}" ${v === size ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <span class="note">${loc`${fmt(g.nSessions)} sessions analysées · ${fmt(g.edges.length)} liens · ${multi.length} communautés`}</span></div>
    <div class="net-wrap"><canvas id="net" aria-label="${loc`Graphe des artistes écoutés ensemble`}"></canvas><p class="net-help">${loc`Survole un artiste pour voir ses liens, clique pour ouvrir sa page, glisse pour le déplacer.`}</p></div>
    ${section(loc`Tes communautés`, `<div class="clusters">${multi.map(c => `<div class="cluster" style="--c:${c.color}">
        <div class="cl-h">${loc`<b>Bloc ${esc(DB.artists[c.list[0].id])}</b>`}<span class="num">${dur(c.sec)}</span></div>
        <p>${c.list.slice(0, 10).map(n => `<a href="${href('artist', n.id)}">${esc(DB.artists[n.id])}</a>`).join(', ')}${c.list.length > 10 ? ` ${loc`et ${c.list.length - 10} autres`}` : ''}</p></div>`).join('')}</div>`, { eyebrow: loc`Détectées automatiquement` })}
    ${bridges.length ? section(loc`Les passerelles`, `<p class="lede">${loc`Ces artistes font le lien entre plusieurs de tes blocs.`}</p><ul class="bridges">${bridges.map(b => `<li><a href="${href('artist', b.n.id)}">${esc(DB.artists[b.n.id])}</a><span>${loc`relié à ${b.k + 1} communautés`}</span></li>`).join('')}</ul>`, { eyebrow: loc`Entre les blocs` }) : ''}
  </div>`;
  root.querySelector('#netSize').addEventListener('change', e => { store.set('net-size', +e.target.value); ctx.rerender(); });
  return draw(root.querySelector('#net'), g, clusters);
}

function draw(canvas, g, clusters) {
  const N = g.nodes.length;
  const maxSec = Math.max(...g.nodes.map(n => n.sec));
  const nodes = g.nodes.map((n, i) => ({ ...n, r: 4 + 18 * Math.sqrt(n.sec / maxSec), x: Math.cos(i * 2.4) * (50 + i * 3), y: Math.sin(i * 2.4) * (50 + i * 3), vx: 0, vy: 0 }));
  const maxW = Math.max(...g.edges.map(e => e.w));
  const adj = Array.from({ length: N }, () => new Set());
  g.edges.forEach(e => { adj[e.a].add(e.b); adj[e.b].add(e.a); });
  // Un artiste sans aucun lien n'apporte rien au graphe et partirait au bord : on ne l'affiche pas.
  nodes.forEach((n, i) => { n.lonely = adj[i].size === 0; });
  // Pour la disposition, chaque artiste ne garde que ses 6 liens les plus forts : sinon un graphe dense
  // se tasse en une pelote illisible. Tous les liens restent dessinés.
  const strongest = Array.from({ length: N }, () => []);
  g.edges.forEach((e, k) => { strongest[e.a].push(k); strongest[e.b].push(k); });
  const keep = new Set();
  strongest.forEach(list => list.sort((x, y) => g.edges[y].w - g.edges[x].w).slice(0, 6).forEach(k => keep.add(k)));
  const springs = g.edges.filter((_, k) => keep.has(k));
  const REPEL = 900 * Math.min(2, Math.max(1, springs.length / N / 3));

  // Simulation de forces simple : répulsion, ressorts sur les liens, attraction vers le centre de la communauté.
  const step = alpha => {
    const cx = new Map();
    for (const n of nodes) { const c = cx.get(n.c) || { x: 0, y: 0, k: 0 }; c.x += n.x; c.y += n.y; c.k++; cx.set(n.c, c); }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.lonely || b.lonely) continue;
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy + 0.01;
      const min = a.r + b.r + 6;
      const f = REPEL / d2 + (d2 < min * min ? 0.6 * (min - Math.sqrt(d2)) / Math.sqrt(d2) : 0);
      dx *= f; dy *= f;
      a.vx -= dx * alpha; a.vy -= dy * alpha; b.vx += dx * alpha; b.vy += dy * alpha;
    }
    for (const e of springs) {
      const a = nodes[e.a], b = nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = 60 + (a.r + b.r), k = 0.02 + 0.08 * e.w / maxW;
      const f = (d - target) * k / d;
      a.vx += dx * f * alpha; a.vy += dy * f * alpha; b.vx -= dx * f * alpha; b.vy -= dy * f * alpha;
    }
    for (const n of nodes) {
      const c = cx.get(n.c);
      if (n.lonely) continue;
      n.vx += ((c.x / c.k) - n.x) * 0.01 * alpha - n.x * 0.004 * alpha;
      n.vy += ((c.y / c.k) - n.y) * 0.01 * alpha - n.y * 0.004 * alpha;
      if (n.fixed) { n.vx = n.vy = 0; continue; }
      n.x += n.vx; n.y += n.vy; n.vx *= 0.6; n.vy *= 0.6;
    }
  };
  for (let t = 0; t < 400; t++) step(1 - t / 450);

  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, scale = 1, ox = 0, oy = 0, hover = -1, drag = -1, raf = 0, moved = false;
  const css = getComputedStyle(document.documentElement);
  const col = name => css.getPropertyValue(name).trim();
  const fit = () => {
    const r = canvas.parentElement.getBoundingClientRect();
    W = r.width; H = Math.max(420, Math.min(720, r.width * 0.68));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shown = nodes.filter(n => !n.lonely);
    const xs = shown.map(n => n.x), ys = shown.map(n => n.y);
    const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30;
    scale = Math.min(W / (maxX - minX), H / (maxY - minY));
    ox = W / 2 - scale * (minX + maxX) / 2; oy = H / 2 - scale * (minY + maxY) / 2;
    paint();
  };
  const sx = n => ox + n.x * scale, sy = n => oy + n.y * scale;
  const paint = () => {
    ctx.clearRect(0, 0, W, H);
    const focus = hover >= 0 ? hover : drag;
    for (const e of g.edges) {
      const a = nodes[e.a], b = nodes[e.b];
      const on = focus < 0 || e.a === focus || e.b === focus;
      ctx.strokeStyle = a.c === b.c ? clusters[a.c].color : col('--dim');
      ctx.globalAlpha = on ? (focus >= 0 ? 0.85 : 0.25 + 0.4 * e.w / maxW) : 0.04;
      ctx.lineWidth = 0.6 + 3.4 * e.w / maxW;
      ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    nodes.forEach((n, i) => {
      if (n.lonely) return;
      const on = focus < 0 || i === focus || adj[focus].has(i);
      ctx.globalAlpha = on ? 1 : 0.18;
      ctx.fillStyle = clusters[n.c].color;
      ctx.beginPath(); ctx.arc(sx(n), sy(n), n.r * Math.min(1.4, Math.max(0.7, scale)), 0, Math.PI * 2); ctx.fill();
      if (i === focus) { ctx.lineWidth = 2; ctx.strokeStyle = col('--fg'); ctx.stroke(); }
    });
    ctx.textAlign = 'center';
    nodes.forEach((n, i) => {
      if (n.lonely) return;
      const on = focus < 0 ? n.r > 9 : (i === focus || adj[focus].has(i));
      if (!on) return;
      ctx.globalAlpha = 1;
      ctx.font = `${i === focus ? 700 : 500} ${i === focus ? 14 : 12}px Figtree, system-ui, sans-serif`;
      const y = sy(n) - n.r * Math.min(1.4, Math.max(0.7, scale)) - 5;
      ctx.lineWidth = 4; ctx.strokeStyle = col('--ink'); ctx.strokeText(DB.artists[n.id], sx(n), y);
      ctx.fillStyle = col('--fg'); ctx.fillText(DB.artists[n.id], sx(n), y);
    });
    ctx.globalAlpha = 1;
  };
  const pick = ev => {
    const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = -1, bd = 1e9;
    nodes.forEach((n, i) => { if (n.lonely) return; const d = Math.hypot(sx(n) - x, sy(n) - y); if (d < n.r * Math.max(0.7, scale) + 6 && d < bd) { bd = d; best = i; } });
    return { i: best, x, y };
  };
  const onMove = ev => {
    if (drag >= 0) {
      const r = canvas.getBoundingClientRect();
      const n = nodes[drag];
      n.x = (ev.clientX - r.left - ox) / scale; n.y = (ev.clientY - r.top - oy) / scale; n.fixed = true; moved = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { for (let t = 0; t < 3; t++) step(0.15); paint(); });
      return;
    }
    const p = pick(ev);
    if (p.i !== hover) { hover = p.i; canvas.style.cursor = hover >= 0 ? 'pointer' : 'default'; paint(); }
    canvas.title = hover >= 0 ? loc`${DB.artists[nodes[hover].id]} — ${dur(nodes[hover].sec)}, ${adj[hover].size} liens` : '';
  };
  const onDown = ev => { const p = pick(ev); if (p.i >= 0) { drag = p.i; moved = false; canvas.setPointerCapture(ev.pointerId); } };
  const onUp = () => {
    if (drag >= 0 && !moved) location.hash = href('artist', nodes[drag].id);
    if (drag >= 0) nodes[drag].fixed = false;
    drag = -1; paint();
  };
  const onLeave = () => { if (drag < 0) { hover = -1; paint(); } };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  const ro = new ResizeObserver(fit);
  ro.observe(canvas.parentElement);
  fit();
  return () => { ro.disconnect(); cancelAnimationFrame(raf); };
}
