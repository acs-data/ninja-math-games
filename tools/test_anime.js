#!/usr/bin/env node
/* Test de fumée différentiel de l'édition animée (index.html, la page principale, générée) contre le jeu classique
   (classique.html, le fichier édité à la main).

     node tools/test_anime.js                      teste ./index.html
     node tools/test_anime.js --anime CHEMIN       teste une construction privée (build_anime.py --out)
     node tools/test_anime.js --only diff,reglages ne lance que certains scénarios
     node tools/test_anime.js --list               affiche les clés des scénarios
     node tools/test_anime.js --allow-missing-playwright   sans Playwright : code 0 au lieu de 3

   Codes de sortie : 0 = tout est vert ; 1 = au moins un échec, ou aucune vérification exécutée ;
   2 = appel invalide (option ou clé de --only inconnue, fichier --anime introuvable) ;
   3 = Playwright introuvable (rien n'a été testé : ce n'est jamais un succès, sauf dérogation explicite).

   Principe : même Math.random à graine fixe et même session QCM scriptée (clavier, clics, pause,
   temps écoulé) sur classique.html et sur index.html (niveaux off, complet, puis « chaos » où chaque
   crochet de la couche lève une exception). L'état du jeu, le focus, la suite des messages de
   #toast et de #sr-live, le HUD et l'empreinte du DOM du jeu doivent être IDENTIQUES à chaque étape.
   Les setInterval du jeu sont pilotés à la main (window.__tick) : le bonus de temps du score ne
   dépend donc pas de la vitesse de la machine. Les setTimeout restent réels mais sont SUIVIS : une
   photographie attend le calme (window.__settle) au lieu d'un délai fixe.

   Dépendance : Playwright + Chromium (aucune dépendance ajoutée au dépôt) ; le scénario « build » lance aussi
   python3 (tools/build_anime.py) et bash (étape du déploiement rejouée). Pour ajouter un scénario :
   écrire une fonction async (browser) et l'inscrire dans SCENARIOS, ou déposer un fichier dans
   tools/anime-tests/. */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const argv = process.argv.slice(2);
const OPTIONS = { '--anime': 1, '--only': 1, '--list': 0, '--allow-missing-playwright': 0 };   // 1 = attend une valeur
const usage = (msg) => { console.log('Appel invalide : ' + msg + '\nOptions : --anime CHEMIN, --only clé1,clé2, --list, --allow-missing-playwright'); process.exit(2); };
for (let i = 0; i < argv.length; i++) {
  if (!OPTIONS.hasOwnProperty(argv[i])) usage('option inconnue « ' + argv[i] + ' »');
  if (OPTIONS[argv[i]] && (argv[++i] === undefined || /^--/.test(argv[i]))) usage(argv[i - 1] + ' attend une valeur');
}
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.indexOf(name) >= 0;

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  if (!flag('--list')) {
    console.log('Playwright est introuvable : AUCUN test exécuté.');
    console.log('Pour le lancer : npm i -D playwright && npx playwright install chromium (hors dépôt), puis node tools/test_anime.js');
    if (!flag('--allow-missing-playwright')) process.exit(3);
    console.log('(--allow-missing-playwright : absence admise, code 0)');
    process.exit(0);
  }
}

const ROOT = path.resolve(__dirname, '..');
const CLASSIC = pathToFileURL(path.join(ROOT, 'classique.html')).href;
const ANIME_PATH = path.resolve(arg('--anime') || path.join(ROOT, 'index.html'));
const ANIME = pathToFileURL(ANIME_PATH).href;
const ONLY = arg('--only') ? arg('--only').split(',').map((k) => k.trim()).filter(Boolean) : null;
const SEED = 20261117;

const failures = [];
let checks = 0;
function check(name, ok, detail) {
  checks++;
  if (ok) return;
  failures.push(name + (detail !== undefined ? ' → ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log('  ✗ ' + name);
}

/* Injecté avant tout script de page : hasard à graine, setInterval manuel, tutoriel déjà vu, et de quoi
   photographier sans dépendre de la vitesse de la machine :
     __settle(d)        promesse tenue quand plus aucun setTimeout de délai <= d ms (150 par défaut) n'est en
                        attente, que le focus est stable (un nœud masqué ou désactivé qui a le focus le perd
                        un peu plus tard, par une tâche interne du navigateur : on attend qu'il soit retombé
                        sur <body>), et que deux images ont été peintes depuis ; false après 8 s sans calme ;
     __hold(d)          retient les setTimeout de délai >= d ms posés ensuite (état intermédiaire
                        photographié sans course) ; __release() les relance, dans l'ordre, avec leur délai ;
     __live()           messages écrits dans #sr-live et #toast depuis le dernier appel (observateur de
                        mutations : la SUITE des messages, pas le texte de l'instant) ;
     __domPrint(v)      empreinte du DOM du jeu (voir plus bas) ; __domLog garde le détail de chaque empreinte. */
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
  window.__tick = function (n) { for (let k = 0; k < n; k++) Array.from(cbs.values()).forEach((f) => f()); };
  try { sessionStorage.setItem('tutorial_seen', '1'); } catch (e) {}

  /* ── setTimeout réel mais suivi ── */
  const realSet = window.setTimeout, realClear = window.clearTimeout, raf = window.requestAnimationFrame.bind(window);
  const pending = new Map();            // id -> délai demandé
  const held = new Map();               // faux id -> { fn, ms, args, real }
  let holdMin = null, fake = -1000000000;
  const schedule = function (fn, ms, args, done) {
    const id = realSet.call(window, function () { pending.delete(id); if (done) done(); return fn.apply(window, args); }, ms);
    pending.set(id, +ms || 0);
    return id;
  };
  window.setTimeout = function (fn, ms) {
    if (typeof fn !== 'function') return realSet.apply(window, arguments);
    const args = Array.prototype.slice.call(arguments, 2);
    if (holdMin !== null && +ms >= holdMin) { held.set(--fake, { fn: fn, ms: ms, args: args, real: 0 }); return fake; }
    return schedule(fn, ms, args);
  };
  window.clearTimeout = function (id) {
    const h = held.get(id);
    if (h) { held.delete(id); id = h.real; if (!id) return; }
    pending.delete(id);
    realClear.call(window, id);
  };
  window.clearInterval = function (id) { if (!cbs.delete(id)) window.clearTimeout(id); };   // même réserve d'identifiants
  window.__hold = function (min) { holdMin = min; };
  window.__release = function () {
    holdMin = null;
    held.forEach(function (h, id) { if (!h.real) h.real = schedule(h.fn, h.ms, h.args, function () { held.delete(id); }); });
  };
  /* Le nœud qui a le focus peut-il le garder ? Sinon (désactivé, inerte, masqué, écran caché) Chromium le rend à
     <body> de façon différée : tant que ce n'est pas fait, la page n'est pas au calme. */
  const focusStable = function () {
    const ae = document.activeElement;
    if (!ae || ae === document.body || ae === document.documentElement) return true;
    if (ae.matches(':disabled') || ae.closest('[inert]')) return false;
    return ae.checkVisibility ? ae.checkVisibility({ checkVisibilityCSS: true }) : ae.getClientRects().length > 0;
  };
  window.__pending = function () {
    return Array.from(pending.values()).concat(Array.from(held.values()).map((h) => 'retenu ' + h.ms), focusStable() ? [] : ['focus sur un nœud masqué ou désactivé']);
  };
  window.__settle = function (maxDelay) {
    const max = maxDelay === undefined || maxDelay === null ? 150 : maxDelay, t0 = performance.now();
    const busy = function () { if (!focusStable()) return true; for (const d of pending.values()) if (d <= max) return true; return false; };
    return new Promise(function (res) {
      let calm = 0;
      (function poll() {
        calm = busy() ? 0 : calm + 1;
        if (calm >= 3) return res(true);                    // calme constaté sur trois images de suite
        if (performance.now() - t0 > 8000) return res(false);
        raf(poll);
      })();
    });
  };

  /* ── Journal des régions live (#sr-live est créée à la première annonce) ── */
  const live = { sr: [], toast: [] };
  new MutationObserver(function (recs) {
    for (const r of recs) {
      const key = r.target.id === 'sr-live' ? 'sr' : r.target.id === 'toast' ? 'toast' : null;
      if (key && r.type === 'childList') r.addedNodes.forEach(function (n) { if (n.textContent) live[key].push(n.textContent); });
      else if (r.type === 'characterData' && r.target.parentNode) {
        const k = r.target.parentNode.id === 'sr-live' ? 'sr' : r.target.parentNode.id === 'toast' ? 'toast' : null;
        if (k) live[k].push(r.target.data);
      }
    }
  }).observe(document, { childList: true, characterData: true, subtree: true });
  window.__live = function () { return { sr: live.sr.splice(0), toast: live.toast.splice(0) }; };

  /* ── Empreinte du DOM du jeu ──
     Tout <html> (attributs), <head> (balises) et <body> (balises, attributs triés, textes, valeur des champs),
     une fois retirés : les nœuds de la couche (id en « fx- », ou pas d'id et toutes les classes en « fx- » :
     calque, arène, boutons de réglage, <style> et <script> injectés), les attributs data-fx*, le contenu des
     <script> / <style>. Le <head> est comparé en entier : balises, TOUS leurs attributs (titre, descriptions,
     manifest compris : index.html reprend le <head> de classique.html tel quel) et le texte du <title>. Les
     commentaires (dont le bandeau « fichier généré » posé avant <html>) ne comptent jamais. Un nœud du JEU qui recevrait une classe « fx- » reste dans l'empreinte, classe comprise.
     « volatile » = ids dont l'attribut class dépend d'une minuterie longue non retenue (#toast, #combo-display).
     Renvoie { h, n } ; le détail (un jeton par balise ouvrante, texte ou balise fermante) reste dans __domLog. */
  window.__domLog = [];
  window.__domPrint = function (volatile) {
    const out = [], skip = {};
    (volatile || []).forEach(function (id) { skip[id] = 1; });
    const own = function (el) {
      if (el.id) return el.id.indexOf('fx-') === 0;
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      return !!cls && cls.split(/\s+/).every(function (k) { return k.indexOf('fx-') === 0; });
    };
    const open = function (el) {
      const a = [];
      for (let i = 0; i < el.attributes.length; i++) {
        const at = el.attributes[i];
        if (at.name.indexOf('data-fx') === 0 || (at.name === 'class' && skip[el.id])) continue;
        a.push(at.name + '="' + at.value + '"');
      }
      a.sort();
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) a.push('.value="' + el.value + '"');
      return '<' + el.tagName.toLowerCase() + (a.length ? ' ' + a.join(' ') : '') + '>';
    };
    const walk = function (node) {
      let text = '';
      for (let ch = node.firstChild; ch; ch = ch.nextSibling) {
        if (ch.nodeType === 3) { text += ch.data; continue; }
        if (ch.nodeType !== 1 || own(ch)) continue;
        if (text) { out.push('"' + text + '"'); text = ''; }
        const tag = ch.tagName;
        out.push(open(ch));
        if (tag !== 'SCRIPT' && tag !== 'STYLE') walk(ch);
        out.push('</' + tag.toLowerCase() + '>');
      }
      if (text) out.push('"' + text + '"');
    };
    out.push(open(document.documentElement));
    out.push('<head>');
    for (let el = document.head.firstElementChild; el; el = el.nextElementSibling) {
      if (own(el)) continue;
      out.push(open(el));
      if (el.tagName === 'TITLE') out.push('"' + el.textContent + '"');
      out.push('</' + el.tagName.toLowerCase() + '>');
    }
    out.push('</head>');
    out.push(open(document.body));
    walk(document.body);
    let h1 = 0x811C9DC5, h2 = 0x1505;
    for (let i = 0; i < out.length; i++) {
      const tok = out[i];
      for (let k = 0; k < tok.length; k++) { const ch = tok.charCodeAt(k); h1 = Math.imul(h1 ^ ch, 0x01000193); h2 = (Math.imul(h2, 33) + ch) | 0; }
      h1 = Math.imul(h1 ^ 10, 0x01000193); h2 = (Math.imul(h2, 33) + 10) | 0;
    }
    window.__domLog.push(out);
    return { h: (h1 >>> 0).toString(16) + '.' + (h2 >>> 0).toString(16), n: out.length, i: window.__domLog.length - 1 };
  };
  /* Calme, puis ce que toute photographie embarque : messages des régions live et empreinte du DOM. */
  window.__shot = async function (maxDelay, volatile) {
    if (!(await window.__settle(maxDelay))) throw new Error('pas de calme après 8 s (minuteries en attente : ' + window.__pending().join(', ') + ')');
    return { live: window.__live(), dom: window.__domPrint(volatile) };
  };
}

/* Audit permanent des nœuds de la couche, injecté dans TOUTES les pages de TOUS les scénarios (voir
   instrument) : chaque élément dont l'id ou une classe commence par « fx- » est contrôlé à son insertion,
   à chaque changement de class / id / aria-hidden, puis une dernière fois à la fermeture de la page.
     · nœud de la couche (id en « fx- », ou pas d'id et toutes les classes en « fx- ») : aria-hidden="true" sur
       lui-même ou sur un ancêtre, et insensible au pointeur (pointer-events: none) ; seuls les cinq boutons
       de réglage du noyau y échappent ;
     · jamais dans un écran du jeu (#screen-*), sauf #fx-arena (et ce qu'elle contient) et #fx-set-home ;
     · un nœud du JEU ne porte jamais de classe « fx- » (ni classe ni style de la couche sur le jeu) ;
     · #fx-style et #fx-script sont les deux nœuds posés par le build, pas des nœuds d'effet. */
function audit() {
  const SETTINGS = { 'fx-set-home': 1, 'fx-set-drawer': 1, 'fx-lite-drawer': 1, 'fx-set-pause': 1, 'fx-set-auto-pause': 1 };
  const A = { seen: 0, bad: [], keys: {} };
  const marked = (el) => (el.id && el.id.indexOf('fx-') === 0) || (typeof el.className === 'string' && /(^|\s)fx-/.test(el.className));
  const layer = (el) => (el.id ? el.id.indexOf('fx-') === 0 : el.className.trim().split(/\s+/).every((k) => k.indexOf('fx-') === 0));
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const bad = (why, el, where) => {
    const key = why + '|' + name(el) + '|' + where;
    if (A.keys[key] || A.bad.length >= 12) return;
    A.keys[key] = 1;
    A.bad.push(why + ' : ' + name(el) + ' dans ' + where + ' « ' + (el.textContent || '').slice(0, 30) + ' »');
  };
  const check = (el) => {
    if (el.id === 'fx-style' || el.id === 'fx-script' || !el.isConnected) return;
    A.seen++;
    if (!layer(el)) { bad('classe de la couche posée sur un nœud du jeu', el, el.parentNode && el.parentNode.nodeType === 1 ? name(el.parentNode) : '?'); return; }
    let hidden = false, setting = false, arena = false, screen = '';
    for (let p = el; p && p.nodeType === 1; p = p.parentNode) {
      if (p.getAttribute('aria-hidden') === 'true') hidden = true;
      if (SETTINGS[p.id]) setting = true;
      if (p.id === 'fx-arena') arena = true;
      if (!screen && /^screen-/.test(p.id || '')) screen = p.id;
    }
    const where = el.parentNode && el.parentNode.nodeType === 1 ? name(el.parentNode) : '?';
    if (setting) return;
    if (!hidden) bad('nœud de la couche sans aria-hidden', el, where);
    if (getComputedStyle(el).pointerEvents !== 'none') bad('nœud de la couche sensible au pointeur', el, where);
    if (screen && !arena) bad('nœud de la couche dans un écran du jeu (#' + screen + ')', el, where);
  };
  const sweep = (rootEl) => {
    if (rootEl.nodeType !== 1) return;
    if (marked(rootEl)) check(rootEl);
    const l = rootEl.querySelectorAll('[id^="fx-"], [class*="fx-"]');
    for (let i = 0; i < l.length; i++) if (marked(l[i])) check(l[i]);
  };
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.type === 'attributes') { if (marked(r.target)) check(r.target); } else r.addedNodes.forEach(sweep);
    }
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'aria-hidden'] });
  window.__fxAudit = function () { sweep(document.documentElement); return { seen: A.seen, bad: A.bad.slice(), fx: typeof FX !== 'undefined' }; };
}
/* Pose l'audit sur chaque contexte créé, et le relève à sa fermeture (browser.audits, vidé par scénario). */
function instrument(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.audits = [];
  browser.newContext = async function (opts) {
    const ctx = await newContext(opts);
    await ctx.addInitScript(audit);
    const close = ctx.close.bind(ctx);
    ctx.close = async function () {
      for (const pg of ctx.pages()) {
        try { const a = await pg.evaluate(() => (window.__fxAudit ? window.__fxAudit() : null)); if (a && a.fx) browser.audits.push(a); } catch (e) { /* page déjà fermée */ }
      }
      return close();
    };
    return ctx;
  };
  return browser;
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
  /* opts.init = [[fonction, argument], …] : scripts propres au scénario, injectés après le harnais et avant ceux de la page. */
  for (const [fn, a] of opts.init || []) await page.addInitScript(fn, a);
  await page.goto(url);
  await page.waitForTimeout(150);
  return page;
}
const wait = (page, ms) => page.waitForTimeout(ms);
/* Attend le calme de la page (voir __settle) : à préférer à un délai fixe avant de lire le focus, une région
   live ou un état posé par une minuterie courte du jeu (annonce : 50 ms ; focus d'une modale : 50 ms…). */
async function settle(page, maxDelay) {
  if (!(await page.evaluate((d) => window.__settle(d), maxDelay === undefined ? null : maxDelay))) {
    throw new Error('pas de calme après 8 s (minuteries en attente : ' + (await page.evaluate(() => window.__pending().join(', '))) + ')');
  }
}
/* Classes pilotées par une minuterie longue du jeu que les sessions sans __later() ne retiennent pas :
   elles sont écartées de l'empreinte du DOM (le texte de ces nœuds, lui, reste comparé). */
const VOLATILE = ['toast', 'combo-display'];
/* Range l'empreinte du DOM d'une photographie dans page.doms et renvoie la photographie sans elle. */
function keepDom(page, shot) {
  (page.doms || (page.doms = [])).push({ label: shot.label, h: shot.dom.h, n: shot.dom.n, i: shot.dom.i });
  delete shot.dom;
  return shot;
}
/* Animations WAAPI en cours (celles de la couche) : on écarte les animations/transitions CSS du jeu. */
const waapi = (page) => page.evaluate(() => document.getAnimations()
  .filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map((a) => a.effect.getTiming().duration));
const gameShown = (page) => page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');

/* Photographie de tout ce que le jeu expose : état, focus, régions live, écran, modales — prise au calme
   (opts.settle : délai des minuteries à laisser échoir, 150 ms par défaut), avec la suite des messages
   écrits dans #sr-live et #toast depuis la photographie précédente et l'empreinte du DOM du jeu. */
async function snap(page, label, opts) {
  opts = opts || {};
  return keepDom(page, await page.evaluate(async ([label, maxDelay, volatile]) => {
    const base = await window.__shot(maxDelay, volatile);
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
      toast: txt('toast'), sr: txt('sr-live'), srLog: base.live.sr, toastLog: base.live.toast, dom: base.dom,
      hud: [txt('hud-score'), txt('hud-streak'), txt('hud-level')],
      screens: Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id),
      modals: Array.from(document.querySelectorAll('.modal-overlay.show')).map((m) => m.id),
      answers: Array.from(document.querySelectorAll('#answers-grid .answer-btn')).map((b) => b.className + (b.disabled ? ':off' : '') + '|' + b.getAttribute('aria-label')),
      feedback: fb ? fb.style.display + '|' + fb.className + '|' + fb.textContent : null,
      result: [txt('result-rank'), txt('result-msg'), txt('res-score'), txt('res-correct'), txt('trophies-list')],
      bodyOverflow: document.body.style.overflow,
      storage: Object.keys(localStorage).sort()
    };
  }, [label, opts.settle === undefined ? null : opts.settle, opts.volatile || VOLATILE]));
}

/* Session QCM scriptée, identique pour toutes les pages. */
async function session(page) {
  const shots = [];
  const shot = async (label) => { shots.push(await snap(page, label)); };
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
/* Première différence entre les empreintes du DOM de deux pages ENCORE OUVERTES (mêmes étapes) : null, ou
   { etape, chemin, classique, anime } où « chemin » mène au premier nœud qui diffère. */
async function domDiff(pa, pb) {
  const a = pa.doms || [], b = pb.doms || [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] && b[i] && a[i].h === b[i].h && a[i].label === b[i].label) continue;
    if (!a[i] || !b[i] || a[i].label !== b[i].label) return { etape: (a[i] || b[i]).label, chemin: '(étapes différentes)', classique: a[i] && a[i].label, anime: b[i] && b[i].label };
    const [ta, tb] = await Promise.all([pa.evaluate((k) => window.__domLog[k], a[i].i), pb.evaluate((k) => window.__domLog[k], b[i].i)]);
    let k = 0;
    while (k < ta.length && k < tb.length && ta[k] === tb[k]) k++;
    const stack = [];
    for (let j = 0; j < k; j++) {
      const t = ta[j];
      if (t.charAt(0) !== '<') continue;
      if (t.charAt(1) === '/') { stack.pop(); continue; }
      const id = / id="([^"]*)"/.exec(t), cls = / class="([^" ]+)/.exec(t);
      stack.push(/^<([\w-]+)/.exec(t)[1] + (id ? '#' + id[1] : cls ? '.' + cls[1] : ''));
    }
    const cut = (s) => (s === undefined ? '(fin du document)' : s.length > 240 ? s.slice(0, 240) + '…' : s);
    return { etape: a[i].label, chemin: stack.join(' > '), classique: cut(ta[k]), anime: cut(tb[k]) };
  }
  return null;
}
/* Vérifie l'empreinte du DOM de chaque page animée contre la page classique, puis ferme tout.
   runs = [[nom, run], …], le premier étant le classique ; run.page doit être encore ouverte. */
async function domChecks(prefix, runs) {
  const classic = runs[0][1];
  const doms = classic.page.doms || [];
  check(prefix + ' : empreinte du DOM prise à chaque étape (document entier : plus de 1000 jetons)', doms.length > 0 && doms.every((d) => d.n > 1000), doms.map((d) => d.n).slice(0, 6));
  for (const [name, r] of runs.slice(1)) {
    const d = await domDiff(classic.page, r.page);
    check(prefix + ' : DOM du jeu identique à classique.html, hors nœuds fx- et attributs data-fx* (' + name + ')', !d, d);
  }
  await Promise.all(runs.map(([, r]) => r.page.context().close()));
}

/* ── Scénario 1 : différentiel classique / off / complet / chaos ── */
async function scenarioDiff(browser) {
  const run = async (url, prepare) => {
    const page = await open(browser, url);
    if (prepare) await page.evaluate(prepare);
    const globals = await page.evaluate(() => Object.keys(window).sort());      // les aides du harnais (__tick, __settle…) sont dans les deux pages
    const shots = await session(page);
    const fx = url === ANIME ? await page.evaluate(() => ({ log: FX.debug.log.length, stats: FX.stats() })) : null;
    return { page, shots, fx, errors: page.errors, globals };
  };
  const [classic, off, full, chaos] = await Promise.all([
    run(CLASSIC),
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
  check('régions live : la session classique annonce et affiche des toasts (suites non vides)',
    classic.shots.some((s) => s.srLog.length > 0) && classic.shots.some((s) => s.toastLog.length > 0), classic.shots.map((s) => [s.label, s.srLog.length, s.toastLog.length]));
  await domChecks('QCM', [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos]]);
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

  await page.click('#topbar-menu-btn'); await settle(page);          // focus posé par le jeu 50 ms après l'ouverture
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
  /* Lu DANS le tick de la touche (écouteur posé après ceux du jeu) : sur l'accueil d'une page fraîche, le même
     Échap ouvre ensuite la pause du QCM (défaut hérité de classique.html : #screen-game n'a pas encore de style en
     ligne), dont le focus part 50 ms plus tard. Une lecture à délai fixe tombait avant ou après selon la machine. */
  await page.evaluate(() => window.addEventListener('keydown', () => {
    window.__esc = { drawer: document.getElementById('drawer-menu').classList.contains('show'), focus: document.activeElement && document.activeElement.id };
  }, { once: true }));
  await page.keyboard.press('Escape'); await settle(page);
  const esc = await page.evaluate(() => window.__esc);
  check('Échap ferme le tiroir, focus rendu au bouton menu', !!esc && !esc.drawer && esc.focus === 'topbar-menu-btn', esc);

  // Modale de pause : Entrée / Espace sur le bouton FX ne reprend ni n'avance la partie.
  await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
  await page.keyboard.press('Escape'); await settle(page);
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
  await page.keyboard.press('Escape'); await settle(page);                // Échap : le jeu ferme puis rouvre la pause (comportement d'origine)
  await page.evaluate(() => { quitFromPause(); startAutoMode('auto_6e'); });
  await settle(page);                                                     // focus du champ : 100 ms après le départ
  await page.focus('#auto-input'); await page.keyboard.press('Escape'); await settle(page);
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
  await page.click('#fx-set-home');                          // l'éclat de confirmation part dans le tick du clic : lu sans attendre
  const r = await page.evaluate(() => ({ level: FX.level(), burst: FX.debug.log.filter((e) => e.fx === 'burst')[0], particles: FX.stats().particles }));
  check('mouvement réduit : rallumer donne « léger »', r.level === 'leger', r);
  check('mouvement réduit : mouvement visible (particules, 8 au plus)', !!r.burst && r.burst.n > 0 && r.burst.n <= 8 && r.particles > 0, r);
  /* Lue dans la page à l'image même où la transition démarre (la file de la couche est vidée par un rAF demandé
     avant celui-ci) : une attente fixe côté Node pouvait tomber après la fin des 140 ms sur une machine chargée. */
  const a = await page.evaluate(() => new Promise((res) => {
    showScreen('stats');
    requestAnimationFrame(() => res(document.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).map((x) => x.effect.getTiming().duration)));
  }));
  check('mouvement réduit : l\'animation WAAPI garde sa durée (140 ms)', a.length === 1 && a[0] === 140, a);
  check('aucune erreur console / page (mouvement réduit)', page.errors.length === 0, page.errors);
  await page.context().close();
}

/* ── Scénario 4 : au niveau off, la mise en page est celle du jeu classique ── */
async function scenarioLayout(browser) {
  const rects = (page) => page.evaluate(() => {
    const out = {};
    /* Les animations CSS du jeu en cours (pulsation de la bonne réponse, entrée d'un panneau) déforment les
       rectangles mesurés : elles sont menées à leur terme (les boucles ramenées à leur début) avant la mesure,
       qui ne dépend donc plus de l'instant où elle tombe. */
    document.getAnimations().forEach((a) => {
      try { if (a.effect && a.effect.getComputedTiming().endTime === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch (e) { /* animation déjà retirée */ }
    });
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
    const res = await Promise.all([CLASSIC, ANIME].map(async (url) => {
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
    // 7 bis. Contrat de l'enveloppe (FX.wrap), sur une globale jetable : même this, mêmes arguments, valeur
    // renvoyée telle quelle, exception du jeu propagée (le même objet), original appelé exactement une fois.
    const probe = { calls: 0, self: null, args: null, err: new Error('exception du jeu'), token: { retour: 1 }, before: [], after: [] };
    window.__sonde = function (a) {
      probe.calls++; probe.self = this; probe.args = Array.prototype.slice.call(arguments);
      if (a === 'lève') throw probe.err;
      return probe.token;
    };
    const bare = window.__sonde;
    out.wrapped = [FX.wrap('__sonde', function () { probe.before.push([this, arguments.length, arguments[0]]); return 'ctx'; },
      function (ctx, args, ret) { probe.after.push([this, ctx, args.length, args[0], ret]); }), window.__sonde !== bare, FX.debug.orig('__sonde') === bare];
    const trial = () => {
      const self = { moi: 1 }, arg = { a: 1 }, res = {};
      probe.calls = 0; probe.before = []; probe.after = [];
      const ret = window.__sonde.call(self, arg, 2, 'trois');
      res.retour = ret === probe.token;
      res.thisArgs = probe.self === self && probe.args.length === 3 && probe.args[0] === arg && probe.args[1] === 2 && probe.args[2] === 'trois';
      res.uneFois = probe.calls === 1;
      const hookOk = probe.before.length === 1 && probe.before[0][0] === self && probe.before[0][1] === 3 && probe.before[0][2] === arg &&
        probe.after.length === 1 && probe.after[0][0] === self && probe.after[0][1] === 'ctx' && probe.after[0][2] === 3 && probe.after[0][3] === arg && probe.after[0][4] === probe.token;
      let caught = null;
      probe.calls = 0;
      try { window.__sonde.call(self, 'lève'); } catch (e) { caught = e; }
      res.exception = caught === probe.err;
      res.uneFoisQuandLeve = probe.calls === 1;
      res.crochets = probe.before.length + '/' + probe.after.length + (hookOk ? ' ok' : '');
      return res;
    };
    out.contract = { complet: trial() };
    FX.setLevel('off'); out.contract.off = trial();
    FX.setLevel('complet'); FX.debug.chaos = true; out.contract.chaos = trial(); out.contract.chaosLeves = FX.stats().chaos;
    FX.debug.chaos = false;
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
    out.contract.coupee = trial();
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
  /* Contrat de l'enveloppe : la couche n'est jamais entre le jeu et lui-même. */
  check('enveloppe : la globale jetable est bien enveloppée (FX.debug.orig rend l\'original)', r.wrapped.every(Boolean), r.wrapped);
  for (const [lv, hooks] of [['complet', '2/1 ok'], ['off', '0/0'], ['chaos', '0/0'], ['coupee', '0/0']]) {
    const k = r.contract[lv], tag = lv === 'coupee' ? 'couche coupée' : 'niveau ' + lv;
    check('enveloppe (' + tag + ') : valeur de retour rendue telle quelle', k.retour === true, k);
    check('enveloppe (' + tag + ') : même this et mêmes arguments pour l\'original', k.thisArgs === true, k);
    check('enveloppe (' + tag + ') : l\'exception du jeu se propage (le même objet)', k.exception === true, k);
    check('enveloppe (' + tag + ') : original appelé exactement une fois, qu\'il rende ou qu\'il lève', k.uneFois === true && k.uneFoisQuandLeve === true, k);
    check('enveloppe (' + tag + ') : crochets ' + (hooks === '2/1 ok' ? 'servis avec le même this, les arguments et le retour ; « après » sauté quand le jeu lève' : 'muets'), k.crochets === hooks, k);
  }
  check('enveloppe (chaos) : les crochets ont bien levé', r.contract.chaosLeves >= 2, r.contract.chaosLeves);
  check('aucune erreur console / page (noyau)', page.errors.length === 0, page.errors);
  await page.context().close();
  await Promise.all([kernelLoop(browser), kernelHidden(browser)]);
}
/* La boucle du moteur ne s'ouvre qu'UNE fois par image, même quand un effet démarre depuis un gestionnaire
   (FX.on, vidé par la boucle elle-même) : sinon le canvas est effacé et redessiné plusieurs fois par image.
   Les rappels de la boucle sont reconnus par leur nom (« tick », 01-engine.js) : le total contrôle que le nom tient. */
async function kernelLoop(browser) {
  const page = await open(browser, ANIME, { viewport: { width: 1280, height: 900 } });
  await wait(page, 900);
  const r = await page.evaluate(async () => {
    const real = window.requestAnimationFrame, per = new Map();
    FX.cancel('*');
    window.requestAnimationFrame = function (fn) {
      return real.call(window, fn && fn.name === 'tick' ? function (t) { per.set(t, (per.get(t) || 0) + 1); return fn(t); } : fn);
    };
    const pause = (ms) => new Promise((res) => setTimeout(res, ms));
    /* 1. Effets lancés par un gestionnaire, à répétition (ce que font tous les modules). */
    FX.on('t:boucle', () => { FX.fx.burst(200, 200, { n: 12, life: 400 }); FX.fx.ring(200, 200, {}); });
    for (let i = 0; i < 8; i++) { FX.emit('t:boucle', 0, null); await pause(60); }
    await pause(700);
    const a = Array.from(per.values()), idleA = FX.stats().loop;
    per.clear();
    /* 2. Une vraie bonne réponse du QCM (gestionnaire « qcm:rep », minuteries, particules). */
    startGame('6e_facile'); showScreen('game'); updateHUD(); loadQuestion();
    await pause(400);
    answer(state.questions[state.qIndex].correct);
    await pause(1000);
    const b = Array.from(per.values());
    window.requestAnimationFrame = real;
    return { a: [a.length, Math.max.apply(null, a)], b: [b.length, Math.max.apply(null, b)], idleA, idleB: FX.stats().loop, errors: FX.stats().errors };
  });
  check('boucle : une seule passe par image pendant des effets lancés par un gestionnaire (8 rafales)', r.a[0] >= 20 && r.a[1] === 1 && r.idleA === false, r);
  check('boucle : une seule passe par image pendant une bonne réponse du QCM, puis arrêt', r.b[0] >= 20 && r.b[1] === 1 && r.idleB === false && r.errors.length === 0, r);
  check('aucune erreur console / page (boucle)', page.errors.length === 0, page.errors);
  await page.context().close();
}
/* Page chargée dans un onglet caché (document.hidden vrai, images retenues) : l'ouverture de l'accueil reste due
   et joue quand l'élève arrive sur l'onglet — pas plus tard, à la fermeture d'une modale sans rapport. */
async function kernelHidden(browser) {
  const page = await open(browser, ANIME, { viewport: { width: 1280, height: 900 }, init: [[function () {
    let hidden = true; const held = [], raf = window.requestAnimationFrame.bind(window);
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return hidden; } });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return hidden ? 'hidden' : 'visible'; } });
    window.requestAnimationFrame = function (fn) { if (hidden) { held.push(fn); return 0; } return raf(fn); };
    window.__show = function () { hidden = false; held.splice(0).forEach((fn) => raf(fn)); document.dispatchEvent(new Event('visibilitychange')); };
  }]] });
  await wait(page, 1500);
  const before = await page.evaluate(() => [FX.debug.log.length, FX.stats().suspended]);
  await page.evaluate(() => window.__show());
  await wait(page, 500);
  const after = await logOf(page);
  check('onglet caché au chargement : rien ne joue, la couche est suspendue', before[0] === 0 && before[1] === true, before);
  check('onglet caché au chargement : l\'ouverture de l\'accueil joue à l\'arrivée sur l\'onglet', after[0] === 'accueil[ouverture]', after);
  check('aucune erreur console / page (onglet caché)', page.errors.length === 0, page.errors);
  await page.context().close();
}

/* ── Scénario 5 bis : réseau et média — la couche ne demande rien et n'ajoute aucune balise de ressource ── */
async function scenarioNetwork(browser) {
  const TAGS = ['img', 'picture', 'audio', 'video', 'source', 'track', 'iframe', 'frame', 'object', 'embed', 'script', 'link', 'style'];
  const run = async (url) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
    const reqs = [];
    ctx.on('request', (q) => reqs.push(q.url()));
    await ctx.route(/^(https?|wss?):/, (route) => route.abort());          // rien ne sort de la machine ; la tentative reste comptée
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('websocket', (ws) => reqs.push(ws.url()));
    await page.addInitScript(harness, SEED);
    await page.goto(url);
    await wait(page, 900);                                                 // ouverture de l'accueil
    /* Session courte à travers les modules : univers, QCM (juste, faux, partie finie), résultat, Vrai/Faux,
       Histoire, Constructeur, Automatismes, Stats, thème. Les attentes laissent jouer les effets. */
    await page.evaluate(() => selectUniverse('onepiece')); await wait(page, 300);
    await page.evaluate(() => startGame('6e_facile')); await gameShown(page); await wait(page, 200);
    await page.evaluate(() => answer(state.questions[state.qIndex].correct)); await wait(page, 250);
    await page.evaluate(() => { nextQuestion(); answer((state.questions[state.qIndex].correct + 1) % 4); }); await wait(page, 250);
    await playThrough(page, 1); await wait(page, 700);
    await page.evaluate(() => { showHome(); startTrueFalse(); }); await wait(page, 200);
    await page.evaluate(() => answerTf(tfState.questions[tfState.qIdx].isTrue)); await wait(page, 250);
    await page.evaluate(() => { clearInterval(tfState.timer); showHome(); startStoryMode(); nextStoryStep(); answerStoryStep(storyState.currentStep.correct); }); await wait(page, 250);
    await page.evaluate(() => { showHome(); startPythMode(); }); await wait(page, 200);
    await page.evaluate(() => validatePythChallenge()); await wait(page, 200);
    await page.evaluate(() => { showHome(); startAutoMode('auto_6e'); }); await wait(page, 200);
    await page.evaluate(() => { document.getElementById('auto-input').value = String(autoState.questions[autoState.qIdx].a); submitAutoAnswer(); }); await wait(page, 250);
    await page.evaluate(() => { exitAutoMode(); showStatsScreen(); }); await wait(page, 200);
    await page.evaluate(() => { showHome(); toggleTheme(); }); await wait(page, 400);
    const dom = await page.evaluate((TAGS) => {
      const tags = {};
      TAGS.forEach((t) => { tags[t] = document.getElementsByTagName(t).length; });
      const res = [];
      document.querySelectorAll('[src], link[href], [srcset], [poster], object[data]').forEach((e) => res.push(e.tagName.toLowerCase() + ' ' + (e.getAttribute('src') || e.getAttribute('href') || e.getAttribute('srcset') || e.getAttribute('poster') || e.getAttribute('data'))));
      return { tags, res: res.sort(), sheets: document.styleSheets.length, fonts: document.fonts.size, played: typeof FX !== 'undefined' ? FX.debug.log.length : -1,
        fxNodes: Array.from(document.querySelectorAll('[id^="fx-"]')).filter((e) => /^(SCRIPT|STYLE)$/.test(e.tagName)).map((e) => e.tagName.toLowerCase() + '#' + e.id) };
    }, TAGS);
    await ctx.close();
    return { reqs: Array.from(new Set(reqs)).sort(), dom, errors: page.errors };
  };
  const [classic, anime] = await Promise.all([run(CLASSIC), run(ANIME)]);
  const short = (u) => (u.length > 140 ? u.slice(0, 140) + '…' : u);
  /* Admis en plus : la page elle-même (à la place de classique.html). Le manifest est le même (manifest.json). */
  const own = (u) => u === ANIME;
  const extra = anime.reqs.filter((u) => classic.reqs.indexOf(u) < 0 && !own(u));
  check('réseau : la session classique émet bien des requêtes observables (polices, compteur)', classic.reqs.length > 1 && classic.reqs.some((u) => /^https?:/.test(u)), classic.reqs.map(short));
  check('réseau : l\'édition animée ne demande rien que classique.html ne demande (manifest compris : le même)', extra.length === 0, extra.map(short));
  check('réseau : la couche a joué pendant la session (journal non vide)', anime.dom.played > 20, anime.dom.played);
  const want = Object.assign({}, classic.dom.tags, { script: classic.dom.tags.script + 1, style: classic.dom.tags.style + 1 });
  check('média : aucune balise img / audio / video / iframe / script / link / source / object / embed ajoutée (hors #fx-script et #fx-style du build)',
    JSON.stringify(anime.dom.tags) === JSON.stringify(want) && anime.dom.fxNodes.join() === 'style#fx-style,script#fx-script', [classic.dom.tags, anime.dom.tags, anime.dom.fxNodes]);
  /* Aucune différence admise : index.html reprend le <head> de classique.html tel quel (manifest compris). */
  check('média : mêmes attributs de ressource (src, href, srcset, poster) dans les deux pages, manifest compris',
    JSON.stringify(classic.dom.res) === JSON.stringify(anime.dom.res) && classic.dom.res.indexOf('link manifest.json') >= 0,
    [anime.dom.res.filter((x) => classic.dom.res.indexOf(x) < 0), classic.dom.res.filter((x) => anime.dom.res.indexOf(x) < 0)]);
  check('média : une seule feuille de style en plus (#fx-style), aucune police déclarée en plus',
    anime.dom.sheets === classic.dom.sheets + 1 && anime.dom.fonts === classic.dom.fonts, [classic.dom.sheets, anime.dom.sheets, classic.dom.fonts, anime.dom.fonts]);
  check('aucune erreur de page (réseau)', classic.errors.length + anime.errors.length === 0, [classic.errors, anime.errors]);
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
  const measured = await Promise.all(sizes.map(([w, h]) => Promise.all([measure(CLASSIC, { width: w, height: h }), measure(ANIME, { width: w, height: h }, 'complet')])));
  for (const [k, [w, h, tol, ah]] of sizes.entries()) {
    const tag = w + '×' + h, [c, a] = measured[k];
    console.log('    ' + tag + ' : haut des réponses (min/médiane/max sur 30 questions) classique ' + [c.min, c.med, c.max].join('/') +
      ' → animé ' + [a.min, a.med, a.max].join('/') + ' (écart médian ' + (a.med - c.med) + ' px) ; arène ' + a.arena.join(' ') + ' px');
    check('arène : réponses pas plus basses que dans classique.html (' + tag + ', tolérance ' + tol + ' px)', a.min - c.min <= tol && a.med - c.med <= tol && a.max - c.max <= tol, [c, a]);
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
  await Promise.all([combatWords(browser), combatHeader(browser)]);
}
/* Observateurs injectés par opts.init (voir open) : ils regardent la page image par image, DANS la page, sur une
   seule horloge — ce que la couche pose à l'écran pendant un effet, pas seulement ce qu'elle journalise.
     __watchWords(ms)   un mot de la couche (texte flottant, bandeau, cut-in) posé sur un des deux libellés du centre
                        de l'arène (pastille ×N, mot du combo) ? Rectangles du TEXTE (Range), nœuds visibles seulement
                        (opacité ≥ 0,5, ancêtres compris). Un bandeau ou un cut-in opaque qui couvre un libellé EN
                        ENTIER ne compte pas : rien ne se lit à moitié. -> { « mot sur libellé » : % du libellé couvert }
     __watchOver(ms, sel, skip)   pendant « ms », chaque nœud de #fx-stage visible (hors transition d'écran et repère 👇,
                        et hors classes de « skip ») croisé avec la partie VISIBLE (sous l'en-tête s'il est à l'écran,
                        dans la fenêtre, opacité ≥ 0,5) des éléments du jeu de sel = { nom: sélecteur }.
                        -> { over: { « nœud sur nom » : ms cumulées }, plates: textes des bandeaux / cut-in dans l'ordre
                             d'apparition, plateCut: pour chacun, de combien de ms il a quitté l'écran AVANT la fin
                             prévue de sa propre animation (≤ 0 : il est allé au bout ; plusieurs centaines : il a été
                             chassé — par le bandeau suivant, par exemple), maxPlates: bandeaux visibles en même temps
                             (au plus), onHeader: tous posés sur l'en-tête ?, last: dernier instant (ms) où la couche
                             n'était pas au repos,
                             lastDraw: idem sans compter les minuteries (rien à l'écran : ni particule, ni forme,
                             ni animation, ni nœud), lag: retard (ms) dû à la machine pendant l'observation = temps
                             cumulé des images au-delà de 34 ms (une machine au calme tient 17 ms : lag vaut 0). Un
                             contrôle de durée le déduit (« last - lag ») pour ne pas imputer à la couche une machine
                             saturée : particules et formes avancent au pas réel plafonné, la fin d'une animation
                             n'est vue qu'à l'image suivante } */
function watchers() {
  const textRect = (el) => { if (!el || !el.textContent) return null; const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return b.width ? b : null; };
  const inter = (a, b) => { const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return w > 1 && h > 1 ? w * h : 0; };
  const shown = (el, min) => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) if (+getComputedStyle(e).opacity < (min || 0.5)) return false; return true; };
  window.__watchWords = function (ms) {
    return new Promise((res) => {
      const A = document.getElementById('fx-arena'), t0 = performance.now(), hits = {};
      (function frame() {
        const labels = ['combo', 'tag'].map((k) => A.querySelector('.fx-ar-' + k)).filter((el) => shown(el)).map((el) => [el, textRect(el)]);
        document.querySelectorAll('#fx-stage .fx-float, #fx-stage .fx-banner, #fx-stage .fx-cutin').forEach((n) => {
          if (!shown(n)) return;
          const plate = !n.classList.contains('fx-float'), nr = plate ? n.getBoundingClientRect() : textRect(n);
          labels.forEach(([el, lr]) => {
            if (!lr || !nr) return;
            const a = inter(nr, lr), pct = Math.round(100 * a / (lr.width * lr.height));
            if (a > 0 && !(plate && pct >= 98)) { const key = n.textContent + ' sur « ' + el.textContent + ' »'; hits[key] = Math.max(hits[key] || 0, pct); }
          });
        });
        if (performance.now() - t0 < ms) requestAnimationFrame(frame); else res(hits);
      })();
    });
  };
  window.__watchOver = function (ms, sel, skip) {
    return new Promise((res) => {
      const t0 = performance.now(), out = { over: {}, plates: [], plateCut: [], maxPlates: 0, onHeader: true, last: 0, lastDraw: 0 }, stage = document.getElementById('fx-stage');
      const seen = [];                                       // par bandeau : { n: nœud, end: fin prévue de son animation, cut: avance à sa disparition }
      let lag = 0;
      const no = new RegExp('fx-(blade|cue' + (skip ? '|' + skip : '') + ')');
      let prev = t0, lastPlate = null;
      (function frame() {
        const now = performance.now(), dt = now - prev, hd = document.querySelector('header[role="banner"]').getBoundingClientRect(), top = hd.bottom > 0 ? hd.bottom : 0, st = FX.stats();
        prev = now;
        lag += Math.max(0, dt - 34);
        seen.forEach((p) => { if (p.cut === null && !p.n.isConnected) p.cut = Math.round(p.end - now); });
        if (st.particles + st.shapes + st.anims + st.nodes + st.timers + st.queue > 0) out.last = Math.round(now - t0);
        if (st.particles + st.shapes + st.anims + st.nodes > 0) out.lastDraw = Math.round(now - t0);
        let plates = 0;
        Array.from(stage.children).forEach((n) => {
          if (no.test(n.className)) return;
          const plate = /fx-(banner|cutin)/.test(n.className), r = n.getBoundingClientRect();
          if (plate && shown(n, 0.05)) {
            plates++;
            if (n !== lastPlate) {
              const a = n.getAnimations()[0], tm = a && a.effect.getComputedTiming();
              lastPlate = n; out.plates.push(n.textContent);
              seen.push({ n: n, end: tm ? now + tm.endTime - (a.currentTime || 0) : now, cut: null });
            }
            if (!(r.top >= hd.top - 1 && r.bottom <= hd.bottom + 1 && hd.top >= -1)) out.onHeader = false;
          }
          if (!shown(n)) return;
          for (const k in sel) {
            document.querySelectorAll(sel[k]).forEach((e) => {
              const b = e.getBoundingClientRect();
              if (!b.width || b.bottom <= top || b.top >= innerHeight || !shown(e)) return;
              if (inter(r, { left: b.left, right: b.right, top: Math.max(b.top, top), bottom: Math.min(b.bottom, innerHeight) }) > 0) {
                const key = n.className.replace(/fx-/g, '') + ' « ' + n.textContent.slice(0, 24) + ' » sur ' + k;
                out.over[key] = Math.round((out.over[key] || 0) + dt);
              }
            });
          }
        });
        out.maxPlates = Math.max(out.maxPlates, plates);
        if (now - t0 < ms) requestAnimationFrame(frame); else { out.plateCut = seen.map((p) => (p.cut === null ? 0 : p.cut)); out.lag = Math.round(lag); res(out); }
      })();
    });
  };
}
/* Les mots de l'arène ne se superposent jamais : « K.O. ! », « FIN DU COMBAT », l'ULTIME du niveau léger et les
   onomatopées ne recouvrent ni la pastille ×N ni le mot du combo ; le « VS » d'attente disparaît dès que la
   pastille porte un mot. */
async function combatWords(browser) {
  const CASES = [['naruto', 'complet', 1280, 800], ['myhero', 'complet', 1280, 800], ['naruto', 'leger', 1280, 800], ['myhero', 'complet', 412, 915], ['myhero', 'leger', 360, 640]];
  await Promise.all(CASES.map(async ([uni, level, w, h]) => {
    const tag = uni + ', ' + level + ', ' + w + '×' + h;
    const page = await open(browser, ANIME, { viewport: { width: w, height: h }, init: [[watchers]] });
    await page.evaluate(([u, l]) => { if (u !== 'naruto') selectUniverse(u); FX.setLevel(l); FX.cancel('*'); FX.seed(11); startGame('6e_facile'); }, [uni, level]);
    await gameShown(page); await wait(page, 350);
    /* Arène juste sous l'en-tête, XP loin d'un seuil, série imposée, puis bonne réponse observée image par image. */
    const hit = (streak, ms) => page.evaluate(async ([streak, ms]) => {
      const a = document.getElementById('fx-arena').getBoundingClientRect(), hd = document.querySelector('header').getBoundingClientRect().bottom;
      window.scrollBy(0, a.top - hd - 12);
      state.xp = (state.level - 1) * 500; state.streak = streak;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const seen = !!FX.arena.geo();
      FX.debug.log.length = 0;
      answer(state.questions[state.qIndex].correct);
      const hits = await window.__watchWords(ms);
      const q = (k) => document.querySelector('#fx-arena .fx-ar-' + k);
      return { seen, hits, combo: q('combo').textContent, tag: q('tag').textContent, vs: getComputedStyle(q('combo'), '::before').content,
        floats: FX.debug.log.filter((e) => e.fx === 'anim' && e.info === 'fx-float').length };
    }, [streak, ms]);
    const next = async () => { await page.evaluate(() => nextQuestion()); await wait(page, 320); };
    let r = await hit(1, 900);
    check('mots de l\'arène (' + tag + ') : coup au combo ×2 → aucun mot posé sur un libellé du centre', r.seen && r.combo === '×2' && r.tag === 'DOUBLE !' && Object.keys(r.hits).length === 0, r);
    await next();
    r = await hit(4, 1200);
    check('mots de l\'arène (' + tag + ') : ULTIME (×5) → rien sur « ×5 » ni sur « PENTA ! »', r.seen && r.combo === '×5' && r.tag === 'PENTA !' && Object.keys(r.hits).length === 0, r);
    /* Dernier coup d'une partie gagnée, avec une série de 2 : « K.O. ! » dans la pastille, le mot du combo dessous. */
    await page.evaluate(() => {
      let g = 0; nextQuestion();
      while (!(state.qIndex >= state.questions.length - 1 && !state.missedQueue.length) && g++ < 200) { answer(state.questions[state.qIndex].correct); nextQuestion(); }
    });
    await wait(page, 1300);
    r = await hit(1, 1200);
    check('mots de l\'arène (' + tag + ') : K.O. final → « K.O. ! » écrit dans la pastille de l\'arène, « DOUBLE ! » lisible dessous, rien posé dessus',
      r.seen && r.combo === 'K.O. !' && r.tag === 'DOUBLE !' && Object.keys(r.hits).length === 0, r);
    check('aucune erreur (mots de l\'arène, ' + tag + ')', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }));
  /* Revanche : le bandeau tient entre les deux combattants et les libellés du centre s'effacent dessous.
     Boss : « FIN DU COMBAT » dans la pastille, sans le « VS » d'attente derrière. */
  for (const [w, h] of [[360, 640], [1280, 800]]) {
    const page = await open(browser, ANIME, { viewport: { width: w, height: h }, init: [[watchers]] });
    await page.evaluate(() => { FX.cancel('*'); startGame('6e_facile'); }); await gameShown(page); await wait(page, 350);
    const r = await page.evaluate(async () => {
      const a = document.getElementById('fx-arena').getBoundingClientRect(), hd = document.querySelector('header').getBoundingClientRect().bottom;
      window.scrollBy(0, a.top - hd - 12);
      state.xp = (state.level - 1) * 500; state.streak = 2; state.questions[state.qIndex]._retry = true;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      answer(state.questions[state.qIndex].correct);
      await new Promise((r) => setTimeout(r, 350));
      const b = document.querySelector('#fx-stage .fx-banner'), q = (s) => document.querySelector('#fx-arena ' + s).getBoundingClientRect(), br = b && b.getBoundingClientRect(), ar = q('');
      const out = { text: b && b.textContent, inArena: !!br && br.top >= ar.top - 1 && br.bottom <= ar.bottom + 1, hero: !!br && br.left - q('.fx-ar-l').right, foe: !!br && q('.fx-ar-r').left - br.right,
        mid: getComputedStyle(document.querySelector('#fx-arena .fx-ar-m')).opacity };
      out.hits = await window.__watchWords(800);
      return out;
    });
    check('revanche (' + w + '×' + h + ') : bandeau au centre de l\'arène, entre les deux combattants, libellés du centre effacés dessous',
      /REVANCHE RÉUSSIE/.test(r.text) && r.inArena && r.hero >= 0 && r.foe >= 0 && r.mid === '0' && Object.keys(r.hits).length === 0, r);
    await page.evaluate(() => { showHome(); startGame('boss'); }); await gameShown(page); await wait(page, 300);
    for (let i = 0; i < 2; i++) { await wrong(page); await wait(page, 40); await next(page); await wait(page, 60); }
    const k = await page.evaluate(async () => {
      const a = document.getElementById('fx-arena').getBoundingClientRect(), hd = document.querySelector('header').getBoundingClientRect().bottom;
      window.scrollBy(0, a.top - hd - 12);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      answer((state.questions[state.qIndex].correct + 1) % 4);
      FX.debug.log.length = 0;
      const hits = await window.__watchWords(1100), c = document.querySelector('#fx-arena .fx-ar-combo');
      return { hits, combo: c.textContent, vs: getComputedStyle(c, '::before').content, op: getComputedStyle(c).opacity, down: document.getElementById('fx-arena').classList.contains('fx-down'),
        floats: FX.debug.log.filter((e) => e.fx === 'anim' && e.info === 'fx-float').length };
    });
    check('boss vaincu par… le boss (' + w + '×' + h + ') : « FIN DU COMBAT » dans la pastille de l\'arène, sans « VS » derrière, aucun texte flottant',
      k.down && k.combo === 'FIN DU COMBAT' && k.vs === 'none' && k.op === '1' && k.floats === 0 && Object.keys(k.hits).length === 0, k);
    check('aucune erreur (revanche et fin du combat, ' + w + '×' + h + ')', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }
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
/* Arène HORS champ (petit téléphone : l'élève lit la fin de la question, la bande est passée sous l'en-tête
   collant) : chaque moment garde une forme propre, sur l'en-tête, et rien de neuf ne se pose sur la question,
   les réponses ou l'explication. Le niveau gagné attend que le bandeau du moment soit parti. */
async function combatHeader(browser) {
  const SEL = { question: '#question-text', reponses: '#answers-grid .answer-btn', explication: '#feedback-panel' };
  await Promise.all([[360, 640, 'complet'], [390, 664, 'complet'], [360, 640, 'leger']].map(async ([w, h, level]) => {
    const tag = w + '×' + h + ', ' + level, full = level === 'complet';
    const page = await open(browser, ANIME, { viewport: { width: w, height: h }, init: [[watchers]] });
    await page.evaluate((l) => { FX.setLevel(l); FX.cancel('*'); FX.seed(5); startGame('6e_facile'); }, level);
    await gameShown(page); await wait(page, 350);
    /* L'arène passe juste sous l'en-tête (la page défile de ce qu'il faut), série imposée, réponse, observation. */
    const play = (o) => page.evaluate(async ([o, SEL]) => {
      const a = document.getElementById('fx-arena').getBoundingClientRect(), hd = document.querySelector('header').getBoundingClientRect().bottom, q = state.questions[state.qIndex];
      window.scrollBy(0, a.bottom - hd + 4);
      state.xp = o.level ? state.level * 500 - 20 : (state.level - 1) * 500;
      if (o.streak !== undefined) state.streak = o.streak;
      if (o.retry) q._retry = true;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = { arena: !!FX.arena.geo(), y0: scrollY, power: FX.palette().power.toUpperCase(), hero: FX.palette().heroEmoji };
      FX.debug.log.length = 0;
      answer(o.wrong ? (q.correct + 1) % 4 : q.correct);
      const seen = await window.__watchOver(o.ms || 1500, SEL);
      const log = FX.debug.log.map((e) => e.fx + (e.info ? '[' + e.info + ']' : '') + (e.level === 'leger' ? '~' : ''));
      const stars = FX.debug.log.filter((e) => e.fx === 'burst' && e.info === 'star').map((e) => e.n);
      return Object.assign(out, seen, { log, stars, y1: scrollY, level: state.level });
    }, [o, SEL]);
    const next = async () => { await page.evaluate(() => nextQuestion()); await wait(page, 320); };
    const clean = (r) => !r.arena && r.y0 === r.y1 && Object.keys(r.over).length === 0;
    const none = (r, re) => !r.log.some((l) => re.test(l));
    let r = await play({});
    check('arène hors champ (' + tag + ') : coup simple → étincelle sur la réponse, points vers le score, aucun bandeau, aucune étoile',
      clean(r) && has(r.log, 'qcm-juste[×1]') && r.plates.length === 0 && r.stars.length === 0 && none(r, /fx-cutin|fx-tint|fx-ar-/), r);
    await next();
    r = await play({ streak: 2 });
    check('arène hors champ (' + tag + ') : combo ×3 → onde et étoiles sur le compteur de série (le mot est celui du bandeau du jeu), aucun bandeau',
      clean(r) && has(r.log, 'qcm-juste[×3]') && r.plates.length === 0 && r.stars.length === 1 && has(r.log, 'ring'), r);
    check('arène hors champ (' + tag + ') : le bandeau de combo du jeu reste visible (il porte le mot du combo)',
      (await page.evaluate(() => !document.documentElement.hasAttribute('data-fx-combo-off') && document.getElementById('combo-display').textContent)) === '🌪️ TRIPLE !');
    await next();
    r = await play({ streak: 4 });
    check('arène hors champ (' + tag + ') : ULTIME → bandeau « <pouvoir> ULTIME ! » SUR l\'en-tête, éclat d\'étoiles parti de sa ligne, ni cut-in ni teinte',
      clean(r) && has(r.log, 'qcm-ultime[×5]') && r.plates.length === 1 && r.plates[0] === r.hero + r.power + ' ULTIME !' && r.onHeader && r.maxPlates === 1 && r.plateCut[0] <= 150 &&
      r.stars.length === 1 && (full ? r.stars[0] >= 24 : r.stars[0] > 0 && r.stars[0] <= 8) && none(r, /fx-cutin|fx-tint/), r);
    check('arène hors champ (' + tag + ') : ULTIME fini en 1,1 s (retard de la machine déduit)', r.last > 300 && r.last - r.lag <= 1100, [r.last, r.lag]);
    await next();
    r = await play({ wrong: true });
    check('arène hors champ (' + tag + ') : erreur → ni bandeau ni étoile, rien sur l\'en-tête (repère calme seulement)',
      !r.arena && has(r.log, 'qcm-erreur') && r.plates.length === 0 && r.stars.length === 0 && Object.keys(r.over).length === 0 && none(r, /burst|confetti|fx-tint/), r);
    await next();
    r = await play({ retry: true, streak: 0 });
    check('arène hors champ (' + tag + ') : erreur corrigée → « REVANCHE RÉUSSIE ! » SUR l\'en-tête, avec son éclat',
      clean(r) && has(r.log, 'qcm-revanche') && r.plates.length === 1 && r.plates[0] === '🌟REVANCHE RÉUSSIE !' && r.onHeader && r.stars.length === 1 && r.last - r.lag <= 1100, r);
    /* ULTIME + niveau gagné sur le même coup : deux bandeaux sur l'en-tête, l'un APRÈS l'autre. */
    await next();
    r = await play({ streak: 4, level: true, ms: 2700 });
    check('arène hors champ (' + tag + ') : ULTIME puis niveau gagné → deux bandeaux sur l\'en-tête, jamais ensemble, l\'ULTIME d\'abord et jusqu\'au bout de son animation (le niveau ne le chasse pas)',
      clean(r) && r.plates.length === 2 && / ULTIME !$/.test(r.plates[0]) && r.plates[1] === '⭐NIVEAU ' + r.level + ' !' && r.maxPlates === 1 && r.onHeader && has(r.log, 'niveau') &&
      r.plateCut[0] <= 150 && r.plateCut[1] <= 150, r);
    /* Dernier coup de la partie. */
    await page.evaluate(() => {
      let g = 0; nextQuestion();
      while (!(state.qIndex >= state.questions.length - 1 && !state.missedQueue.length) && g++ < 200) { answer(state.questions[state.qIndex].correct); nextQuestion(); }
    });
    await wait(page, 1300);
    r = await play({ streak: 1, ms: 1300 });
    check('arène hors champ (' + tag + ') : fin de l\'adversaire → « K.O. ! » SUR l\'en-tête, avec son éclat, fini en 1,1 s',
      clean(r) && has(r.log, 'qcm-ko') && r.plates.length === 1 && r.plates[0] === r.hero + 'K.O. !' && r.onHeader && r.stars.length === 1 && (full ? r.stars[0] >= 24 : r.stars[0] <= 8) && r.last - r.lag <= 1100, r);
    check('aucune erreur (arène hors champ, ' + tag + ')', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }));
}
/* Boss : fin de combat brève, dans la fenêtre de 1500 ms du jeu, puis verdict doux. */
async function combatBoss(browser) {
  let log, a;
  const boss = await open(browser, ANIME, { viewport: { width: 1280, height: 800 } });
  await boss.evaluate(() => startGame('boss')); await gameShown(boss); await wait(boss, 200);
  for (let i = 0; i < 2; i++) { await wrong(boss); await wait(boss, 40); await next(boss); await wait(boss, 40); }
  /* Mesure DANS la page, sur une seule horloge (insensible à la charge de la machine de test) : instant où
     la couche retombe au repos après la réponse, et instant où le jeu quitte l'écran (endGame, 1500 ms). */
  await boss.evaluate(() => {
    const t0 = performance.now(), game = document.getElementById('screen-game');
    window.__ko = { idle: 0, gone: 0 };
    (function poll() {
      const s = FX.stats(), t = performance.now() - t0;
      if (getComputedStyle(game).display !== 'block') { window.__ko.gone = t; return; }
      window.__ko.idle = s.particles + s.shapes + s.anims + s.nodes + s.timers + s.queue === 0 ? (window.__ko.idle || t) : 0;
      requestAnimationFrame(poll);
    })();
  });
  log = await during(boss, () => wrong(boss), 300);
  a = await arena(boss);
  check('boss : fin de combat (héros à terre, sans secousse ni teinte)', has(log, 'qcm-ko-heros') && /fx-down/.test(a.cls) && !has(log, 'anim[fx-tint]'), [log, a]);
  await boss.evaluate(() => { FX.debug.log.length = 0; });
  await boss.waitForFunction(() => getComputedStyle(document.getElementById('screen-result')).display !== 'none');
  const ko = await boss.evaluate(() => window.__ko);
  check('boss : l\'effet tient dans les 1500 ms du jeu', ko.idle > 300 && ko.idle < ko.gone && (await leftovers(boss)).errors.length === 0, ko);
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
  /* Rang hors champ. Le jeu affiche l'écran de résultat depuis le haut : le rang n'est hors champ que si la page
     défile encore quand le résultat arrive (élan d'un défilement tactile : elle repart dans le même tick) ou dans
     une fenêtre de moins de ~140 px de haut. La cérémonie se réduit alors à UN moment sur l'en-tête collant, sans
     toucher au rang du jeu ni retenir un seul nœud du résultat. */
  page = await start();
  await page.evaluate(() => {
    let guard = 0, acc = 0;
    while (document.getElementById('screen-game').style.display === 'block' && guard++ < 400) {
      const q = state.questions[state.qIndex];
      acc += 0.9;
      if (acc >= 1) { acc -= 1; answer(q.correct); } else answer((q.correct + 1) % 4);
      nextQuestion();
    }
    window.__y0 = pageYOffset;
    window.scrollTo(0, 700);
  });
  await wait(page, 250);
  v = await view(page);
  const head = await page.evaluate(() => {
    const b = document.querySelector('#fx-stage .fx-banner'), h = document.querySelector('header').getBoundingClientRect(), rank = document.getElementById('result-rank'), q = b && b.getBoundingClientRect();
    return { y0: window.__y0, y: Math.round(pageYOffset), rankBottom: Math.round(rank.getBoundingClientRect().bottom), headerBottom: Math.round(h.bottom), stage: document.querySelectorAll('#fx-stage > :not(.fx-blade)').length,
      text: b && b.textContent, emoji: rank.textContent, onHeader: !!q && q.top >= h.top && q.bottom <= h.bottom, inside: !!q && q.left >= 0 && q.right <= document.documentElement.clientWidth };
  });
  check('verdict hors champ (page qui défilait à l\'arrivée) : le jeu avait remis la page en haut, le rang est passé sous l\'en-tête',
    head.y0 === 0 && head.y > 100 && head.rankBottom < head.headerBottom, head);
  check('verdict hors champ : un seul nœud de la couche (hors rideau d\'arrivée), le bandeau du rang, posé SUR l\'en-tête ; ni échelle ni animation sur le rang du jeu',
    head.stage === 1 && !!head.text && head.text.indexOf(head.emoji) === 0 && head.onHeader && head.inside && v.rankFx === 0 && v.ladder === 0 && v.rank === '1', [head, v]);
  log = await logOf(page);
  check('verdict hors champ : bandeau et étoiles parties de l\'en-tête, aucun nœud du résultat animé ou retenu par la couche',
    has(log, 'anim[fx-banner]') && has(log, 'burst[star]') && !log.some((l) => /^anim\[(bilan-|fx-rung|fx-ladder)/.test(l)) && !has(log, 'confetti'), log.filter((l) => /bilan|banner|burst|confetti|rung/.test(l)));
  await wait(page, 1000);
  check('verdict hors champ : terminé en 1,3 s, rien ne reste', isIdle(await leftovers(page)) && page.errors.length === 0, [await leftovers(page), page.errors]);
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
  ['noyau', 'garde-fous du noyau et contrat de l\'enveloppe', scenarioKernel],
  ['reseau', 'réseau et média : aucune requête ni balise de ressource ajoutée', scenarioNetwork],
  ['arene', 'arène du QCM (mise en page, modes, univers)', scenarioArena],
  ['combat', 'moments du QCM (journal, coupure nette)', scenarioCombat],
  ['verdict', 'cérémonie du résultat', scenarioVerdict],
  ['parties', 'parties complètes (modes × univers × thèmes)', scenarioSessions]
];

/* Scénarios des modules : un fichier par module dans tools/anime-tests/ (ordre alphabétique).
   Chaque fichier exporte function (h) { return [[clé, titre, async (browser) => {…}], …]; }
   où h regroupe les aides de ce fichier (voir HELPERS). */
const HELPERS = { check, open, wait, settle, waapi, gameShown, snap, firstDiff, keepDom, domChecks, VOLATILE, logOf, during, leftovers, isIdle, harness, watchers,
  ROOT, CLASSIC, ANIME, SEED };
const EXTRA_DIR = path.join(__dirname, 'anime-tests');
if (fs.existsSync(EXTRA_DIR)) {
  fs.readdirSync(EXTRA_DIR).filter((f) => /\.js$/.test(f)).sort().forEach((f) => {
    (require(path.join(EXTRA_DIR, f))(HELPERS) || []).forEach((s) => SCENARIOS.push(s));
  });
}

const KEYS = SCENARIOS.map((s) => s[0]);
if (flag('--list')) { console.log(KEYS.join('\n')); process.exit(0); }
if (ONLY) {
  const unknown = ONLY.filter((k) => KEYS.indexOf(k) < 0);
  if (unknown.length || !ONLY.length) usage('clé de scénario inconnue pour --only : ' + (unknown.join(', ') || '(liste vide)') + '\nClés : ' + KEYS.join(', '));
}
if (!fs.existsSync(ANIME_PATH)) usage('fichier introuvable : ' + ANIME_PATH);

(async () => {
  const t0 = Date.now();
  const browser = instrument(await chromium.launch());
  let ran = 0;
  for (const [key, title, fn] of SCENARIOS) {
    if (ONLY && ONLY.indexOf(key) < 0) continue;
    const t = Date.now(), n = failures.length;
    ran++;
    try { await fn(browser); } catch (e) { check(title + ' (exception du test)', false, String(e && e.stack || e).slice(0, 600)); }
    /* Audit des nœuds de la couche, relevé à la fermeture de chaque page animée du scénario. */
    const audits = browser.audits.splice(0), bad = [];
    audits.forEach((a) => a.bad.forEach((b) => { if (bad.indexOf(b) < 0) bad.push(b); }));
    check(title + ' — audit de la couche : nœuds aria-hidden et hors pointeur, aucun dans un écran du jeu hors #fx-arena, aucune classe fx- sur le jeu',
      audits.length > 0 && audits.some((a) => a.seen > 0) && bad.length === 0, audits.length ? bad.slice(0, 6) : 'aucune page animée relevée');
    console.log((failures.length === n ? '✓ ' : '✗ ') + title + '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
  }
  await browser.close();
  console.log('\n' + checks + ' vérifications, ' + failures.length + ' échec(s), ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  failures.forEach((f) => console.log(' - ' + f));
  if (!ran || !checks) { console.log('AUCUNE vérification exécutée : ce n\'est pas un succès.'); process.exit(1); }
  process.exit(failures.length ? 1 : 0);
})();
