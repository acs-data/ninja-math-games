/* ═══ 00-kernel.js — noyau de la couche d'animation ═══
   Objet FX, niveaux et profils, enveloppes (FX.wrap), disjoncteur, file d'évènements
   à jetons de portée, minuteries, registre de modules, journal de diagnostic.
   Tout ce fichier vit dans l'IIFE unique générée par tools/build_anime.py :
   la seule globale créée est window.FX (posée par 99-boot.js). */

var W = window, D = document, ROOT = D.documentElement;
var FX = { version: '1.0.0', fx: {} };
var LEVELS = { off: 0, leger: 1, complet: 2 };
var LEVEL_NAMES = ['off', 'leger', 'complet'];

/* État interne (jamais exposé tel quel). */
var S = {
  pref: 'complet',      // préférence du joueur : 'off' | 'leger' | 'complet'
  lastOn: 'complet',    // dernier niveau non-off (ce que rallume le bouton ON/OFF)
  explicit: false,      // le joueur a choisi lui-même (sinon on suit le réglage système)
  reduced: false,       // prefers-reduced-motion du système
  dead: false,          // disjoncteur déclenché ou navigateur incompatible
  suspended: false,     // modale ouverte ou onglet caché
  screen: 'home',       // dernier id passé à showScreen (state.screen du jeu n'est jamais mis à jour)
  profile: 'home'
};

/* Écran -> profil. Un écran inconnu prend le profil 'home'. */
FX.PROFILES = {
  home: 'home', 'auto-menu': 'home', stats: 'home',
  loading: 'battle', game: 'battle',
  auto: 'sobre', 'dnb-intro': 'sobre', 'dnb-transition': 'sobre', 'dnb-ex': 'sobre',
  tf: 'duel', story: 'recit',
  draw: 'atelier', puzzle: 'atelier', pythagore: 'atelier', 'proba-tree': 'atelier', 'graph-reader': 'atelier',
  result: 'ceremony', 'auto-result': 'ceremony', 'tf-result': 'ceremony', 'story-result': 'ceremony',
  'dnb-result': 'ceremony', 'proba-tree-result': 'ceremony', 'graph-reader-result': 'ceremony'
};
/* Profil -> plafonds. max = niveau maximal (1 léger, 2 complet) ;
   p = nombre maximal de particules vivantes [au niveau léger, au niveau complet]. */
FX.CAPS = {
  home:     { max: 2, p: [24, 160] },
  battle:   { max: 2, p: [24, 160] },
  duel:     { max: 2, p: [16, 96] },
  recit:    { max: 2, p: [16, 96] },
  atelier:  { max: 2, p: [16, 64] },
  ceremony: { max: 2, p: [40, 160] },
  sobre:    { max: 1, p: [0, 0] }       // épreuves : léger au plus, aucune particule
};

/* ── Diagnostic ── */
var DBG = FX.debug = { log: [], drops: [], tints: [], chaos: false };
var ST = { played: 0, dropped: 0, errors: [], errCount: 0, chaos: 0, peak: 0,
           wrapped: [], missing: [], denied: [], modules: {} };
var CHAOS = { message: 'chaos', chaos: true };   // erreur de test levée par chaque crochet si FX.debug.chaos

function now() { return W.performance && performance.now ? performance.now() : Date.now(); }

/* Disjoncteur : 3 erreurs sur un même crochet le coupent, 8 erreurs au total coupent la couche. */
function oops(e, where, pair) {
  if (e === CHAOS) { ST.chaos++; return; }
  ST.errCount++;
  if (ST.errors.length < 20) ST.errors.push(where + ' : ' + (e && e.message ? e.message : e));
  if (pair && ++pair.errs >= 3) pair.off = true;
  if (ST.errCount >= 8) kill('erreurs');
}
function kill(why) {
  if (S.dead) return;
  S.dead = true;
  try { FX.cancel('*'); } catch (e) {}
  try { ROOT.setAttribute('data-fx', 'off'); ROOT.setAttribute('data-fx-dead', String(why || '')); } catch (e) {}
  try { syncUI(); } catch (e) {}
  dispatch('fx:kill', why);
}
FX.kill = kill;

/* Entrée du journal : une par effet réellement joué. */
function log(fx, lv, n, info) {
  ST.played++;
  if (DBG.log.length >= 200) DBG.log.shift();
  DBG.log.push({ t: Math.round(now()), fx: fx, level: LEVEL_NAMES[lv], profile: S.profile,
                 screen: S.screen, n: n || 0, info: info == null ? '' : String(info) });
}
function drop(type, why) {
  ST.dropped++;
  if (DBG.drops.length >= 50) DBG.drops.shift();
  DBG.drops.push({ t: Math.round(now()), type: type, why: why });
}

/* ── Contexte ── */
var openModals = D.getElementsByClassName('modal-overlay show');   // collection vivante : test en O(1)
function modalOpen() { return openModals.length > 0; }
function blocked() { return D.hidden || modalOpen(); }

FX.level = function () { return S.dead ? 'off' : S.pref; };
/* Niveau effectif : min(préférence, plafond du profil) ; 0 si modale, onglet caché ou couche coupée. */
FX.effective = function () {
  if (S.dead || S.pref === 'off' || blocked()) return 0;
  var cap = FX.CAPS[S.profile] || FX.CAPS.home;
  return Math.min(LEVELS[S.pref], cap.max);
};
/* Porte commune des primitives : opts.min = niveau minimal requis (1 par défaut). */
function gate(opts) {
  var e = FX.effective();
  return e && opts && opts.min > e ? 0 : e;
}

FX.env = {
  screen: function () { return S.screen; },
  profile: function () { return S.profile; },
  /* Écran réellement affiché (style calculé : le style en ligne ment avant le premier showScreen). */
  visible: function (id) {
    var el = D.getElementById('screen-' + (id || S.screen));
    return !!el && getComputedStyle(el).display !== 'none';
  },
  modal: modalOpen,
  blocked: function () { return S.dead || S.pref === 'off' || blocked(); },
  reduced: function () { return S.reduced; }
};

/* Lecture sûre des globales lexicales du jeu (jamais mises en cache : CHARS/RANKS sont réassignées). */
FX.game = {
  state: function () { try { return typeof state !== 'undefined' ? state : null; } catch (e) { return null; } },
  universe: function () { try { return typeof currentUniverse === 'string' ? currentUniverse : null; } catch (e) { return null; } },
  uni: function () { try { return UNIVERSES[currentUniverse] || null; } catch (e) { return null; } },
  char: function () { try { return CHARS[state.char] || null; } catch (e) { return null; } },
  theme: function () { return ROOT.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; },
  saveOn: function () { try { return typeof isSaveEnabled === 'function' && isSaveEnabled() === true; } catch (e) { return false; } }
};

/* ── Générateur pseudo-aléatoire propre à la couche (xorshift32). La couche n'appelle jamais
   le générateur du jeu : avec une graine identique, anime.html et index.html tirent les mêmes questions. */
var seed = ((Date.now() ^ 0x9E3779B9) >>> 0) || 1;
FX.rnd = function () {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 4294967296;
};
FX.seed = function (n) { seed = (n >>> 0) || 1; };
FX.rand = function (a, b) { return a + (b - a) * FX.rnd(); };
FX.pick = function (arr) { return arr[Math.floor(FX.rnd() * arr.length)]; };

/* ── Enveloppes ──
   FX.wrap(nom, avant, apres, opts) -> boolean
     avant(...args)            -> ctx   (même this, mêmes arguments que l'original)
     apres(ctx, args, retour)           (non appelé si « avant » a levé, ou si le jeu a levé)
     opts.always = true : le crochet tourne aussi au niveau off (suivi d'état uniquement).
   L'original est appelé exactement une fois, hors de tout try, et sa valeur est renvoyée.
   Une seule enveloppe par fonction, posée par simple affectation et jamais retirée ;
   les appels suivants à FX.wrap ajoutent une paire de crochets à la même enveloppe. */
var DENY = { trapFocus: 1, getCanvasPos: 1, isPythDragging: 1, getThemeColor: 1, isSaveEnabled: 1 };
var DENY_RE = /^(render|draw)|^handle\w*Move$/;            // chemins chauds (canvas, glisser)
var ALLOW = { renderUniverseGrid: 1, renderCharGrid: 1, renderMissionChips: 1, renderStats: 1,
              renderPuzzle: 1, renderProbaTree: 1, renderProbaPool: 1, renderProbaQuestion: 1, renderGraphQcm: 1 };
var wraps = {};
var SKIP = {};

FX.wrap = function (name, before, after, opts) {
  if (DENY[name] || (DENY_RE.test(name) && !ALLOW[name])) { ST.denied.push(name); return false; }
  var rec = wraps[name];
  if (!rec) {
    var orig = W[name];
    if (typeof orig !== 'function') { ST.missing.push(name); return false; }
    rec = wraps[name] = { orig: orig, pairs: [] };
    W[name] = makeWrapper(name, rec);
    ST.wrapped.push(name);
  }
  rec.pairs.push({ b: before || null, a: after || null, always: !!(opts && opts.always), errs: 0, off: false });
  return true;
};
function makeWrapper(name, rec) {
  var orig = rec.orig, pairs = rec.pairs;
  return function () {
    var ctx = null, i, p, n = S.dead ? 0 : pairs.length, live = S.pref !== 'off';
    for (i = 0; i < n; i++) {
      p = pairs[i];
      if (p.off || !(live || p.always)) continue;
      if (!ctx) ctx = [];
      try {
        if (DBG.chaos) throw CHAOS;
        ctx[i] = p.b ? p.b.apply(this, arguments) : undefined;
      } catch (e) { ctx[i] = SKIP; oops(e, name, p); }
    }
    var ret = orig.apply(this, arguments);     // hors try : une exception du jeu se propage telle quelle
    if (ctx) {
      for (i = 0; i < n; i++) {
        p = pairs[i];
        if (!p.a || p.off || !(i in ctx) || ctx[i] === SKIP) continue;
        try {
          if (DBG.chaos) throw CHAOS;
          p.a.call(this, ctx[i], arguments, ret);
        } catch (e) { oops(e, name, p); }
      }
    }
    return ret;
  };
}
DBG.orig = function (name) { return wraps[name] ? wraps[name].orig : null; };

/* ── Évènements ──
   FX.on(type, fn)            : fn(data) ; les types 'fx:*' sont des signaux synchrones du noyau.
   FX.emit(type, data, scope) : met en file (O(1), aucune lecture du DOM). La file est vidée à la
     frame suivante ; un évènement est ABANDONNÉ si le jeton de sa portée a changé, si l'écran a
     changé, si une modale est ouverte ou si l'onglet est caché (à l'émission comme à la frame).
     scope par défaut : 'screen' ; scope null = ni filtre de portée ni filtre d'écran. */
var handlers = {}, queue = [], tokens = {};

FX.on = function (type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); return FX; };
function dispatch(type, data) {
  var l = handlers[type], i;
  if (!l) return;
  for (i = 0; i < l.length; i++) {
    try { if (DBG.chaos) throw CHAOS; l[i](data); } catch (e) { oops(e, 'on:' + type); }
  }
}
FX.emit = function (type, data, scope) {
  if (S.dead || S.pref === 'off') return false;
  if (blocked()) { drop(type, 'bloqué'); return false; }      // modale ouverte ou onglet caché : rien n'est mis en attente
  if (queue.length >= 32) { drop(type, 'file pleine'); return false; }
  if (scope === undefined) scope = 'screen';
  queue.push({ type: type, data: data, scope: scope, tok: scope ? (tokens[scope] || 0) : 0, scr: S.screen });
  wake();
  return true;
};
function flush() {
  if (!queue.length) return;
  var q = queue, i, ev;
  queue = [];
  for (i = 0; i < q.length; i++) {
    ev = q[i];
    if (ev.scope && ((tokens[ev.scope] || 0) !== ev.tok || ev.scr !== S.screen)) { drop(ev.type, 'portée'); continue; }
    dispatch(ev.type, ev.data);
  }
}
/* Raccourci : fn(data) à chaque arrivée sur un écran. ids = 'game' | ['result', 'tf-result'] | '*'. */
FX.onScreen = function (ids, fn) {
  var list = typeof ids === 'string' ? [ids] : ids;
  return FX.on('screen', function (d) {
    if (list[0] === '*' || list.indexOf(d.id) >= 0) fn(d);
  });
};

/* ── Portées ──
   Une portée est un nom libre ('screen', 'q', 'game', 'ui'…). Chaque effet en porte une
   (défaut 'screen'). FX.cancel(portée) arrête net ses animations, particules, nœuds et minuteries ;
   FX.bump(portée) fait de même et change le jeton : les évènements déjà en file sont abandonnés.
   Le noyau fait bump('screen') et bump('q') à chaque changement réel d'écran. */
var cancelers = [];      // fonctions (scope, all) fournies par le moteur
var timers = [];

FX.token = function (scope) { return tokens[scope] || 0; };
FX.bump = function (scope) {
  tokens[scope] = (tokens[scope] || 0) + 1;
  FX.cancel(scope);
  return tokens[scope];
};
FX.cancel = function (scope) {
  var all = !scope || scope === '*', i;
  for (i = timers.length - 1; i >= 0; i--) {
    if (all || timers[i].scope === scope) { clearTimeout(timers[i].id); timers.splice(i, 1); }
  }
  for (i = 0; i < cancelers.length; i++) {
    try { cancelers[i](scope, all); } catch (e) { oops(e, 'cancel'); }
  }
  if (all) queue.length = 0;
};
/* setTimeout protégé : annulé avec sa portée, ignoré si la couche est bloquée à l'échéance. */
FX.after = function (ms, fn, scope) {
  if (S.dead || S.pref === 'off') return 0;
  var rec = { id: 0, scope: scope === undefined ? 'screen' : scope };
  rec.id = setTimeout(function () {
    var k = timers.indexOf(rec);
    if (k >= 0) timers.splice(k, 1);
    if (S.dead || S.pref === 'off' || blocked()) return;
    try { if (DBG.chaos) throw CHAOS; fn(); } catch (e) { oops(e, 'after'); }
  }, ms);
  timers.push(rec);
  return rec.id;
};

/* Suspension : modale ouverte ou onglet caché. Tout est coupé, rien n'est repris ;
   les modules se resynchronisent sur le signal 'fx:resume'. Idempotent. */
function suspend(why) {
  FX.cancel('*');
  if (!S.suspended) { S.suspended = true; dispatch('fx:suspend', why); }
}
function resume() {
  if (!S.suspended || S.dead || blocked()) return;
  S.suspended = false;
  dispatch('fx:resume');
}

/* ── Chorégraphies ──
   FX.play(nom, fn, opts) -> boolean. Porte unique : si le niveau effectif est nul (ou < opts.min),
   rien n'est joué. Sinon fn(niveau, palette) est exécutée dans un try et une entrée est journalisée. */
FX.play = function (name, fn, opts) {
  var lv = gate(opts);
  if (!lv) return false;
  log(name, lv, 0, opts && opts.info);
  try { if (DBG.chaos) throw CHAOS; fn(lv, FX.palette()); } catch (e) { oops(e, 'play:' + name); }
  return true;
};

/* ── Modules ──
   FX.module(nom, init) : init(FX) est appelée au démarrage, chacune dans son propre try.
   Enregistrer un nom déjà pris REMPLACE le module précédent (un module peut ainsi remplacer
   l'effet générique « arrivee » du noyau sans toucher aux fichiers du noyau). */
var mods = [], booted = false;
FX.module = function (name, init) {
  var i;
  for (i = 0; i < mods.length; i++) if (mods[i].name === name) { mods[i].init = init; return FX; }
  mods.push({ name: name, init: init });
  if (booted) runModule(mods[mods.length - 1]);
  return FX;
};
function runModule(m) {
  try { m.init(FX); ST.modules[m.name] = 'ok'; }
  catch (e) { ST.modules[m.name] = 'erreur'; oops(e, 'module:' + m.name); }
}

FX.stats = function () {
  var eng = engineStats();
  return {
    version: FX.version, level: FX.level(), effective: FX.effective(), screen: S.screen, profile: S.profile,
    dead: S.dead, suspended: S.suspended, explicit: S.explicit, reduced: S.reduced,
    played: ST.played, dropped: ST.dropped, errors: ST.errors.slice(), errCount: ST.errCount, chaos: ST.chaos,
    particles: eng.particles, shapes: eng.shapes, anims: eng.anims, nodes: eng.nodes, loop: eng.loop,
    peak: ST.peak, queue: queue.length, timers: timers.length,
    wrapped: ST.wrapped.slice(), missing: ST.missing.slice(), denied: ST.denied.slice(),
    modules: JSON.parse(JSON.stringify(ST.modules)), tints: DBG.tints.slice()
  };
};
