// Traduction de l'interface (français par défaut, anglais).
// Le texte français sert de clé : loc`Bonjour ${nom}` cherche « Bonjour {0} » dans le dictionnaire.
import EN from './i18n-en.js';

const KEY = 'sps:lang';
const SUPPORTED = ['fr', 'en'];

function detect() {
  const url = new URLSearchParams(location.search).get('lang');
  if (SUPPORTED.includes(url)) { try { localStorage.setItem(KEY, url); } catch { /* rien */ } return url; }
  try { const s = localStorage.getItem(KEY); if (SUPPORTED.includes(s)) return s; } catch { /* rien */ }
  return (navigator.languages || [navigator.language || 'fr']).some(l => /^fr\b/i.test(l)) ? 'fr' : 'en';
}

export const LANG = detect();
export const LOCALE = LANG === 'en' ? 'en-GB' : 'fr';
const DICT = LANG === 'en' ? EN : null;

// Clés absentes du dictionnaire, pour les repérer pendant le développement.
const missing = new Set();
if (typeof window !== 'undefined') window.__i18nMissing = missing;

function fill(str, vals) {
  return str.replace(/\{(\d+)\}/g, (_, i) => (vals[+i] ?? ''));
}

// Étiquette de gabarit : loc`texte ${x}` ou loc('texte').
export function loc(strings, ...vals) {
  if (typeof strings === 'string') strings = [strings];
  if (!DICT) {
    let s = strings[0];
    for (let i = 0; i < vals.length; i++) s += vals[i] + strings[i + 1];
    return s;
  }
  const key = strings.map((q, i) => q + (i < vals.length ? `{${i}}` : '')).join('');
  const tr = DICT[key];
  if (tr == null) { missing.add(key); return fill(key, vals); }
  return fill(tr, vals);
}

// Pluriel simple : plural(n, 'écoute', 'écoutes').
export function plural(n, one, many) {
  return Math.abs(n) >= 2 || (LANG === 'en' && n === 0) ? loc(many) : loc(one);
}

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* rien */ }
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  location.href = u.toString();
}

// Bouton FR / EN.
export function langSwitch() {
  return `<span class="lang" role="group" aria-label="Language">${SUPPORTED.map(l =>
    `<button type="button" class="lang-b${l === LANG ? ' on' : ''}" data-lang="${l}" lang="${l}" aria-pressed="${l === LANG}">${l.toUpperCase()}</button>`).join('')}</span>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (b && b.dataset.lang !== LANG) setLang(b.dataset.lang);
});

// Textes fixes de index.html : data-i18n (contenu) et data-i18n-attr="placeholder,aria-label".
export function applyStatic(root = document) {
  document.documentElement.lang = LANG;
  if (!DICT) return;
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.innerHTML.replace(/\s+/g, ' ').trim();
    const tr = DICT[key];
    if (tr != null) el.innerHTML = tr; else missing.add(key);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach(el => {
    for (const a of el.dataset.i18nAttr.split(',')) {
      const v = el.getAttribute(a);
      if (v) { const tr = DICT[v]; if (tr != null) el.setAttribute(a, tr); else missing.add(v); }
    }
  });
  const d = document.querySelector('meta[name="description"]');
  if (d && DICT[d.content]) d.content = DICT[d.content];
}
