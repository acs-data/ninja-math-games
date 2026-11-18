/* Scénarios du DÉFILEMENT (aucun fragment ne porte ce numéro). Chargé par tools/test_anime.js (voir HELPERS).
   Le jeu lui-même (classique.html, donc les deux pages) fait défiler la page à deux endroits :
     · showScreen : un écran de résultat (id finissant par « result ») est toujours affiché depuis le haut ;
     · loadQuestion → bringIntoView(#question-wrap) : si la carte de question n'est pas entièrement visible entre
       l'en-tête collant et le bas de la fenêtre, la page défile aussitôt (sans animation, sans toucher au focus)
       pour caler le bas de la carte en bas de la fenêtre, sans jamais cacher son haut sous l'en-tête.
   La couche, elle, ne fait JAMAIS défiler la page (lint du build) ; elle en profite : l'arène, juste au-dessus de la
   carte, revient à l'écran avec elle, et le rang d'un résultat est à l'écran à l'arrivée.

   · defilement        : sur classique.html SEUL — après chaque loadQuestion la carte est entièrement visible dès
                         qu'elle tient dans la fenêtre, son haut n'est jamais sous l'en-tête, rien ne la déplace
                         dans les deux images suivantes, le focus est le même avant et après le défilement ; un écran
                         de résultat arrive avec scrollY = 0, un autre écran garde le défilement. Puis différentiel :
                         index.html au niveau off défile exactement comme classique.html ; au niveau complet, sur
                         téléphone, les deux pages n'ont pas la même hauteur au-dessus de la carte (arène, bandeau
                         compacté) : on ne compare pas les positions brutes mais « carte entièrement visible », et
                         l'arène réserve bien sa hauteur dans le même tick (question 1 comprise).
   · defilement-partie : une partie entière de 30 questions jouée par de VRAIS appuis (toucher sur téléphone, souris
                         sur bureau ; l'élève ne fait défiler que ce qu'il faut pour atteindre ce qu'il touche) :
                         l'arène est à l'écran à l'instant de la réponse pour au moins 18 réponses sur 30 à
                         360×640 et 22 sur 30 à 390×664 (mesuré : 24 et 27 ; avant la correction du jeu : 1 sur 30),
                         et la cérémonie du résultat est la forme complète aux trois tailles. */
'use strict';

module.exports = function (h) {
  const { check, open, wait, gameShown, logOf, leftovers, CLASSIC, ANIME } = h;
  const SIZES = [[360, 640], [390, 664], [1280, 800]];

  /* Dans la page : joue les 30 questions (réponse juste, page laissée là où se trouve « QUESTION SUIVANTE », question
     suivante) en notant, autour de CHAQUE appel du jeu à bringIntoView, le focus et la place de la carte (tout de
     suite, puis deux images plus tard), et autour de chaque showScreen la position de la page. Les deux fonctions
     du jeu sont observées par une enveloppe de test, retirée à la fin. */
  async function drive() {
    const frames = (n) => new Promise((res) => { (function f() { if (n-- > 0) requestAnimationFrame(f); else res(); })(); });
    const card = document.getElementById('question-wrap'), game = document.getElementById('screen-game'), rows = [], shows = [];
    const realBring = window.bringIntoView, realShow = window.showScreen;
    const geo = () => {
      const c = card.getBoundingClientRect(), hd = document.querySelector('header').getBoundingClientRect().bottom, a = document.getElementById('fx-arena'), r = a && a.getBoundingClientRect();
      return { top: Math.round((c.top - hd) * 10) / 10, bottom: Math.round((window.innerHeight - c.bottom) * 10) / 10, h: Math.round(c.height), avail: Math.round(window.innerHeight - hd), y: Math.round(window.pageYOffset),
        arena: r && r.height ? Math.round(r.height) : 0 };
    };
    window.bringIntoView = function (el) {
      const ae = document.activeElement, y0 = Math.round(window.pageYOffset);
      const ret = realBring.apply(this, arguments);
      const row = { q: state.qIndex, y0, sameFocus: document.activeElement === ae, sync: geo(), later: null };
      rows.push(row);
      requestAnimationFrame(() => requestAnimationFrame(() => { row.later = geo(); }));
      return ret;
    };
    window.showScreen = function (id) {
      const y0 = Math.round(window.pageYOffset);
      const ret = realShow.apply(this, arguments);
      shows.push({ id: String(id), y0, y1: Math.round(window.pageYOffset), max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight) });
      return ret;
    };
    startGame('6e_facile');
    for (let i = 0; i < 200 && game.style.display !== 'block'; i++) await new Promise((res) => setTimeout(res, 20));
    await frames(3);
    for (let g = 0; g < 80 && game.style.display === 'block'; g++) {
      answer(state.questions[state.qIndex].correct);
      await frames(2);
      /* Les entrées animées du jeu (panneau d'explication, bonne réponse) déplacent le bouton de quelques pixels
         pendant ~0,4 s : menées à leur terme avant la mesure, pour que l'élève parte du même endroit dans chaque page. */
      document.getAnimations().forEach((a) => {
        if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) return;
        try { if (a.effect.getComputedTiming().endTime === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch (e) { /* animation déjà retirée */ }
      });
      const b = document.getElementById('btn-next').getBoundingClientRect();
      if (b.bottom > window.innerHeight) window.scrollBy(0, b.bottom - window.innerHeight + 4);     // l'élève amène le bouton à l'écran
      nextQuestion();
      await frames(3);
    }
    /* Autres écrans de résultat, depuis une page défilée ; un écran ordinaire, lui, garde le défilement. */
    for (const id of ['tf-result', 'story-result', 'auto-result', 'dnb-result', 'proba-tree-result', 'graph-reader-result', 'stats']) {
      showScreen('home'); window.scrollTo(0, 300);
      showScreen(id);
    }
    window.bringIntoView = realBring; window.showScreen = realShow;
    showHome(); window.scrollTo(0, 0);
    return { rows, shows };
  }
  const run = async (browser, url, w, hh, level) => {
    const page = await open(browser, url, { viewport: { width: w, height: hh } });
    if (level) await page.evaluate((l) => { FX.setLevel(l); FX.cancel('*'); }, level);
    const r = await page.evaluate(drive);
    r.errors = page.errors.slice();
    if (url === ANIME) r.fx = (await leftovers(page)).errors;
    await page.context().close();
    return r;
  };
  const fits = (g) => g.h <= g.avail;
  const visible = (g) => g.top >= -0.5 && g.bottom >= -0.5;
  const still = (r) => !!r.later && Math.abs(r.later.top - r.sync.top) <= 0.5 && Math.abs(r.later.bottom - r.sync.bottom) <= 0.5;

  async function scenarioScroll(browser) {
    await Promise.all(SIZES.map(async ([w, hh]) => {
      const tag = w + '×' + hh, phone = w < 600;
      const [classic, off, full] = await Promise.all([run(browser, CLASSIC, w, hh), run(browser, ANIME, w, hh, 'off'), run(browser, ANIME, w, hh, 'complet')]);
      const rows = classic.rows, moved = rows.filter((r) => r.sync.y !== r.y0).length, res = classic.shows.filter((s) => /result$/.test(s.id)), qcm = res.find((s) => s.id === 'result');
      /* classique.html seul */
      check('défilement (classique.html, ' + tag + ') : bringIntoView appelé à chaque question' + (phone ? ', et la page a réellement défilé (≥ 10 fois sur 30)' : ''),
        rows.length >= 30 && (!phone || moved >= 10), [rows.length, moved]);
      check('défilement (classique.html, ' + tag + ') : après chaque loadQuestion, la carte de question est entièrement visible dès qu\'elle tient dans la fenêtre',
        rows.filter((r) => fits(r.sync)).length >= 25 && rows.every((r) => !fits(r.sync) || visible(r.sync)), rows.filter((r) => fits(r.sync) && !visible(r.sync)).slice(0, 3));
      check('défilement (classique.html, ' + tag + ') : le haut de la carte n\'est jamais caché sous l\'en-tête', rows.every((r) => r.sync.top >= -0.5), rows.filter((r) => r.sync.top < -0.5).slice(0, 3));
      check('défilement (classique.html, ' + tag + ') : rien ne déplace la carte dans les deux images qui suivent', rows.every(still), rows.filter((r) => !still(r)).slice(0, 3));
      check('défilement (classique.html, ' + tag + ') : document.activeElement est le même avant et après le défilement', rows.every((r) => r.sameFocus), rows.filter((r) => !r.sameFocus).length);
      check('défilement (classique.html, ' + tag + ') : le résultat du QCM arrive avec scrollY = 0' + (phone ? ' (la page était défilée)' : ''), !!qcm && qcm.y1 === 0 && (!phone || qcm.y0 > 0), qcm);
      check('défilement (classique.html, ' + tag + ') : les 7 écrans de résultat arrivent avec scrollY = 0 depuis une page défilée ; un écran ordinaire garde le défilement',
        res.length === 7 && res.every((s) => s.y1 === 0) && res.filter((s) => s.y0 > 0).length >= 6 && classic.shows.some((s) => s.id === 'stats' && s.y0 > 0 && s.y1 === Math.min(s.y0, s.max) && s.y1 > 0), classic.shows.filter((s) => s.id !== 'game' && s.id !== 'loading' && s.id !== 'home'));
      /* Différentiel */
      /* L'accueil de l'édition animée a une rangée de réglages en plus (54 px) : sa hauteur n'est pas comparée. */
      const after = (r) => r.rows.map((x) => [x.q, x.y0, x.sync.y, x.sync.top, x.sync.bottom, x.sync.h]);
      const arrive = (r) => r.shows.map((x) => [x.id, x.y0, x.y1, x.id === 'home' ? 0 : x.max]);
      check('défilement (' + tag + ') : index.html au niveau off défile exactement comme classique.html (même position avant et après chaque question, même arrivée sur chaque écran)',
        JSON.stringify(after(off)) === JSON.stringify(after(classic)) && JSON.stringify(arrive(off)) === JSON.stringify(arrive(classic)),
        [after(off).filter((x, i) => JSON.stringify(x) !== JSON.stringify(after(classic)[i])).slice(0, 3), arrive(off).filter((x, i) => JSON.stringify(x) !== JSON.stringify(arrive(classic)[i])).slice(0, 3)]);
      /* Niveau complet : la hauteur au-dessus de la carte diffère (arène) — on compare « carte entièrement visible ». */
      check('défilement (' + tag + ', complet) : carte entièrement visible dès qu\'elle tient, sur les deux pages (les positions brutes peuvent différer : arène au-dessus de la carte)',
        full.rows.length === rows.length && full.rows.every((r, i) => fits(r.sync) === fits(rows[i].sync) && (!fits(r.sync) || visible(r.sync)) && r.sync.top >= -0.5 && r.sameFocus), full.rows.filter((r) => fits(r.sync) && !visible(r.sync)).slice(0, 3));
      check('défilement (' + tag + ', complet) : l\'arène réserve sa hauteur dans le même tick — la carte ne bouge pas dans les deux images suivantes (question 1 comprise)',
        full.rows.every(still) && full.rows[0].q === 0 && full.rows.every((r) => r.sync.arena === (w > 480 ? 80 : 64) && r.later.arena === r.sync.arena), full.rows.filter((r) => !still(r)).slice(0, 3));
      check('défilement (' + tag + ', complet) : mêmes arrivées sur les écrans de résultat (scrollY = 0)', JSON.stringify(full.shows.map((s) => [s.id, s.y1])) === JSON.stringify(classic.shows.map((s) => [s.id, s.y1])), full.shows);
      check('aucune erreur console / page (défilement, ' + tag + ')', classic.errors.length + off.errors.length + full.errors.length + off.fx.length + full.fx.length === 0, [classic.errors, off.errors, full.errors, full.fx]);
    }));
  }

  /* ── Partie entière en vrais appuis ── */
  async function scenarioGame(browser) {
    const MIN = { '360×640': 18, '390×664': 22, '1280×800': 28 };
    await Promise.all(SIZES.map(async ([w, hh]) => {
      const tag = w + '×' + hh, touch = w < 600;
      const ctx = await browser.newContext({ viewport: { width: w, height: hh }, hasTouch: touch, colorScheme: 'dark', reducedMotion: 'no-preference' });
      const page = await ctx.newPage();
      page.errors = [];
      page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
      await page.addInitScript(h.harness, h.SEED);
      await page.goto(ANIME);
      await wait(page, 150);
      await page.evaluate(() => { FX.seed(3); startGame('6e_facile'); });
      await gameShown(page); await wait(page, 350);
      /* L'élève amène ce qu'il veut toucher entièrement dans la fenêtre — sous l'en-tête collant, au-dessus du toast du
         jeu s'il est affiché (il capte les appuis sur 84 px en bas : hérité) —, sans défiler plus que nécessaire. */
      const tap = async (sel) => {
        const b = await page.evaluate((s) => {
          const e = document.querySelector(s);
          if (!e || e.getBoundingClientRect().height === 0) return null;
          const hd = document.querySelector('header[role="banner"]').getBoundingClientRect(), toast = document.getElementById('toast').classList.contains('show') ? 84 : 0;
          let r = e.getBoundingClientRect();
          if (r.bottom > window.innerHeight - toast) window.scrollBy(0, r.bottom - (window.innerHeight - toast) + 4);
          else if (r.top < hd.bottom) window.scrollBy(0, r.top - hd.bottom - 4);
          r = e.getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        }, sel);
        if (!b) return false;
        if (touch) await page.touchscreen.tap(b[0], b[1]); else await page.mouse.click(b[0], b[1]);
        return true;
      };
      let seen = 0, total = 0, missed = 0;
      for (let g = 0; g < 90; g++) {
        const st = await page.evaluate(() => ({ on: document.getElementById('screen-game').style.display === 'block', a: state.answered, c: state.questions[state.qIndex] ? state.questions[state.qIndex].correct : -1 }));
        if (!st.on) break;
        if (!st.a) {
          await tap('#answers-grid .answer-btn:nth-child(' + (st.c + 1) + ')');
          const now = await page.evaluate(() => ({ a: state.answered, arena: !!FX.arena.geo() }));
          if (!now.a) { missed++; continue; }
          total++; if (now.arena) seen++;
          await wait(page, 300);
        }
        await page.evaluate(() => { FX.debug.log.length = 0; });
        await tap('#feedback-panel .btn-next');
        await wait(page, 80);
      }
      await wait(page, 400);
      const end = await page.evaluate(() => {
        const r = document.getElementById('result-rank').getBoundingClientRect(), hd = document.querySelector('header[role="banner"]').getBoundingClientRect();
        return { screen: FX.env.screen(), y: Math.round(window.pageYOffset), rankSeen: (r.top + r.bottom) / 2 > hd.bottom && (r.top + r.bottom) / 2 < window.innerHeight, ladder: document.querySelectorAll('.fx-ladder .fx-rung').length };
      });
      const log = await logOf(page);
      check('partie en vrais appuis (' + tag + ') : 30 réponses données par ' + (touch ? 'le toucher' : 'la souris') + ', partie finie sur l\'écran de résultat', total === 30 && missed <= 3 && end.screen === 'result', [total, missed, end]);
      check('partie en vrais appuis (' + tag + ') : arène à l\'écran à l\'instant de la réponse pour au moins ' + MIN[tag] + ' réponses sur 30', seen >= MIN[tag], seen + '/' + total);
      check('partie en vrais appuis (' + tag + ') : résultat affiché depuis le haut, rang à l\'écran → cérémonie COMPLÈTE (échelle des rangs, arrivée du vrai rang), pas de bandeau de repli',
        end.y === 0 && end.rankSeen && end.ladder === 5 && log.some((l) => /^bilan\[rang 4 /.test(l)) && log.indexOf('anim[bilan-rang]') >= 0 && log.indexOf('anim[fx-banner]') < 0, [end, log.filter((l) => /bilan|banner/.test(l))]);
      check('aucune erreur (partie en vrais appuis, ' + tag + ')', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
      console.log('    ' + tag + ' : arène à l\'écran à l\'instant de la réponse ' + seen + '/' + total + ' (appuis perdus : ' + missed + ')');
      await ctx.close();
    }));
  }

  return [
    ['defilement', 'défilement du jeu : carte de question ramenée à l\'écran, résultats depuis le haut (classique.html seul, puis différentiel)', scenarioScroll],
    ['defilement-partie', 'défilement : partie de 30 questions en vrais appuis (arène à l\'écran, cérémonie complète)', scenarioGame]
  ];
};
