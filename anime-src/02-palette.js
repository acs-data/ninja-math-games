/* ═══ 02-palette.js — couleurs de l'univers et du personnage, corrigées par thème ═══
   Source : UNIVERSES[currentUniverse].color et CHARS[state.char].color (jamais --orange, qui est
   périmée après une restauration de sauvegarde). Chaque couleur d'effet est rapprochée du noir
   (thème clair) ou du blanc (thème sombre) jusqu'à un contraste >= 3:1 avec le fond de page. */

var PAGE_BG = { dark: '#0D0D1A', light: '#F5F5F7' };      // --dark du jeu dans chaque thème
var INK = { dark: '#F0F0FF', light: '#1A1A2E' };          // --white du jeu (texte) dans chaque thème
var GENERIC = { color: '#5C9DFF', emoji: '✨', name: '', hero: 'héros', power: 'pouvoir', currency: 'énergie' };

function rgb(c) {
  if (typeof c !== 'string') return c;
  var h = c.charAt(0) === '#' ? c.slice(1) : c, n;
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  n = parseInt(h, 16);
  return h.length === 6 && n === n ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [92, 157, 255];
}
function hex(a) {
  return '#' + (16777216 + (Math.round(a[0]) << 16) + (Math.round(a[1]) << 8) + Math.round(a[2])).toString(16).slice(1).toUpperCase();
}
function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function lum(c) { c = rgb(c); return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(a, b, t) {
  a = rgb(a); b = rgb(b);
  return hex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
/* Corrige une couleur pour un thème : contraste >= min (3 par défaut) avec le fond de page. */
function fix(c, theme, min) {
  var bg = PAGE_BG[theme] || PAGE_BG.dark, to = theme === 'light' ? '#000000' : '#FFFFFF', t = 0, out = hex(rgb(c));
  while (contrast(out, bg) < (min || 3) && t < 1) { t += 0.04; out = mix(c, to, t); }
  return out;
}
FX.color = {
  rgb: rgb, hex: hex, lum: lum, contrast: contrast, mix: mix, fix: fix,
  alpha: function (c, a) { c = rgb(c); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
};

/* Geste d'attaque générique par univers (formes abstraites uniquement). Clé inconnue : 'impact'. */
FX.STYLES = { naruto: 'vortex', onepiece: 'stretch', dragonball: 'beam', myhero: 'impact', demonslayer: 'crescent', pokemon: 'bolt' };

/* FX.palette() -> objet mis en cache par (univers, personnage, thème). Ne lève jamais.
   u, c       : couleurs univers / personnage corrigées (>= 3:1 sur bg)   uRaw, cRaw : brutes
   good, warn, calm : vert / ambre / bleu doux corrigés                    set : [u, c, good, warn, calm]
   bg, ink    : fond de page et couleur de texte du thème                  light : booléen
   style      : 'vortex' | 'stretch' | 'beam' | 'impact' | 'crescent' | 'bolt'
   universe, uniName, uniEmoji, hero, power, currency, char, heroName, heroEmoji */
var palCache = null;
FX.palette = function () {
  var key, uk = FX.game.universe(), st = FX.game.state(), ck = st && st.char, th = FX.game.theme();
  key = uk + '|' + ck + '|' + th;
  if (palCache && palCache.key === key) return palCache;
  var u = FX.game.uni() || GENERIC, ch = FX.game.char() || {}, uRaw = u.color || GENERIC.color, cRaw = ch.color || uRaw;
  var p = {
    key: key, theme: th, light: th === 'light', bg: PAGE_BG[th], ink: INK[th],
    uRaw: uRaw, cRaw: cRaw, u: fix(uRaw, th), c: fix(cRaw, th),
    good: fix('#00E676', th), warn: fix('#FFB300', th), calm: fix('#5C9DFF', th),
    style: (uk && FX.STYLES.hasOwnProperty(uk) && FX.STYLES[uk]) || 'impact',
    universe: uk, uniName: u.name || '', uniEmoji: u.emoji || GENERIC.emoji, hero: u.hero || GENERIC.hero,
    power: u.powerName || GENERIC.power, currency: u.currency || GENERIC.currency,
    char: ck || null, heroName: ch.name || '', heroEmoji: ch.emoji || u.emoji || GENERIC.emoji
  };
  p.set = [p.u, p.c, p.good, p.warn, p.calm];
  palCache = p;
  if (root) FX.paint(root);
  return p;
};
/* Pose les variables --fx-u, --fx-c, --fx-ink, --fx-bg sur un nœud FX (jamais sur un nœud du jeu). */
FX.paint = function (el) {
  var p = palCache || FX.palette(), s = el && el.style;
  if (!s || !isOwn(el)) return;
  s.setProperty('--fx-u', p.u); s.setProperty('--fx-c', p.c);
  s.setProperty('--fx-ink', p.ink); s.setProperty('--fx-bg', p.bg);
};
