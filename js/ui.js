import { DB, dayToIso, nameOf, artistOf, coverOf } from './data.js';
import { loc, LANG, LOCALE } from './i18n.js';

const EN = LANG === 'en';
export const MOIS = EN ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  : ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MOIS_LONG = EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  : ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const JOURS = EN ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
export const JOURS_LONG = EN ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const KIND_LABEL = { artist: loc`Artiste`, album: loc`Album`, track: loc`Titre` };
export const KIND_ROUTE = { artist: 'artiste', album: 'album', track: 'titre' };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 0) => Number(n).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (x, d = 0) => fmt(100 * x, d) + (EN ? '%' : ' %');
// Heure ronde : « 21 h » ou « 21:00 ».
export const hourLabel = h => (EN ? `${h}:00` : `${h} h`);
// Heure d'une minute de la journée : « 21 h 05 » ou « 21:05 ».
export const clock = m => { const x = Math.floor(m) % 1440, h = Math.floor(x / 60), mm = String(x % 60).padStart(2, '0'); return EN ? `${h}:${mm}` : `${h} h ${mm}`; };
// Nombre de jours court : « 12 j » ou « 12 d ».
export const daysShort = n => `${fmt(n)} ${EN ? 'd' : 'j'}`;

// Durée lisible à partir de secondes : « 467 h », « 3 h 20 », « 12 min ».
export function dur(sec, mode = 'auto') {
  const h = sec / 3600;
  if (mode === 'h' || h >= 100) return fmt(h) + ' h';
  if (h >= 1) {
    const tot = Math.round(sec / 60), hh = Math.floor(tot / 60), mm = tot % 60;
    if (EN) return mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh} h`;
    return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
  }
  const m = sec / 60;
  if (m >= 1) return fmt(m) + ' min';
  return fmt(sec) + ' s';
}

export function dateFr(day, short = false) {
  const [y, m, d] = dayToIso(day).split('-');
  return short ? `${+d} ${MOIS[+m - 1]} ${y}` : `${+d} ${MOIS_LONG[+m - 1]} ${y}`;
}
export const minuteToDay = m => Math.floor(m / 1440);
export const dateOfMinute = (m, short = true) => (m < 0 ? '—' : dateFr(minuteToDay(m), short));
export const monthLabel = mk => `${MOIS[mk % 12]} ${Math.floor(mk / 12)}`;

export function href(kind, id) { return `#/${KIND_ROUTE[kind]}/${id}`; }
export function link(kind, id, cls = '') {
  return `<a class="${cls}" href="${href(kind, id)}">${esc(nameOf(kind, id))}</a>`;
}
// Nom + sous-titre artiste pour titres et albums.
export function entityCell(kind, id, withThumb = true) {
  const sub = kind === 'artist' ? '' : `<small>${link('artist', artistOf(kind, id))}</small>`;
  const t = withThumb ? thumb(kind, id, 'sm') : '';
  return `<span class="ent-row">${t}<span class="ent">${link(kind, id, 'ent-name')}${sub}</span></span>`;
}

// Vignette : pochette si disponible, sinon initiales sur une couleur stable.
export function thumb(kind, id, size = 'sm') {
  const url = coverOf(kind, id);
  const round = kind === 'artist' ? ' round' : '';
  if (url) return `<img class="thumb ${size}${round}" src="${url}" alt="" loading="lazy" decoding="async">`;
  const name = nameOf(kind, id) || '?';
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '♪';
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="thumb ${size}${round} ph" style="--h:${h % 360}" aria-hidden="true">${esc(letters)}</span>`;
}
export function spotifyUrl(trackId) {
  const u = DB.trackUri[trackId];
  return u ? `https://open.spotify.com/track/${u}` : null;
}

export function delta(cur, prev) {
  if (!prev) return '';
  const r = cur / prev - 1;
  const cls = r > 0.005 ? 'up' : r < -0.005 ? 'down' : 'flat';
  const txt = cls === 'flat' ? '≈ ' + pct(0) : `${r > 0 ? '+' : '−'}${pct(Math.abs(r))}`;
  return `<span class="delta ${cls}" title="${loc`Par rapport à la période précédente de même durée`}">${txt}</span>`;
}

export function kpi(value, label, extra = '') {
  return `<div class="kpi"><div class="kpi-v num">${value}</div><div class="kpi-k">${label}</div>${extra ? `<div class="kpi-x">${extra}</div>` : ''}</div>`;
}

export const store = {
  get(k, def) { try { const v = localStorage.getItem('sps:' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('sps:' + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

export function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = a => a[Math.floor(Math.random() * a.length)];

// Couleurs fixes pour les artistes « d'ère » : les plus écoutés de tout l'historique.
const ERA_COLORS = ['#FF6B57', '#E8457A', '#FFD166', '#6EC5FF', '#B892FF', '#5EE6A8', '#FF9F43', '#F78FB3'];
let eraMap = null;
export function eraColor(artistId) {
  if (!eraMap) eraMap = new Map();
  return eraMap.get(artistId) || 'var(--e-other)';
}
export function setEraArtists(ids) {
  eraMap = new Map(ids.slice(0, ERA_COLORS.length).map((id, i) => [id, ERA_COLORS[i]]));
}
export function eraLegend() {
  if (!eraMap) return '';
  return [...eraMap].map(([id, c]) => `<span><i style="background:${c}"></i>${esc(DB.artists[id])}</span>`).join('') +
    `<span><i style="background:var(--e-other)"></i>${loc`Autres`}</span>`;
}
