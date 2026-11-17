/* ═══ 01-engine.js — moteur : canvas de particules, formes, WAAPI, nœuds de scène, teinte ═══
   Coordonnées : celles de la fenêtre (getBoundingClientRect), en px CSS. Rien ici n'écrit de
   style en ligne sur un élément du jeu ni ne prend le focus. La boucle rAF ne tourne que s'il
   reste quelque chose à dessiner. Référence complète des options : anime-src/README.md. */

var root = null, cv = null, c2d = null, stage = null, tintEl = null;
var vw = 0, vh = 0, dpr = 1, sizeDirty = true, canvasOn = false;

function measure() {
  vw = ROOT.clientWidth; vh = ROOT.clientHeight;      // pas window.innerWidth (faux sur petits téléphones)
  dpr = Math.min(W.devicePixelRatio || 1, 2);
  sizeDirty = false;
  if (!cv) return;
  var w = Math.round(vw * dpr), h = Math.round(vh * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
}
FX.vw = function () { if (sizeDirty) measure(); return vw; };
FX.vh = function () { if (sizeDirty) measure(); return vh; };

/* ── Géométrie : FX.rect(cible) -> { x, y, w, h, cx, cy, inView } | null, ne lève jamais.
   cible = élément, sélecteur CSS, nom d'ancre (FX.defAnchor) ou objet { x, y, w, h }. ── */
var anchors = {
  center: function () { return { x: 0, y: 0, w: FX.vw(), h: FX.vh() }; },
  screen: function () { return D.getElementById('screen-' + S.screen); },
  header: 'header[role="banner"]', logo: '#main-logo',
  score: '#hud-score', streak: '#hud-streak', level: '#hud-level'
};
FX.defAnchor = function (name, target) { anchors[name] = target; };
FX.rect = function (t) {
  try {
    if (typeof t === 'string') {
      if (anchors.hasOwnProperty(t)) t = typeof anchors[t] === 'function' ? anchors[t]() : anchors[t];
      if (typeof t === 'string') t = D.querySelector(t);
    }
    if (!t) return null;
    var r = t.getBoundingClientRect ? t.getBoundingClientRect() : t;
    var x = r.left != null ? r.left : r.x, y = r.top != null ? r.top : r.y;
    var w = r.width != null ? r.width : r.w, h = r.height != null ? r.height : r.h;
    if (!(w > 0 || h > 0) || x !== x || y !== y) return null;      // display:none, détaché, NaN
    return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2,
             inView: y + h > 0 && y < FX.vh() && x + w > 0 && x < FX.vw() };
  } catch (e) { return null; }
};
/* Crée un nœud FX décoratif (aria-hidden, insensible au pointeur). Ses classes commencent par « fx- ». */
FX.el = function (tag, cls, parent, text) {
  var el = D.createElement(tag);
  if (cls) el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  el.style.pointerEvents = 'none';
  if (text != null) el.textContent = text;
  if (parent) parent.appendChild(el);
  return el;
};
function isOwn(el) {
  return (root && root.contains(el)) || (el.id && el.id.indexOf('fx-') === 0) ||
         (typeof el.className === 'string' && /(^|\s)fx-/.test(el.className));
}
function scopeOf(o) { return o.scope === undefined ? 'screen' : o.scope; }

/* ── Particules : bassin d'objets préalloués, aucune allocation par frame ── */
var CAP = 160, P = [], pn = 0, KINDS = { dot: 0, streak: 1, rect: 2, star: 3, glyph: 4 };
while (P.length < CAP) P.push({ x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 0, s: 0, k: 0, c: '', sc: '', g: 0, dr: 0, d: 0, r: 0, vr: 0 });

/* Particules autorisées maintenant : plafond du profil et du niveau, moins les vivantes.
   Au niveau léger un effet garde environ un tiers de ses particules (8 au plus). */
function count(n, lv) {
  var cap = (FX.CAPS[S.profile] || FX.CAPS.home).p[lv - 1] || 0;
  if (lv < 2) n = Math.min(8, Math.max(1, Math.round(n * 0.35)));
  return Math.max(0, Math.min(n, Math.min(cap, CAP) - pn));
}
/* Porte commune des émetteurs : niveau, plafonds, journal. each(p, i, n) complète la particule. */
function shoot(name, o, n, each) {
  var lv = gate(o), i, p, sc = scopeOf(o);
  if (!lv || !(n = count(n, lv))) return 0;
  for (i = 0; i < n; i++) {
    p = P[pn++];
    p.sc = sc; p.k = KINDS[o.kind] || 0; p.s = o.size || 4; p.l = (o.life || 600) / 1000;
    p.c = o.colors ? o.colors[i % o.colors.length] : (o.color || FX.palette().c);
    p.vx = p.vy = p.g = p.dr = p.d = p.r = p.vr = 0;
    each(p, i, n);
    p.m = p.l;
  }
  if (pn > ST.peak) ST.peak = pn;
  log(name, lv, n, o.kind);
  wake();
  return n;
}
function killAt(i) { var p = P[i]; P[i] = P[--pn]; P[pn] = p; }

/* Émojis : dessinés en chaînes entières (séquences ZWJ intactes), une fois, dans un petit canvas. */
var glyphs = [];
function glyph(str, size) {
  var key = str + '|' + size, i, g, cx;
  for (i = 0; i < glyphs.length; i++) if (glyphs[i].key === key) return glyphs[i];
  if (sizeDirty) measure();
  g = D.createElement('canvas');
  g.width = g.height = Math.ceil(size * 1.5 * dpr);
  cx = g.getContext('2d');
  cx.font = Math.round(size * dpr) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText(str, g.width / 2, g.height / 2 + size * dpr * 0.06);
  if (glyphs.length >= 16) glyphs.length = 0;
  glyphs.push(g = { key: key, cv: g, s: size * 1.5 });
  return g;
}

/* ── Émetteurs (FX.fx.*) : renvoient le nombre de particules créées, 0 si filtré ── */
function dflt(v, d) { return v == null ? d : v; }
function jit(a) { return (FX.rnd() - 0.5) * 2 * a; }

FX.fx.burst = function (x, y, o) {                       // éclat radial
  o = o || {};
  return shoot('burst', o, o.n || 14, function (p) {
    var a = (o.angle || 0) + jit(dflt(o.spread, 6.2832) / 2), v = (o.speed || 220) * (0.45 + 0.55 * FX.rnd());
    p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
    p.l *= 0.6 + 0.4 * FX.rnd(); p.s *= 0.6 + 0.6 * FX.rnd();
    p.g = dflt(o.gravity, 300); p.dr = dflt(o.drag, 1.5); p.r = FX.rnd() * 6.28; p.vr = jit(5);
  });
};
FX.fx.streaks = function (x1, y1, x2, y2, o) {           // traits filant de A vers B (faisceau, rafale)
  o = o || {};
  var t = (o.ms || 260) / 1000, dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1;
  return shoot('streaks', o, o.n || 10, function (p) {
    var j = jit(dflt(o.jitter, 10));
    p.k = 1; p.s = o.size || 3; p.l = t; p.d = FX.rnd() * dflt(o.stagger, 120) / 1000;
    p.x = x1 - dy / len * j; p.y = y1 + dx / len * j; p.vx = dx / t; p.vy = dy / t;
  });
};
FX.fx.trail = function (pts, o) {                        // étincelles le long d'une polyligne [[x, y], …]
  o = o || {};
  var segs = pts.length - 1;
  if (segs < 1) return 0;
  return shoot('trail', o, o.n || 24, function (p, i, n) {
    var f = (i + FX.rnd()) / n * segs, k = Math.min(segs - 1, Math.floor(f)), a = pts[k], b = pts[k + 1];
    f -= k;
    p.k = dflt(KINDS[o.kind], 3); p.s = o.size || 3; p.l = (o.life || 500) / 1000;
    p.x = a[0] + (b[0] - a[0]) * f + jit(dflt(o.jitter, 5)); p.y = a[1] + (b[1] - a[1]) * f + jit(dflt(o.jitter, 5));
    p.vx = jit(15); p.vy = -10 - FX.rnd() * 30; p.g = 40; p.dr = 1; p.vr = 2;
    p.d = i / n * dflt(o.stagger, 300) / 1000;
  });
};
FX.fx.confetti = function (o) {                          // pluie depuis le haut, ou jet depuis o.from
  o = o || {};
  var r = o.from && o.from !== 'top' ? FX.rect(o.from) : null, w = FX.vw(),
      cols = o.colors || (o.color ? [o.color] : FX.palette().set);
  return shoot('confetti', o, o.n || 60, function (p, i) {
    p.k = 2; p.c = cols[i % cols.length]; p.s = 5 + FX.rnd() * 4; p.l = (o.ms || 1800) / 1000 * (0.7 + 0.3 * FX.rnd());
    p.r = FX.rnd() * 6.28; p.vr = jit(7);
    if (r) { p.x = r.cx; p.y = r.cy; p.vx = jit(210); p.vy = -260 - FX.rnd() * 300; p.g = 620; p.dr = 1.2; p.d = FX.rnd() * 0.12; }
    else { p.x = FX.rnd() * w; p.y = -12; p.vx = jit(40); p.vy = 120 + FX.rnd() * 160; p.g = 160; p.dr = 0.6; p.d = FX.rnd() * 0.5; }
  });
};
FX.fx.sprite = function (str, x, y, o) {                 // émoji(s) volant(s)
  o = o || {};
  var n = o.n || 1;
  if (!str) return 0;
  return shoot('sprite', o, n, function (p) {
    var a = dflt(o.angle, -1.5708) + jit((o.spread || 0) / 2), v = (o.speed || 0) * (n > 1 ? 0.5 + 0.5 * FX.rnd() : 1);
    p.k = 4; p.c = glyph(String(str), o.size || 28); p.l = (o.life || 700) / 1000;
    p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
    p.g = o.gravity || 0; p.dr = o.drag || 0; p.vr = o.spin || 0;
  });
};

/* ── Formes (anneaux, entailles) : autorisées aussi en profil sobre ── */
var shapes = [];
function shape(name, o, s) {
  var lv = gate(o);
  if (!lv) return 0;
  s.c = o.color || FX.palette().c; s.t = 0; s.sc = scopeOf(o);
  if (shapes.length < 24) shapes.push(s);
  log(name, lv, 0);
  wake();
  return 1;
}
FX.fx.ring = function (x, y, o) {                        // anneau qui s'élargit
  o = o || {};
  return shape('ring', o, { k: 0, x: x, y: y, r0: dflt(o.r0, 6), r1: o.r1 || 44, w: o.width || 3, ms: o.ms || 380 });
};
FX.fx.slash = function (x1, y1, x2, y2, o) {             // entaille de A vers B ; curve = flèche de l'arc
  o = o || {};
  var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1, cu = o.curve || 0;
  return shape('slash', o, { k: 1, x: x1, y: y1, x2: x2, y2: y2, qx: (x1 + x2) / 2 - dy / len * cu,
                             qy: (y1 + y2) / 2 + dx / len * cu, w: o.width || 6, ms: o.ms || 260 });
};

/* ── Dessin ── */
function qpt(a, q, b, t) { var u = 1 - t; return u * u * a + 2 * u * t * q + t * t * b; }
function step(dt) {
  var i, p, a, s, g, sz, e, h, tl, n, f;
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  c2d.clearRect(0, 0, vw, vh);
  c2d.lineCap = 'round';
  for (i = 0; i < pn;) {
    p = P[i];
    if (p.d > 0) { p.d -= dt; i++; continue; }
    p.l -= dt;
    if (p.l <= 0) { killAt(i); continue; }
    p.vy += p.g * dt;
    if (p.dr) { a = Math.max(0, 1 - p.dr * dt); p.vx *= a; p.vy *= a; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    sz = p.s;
    c2d.globalAlpha = Math.min(1, p.l / p.m * 2.2);
    if (p.k === 1) {
      c2d.strokeStyle = p.c; c2d.lineWidth = sz;
      c2d.beginPath(); c2d.moveTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); c2d.lineTo(p.x, p.y); c2d.stroke();
    } else if (p.k === 0) {
      c2d.fillStyle = p.c; c2d.beginPath(); c2d.arc(p.x, p.y, sz / 2, 0, 6.2832); c2d.fill();
    } else {
      c2d.save(); c2d.translate(p.x, p.y); c2d.rotate(p.r);
      if (p.k === 4) { g = p.c; c2d.drawImage(g.cv, -g.s / 2, -g.s / 2, g.s, g.s); }
      else {
        c2d.fillStyle = p.c;
        if (p.k === 2) c2d.fillRect(-sz / 2, -sz / 4, sz, sz / 2 * (0.4 + Math.abs(Math.cos(p.r * 1.7))));
        else {                                   // étoile à quatre branches
          c2d.beginPath(); c2d.moveTo(0, -sz);
          c2d.quadraticCurveTo(0, 0, sz, 0); c2d.quadraticCurveTo(0, 0, 0, sz);
          c2d.quadraticCurveTo(0, 0, -sz, 0); c2d.quadraticCurveTo(0, 0, 0, -sz); c2d.fill();
        }
      }
      c2d.restore();
    }
    i++;
  }
  for (i = shapes.length - 1; i >= 0; i--) {
    s = shapes[i]; s.t += dt * 1000; f = s.t / s.ms;
    if (f >= 1) { shapes.splice(i, 1); continue; }
    c2d.strokeStyle = s.c;
    c2d.beginPath();
    if (s.k === 0) {
      e = 1 - (1 - f) * (1 - f);                 // sortie douce
      c2d.globalAlpha = 1 - f; c2d.lineWidth = s.w * (1 - f * 0.6);
      c2d.arc(s.x, s.y, s.r0 + (s.r1 - s.r0) * e, 0, 6.2832);
    } else {
      h = Math.min(1, f * 2.2); tl = Math.max(0, f * 2.2 - 1.2);     // tête et queue de l'entaille
      c2d.globalAlpha = Math.min(1, (1 - f) * 2.5); c2d.lineWidth = s.w;
      for (n = 0; n <= 8; n++) {
        a = tl + (h - tl) * n / 8;
        c2d[n ? 'lineTo' : 'moveTo'](qpt(s.x, s.qx, s.x2, a), qpt(s.y, s.qy, s.y2, a));
      }
    }
    c2d.stroke();
  }
  c2d.globalAlpha = 1;
}

/* ── Boucle : démarre au premier besoin, s'arrête dès qu'il n'y a plus rien ── */
var running = false, lastT = 0;
function showCanvas(on) {
  if (on === canvasOn || !root) return;
  canvasOn = on;
  root.classList[on ? 'add' : 'remove']('fx-live');
  if (!on && c2d) { c2d.setTransform(1, 0, 0, 1, 0, 0); c2d.clearRect(0, 0, cv.width, cv.height); }
}
function wake() {
  if (running || S.dead || !root) return;
  running = true; lastT = 0;
  requestAnimationFrame(tick);
}
function tick(t) {
  running = false;
  try {
    if (S.dead || S.pref === 'off') FX.cancel('*');
    else if (blocked()) suspend('bloqué');         // modale ouverte sans openModal, onglet caché
    else {
      if (S.suspended) resume();
      flush();
      if (pn || shapes.length) {
        if (sizeDirty) measure();
        showCanvas(true);
        step(lastT ? Math.min(t - lastT, 34) / 1000 : 0.016);
      }
    }
  } catch (e) { oops(e, 'tick'); pn = 0; shapes.length = 0; }
  lastT = t;
  if (pn || shapes.length || queue.length) { running = true; requestAnimationFrame(tick); }
  else showCanvas(false);
}

/* ── WAAPI : FX.anim(el, images, opts) -> Animation | null ──
   Sur un élément du JEU : aucun style en ligne (WAAPI n'en écrit pas), fill 'none' ou 'backwards',
   itérations finies, 3 s au plus ; refus sur html, body, #app, main et d'un transform sur .answer-btn. */
var anims = [];
function hasTransform(fr) {
  var l = fr && fr.length != null ? fr : [fr], i;
  for (i = 0; i < l.length; i++) if (l[i] && (l[i].transform != null || l[i].scale != null || l[i].translate != null || l[i].rotate != null)) return true;
  return false;
}
FX.anim = function (el, frames, o) {
  o = o || {};
  var lv = gate(o), own, a, rec, it = o.iterations || 1, dur = o.duration || 300;
  if (!lv) return null;
  if (typeof el === 'string') el = D.querySelector(el);
  if (!el || !el.animate) return null;
  if (lv < 2) { if (o.leger === false) return null; if (o.leger) frames = o.leger; }
  own = isOwn(el);
  if (!own) {
    if (el === ROOT || el === D.body || el.id === 'app' || el.tagName === 'MAIN' ||
        (el.classList.contains('answer-btn') && hasTransform(frames))) { drop('anim', 'cible interdite'); return null; }
    if (!(it > 0 && it <= 20)) it = 1;
    dur = Math.min(dur, 3000 / it);
  } else if (it === Infinity && S.profile !== 'home' && S.profile !== 'ceremony') it = 1;   // pas de boucle sur un écran de lecture
  try {
    a = el.animate(frames, { duration: dur, delay: o.delay || 0, easing: o.easing || 'ease-out', iterations: it,
      fill: own ? (o.fill || 'both') : (o.fill === 'none' ? 'none' : 'backwards') });
  } catch (e) { oops(e, 'anim'); return null; }
  rec = { a: a, scope: scopeOf(o) };
  anims.push(rec);
  a.onfinish = a.oncancel = function (ev) {
    var k = anims.indexOf(rec);
    if (k >= 0) anims.splice(k, 1);
    if (o.remove && own) dropNode(el);
    if (o.done && ev && ev.type === 'finish') { try { o.done(); } catch (e) { oops(e, 'anim:done'); } }
  };
  log('anim', lv, 0, o.name || el.id);
  return a;
};

/* ── Nœuds de scène (texte flottant, bandeau, cut-in) : enfants de #fx-stage ── */
var nodes = [], plateEl = null;
function dropNode(el) {
  var i;
  for (i = nodes.length - 1; i >= 0; i--) if (nodes[i].el === el) nodes.splice(i, 1);
  if (el.parentNode) el.parentNode.removeChild(el);
  if (plateEl === el) plateEl = null;
}
/* Nœud libre dans la scène, retiré avec sa portée (carte, échelle des rangs…). null si rien ne doit jouer. */
FX.node = function (cls, scope) {
  if (!stage || !FX.effective()) return null;
  var el = FX.el('div', cls, stage);
  nodes.push({ el: el, scope: scope === undefined ? 'screen' : scope });
  return el;
};
/* Nœud animé puis retiré : opacité 0 -> 1 -> 0, transform = base + (from | rien | to). */
function stageNode(cls, o, base, from, to, ms, fill) {
  FX.palette();                                          // variables --fx-* de #fx-root à jour (thème, univers)
  var el = FX.el('div', cls + (o.cls ? ' ' + o.cls : ''), stage);
  nodes.push({ el: el, scope: scopeOf(o) });
  fill(el);
  if (!FX.anim(el, [{ opacity: 0, transform: base + from }, { opacity: 1, transform: base, offset: 0.2 },
                    { opacity: 1, transform: base, offset: 0.75 }, { opacity: 0, transform: base + to }],
               { duration: ms, scope: o.scope, remove: true, name: cls })) { dropNode(el); return null; }
  return el;
}
FX.fx.float = function (text, x, y, o) {                 // texte flottant centré sur (x, y)
  o = o || {};
  var lv = gate(o);
  if (!lv || !stage) return null;
  return stageNode('fx-float', o, 'translate(-50%,-50%) rotate(' + (o.rotate || 0) + 'deg) ', lv < 2 ? '' : 'scale(.5)',
    'translate(' + (o.dx || 0) + 'px,' + dflt(o.dy, -46) * (lv < 2 ? 0.5 : 1) + 'px)', o.ms || 700, function (el) {
      el.textContent = text;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      if (o.color) el.style.color = o.color;
      if (o.size) el.style.fontSize = o.size + 'px';
    });
};
/* Bandeau (kind 0) ou cut-in (kind 1) : un seul à la fois. */
function plate(kind, text, o) {
  var lv = gate(o), r, right = o.side === 'right';
  if (!lv || !stage) return null;
  if (lv < 2) kind = 0;                                  // au niveau léger, un cut-in devient un bandeau
  if (plateEl) dropNode(plateEl);
  r = o.anchor ? FX.rect(o.anchor) : null;
  return (plateEl = stageNode(kind ? 'fx-cutin' : 'fx-banner', o, kind ? 'translateY(-50%) ' : 'translate(-50%,-50%) ',
    kind ? 'translateX(' + (right ? '' : '-') + '100%)' : (lv < 2 ? '' : 'scale(.6)'),
    kind ? 'translateX(' + (right ? '-' : '') + '30%)' : (lv < 2 ? '' : 'scale(1.05)'),
    o.ms || (kind ? 1000 : 900), function (el) {
      if (o.emoji) FX.el('span', 'fx-emoji', el, o.emoji);
      FX.el('strong', '', el, text);
      if (o.sub) FX.el('small', '', el, o.sub);
      if (o.color) el.style.setProperty('--fx-c', o.color);
      el.style.top = (r ? r.cy : dflt(o.y, FX.vh() * 0.28)) + 'px';
    }));
}
FX.fx.banner = function (text, o) { return plate(0, text, o || {}); };
FX.fx.cutin = function (text, o) { return plate(1, text, o || {}); };

/* Teinte de grande surface — limiteur unique : une par seconde au plus, alpha <= .12, fondus
   >= 120 ms, alpha réduit tant que la luminance de la page varierait de plus de 0,08
   (sous le seuil d'un « flash » WCAG). Niveau complet seulement. -> true si jouée. */
var lastTint = -1e9;
FX.fx.tint = function (color, o) {
  o = o || {};
  if (o.min == null) o.min = 2;
  var t = now(), a = Math.min(dflt(o.alpha, 0.1), 0.12), ms = Math.max(o.ms || 500, 320), r, p, k, s;
  if (!gate(o) || !tintEl) return false;
  if (t - lastTint < 1000) { drop('tint', 'limiteur'); return false; }
  p = FX.palette(); color = color || p.u;
  for (k = 0; k < 12 && Math.abs(lum(mix(p.bg, color, a)) - lum(p.bg)) > 0.08; k++) a *= 0.8;
  r = o.rect ? FX.rect(o.rect) : null;
  s = tintEl.style;
  s.left = (r ? r.x : 0) + 'px'; s.top = (r ? r.y : 0) + 'px';
  s.width = r ? r.w + 'px' : '100%'; s.height = r ? r.h + 'px' : '100%';
  s.background = color;
  if (!FX.anim(tintEl, [{ opacity: 0 }, { opacity: a, offset: Math.max(0.3, 120 / ms) }, { opacity: 0 }],
               { duration: ms, easing: 'linear', fill: 'none', scope: o.scope, name: 'fx-tint' })) return false;
  lastTint = t;
  if (DBG.tints.length >= 50) DBG.tints.shift();
  DBG.tints.push({ t: Math.round(t), alpha: Math.round(a * 1000) / 1000, color: color });
  return true;
};

/* Annulation par portée (appelée par FX.cancel). */
cancelers.push(function (scope, all) {
  var i, a;
  for (i = pn - 1; i >= 0; i--) if (all || P[i].sc === scope) killAt(i);
  for (i = shapes.length - 1; i >= 0; i--) if (all || shapes[i].sc === scope) shapes.splice(i, 1);
  for (i = anims.length - 1; i >= 0; i--) if (all || anims[i].scope === scope) {
    a = anims.splice(i, 1)[0].a;
    try { a.cancel(); } catch (e) {}
  }
  for (i = nodes.length - 1; i >= 0; i--) if (all || nodes[i].scope === scope) dropNode(nodes[i].el);
  if (all) showCanvas(false);
});

function engineStats() {
  return { particles: pn, shapes: shapes.length, anims: anims.length, nodes: nodes.length, loop: running };
}

/* Montage : #fx-root est le DERNIER enfant de #app (au-dessus des écrans et de l'en-tête,
   sous le tiroir, les modales et le toast). Renvoie false si le navigateur ne suit pas. */
function mountEngine(app) {
  root = FX.el('div', '', app); root.id = 'fx-root';
  cv = FX.el('canvas', '', root); cv.id = 'fx-canvas';
  tintEl = FX.el('div', '', root); tintEl.id = 'fx-tint';
  stage = FX.el('div', '', root); stage.id = 'fx-stage';
  c2d = cv.getContext ? cv.getContext('2d') : null;
  W.addEventListener('resize', function () { sizeDirty = true; }, { passive: true });
  return !!(c2d && root.animate && W.requestAnimationFrame);
}
