#!/usr/bin/env node
/* Test de fumée différentiel de l'édition animée (anime.html) contre le jeu classique (index.html).

     node tools/test_anime.js                      teste ./anime.html
     node tools/test_anime.js --anime CHEMIN       teste une construction privée (build_anime.py --out)
     node tools/test_anime.js --only diff,reglages ne lance que certains scénarios

   Principe : même Math.random à graine fixe et même session QCM scriptée (clavier, clics, pause,
   temps écoulé) sur index.html et sur anime.html (niveaux off, complet, puis « chaos » où chaque
   crochet de la couche lève une exception). L'état du jeu, le focus, les textes de #toast,
   #sr-live et du HUD doivent être IDENTIQUES à chaque étape.
   Les setInterval du jeu sont pilotés à la main (window.__tick) : le bonus de temps du score ne
   dépend donc pas de la vitesse de la machine.

   Dépendance : Playwright + Chromium (aucune dépendance ajoutée au dépôt). S'il est absent, le
   script explique comment le lancer et sort avec le code 0. Pour ajouter un scénario : écrire une
   fonction async (browser) et l'inscrire dans SCENARIOS, ou déposer un fichier dans tools/anime-tests/. */
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('Playwright est introuvable : test non exécuté.');
  console.log('Pour le lancer : npm i -D playwright && npx playwright install chromium (hors dépôt), puis node tools/test_anime.js');
  process.exit(0);
}

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const ROOT = path.resolve(__dirname, '..');
const INDEX = pathToFileURL(path.join(ROOT, 'index.html')).href;
const ANIME = pathToFileURL(path.resolve(arg('--anime') || path.join(ROOT, 'anime.html'))).href;
const ONLY = arg('--only') ? arg('--only').split(',') : null;
const SEED = 20261117;

const failures = [];
let checks = 0;
function check(name, ok, detail) {
  checks++;
  if (ok) return;
  failures.push(name + (detail !== undefined ? ' → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log('  ✗ ' + name);
}

/* Injecté avant tout script de page : hasard à graine, setInterval manuel, tutoriel déjà vu. */
function harness(seed) {
  let s = seed >>> 0;
  Math.random = function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cbs = new Map();
  let next = 1000000;
  window.setInterval = function (fn) { cbs.set(++next, fn); return next; };
  const realClear = window.clearInterval;
  window.clearInterval = function (id) { if (!cbs.delete(id)) realClear(id); };
  window.__tick = function (n) { for (let k = 0; k < n; k++) Array.from(cbs.values()).forEach((f) => f()); };
  try { sessionStorage.setItem('tutorial_seen', '1'); } catch (e) {}
}

async function open(browser, url, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 412, height: 800 }, reducedMotion: opts.reducedMotion || 'no-preference',
    colorScheme: opts.colorScheme || 'light' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) page.errors.push('console: ' + m.text());
  });
  await page.addInitScript(harness, SEED);
  await page.goto(url);
  await page.waitForTimeout(150);
  return page;
}
const wait = (page, ms) => page.waitForTimeout(ms);
/* Animations WAAPI en cours (celles de la couche) : on écarte les animations/transitions CSS du jeu. */
const waapi = (page) => page.evaluate(() => document.getAnimations()
  .filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map((a) => a.effect.getTiming().duration));
const gameShown = (page) => page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');

/* Photographie de tout ce que le jeu expose : état, focus, régions live, écran, modales. */
function snap(page, label) {
  return page.evaluate((label) => {
    const q = state.questions[state.qIndex] || {};
    const ae = document.activeElement;
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent : null; };
    const fb = document.getElementById('feedback-panel');
    return {
      label,
      state: [state.score, state.streak, state.bestStreak, state.hp, state.chakra, state.correct, state.qIndex,
        state.answered, state.xp, state.level, state.attempted, state.questions.length, (state.missedQueue || []).length,
        state.reviewedRetries, Math.round(state.timeLeft * 10) / 10, JSON.stringify(state.jutsu), !!state.timeFrozen,
        state.mode, state.char, currentUniverse],
      question: [q.text, q.correct, !!q._retry],
      focus: ae ? (ae.id || (ae.tagName + '.' + ae.className)) : null,
      toast: txt('toast'), sr: txt('sr-live'), hud: [txt('hud-score'), txt('hud-streak'), txt('hud-level')],
      screens: Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id),
      modals: Array.from(document.querySelectorAll('.modal-overlay.show')).map((m) => m.id),
      answers: Array.from(document.querySelectorAll('#answers-grid .answer-btn')).map((b) => b.className + (b.disabled ? ':off' : '') + '|' + b.getAttribute('aria-label')),
      feedback: fb ? fb.style.display + '|' + fb.className + '|' + fb.textContent : null,
      result: [txt('result-rank'), txt('result-msg'), txt('res-score'), txt('res-correct'), txt('trophies-list')],
      bodyOverflow: document.body.style.overflow,
      storage: Object.keys(localStorage).sort()
    };
  }, label);
}

/* Session QCM scriptée, identique pour toutes les pages. */
async function session(page) {
  const shots = [];
  const shot = async (label) => { await wait(page, 90); shots.push(await snap(page, label)); };
  const good = () => page.evaluate(() => state.questions[state.qIndex].correct);
  await shot('accueil');
  await page.evaluate(() => startGame('6e_facile'));
  await gameShown(page);
  await shot('q1');
  await page.evaluate(() => __tick(7));                                   // 0,7 s de chrono
  await page.keyboard.press(String((await good()) + 1)); await shot('q1 juste (clavier)');
  await page.keyboard.press('Enter'); await shot('q2');
  await page.click('#answers-grid .answer-btn:nth-child(' + ((await good()) + 1) + ')'); await shot('q2 juste (clic)');
  await page.keyboard.press('Enter'); await shot('q3');
  await page.keyboard.press(String(((await good()) + 1) % 4 + 1)); await shot('q3 fausse');
  await page.keyboard.press(' '); await shot('q4');
  await page.evaluate(() => useJutsu('50')); await shot('q4 pouvoir 50/50');
  await page.keyboard.press(String((await good()) + 1)); await shot('q4 juste');
  await page.evaluate(() => { nextQuestion(); __tick(320); }); await shot('q5 temps écoulé');
  await page.keyboard.press('Enter'); await shot('q6');
  await page.keyboard.press('Escape'); await shot('pause');
  await page.keyboard.press('Enter'); await shot('reprise');               // REPRENDRE a le focus
  await page.evaluate(() => { answer(state.questions[state.qIndex].correct); nextQuestion(); answer(state.questions[state.qIndex].correct); });
  await shot('q7 juste, même tick');                                     // réponse + suivante + réponse dans le même tick
  await page.evaluate(() => {                                              // fin de partie d'une traite
    let guard = 0;
    nextQuestion();
    while (document.getElementById('screen-game').style.display === 'block' && guard++ < 300) {
      const q = state.questions[state.qIndex];
      answer(guard % 5 === 0 ? (q.correct + 1) % 4 : q.correct);
      nextQuestion();
    }
  });
  await shot('résultat');
  await page.evaluate(() => showHome()); await shot('retour accueil');
  return shots;
}
function firstDiff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
    const x = a[i] || {}, y = b[i] || {};
    for (const k of Object.keys(Object.assign({}, x, y))) {
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return { etape: x.label || y.label, cle: k, classique: x[k], anime: y[k] };
    }
  }
  return null;
}

/* ── Scénario 1 : différentiel classique / off / complet / chaos ── */
async function scenarioDiff(browser) {
  const run = async (url, prepare) => {
    const page = await open(browser, url);
    if (prepare) await page.evaluate(prepare);
    const globals = await page.evaluate(() => Object.keys(window).filter((k) => k !== '__tick').sort());
    const shots = await session(page);
    const fx = url === ANIME ? await page.evaluate(() => ({ log: FX.debug.log.length, stats: FX.stats() })) : null;
    await page.context().close();
    return { shots, fx, errors: page.errors, globals };
  };
  const [classic, off, full, chaos] = await Promise.all([
    run(INDEX),
    run(ANIME, () => { FX.setLevel('off'); }),
    run(ANIME, () => { FX.seed(7); }),
    run(ANIME, () => { FX.debug.chaos = true; })
  ]);
  check('la session classique va jusqu\'au résultat', classic.shots.some((s) => s.screens.indexOf('screen-result') >= 0 && s.label === 'résultat'), classic.shots.map((s) => s.screens));
  check('niveau off : état du jeu identique', !firstDiff(classic.shots, off.shots), firstDiff(classic.shots, off.shots));
  check('niveau complet : état du jeu identique', !firstDiff(classic.shots, full.shots), firstDiff(classic.shots, full.shots));
  check('chaos : état du jeu identique', !firstDiff(classic.shots, chaos.shots), firstDiff(classic.shots, chaos.shots));
  for (const [name, r] of [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos]]) {
    check('aucune erreur console / page (' + name + ')', r.errors.length === 0, r.errors);
  }
  check('niveau off : journal FX vide', off.fx.log === 0, off.fx.log);
  check('niveau complet : journal FX non vide', full.fx.log > 0, full.fx.log);
  check('niveau complet : aucune erreur interne', full.fx.stats.errCount === 0, full.fx.stats.errors);
  check('niveau complet : aucune fonction manquante ou refusée', full.fx.stats.missing.length + full.fx.stats.denied.length === 0, [full.fx.stats.missing, full.fx.stats.denied]);
  check('niveau complet : tous les modules démarrés', Object.values(full.fx.stats.modules).every((v) => v === 'ok'), full.fx.stats.modules);
  check('niveau complet : écran suivi', full.fx.stats.screen === 'home', full.fx.stats.screen);
  check('chaos : les crochets ont bien levé', chaos.fx.stats.chaos > 0, chaos.fx.stats.chaos);
  check('chaos : rien n\'a été joué', chaos.fx.log === 0, chaos.fx.log);
  const extra = full.globals.filter((k) => classic.globals.indexOf(k) < 0);
  check('une seule nouvelle globale : FX', extra.length === 1 && extra[0] === 'FX', extra);
}

/* ── Scénario 2 : réglages (boutons, aria-pressed, 44 px, tiroir, pause, stockage) ── */
async function scenarioSettings(browser) {
  const page = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
  const st = () => page.evaluate(() => ({
    level: FX.level(), attr: document.documentElement.getAttribute('data-fx'), key: localStorage.getItem('amat_fx_v1'),
    pressed: ['fx-set-home', 'fx-set-drawer', 'fx-lite-drawer', 'fx-set-pause', 'fx-set-auto-pause'].map((id) => {
      const b = document.getElementById(id); return b ? b.tagName + ':' + b.getAttribute('aria-pressed') + ':' + (b.disabled ? 'off' : 'on') + ':' + b.textContent.trim() : null;
    }),
    drawer: document.getElementById('drawer-menu').classList.contains('show'),
    focus: document.activeElement && document.activeElement.id
  }));
  const height = (id) => page.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().height), id);
  let s = await st();
  check('5 vrais boutons de réglage', s.pressed.every((p) => p && p.indexOf('BUTTON:') === 0), s.pressed);
  check('défaut : complet, aria-pressed vrai', s.level === 'complet' && s.attr === 'complet' && s.pressed[0].indexOf(':true:') > 0 && s.pressed[2].indexOf(':false:on') > 0, s);
  check('bouton accueil >= 44 px', (await height('fx-set-home')) >= 44);
  await page.click('#fx-set-home'); s = await st();
  check('accueil : OFF appliqué dans le même tick', s.level === 'off' && s.attr === 'off' && s.pressed.filter((p) => p.indexOf(':false:') > 0).length === 5 && s.pressed[2].indexOf(':off:') > 0, s);
  check('sauvegarde coupée : aucune clé amat_fx_v1', s.key === null, s.key);
  const loops = () => page.evaluate(() => ['.chakra-dot', '.hero-ninja'].map((q) => getComputedStyle(document.querySelector(q)).animationPlayState).join());
  check('OFF : boucles décoratives du jeu en pause', (await loops()) === 'paused,paused', await loops());
  await page.click('#fx-set-home'); s = await st();
  check('ON : boucles décoratives du jeu relancées', (await loops()) === 'running,running', await loops());
  check('accueil : ON revient à complet', s.level === 'complet' && s.pressed[0].indexOf('Animations : ON') > 0, s);
  check('ON : éclat de confirmation journalisé', await page.evaluate(() => FX.debug.log.some((e) => e.fx === 'burst')));

  await page.click('#topbar-menu-btn'); await wait(page, 90);
  check('tiroir : boutons >= 44 px', (await height('fx-set-drawer')) >= 44 && (await height('fx-lite-drawer')) >= 44);
  const order = [];
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 12))); }
  const iSet = order.indexOf('fx-set-drawer');
  check('tiroir : ordre de tabulation … Animations, Effets légers, Sauvegarde', iSet > 0 && order[iSet + 1] === 'fx-lite-drawer' && order[iSet + 2] === 'drawer-save-toggle', order);
  await page.click('#fx-lite-drawer'); s = await st();
  check('tiroir : effets légers ON, tiroir toujours ouvert', s.level === 'leger' && s.drawer && s.pressed[2].indexOf(':true:on') > 0, s);
  await page.focus('#fx-set-drawer'); await page.keyboard.press('Enter'); s = await st();
  check('tiroir : Entrée bascule OFF, effets légers désactivé', s.level === 'off' && s.drawer && s.pressed[2].indexOf(':false:off') > 0, s);
  await page.keyboard.press(' '); s = await st();
  check('tiroir : Espace rallume au dernier niveau (léger)', s.level === 'leger' && s.drawer, s);
  check('toujours aucune clé sans sauvegarde', s.key === null, s.key);
  await page.click('#drawer-save-toggle'); s = await st();
  check('sauvegarde activée : clé écrite', !!s.key && JSON.parse(s.key).n === 'leger', s.key);
  await page.click('#fx-lite-drawer'); s = await st();
  check('changement de niveau : clé mise à jour', !!s.key && JSON.parse(s.key).n === 'complet', s.key);
  await page.click('#drawer-save-toggle'); s = await st();
  check('sauvegarde désactivée : clé effacée', s.key === null && s.drawer, s);
  await page.keyboard.press('Escape'); await wait(page, 30); s = await st();
  check('Échap ferme le tiroir, focus rendu au bouton menu', !s.drawer && s.focus === 'topbar-menu-btn', s);

  // Modale de pause : Entrée / Espace sur le bouton FX ne reprend ni n'avance la partie.
  await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
  await page.keyboard.press('Escape'); await wait(page, 90);
  const before = await page.evaluate(() => [state.qIndex, state.answered, String(state.timer), document.activeElement.textContent.trim()]);
  check('pause : le focus initial reste sur REPRENDRE', /REPRENDRE/.test(before[3]), before);
  check('pause : bouton >= 44 px', (await height('fx-set-pause')) >= 44);
  await page.keyboard.press('Shift+Tab');
  check('pause : Maj+Tab depuis le premier va au bouton FX (piège à focus intact)', (await st()).focus === 'fx-set-pause');
  await page.keyboard.press('Enter'); s = await st();
  let after = await page.evaluate(() => [state.qIndex, state.answered, String(state.timer), document.getElementById('modal-pause').classList.contains('show')]);
  check('pause : Entrée bascule le niveau sans reprendre', s.level === 'off' && after[3] && after[0] === before[0] && after[1] === before[1] && after[2] === before[2], [s.level, before, after]);
  await page.keyboard.press(' '); s = await st();
  after = await page.evaluate(() => [state.qIndex, state.answered, String(state.timer), document.getElementById('modal-pause').classList.contains('show')]);
  check('pause : Espace bascule le niveau sans reprendre', s.level === 'complet' && after[3] && after[0] === before[0] && after[2] === before[2], [s.level, before, after]);
  await page.keyboard.press('Escape'); await wait(page, 30);              // Échap : le jeu ferme puis rouvre la pause (comportement d'origine)
  await page.evaluate(() => { quitFromPause(); startAutoMode('auto_6e'); });
  await wait(page, 50);
  await page.focus('#auto-input'); await page.keyboard.press('Escape'); await wait(page, 90);
  const autoBefore = await page.evaluate(() => [autoState.qIdx, autoState.answered, document.getElementById('modal-auto-pause').classList.contains('show')]);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); s = await st();
  const autoAfter = await page.evaluate(() => [autoState.qIdx, autoState.answered, document.getElementById('modal-auto-pause').classList.contains('show')]);
  check('pause automatismes : Entrée sur le bouton FX bascule sans reprendre', autoBefore[2] && s.focus === 'fx-set-auto-pause' && s.level === 'off' && JSON.stringify(autoBefore) === JSON.stringify(autoAfter), [s.focus, s.level, autoBefore, autoAfter]);
  check('aucune erreur console / page (réglages)', page.errors.length === 0, page.errors);
  await page.context().close();

  // Préférence relue au chargement seulement si la sauvegarde est activée ; sinon clé nettoyée.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); sessionStorage.setItem('tutorial_seen', '1'); localStorage.setItem('amat_fx_v1', '{"v":1,"n":"leger","d":"leger"}'); } } catch (e) {} });
  await p2.goto(ANIME);
  check('démarrage sans sauvegarde : clé orpheline nettoyée, défaut complet', await p2.evaluate(() => localStorage.getItem('amat_fx_v1') === null && FX.level() === 'complet'));
  await p2.evaluate(() => { toggleSave(); FX.setLevel('leger'); });
  await p2.reload();
  check('démarrage avec sauvegarde : niveau relu', await p2.evaluate(() => FX.level() === 'leger' && FX.stats().explicit));
  await ctx.close();
}

/* ── Scénario 3 : prefers-reduced-motion ── */
async function scenarioReduced(browser) {
  const page = await open(browser, ANIME, { reducedMotion: 'reduce' });
  check('mouvement réduit : off au démarrage', await page.evaluate(() => FX.level() === 'off' && document.documentElement.getAttribute('data-fx') === 'off' && FX.stats().reduced));
  await page.evaluate(() => showScreen('stats')); await wait(page, 60);
  check('mouvement réduit : rien ne joue tant que c\'est off', (await page.evaluate(() => FX.debug.log.length)) === 0 && (await waapi(page)).length === 0);
  await page.evaluate(() => showScreen('home'));
  await page.click('#fx-set-home'); await wait(page, 60);
  const r = await page.evaluate(() => ({ level: FX.level(), burst: FX.debug.log.filter((e) => e.fx === 'burst')[0], particles: FX.stats().particles }));
  check('mouvement réduit : rallumer donne « léger »', r.level === 'leger', r);
  check('mouvement réduit : mouvement visible (particules, 8 au plus)', !!r.burst && r.burst.n > 0 && r.burst.n <= 8 && r.particles > 0, r);
  await page.evaluate(() => showScreen('stats')); await wait(page, 60);
  const a = await waapi(page);
  check('mouvement réduit : l\'animation WAAPI garde sa durée (140 ms)', a.length === 1 && a[0] === 140, a);
  check('aucune erreur console / page (mouvement réduit)', page.errors.length === 0, page.errors);
  await page.context().close();
}

/* ── Scénario 4 : au niveau off, la mise en page est celle du jeu classique ── */
async function scenarioLayout(browser) {
  const rects = (page) => page.evaluate(() => {
    const out = {};
    const add = (key, el) => { if (!el) return; const r = el.getBoundingClientRect(); if (r.width || r.height) out[key] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); };
    add('header', document.querySelector('header'));
    document.querySelectorAll('[id^="screen-"]').forEach((scr) => {
      if (getComputedStyle(scr).display === 'none') return;
      add(scr.id, scr);
      /* Les nœuds de la couche (ex. #fx-arena, masqué au niveau off) ne décalent pas la numérotation des enfants du jeu. */
      Array.from(scr.children).filter((c) => !/^fx-/.test(c.id)).forEach((c, i) => add(scr.id + '>' + i + ':' + (c.id || c.className), c));
      scr.querySelectorAll('[id^="fx-"]').forEach((c) => add(scr.id + '>' + c.id, c));
    });
    document.querySelectorAll('#answers-grid .answer-btn, #question-wrap, .game-controls, footer').forEach((el, i) => add('el' + i + ':' + (el.id || el.className), el));
    out.scroll = document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight;
    return out;
  });
  for (const vp of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    const res = await Promise.all([INDEX, ANIME].map(async (url) => {
      const page = await open(browser, url, { viewport: vp });
      if (url === ANIME) await page.evaluate(() => FX.setLevel('off'));
      const out = {};
      const home = await page.evaluate(() => [document.querySelector('.home-actions').getBoundingClientRect().height, document.documentElement.scrollHeight, document.documentElement.scrollWidth]);
      await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
      out.game = await rects(page);
      await page.evaluate(() => { answer(state.questions[state.qIndex].correct); });
      out.feedback = await rects(page);
      for (const id of ['result', 'tf', 'auto-menu', 'stats', 'story']) { await page.evaluate((id) => showScreen(id), id); out[id] = await rects(page); }
      out.fx = url === ANIME ? await page.evaluate(() => ({ log: FX.debug.log.length, root: getComputedStyle(document.getElementById('fx-root')).display })) : null;
      if (out.fx) out.fx.anims = (await waapi(page)).length;
      await page.context().close();
      out.home = home;
      return out;
    }));
    const tag = vp.width + '×' + vp.height;
    /* Accueil : seule différence admise, le bouton « Animations » de la barre de réglages, qui peut
       ajouter UNE rangée (44 px + 10 px d'espacement) sur les écrans étroits. */
    const dh = res[1].home[1] - res[0].home[1];
    check('accueil : au plus une rangée de réglages en plus (' + tag + ')', (dh === 0 || dh === 54) && dh === res[1].home[0] - res[0].home[0] && res[1].home[2] === res[0].home[2], [res[0].home, res[1].home]);
    for (const key of Object.keys(res[0])) {
      if (key === 'fx' || key === 'home') continue;
      const diff = Object.keys(Object.assign({}, res[0][key], res[1][key])).filter((k) => res[0][key][k] !== res[1][key][k]);
      check('off : mise en page identique (' + key + ', ' + tag + ')', diff.length === 0, diff.slice(0, 4).map((k) => k + ' ' + res[0][key][k] + ' ≠ ' + res[1][key][k]));
    }
    check('off : aucun effet, calque masqué (' + tag + ')', res[1].fx.log === 0 && res[1].fx.anims === 0 && res[1].fx.root === 'none', res[1].fx);
  }
}

/* ── Scénario 5 : garde-fous du noyau (portées, disjoncteur, limiteur, palette, plafonds) ── */
async function scenarioKernel(browser) {
  const page = await open(browser, ANIME);
  const r = await page.evaluate(async () => {
    const out = {};
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    // 1. Un évènement dont la portée a changé avant la frame est abandonné.
    let got = 0;
    FX.on('t:evt', () => { got++; });
    FX.emit('t:evt', 1, 'q'); FX.bump('q'); FX.emit('t:evt', 2, 'q');
    await frame();
    out.scopeDrop = got;
    // 2. Modale ouverte : rien ne joue, et tout ce qui tournait est coupé.
    FX.fx.burst(100, 100, { n: 20 });
    openModal('modal-legal');
    out.modal = [FX.effective(), FX.stats().particles, FX.fx.burst(100, 100, {}), FX.emit('t:evt', 3)];
    await frame();
    out.modal.push(got);
    closeModal('modal-legal');
    // 3. Limiteur de teinte : une par seconde, alpha <= .12.
    out.tints = [FX.fx.tint('#FFFFFF', { alpha: 0.9 }), FX.fx.tint('#FFFFFF', {}), FX.debug.tints.slice(-1)[0].alpha];
    // 4. Profil sobre : léger au plus, aucune particule, pas d'arrivée ; les anneaux restent permis.
    FX.debug.log.length = 0;
    showScreen('auto'); await frame();
    out.sobre = [FX.env.profile(), FX.effective(), FX.fx.burst(50, 50, { n: 30 }), FX.fx.confetti({}), FX.fx.ring(50, 50, {}), FX.debug.log.filter((e) => e.fx === 'arrivee').length];
    showScreen('home'); await frame();
    // 5. Cibles interdites pour FX.anim ; refus des chemins chauds par FX.wrap.
    const btn = document.createElement('button'); btn.className = 'answer-btn'; document.body.appendChild(btn);
    out.refus = [FX.anim(document.body, [{ opacity: 0 }, { opacity: 1 }]), FX.anim('#app', [{ opacity: 0 }, { opacity: 1 }]),
      FX.anim(btn, [{ transform: 'scale(2)' }, { transform: 'none' }]), FX.wrap('trapFocus'), FX.wrap('renderPyth'), FX.wrap('handlePythMove'), FX.wrap('nexistePas')];
    btn.remove();
    // 6. Palette : contraste >= 3:1 sur le fond de page, deux thèmes, tous les univers et personnages.
    let worst = 99; const u0 = currentUniverse, c0 = state.char, t0 = document.documentElement.dataset.theme;
    for (const th of ['dark', 'light']) {
      document.documentElement.dataset.theme = th;
      for (const uk of Object.keys(UNIVERSES)) for (const ck of Object.keys(UNIVERSES[uk].chars)) {
        currentUniverse = uk; CHARS = UNIVERSES[uk].chars; state.char = ck;
        const p = FX.palette();
        for (const c of [p.u, p.c, p.good, p.warn, p.calm]) worst = Math.min(worst, FX.color.contrast(c, p.bg));
      }
    }
    currentUniverse = 'inconnu'; out.generic = [FX.palette().style, FX.palette().u.length];
    currentUniverse = u0; CHARS = UNIVERSES[u0].chars; state.char = c0; document.documentElement.dataset.theme = t0;
    out.worst = Math.round(worst * 100) / 100;
    // 7. Plafond de particules et arrêt de la boucle au repos.
    for (let i = 0; i < 12; i++) FX.fx.burst(200, 200, { n: 40, life: 300 });
    out.cap = FX.stats().particles;
    await new Promise((res) => setTimeout(res, 700));
    out.idle = [FX.stats().particles, FX.stats().loop, document.getElementById('fx-root').className];
    // 8. Disjoncteur : un crochet fautif est coupé après 3 erreurs, la couche après 8 ; le jeu continue.
    let calls = 0;
    FX.wrap('updateJutsuUI', () => { calls++; throw new Error('test'); });
    for (let i = 0; i < 6; i++) updateJutsuUI();
    out.hookOff = [calls, FX.stats().errCount, FX.stats().dead];
    FX.on('t:boom', () => { throw new Error('boom'); });
    for (let i = 0; i < 6; i++) FX.emit('t:boom', 0, null);
    await frame();
    out.dead = [FX.stats().dead, FX.level(), document.documentElement.getAttribute('data-fx'), document.getElementById('fx-set-home').disabled];
    startGame('6e_facile');
    out.gameAlive = state.mode;
    return out;
  });
  check('évènement abandonné quand sa portée change', r.scopeDrop === 1, r.scopeDrop);
  check('modale ouverte : niveau effectif nul, particules coupées, rien de joué ni mis en file', r.modal.join() === '0,0,0,false,1', r.modal);
  check('teinte : une par seconde, alpha plafonné à .12', r.tints[0] === true && r.tints[1] === false && r.tints[2] <= 0.12, r.tints);
  check('profil sobre : léger, zéro particule, anneau permis, pas d\'arrivée', r.sobre.join() === 'sobre,1,0,0,1,0', r.sobre);
  check('FX.anim refuse body, #app et un transform sur .answer-btn ; FX.wrap refuse les chemins chauds', r.refus.every((v) => v === null || v === false), r.refus);
  check('palette : contraste >= 3:1 partout (thèmes clair et sombre)', r.worst >= 3, r.worst);
  check('univers inconnu : repli générique sans erreur', r.generic[0] === 'impact' && r.generic[1] === 7, r.generic);
  check('plafond de 160 particules', r.cap <= 160 && r.cap > 100, r.cap);
  check('boucle arrêtée et canvas masqué au repos', r.idle[0] === 0 && r.idle[1] === false && r.idle[2] === '', r.idle);
  check('disjoncteur : crochet coupé après 3 erreurs', r.hookOff[0] === 3 && r.hookOff[1] === 3 && r.hookOff[2] === false, r.hookOff);
  check('disjoncteur : couche coupée après 8 erreurs, jeu intact', r.dead[0] === true && r.dead[1] === 'off' && r.dead[2] === 'off' && r.dead[3] === true && r.gameAlive === '6e_facile', [r.dead, r.gameAlive]);
  check('aucune erreur console / page (noyau)', page.errors.length === 0, page.errors);
  await page.context().close();
}

/* ══════════ Scénarios du combat (modules 20–29 : arène, moments du QCM, verdict) ══════════ */
/* Journal FX lisible : « nom[info] », suivi de « ~ » si l'effet a été joué au niveau léger. */
const logOf = (page) => page.evaluate(() => FX.debug.log.map((e) => e.fx + (e.info ? '[' + e.info + ']' : '') + (e.level === 'leger' ? '~' : '')));
const has = (log, name) => log.some((l) => l.indexOf(name) === 0);
const right = (page) => page.evaluate(() => answer(state.questions[state.qIndex].correct));
const wrong = (page) => page.evaluate(() => answer((state.questions[state.qIndex].correct + 1) % 4));
const next = (page) => page.evaluate(() => nextQuestion());
/* Ce qu'il reste de vivant dans la couche (doit retomber à zéro : effets finis, rien ne traîne). */
const leftovers = (page) => page.evaluate(() => {
  const s = FX.stats();
  return { particles: s.particles, shapes: s.shapes, anims: s.anims, nodes: s.nodes, timers: s.timers, queue: s.queue, errors: s.errors };
});
const isIdle = (s) => s.particles + s.shapes + s.anims + s.nodes + s.timers + s.queue === 0 && s.errors.length === 0;
/* Vide le journal, exécute l'action, attend, renvoie ce qui a été joué. */
async function during(page, fn, ms) {
  await page.evaluate(() => { FX.debug.log.length = 0; });
  await fn();
  await wait(page, ms === undefined ? 120 : ms);
  return logOf(page);
}
const arena = (page) => page.evaluate(() => {
  const a = document.getElementById('fx-arena'), q = (s) => a.querySelector(s);
  return { parent: a.parentNode.id, next: a.nextElementSibling && a.nextElementSibling.id, hidden: a.getAttribute('aria-hidden'),
    pe: getComputedStyle(a).pointerEvents, hero: q('.fx-ar-hero').textContent, foe: q('.fx-ar-foe').textContent,
    kind: a.getAttribute('data-fx-foe'), etat: a.getAttribute('data-fx-etat'), combo: a.getAttribute('data-fx-combo'), cls: a.className,
    badge: q('.fx-ar-combo').textContent, tag: q('.fx-ar-tag').textContent, seg: a.querySelectorAll('.fx-ar-hp i').length, off: a.querySelectorAll('.fx-ar-hp i.fx-off').length,
    heroChar: CHARS[state.char].emoji, focusable: a.querySelectorAll('button, a, input, [tabindex]').length,
    gameClass: a.querySelectorAll('.answer-btn, .stat-block, .show, .modal-overlay').length };
});
/* Partie jouée d'une traite jusqu'au résultat, avec un taux de bonnes réponses donné. */
const playThrough = (page, rate, mode) => page.evaluate(([rate, mode]) => {
  let guard = 0, acc = 0;
  if (mode) { startGame(mode); showScreen('game'); updateHUD(); loadQuestion(); }
  while (document.getElementById('screen-game').style.display === 'block' && guard++ < 400) {
    const q = state.questions[state.qIndex];
    acc += rate;
    if (acc >= 1) { acc -= 1; answer(q.correct); } else answer((q.correct + 1) % 4);
    nextQuestion();
  }
}, [rate, mode || null]);

/* ── Scénario 6 : l'arène (place prise à l'écran, structure, modes, univers, contraste) ── */
async function scenarioArena(browser) {
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const measure = async (url, vp, level) => {
    const page = await open(browser, url, { viewport: vp });
    if (level) await page.evaluate((l) => FX.setLevel(l), level);
    await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
    await wait(page, 300);                                   // fin du glissement d'arrivée de l'écran (10 px)
    const r = await page.evaluate(() => {
      const top = [];
      for (let i = 0; i < state.questions.length; i++) { state.qIndex = i; loadQuestion(); top.push(Math.round(document.getElementById('answers-grid').getBoundingClientRect().top + scrollY)); }
      const a = document.getElementById('fx-arena');
      return { top, sw: document.documentElement.scrollWidth, arena: a ? [getComputedStyle(a).display, Math.round(a.getBoundingClientRect().height)] : null,
        btns: document.querySelectorAll('.answer-btn').length + '/' + document.querySelectorAll('#answers-grid .answer-btn').length };
    });
    await page.context().close();
    return { min: Math.min(...r.top), med: med(r.top), max: Math.max(...r.top), sw: r.sw, arena: r.arena, btns: r.btns, errors: page.errors };
  };
  /* [largeur, hauteur, tolérance en px, hauteur d'arène attendue (0 = masquée)] */
  const sizes = [[360, 640, 0, 64], [600, 800, 2, 80], [768, 1024, 2, 80], [1280, 800, 2, 80], [640, 360, 0, 0]];
  const measured = await Promise.all(sizes.map(([w, h]) => Promise.all([measure(INDEX, { width: w, height: h }), measure(ANIME, { width: w, height: h }, 'complet')])));
  for (const [k, [w, h, tol, ah]] of sizes.entries()) {
    const tag = w + '×' + h, [c, a] = measured[k];
    console.log('    ' + tag + ' : haut des réponses (min/médiane/max sur 30 questions) classique ' + [c.min, c.med, c.max].join('/') +
      ' → animé ' + [a.min, a.med, a.max].join('/') + ' (écart médian ' + (a.med - c.med) + ' px) ; arène ' + a.arena.join(' ') + ' px');
    check('arène : réponses pas plus basses que dans index.html (' + tag + ', tolérance ' + tol + ' px)', a.min - c.min <= tol && a.med - c.med <= tol && a.max - c.max <= tol, [c, a]);
    check('arène : aucun débordement horizontal ajouté (' + tag + ')', a.sw === c.sw, [c.sw, a.sw]);
    check('arène : ' + (ah ? 'affichée (' + ah + ' px)' : 'masquée en paysage bas') + ' (' + tag + ')', ah ? a.arena[0] === 'flex' && a.arena[1] === ah : a.arena[0] === 'none', a.arena);
    check('arène : les 4 .answer-btn du document sont ceux de la grille (' + tag + ')', a.btns === '4/4', a.btns);
    check('aucune erreur (arène, ' + tag + ')', a.errors.length === 0, a.errors);
  }

  const page = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
  await page.evaluate(() => startGame('6e_facile')); await gameShown(page); await wait(page, 80);
  let a = await arena(page);
  check('arène : enfant direct de #screen-game, juste avant #question-wrap', a.parent === 'screen-game' && a.next === 'question-wrap', a);
  check('arène : aria-hidden, insensible au pointeur, rien de focalisable, aucune classe du jeu', a.hidden === 'true' && a.pe === 'none' && a.focusable === 0 && a.gameClass === 0, a);
  check('arène : héros = émoji du personnage, sbire générique à 1 segment', a.hero === a.heroChar && a.kind === 'sbire' && a.seg === 1 && a.off === 0 && a.etat === '', a);
  await right(page); await wait(page, 60); a = await arena(page);
  check('arène : bonne réponse → sbire K.O., segment éteint', a.etat === 'ko' && a.off === 1, a);
  await next(page); await wait(page, 60); await wrong(page); await wait(page, 60); a = await arena(page);
  check('arène : erreur → le monstre s\'échappe, repère calme vers l\'explication, combo remis à zéro', a.etat === 'fuite' && /explication/.test(a.tag) && a.combo === '0' && a.badge === '', a);
  /* Pause puis reprise dans l'état « répondu » : l'image fixe est recalculée depuis le jeu. */
  await page.evaluate(() => pauseGame()); await wait(page, 60);
  check('arène : modale ouverte → plus rien ne tourne', isIdle(await leftovers(page)), await leftovers(page));
  await page.evaluate(() => resumeGame()); await wait(page, 60); a = await arena(page);
  check('arène : état conservé après pause / reprise', a.etat === 'fuite' && /explication/.test(a.tag), a);
  /* Niveau coupé puis rallumé en cours de question : l'arène est recalée sans attendre la suivante. */
  await next(page); await wait(page, 60);
  await page.evaluate(() => { FX.setLevel('off'); answer(state.questions[state.qIndex].correct); nextQuestion(); answer(state.questions[state.qIndex].correct); FX.setLevel('complet'); });
  a = await arena(page);
  check('arène : recalée quand le niveau est rallumé (question déjà répondue juste)', a.etat === 'ko' && a.hero === a.heroChar, a);
  /* Fin de partie, rejouer, retour accueil, autre mode, autre univers. */
  await page.evaluate(() => { endGame(); retryGame(); }); await gameShown(page); await wait(page, 80); a = await arena(page);
  check('arène : intacte après endGame + rejouer', a.parent === 'screen-game' && a.next === 'question-wrap' && a.etat === '' && a.kind === 'sbire', a);
  await page.evaluate(() => { showHome(); startGame('boss'); }); await gameShown(page); await wait(page, 80); a = await arena(page);
  const bossLen = await page.evaluate(() => state.originalLength);
  check('arène : boss = un seul adversaire à ' + bossLen + ' segments', a.kind === 'boss' && a.foe === '👹' && a.seg === bossLen && a.off === 0, a);
  await right(page); await wait(page, 60); a = await arena(page);
  check('arène : le boss perd un segment et reste debout', a.off === 1 && a.etat === '', a);
  await next(page); await wait(page, 60); await wrong(page); await wait(page, 60); a = await arena(page);
  check('arène : le boss ne s\'échappe pas après une erreur', a.etat === '' && a.kind === 'boss' && a.off === 1, a);
  await page.evaluate(() => { showHome(); startGame('libre'); }); await gameShown(page); await wait(page, 80); a = await arena(page);
  check('arène : mode libre = cible d\'entraînement sans barre de vie', a.kind === 'cible' && a.foe === '🎯' && a.seg === 0, a);
  await wrong(page); await wait(page, 60); a = await arena(page);
  check('arène : la cible reste en place après une erreur', a.etat === '' && /explication/.test(a.tag), a);
  await page.evaluate(() => { showHome(); selectUniverse('onepiece'); startGame('6e_facile'); }); await gameShown(page); await wait(page, 80); a = await arena(page);
  check('arène : le héros suit l\'univers et le personnage choisis', a.hero === a.heroChar && a.hero !== '🍜', a);
  /* Contraste des couleurs d'effet (personnage et univers) sur le fond de page, 6 univers × 2 thèmes. */
  const contrast = await page.evaluate(() => {
    const out = [];
    showHome();
    Object.keys(UNIVERSES).forEach((u) => {
      selectUniverse(u);
      ['dark', 'light'].forEach((t) => {
        applyTheme(t);
        const p = FX.palette();
        out.push([u, t, Math.round(FX.color.contrast(p.c, p.bg) * 100) / 100, Math.round(FX.color.contrast(p.u, p.bg) * 100) / 100, p.style]);
      });
    });
    return out;
  });
  check('arène : couleurs d\'effet ≥ 3:1 sur le fond, 6 univers × 2 thèmes', contrast.length === 12 && contrast.every((c) => c[2] >= 3 && c[3] >= 3), contrast);
  check('arène : six gestes d\'attaque distincts', new Set(contrast.map((c) => c[4])).size === 6, contrast.map((c) => c[4]));
  check('aucune erreur (arène)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
  await page.context().close();
}

/* ── Scénario 7 : les moments du QCM (journal attendu, coupure nette, rien ne traîne) ── */
async function scenarioCombat(browser) {
  await Promise.all([combatMain(browser), combatBoss(browser), combatPhone(browser)]);
}
async function combatMain(browser) {
  const page = await open(browser, ANIME, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await page.evaluate(() => { FX.seed(3); startGame('6e_facile'); }); await gameShown(page); await wait(page, 320);
  let log, a;
  /* Bonne réponse : l'énergie part de la réponse, le héros attaque, l'adversaire encaisse. */
  log = await during(page, () => right(page), 320);
  check('juste : chorégraphie jouée (éclat sur la réponse, héros, adversaire, dégâts)',
    has(log, 'qcm-juste[×1]') && has(log, 'streaks') && has(log, 'anim[fx-ar-emo fx-ar-hero]') && has(log, 'anim[fx-ar-emo fx-ar-foe]') && has(log, 'anim[fx-float]'), log);
  await wait(page, 520);
  check('juste : tout est fini 850 ms après la réponse', isIdle(await leftovers(page)), await leftovers(page));
  check('bandeau de combo du jeu : laissé visible quand il ne recouvre pas l\'arène', (await page.evaluate(() => document.documentElement.hasAttribute('data-fx-combo-off'))) === false);
  log = await during(page, () => right(page));
  check('appel ignoré par le jeu (déjà répondu) : aucun effet', log.length === 0, log);
  /* Combos : crans 2, 3, 4 puis ULTIME à 5. */
  for (const n of [2, 3, 4]) {
    await next(page); await wait(page, 40);
    log = await during(page, () => right(page), 100);
    a = await arena(page);
    check('combo ×' + n + ' : joué, cran d\'aura ' + Math.min(3, n - 1), has(log, 'qcm-juste[×' + n + ']') && a.combo === String(Math.min(3, n - 1)) && a.badge === '×' + n, [log, a]);
  }
  await next(page); await wait(page, 300);
  log = await during(page, () => right(page), 700);
  check('combo ×5 : ULTIME (cut-in sur la bande, teinte limitée à l\'arène)', has(log, 'qcm-ultime[×5]') && has(log, 'anim[fx-cutin]') && has(log, 'anim[fx-tint]'), log);
  const tint = await page.evaluate(() => { const t = document.getElementById('fx-tint'), a = document.getElementById('fx-arena'); return [t.offsetWidth, t.offsetHeight, a.offsetWidth, a.offsetHeight, innerHeight]; });
  check('ULTIME : aucune teinte plein écran', tint[1] < tint[4] / 2 && Math.abs(tint[1] - tint[3]) <= 2, tint);
  await wait(page, 520);
  check('ULTIME : tout est fini 1,25 s après la réponse', isIdle(await leftovers(page)), await leftovers(page));
  /* Erreur : contre paré, aucune secousse ni teinte ; la question reviendra. */
  await next(page); await wait(page, 300);
  log = await during(page, () => wrong(page), 320);
  a = await arena(page);
  check('erreur : contre paré (bouclier), ni teinte ni bandeau', has(log, 'qcm-erreur') && has(log, 'sprite') && !has(log, 'anim[fx-tint]') && !has(log, 'anim[fx-banner]') && !has(log, 'anim[fx-cutin]'), log);
  check('erreur : état fixe (monstre échappé, repère)', a.etat === 'fuite' && /explication/.test(a.tag), a);
  /* Revanche : la question ratée revient en fantôme ; la corriger est le moment le plus fêté. */
  await next(page); await wait(page, 300);
  a = await arena(page);
  check('revenant : fantôme + « REVANCHE ! »', a.kind === 'revenant' && a.foe === '👻' && a.tag === 'REVANCHE !' && (await page.evaluate(() => state.questions[state.qIndex]._retry)) === true, a);
  log = await during(page, () => right(page), 320);
  check('revanche réussie : bandeau, couronne, confettis', has(log, 'qcm-revanche') && has(log, 'anim[fx-banner]') && has(log, 'confetti') && has(log, 'trail'), log);
  await wait(page, 950);
  check('revanche : tout est fini 1,3 s après la réponse', isIdle(await leftovers(page)), await leftovers(page));
  /* Temps écoulé : distinct d'une erreur, et aucune réponse n'est désignée. */
  await next(page); await wait(page, 60);
  log = await during(page, () => page.evaluate(() => __tick(301)), 200);
  a = await arena(page);
  check('temps écoulé : effet propre, repère « Temps écoulé »', has(log, 'qcm-temps') && !has(log, 'qcm-erreur') && /Temps écoulé/.test(a.tag), [log, a]);
  /* Pouvoirs : réussis (compteur en baisse) ou refusés (aucun effet). */
  await next(page); await wait(page, 60);
  await page.evaluate(() => { state.chakra = 100; });
  log = await during(page, () => page.evaluate(() => useJutsu('50')));
  check('pouvoir 50/50 : un trait sur chacune des deux réponses éliminées', has(log, 'qcm-pouvoir[50]') && log.filter((l) => l === 'slash').length === 2, log);
  log = await during(page, () => page.evaluate(() => useJutsu('hint')));
  check('pouvoir indice : effet dans l\'arène seulement', has(log, 'qcm-pouvoir[hint]') && !has(log, 'slash'), log);
  log = await during(page, () => page.evaluate(() => useJutsu('time')));
  a = await arena(page);
  check('pouvoir temps : adversaire figé', has(log, 'qcm-pouvoir[time]') && /fx-gel/.test(a.cls) && /figé/.test(a.tag), [log, a]);
  log = await during(page, () => page.evaluate(() => useJutsu('time')));
  check('pouvoir refusé (plus d\'utilisation) : aucun effet', log.length === 0, log);
  await page.evaluate(() => { state.timeFrozen = false; __tick(1); }); await wait(page, 60);
  a = await arena(page);
  check('fin du temps figé : l\'arène se dégèle', !/fx-gel/.test(a.cls) && a.tag === '', a);
  /* Moins de 5 s : un seul effet, puis état fixe. */
  log = await during(page, () => page.evaluate(() => __tick(255)), 200);
  a = await arena(page);
  check('moins de 5 s : tension signalée une seule fois', log.filter((l) => l === 'qcm-tension').length === 1 && /fx-tense/.test(a.cls), [log, a]);
  /* Niveau gagné : bandeau (le toast du jeu est écrasé dans le même tick). */
  await page.evaluate(() => { state.xp = state.level * 500 - 20; });
  log = await during(page, () => right(page), 800);
  check('niveau gagné : bandeau sur l\'en-tête', has(log, 'niveau') && has(log, 'anim[fx-banner]'), log);
  await wait(page, 900);
  /* Jeu rapide : réponse + question suivante dans le même tick, 20 fois. */
  log = await during(page, async () => {
    for (let i = 0; i < 20; i++) await page.evaluate(() => { answer(state.questions[state.qIndex].correct); nextQuestion(); });
  }, 60);
  check('jeu rapide ×20 : aucune chorégraphie de réponse périmée', !log.some((l) => /^qcm-(juste|ultime|ko|revanche|erreur)/.test(l)), log);
  a = await arena(page);
  check('jeu rapide ×20 : arène à l\'image de la question courante', a.etat === '' && a.off === 0 && (await page.evaluate(() => state.answered)) === false, a);
  await wait(page, 1600);
  check('jeu rapide ×20 : aucun reste (nœuds, animations, particules, minuteries)', isIdle(await leftovers(page)), await leftovers(page));
  /* Niveau léger : mêmes moments, forme courte, pas de cut-in. */
  await page.evaluate(() => { FX.setLevel('leger'); state.streak = 4; state.xp = (state.level - 1) * 500; });   // loin d'un changement de niveau
  log = await during(page, () => right(page), 250);
  check('léger : ULTIME sans cut-in ni teinte, tout au niveau léger', has(log, 'qcm-ultime') && !has(log, 'anim[fx-cutin]') && !has(log, 'anim[fx-tint]') && log.every((l) => /~$/.test(l)), log);
  await wait(page, 500);
  check('léger : tout est fini 750 ms après la réponse', isIdle(await leftovers(page)), await leftovers(page));   // forme courte : ≈ 510 ms
  await page.evaluate(() => FX.setLevel('complet'));
  /* K.O. final : dernière bonne réponse d'une partie finie. */
  await page.evaluate(() => {
    let guard = 0;
    nextQuestion();
    while (!(state.qIndex >= state.questions.length - 1 && !state.missedQueue.length) && guard++ < 200) { answer(state.questions[state.qIndex].correct); nextQuestion(); }
  });
  await wait(page, 300);
  log = await during(page, () => right(page), 400);
  a = await arena(page);
  check('dernier coup : K.O. final', has(log, 'qcm-ko') && has(log, 'confetti') && a.etat === 'sorti', [log, a]);
  check('aucune erreur (QCM)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
  await page.context().close();
}
/* Boss : fin de combat brève, dans la fenêtre de 1500 ms du jeu, puis verdict doux. */
async function combatBoss(browser) {
  let log, a;
  const boss = await open(browser, ANIME, { viewport: { width: 1280, height: 800 } });
  await boss.evaluate(() => startGame('boss')); await gameShown(boss); await wait(boss, 200);
  for (let i = 0; i < 2; i++) { await wrong(boss); await wait(boss, 40); await next(boss); await wait(boss, 40); }
  log = await during(boss, () => wrong(boss), 300);
  a = await arena(boss);
  check('boss : fin de combat (héros à terre, sans secousse ni teinte)', has(log, 'qcm-ko-heros') && /fx-down/.test(a.cls) && !has(log, 'anim[fx-tint]'), [log, a]);
  await wait(boss, 1000);
  check('boss : l\'effet tient dans les 1500 ms du jeu', isIdle(await leftovers(boss)) && (await boss.evaluate(() => getComputedStyle(document.getElementById('screen-game')).display)) === 'block', await leftovers(boss));
  await boss.evaluate(() => { FX.debug.log.length = 0; });
  await boss.waitForFunction(() => getComputedStyle(document.getElementById('screen-result')).display !== 'none');
  await wait(boss, 200);
  log = await logOf(boss);
  check('boss : verdict doux après la défaite (sans échelle)', log.some((l) => /^bilan\[rang \d ko/.test(l)) && !has(log, 'anim[fx-rung]'), log);
  check('aucune erreur (boss)', boss.errors.length === 0 && (await leftovers(boss)).errors.length === 0, [boss.errors, await leftovers(boss)]);
  await boss.context().close();
}
/* Téléphone : explication sous le bas de l'écran → pastille discrète, retirée au défilement. */
async function combatPhone(browser) {
  const tel = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
  await tel.evaluate(() => startGame('6e_facile')); await gameShown(tel); await wait(tel, 200);
  await tel.evaluate(() => { const r = document.getElementById('fx-arena').getBoundingClientRect(); window.scrollBy(0, r.top - 70); });
  await wait(tel, 60);
  await wrong(tel); await wait(tel, 200);
  const cue = await tel.evaluate(() => { const c = document.querySelector('.fx-cue'), p = document.getElementById('feedback-panel').getBoundingClientRect(); return { cue: !!c, w: c ? c.offsetWidth : 0, below: p.top > innerHeight - 40 }; });
  check('repère d\'explication : présent seulement si elle est sous le bas de l\'écran, petit (≤ 40 px)', cue.cue === cue.below && cue.w <= 40, cue);
  /* Pendant que les effets jouent, « QUESTION SUIVANTE » reçoit bien l'appui (rien de la couche ne le capte). */
  const hit = await tel.evaluate(() => {
    const b = document.getElementById('btn-next'); b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return [el && el.id, FX.stats().anims + FX.stats().nodes];
  });
  check('bouton « QUESTION SUIVANTE » jamais couvert par la couche', hit[0] === 'btn-next', hit);
  await tel.evaluate(() => window.scrollBy(0, 40)); await wait(tel, 120);
  check('repère d\'explication : retiré au premier défilement', (await tel.evaluate(() => !document.querySelector('.fx-cue'))) === true);
  /* Arène juste sous l'en-tête : le bandeau de combo du jeu (fixe, en haut à droite) la recouvrirait. */
  await next(tel); await wait(tel, 60);
  await tel.evaluate(() => { const r = document.getElementById('fx-arena').getBoundingClientRect(); window.scrollBy(0, r.top - 70); });
  await right(tel); await wait(tel, 40); await next(tel); await wait(tel, 60); await right(tel); await wait(tel, 120);
  const cg = await tel.evaluate(() => ({ off: document.documentElement.hasAttribute('data-fx-combo-off'), vis: getComputedStyle(document.getElementById('combo-display')).opacity,
    shown: document.getElementById('combo-display').classList.contains('show'), tag: document.querySelector('#fx-arena .fx-ar-tag').textContent, badge: document.querySelector('#fx-arena .fx-ar-combo').textContent }));
  check('bandeau de combo du jeu : masqué tant qu\'il recouvrirait l\'arène, qui affiche le même mot', cg.off && cg.vis === '0' && cg.shown && cg.tag === 'DOUBLE !' && cg.badge === '×2', cg);
  await tel.evaluate(() => FX.setLevel('off'));
  check('bandeau de combo du jeu : jamais masqué au niveau off', (await tel.evaluate(() => getComputedStyle(document.getElementById('combo-display')).transitionDuration)) !== '0s');
  await tel.evaluate(() => FX.setLevel('complet'));
  check('aucune erreur (téléphone)', tel.errors.length === 0 && (await leftovers(tel)).errors.length === 0, [tel.errors, await leftovers(tel)]);
  await tel.context().close();
}

/* ── Scénario 8 : le verdict (cérémonie du rang, paliers, passage, doublons) ── */
async function scenarioVerdict(browser) {
  const view = (page) => page.evaluate(() => {
    const op = (el) => (el ? getComputedStyle(el).opacity : null);
    return { rank: op(document.getElementById('result-rank')), msg: op(document.getElementById('result-msg')), stats: op(document.querySelector('#screen-result .result-stats')),
      trophies: Array.from(document.querySelectorAll('#trophies-list .trophy')).map(op), ladder: document.querySelectorAll('.fx-ladder .fx-rung').length,
      focus: document.activeElement ? document.activeElement.tagName : null,
      /* Animations de la COUCHE sur le rang du jeu (son entrée CSS « rankPop » n'en fait pas partie). */
      rankFx: document.getElementById('result-rank').getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length };
  });
  const start = async (opts, level) => {
    const page = await open(browser, ANIME, Object.assign({ viewport: { width: 360, height: 640 } }, opts || {}));
    if (level) await page.evaluate((l) => FX.setLevel(l), level);
    await page.evaluate(() => startGame('6e_facile')); await gameShown(page); await wait(page, 60);
    return page;
  };
  /* Un palier par taux de réussite : 0 → rang 0, 0,45 → 1, 0,7 → 2, 0,9 → 3, 1 → 4. */
  const tiers = Promise.all([0, 0.45, 0.7, 0.9, 1].map(async (rate, tier) => {
    const page = await start();
    await playThrough(page, rate);
    await wait(page, 250);
    const mid = await view(page), midLog = await logOf(page);
    check('verdict rang ' + tier + ' : cérémonie lancée, chiffres visibles tout de suite, rang en attente derrière l\'échelle',
      midLog.some((l) => l.indexOf('bilan[rang ' + tier + ' ') === 0) && mid.stats === '1' && mid.rank === '0' && mid.ladder === 5, [mid, midLog.filter((l) => /bilan/.test(l))]);
    await wait(page, 2450);
    const end = await view(page), log = await logOf(page), left = await leftovers(page);
    check('verdict rang ' + tier + ' : terminé en 2,7 s, état final = celui du jeu', isIdle(left) && end.rank === '1' && end.msg === '1' && end.ladder === 0 && end.trophies.every((o) => o === '1') && (await waapi(page)).length === 0, [end, left]);
    const fireworks = log.filter((l) => l === 'ring').length;
    check('verdict rang ' + tier + ' : fête proportionnelle (confettis ' + (tier ? 'oui' : 'non') + ')', has(log, 'confetti') === (tier > 0) && (tier < 3 || fireworks >= tier + 1), log.filter((l) => !/^anim/.test(l)));
    check('aucune erreur (verdict rang ' + tier + ')', page.errors.length === 0, page.errors);
    await page.context().close();
  }));
  /* Tout appui passe la cérémonie. */
  let page = await start();
  await playThrough(page, 1); await wait(page, 300);
  await page.keyboard.press('Shift'); await wait(page, 60);
  let v = await view(page), log = await logOf(page);
  check('verdict : une touche passe la cérémonie (plus aucune animation de la couche, rang et titre visibles)', has(log, 'bilan-passe') && v.rank === '1' && v.msg === '1' && v.ladder === 0 && (await waapi(page)).length === 0 && isIdle(await leftovers(page)), [v, await leftovers(page)]);
  await wait(page, 900);                                     // l'entrée CSS des trophées du jeu lui-même (0,4 s + 0,15 s par trophée)
  v = await view(page);
  check('verdict passé : état final = celui du jeu', v.trophies.length > 0 && v.trophies.every((o) => o === '1') && v.rank === '1', v);
  /* Rejouer pendant la cérémonie suivante : tout est coupé. */
  await page.evaluate(() => retryGame()); await gameShown(page); await wait(page, 60);
  await playThrough(page, 0.7); await wait(page, 200);
  await page.evaluate(() => { FX.debug.log.length = 0; endGame(); }); await wait(page, 200);   // endGame une seconde fois (minuterie du boss)
  log = await logOf(page);
  check('verdict : un second endGame ne relance pas la cérémonie', !has(log, 'bilan'), log);
  await page.evaluate(() => retryGame()); await wait(page, 60);
  check('verdict : rejouer coupe la cérémonie', (await page.evaluate(() => !document.querySelector('.fx-ladder'))) === true && (await waapi(page)).filter((d) => d > 400).length === 0, await leftovers(page));
  await gameShown(page);
  /* Le joueur est reparti avant la frame : rien ne joue. */
  await page.evaluate(() => { FX.debug.log.length = 0; endGame(); showHome(); }); await wait(page, 200);
  log = await logOf(page);
  check('verdict : rien si le joueur a déjà quitté l\'écran de résultat', !has(log, 'bilan'), log);
  check('aucune erreur (verdict)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
  await page.context().close();
  /* Téléphone, page défilée (le jeu ne fait jamais défiler) : le rang est au-dessus de la fenêtre.
     La cérémonie se joue alors en vignette sous l'en-tête, sans toucher au rang du jeu. */
  page = await start();
  await page.evaluate(() => window.scrollTo(0, 700));
  await playThrough(page, 0.9); await wait(page, 250);
  v = await view(page);
  const chip = await page.evaluate(() => { const c = document.querySelector('.fx-ladder-chip'), h = document.querySelector('header').getBoundingClientRect(), r = document.getElementById('result-rank').getBoundingClientRect(); return c ? [Math.round(c.getBoundingClientRect().top - h.bottom), Math.round(r.bottom)] : null; });
  check('verdict hors champ : échelle en vignette sous l\'en-tête, rang du jeu intact', chip !== null && chip[0] >= 0 && chip[0] < 60 && chip[1] < 62 && v.rankFx === 0 && v.ladder === 5, [chip, v]);
  await wait(page, 900);
  log = await logOf(page);
  check('verdict hors champ : rang annoncé par un bandeau de la couche', has(log, 'anim[fx-banner]') && !has(log, 'anim[bilan-rang]'), log.filter((l) => /bilan|banner/.test(l)));
  await wait(page, 1700);
  check('verdict hors champ : terminé, rien ne reste', isIdle(await leftovers(page)) && page.errors.length === 0, [await leftovers(page), page.errors]);
  await page.context().close();
  /* Niveau léger : pas d'échelle, ≤ 1,2 s. */
  page = await start(null, 'leger');
  await playThrough(page, 1); await wait(page, 200);
  v = await view(page); log = await logOf(page);
  check('verdict léger : sans échelle, sans confettis', has(log, 'bilan[rang 4') && v.ladder === 0 && !has(log, 'confetti') && log.every((l) => /~$/.test(l)), [v, log]);
  await wait(page, 1000);
  check('verdict léger : terminé en 1,2 s', isIdle(await leftovers(page)) && (await waapi(page)).length === 0, await leftovers(page));
  await page.context().close();
  /* Carte VS pendant le chargement, retirée à l'arrivée du jeu. */
  page = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
  await page.evaluate(() => startGame('boss')); await wait(page, 150);
  const vs = await page.evaluate(() => { const n = document.querySelector('.fx-vs'); return n ? n.textContent : null; });
  check('carte VS : affichée pendant le chargement (héros VS adversaire générique)', vs !== null && /VS/.test(vs) && /👹/.test(vs), vs);
  await gameShown(page); await wait(page, 60);
  check('carte VS : retirée quand le jeu arrive', (await page.evaluate(() => !document.querySelector('.fx-vs'))) === true);
  check('aucune erreur (VS)', page.errors.length === 0, page.errors);
  await page.context().close();
  await tiers;
}

/* ── Scénario 9 : parties complètes (modes × univers × thèmes) sans aucune erreur ── */
async function scenarioSessions(browser) {
  await Promise.all([['naruto', 'dark'], ['pokemon', 'light'], ['demonslayer', 'dark']].map(async ([uni, theme]) => {
    const page = await open(browser, ANIME, { viewport: { width: 390, height: 844 }, colorScheme: theme });
    if (uni !== 'naruto') await page.evaluate((u) => selectUniverse(u), uni);
    const tags = new Set(), kinds = new Set();
    const note = async () => { const a = await arena(page); tags.add(a.tag); kinds.add(a.kind); };
    const result = () => page.waitForFunction(() => getComputedStyle(document.getElementById('screen-result')).display !== 'none');
    /* 1. Partie 6e : justes, erreurs et temps écoulés mêlés, pouvoirs, pause. */
    await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
    for (let i = 0; i < 80 && (await page.evaluate(() => document.getElementById('screen-game').style.display === 'block')); i++) {
      await note();
      if (i === 2) await page.evaluate(() => { useJutsu('50'); useJutsu('hint'); });
      if (i === 4) { await page.evaluate(() => pauseGame()); await wait(page, 30); await page.evaluate(() => resumeGame()); }
      if (i % 7 === 3) await page.evaluate(() => __tick(460)); else if (i % 4 === 1) await wrong(page); else await right(page);
      await wait(page, i % 5 === 0 ? 120 : 25);
      await next(page); await wait(page, 20);
    }
    await result(); await wait(page, 300);
    check('partie 6e (' + uni + ', ' + theme + ') : résultat atteint, revenants rencontrés', kinds.has('revenant') && kinds.has('sbire'), [Array.from(kinds), Array.from(tags)]);
    /* 2. Boss jusqu'à la défaite. */
    await page.evaluate(() => startGame('boss')); await gameShown(page);
    await right(page); await wait(page, 60); await next(page);
    for (let i = 0; i < 3; i++) { await wait(page, 30); await wrong(page); await wait(page, 60); if (i < 2) await next(page); }
    await result(); await wait(page, 300);
    /* 3. Entraînement libre. */
    await page.evaluate(() => startGame('libre')); await gameShown(page);
    for (let i = 0; i < 60 && (await page.evaluate(() => document.getElementById('screen-game').style.display === 'block')); i++) {
      if (i % 3 === 2) await wrong(page); else await right(page);
      await wait(page, 20); await next(page); await wait(page, 15);
    }
    await result(); await wait(page, 200);
    /* 4. Chapitre de 4e (pool infini : vagues), terminé depuis la pause. */
    await page.evaluate(() => startGame('4e:pythagore')); await gameShown(page);
    const infinite = await page.evaluate(() => !!state.infiniteChapter);
    for (let i = 0; i < 26; i++) {
      await note();
      if (i % 6 === 4) await wrong(page); else await right(page);
      await wait(page, 20); await next(page); await wait(page, 15);
    }
    if (infinite) {
      check('chapitre 4e (' + uni + ') : vagues annoncées dans l\'arène', Array.from(tags).some((t) => /^VAGUE \d/.test(t)), Array.from(tags));
      await page.evaluate(() => { pauseGame(); finishInfiniteSession(); });
    } else await playThrough(page, 1);
    await result(); await wait(page, 300);
    const st = await page.evaluate(() => { const s = FX.stats(); return { err: s.errCount, errors: s.errors, dead: s.dead, modules: s.modules, missing: s.missing, denied: s.denied }; });
    check('parties (' + uni + ', ' + theme + ') : aucune erreur console / page', page.errors.length === 0, page.errors);
    check('parties (' + uni + ', ' + theme + ') : couche saine (aucune erreur interne, modules démarrés)',
      st.err === 0 && !st.dead && st.missing.length + st.denied.length === 0 && ['arene', 'combat', 'verdict'].every((m) => st.modules[m] === 'ok'), st);
    await page.context().close();
  }));
}

const SCENARIOS = [
  ['diff', 'différentiel classique / off / complet / chaos', scenarioDiff],
  ['reglages', 'réglages et persistance', scenarioSettings],
  ['reduit', 'prefers-reduced-motion', scenarioReduced],
  ['miseenpage', 'mise en page au niveau off', scenarioLayout],
  ['noyau', 'garde-fous du noyau', scenarioKernel],
  ['arene', 'arène du QCM (mise en page, modes, univers)', scenarioArena],
  ['combat', 'moments du QCM (journal, coupure nette)', scenarioCombat],
  ['verdict', 'cérémonie du résultat', scenarioVerdict],
  ['parties', 'parties complètes (modes × univers × thèmes)', scenarioSessions]
];

/* Scénarios des modules : un fichier par module dans tools/anime-tests/ (ordre alphabétique).
   Chaque fichier exporte function (h) { return [[clé, titre, async (browser) => {…}], …]; }
   où h regroupe les aides de ce fichier (voir HELPERS). */
const HELPERS = { check, open, wait, waapi, gameShown, snap, firstDiff, logOf, during, leftovers, isIdle, harness,
  ROOT, INDEX, ANIME, SEED };
const fs = require('fs');
const EXTRA_DIR = path.join(__dirname, 'anime-tests');
if (fs.existsSync(EXTRA_DIR)) {
  fs.readdirSync(EXTRA_DIR).filter((f) => /\.js$/.test(f)).sort().forEach((f) => {
    (require(path.join(EXTRA_DIR, f))(HELPERS) || []).forEach((s) => SCENARIOS.push(s));
  });
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch();
  for (const [key, title, fn] of SCENARIOS) {
    if (ONLY && ONLY.indexOf(key) < 0) continue;
    const t = Date.now(), n = failures.length;
    try { await fn(browser); } catch (e) { check(title + ' (exception du test)', false, String(e && e.stack || e).slice(0, 600)); }
    console.log((failures.length === n ? '✓ ' : '✗ ') + title + '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  }
  await browser.close();
  console.log('\n' + checks + ' vérifications, ' + failures.length + ' échec(s), ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(failures.length ? 1 : 0);
})();
