/* Scénarios du module « textes » (anime-src/40-textmodes.js) : Vrai/Faux Speed, Histoire interactive,
   Automatismes et DNB Blanc. Chargé par tools/test_anime.js (voir HELPERS).

   · txt-diff    : pour CHAQUE mode, la même session scriptée (clavier, clics, appels directs, pause,
                   temps écoulé, abandon pendant la correction + minuteries fantômes) sur index.html et
                   sur anime.html aux niveaux off, complet et « chaos » : état du jeu, focus, #toast,
                   #sr-live, HUD, textes des écrans, boutons, champs… identiques à chaque étape.
   · txt-moments : le journal FX montre les effets attendus (complet), leurs formes courtes (léger,
                   profil sobre des épreuves), rien au niveau off ; rien ne reste vivant ensuite ;
                   rien n'est joué sur l'accueil par les minuteries fantômes du jeu.
   · txt-tel     : téléphone 360×640 (explication sous l'écran, résultat hors champ).

   Les minuteries longues du jeu (« question suivante » : 2,5 / 4,5 / 5 s ; toast : 2,2 s) sont
   retenues et déclenchées à la main par __later() : sessions rapides et déterministes. Les
   setInterval sont déjà manuels (__tick) ; __tick fait avancer TOUS les intervalles d'un pas. */
'use strict';

module.exports = function (h) {
  const { check, wait, logOf, during, leftovers, isIdle, harness, INDEX, ANIME, SEED } = h;
  const has = (log, name) => log.some((l) => l.indexOf(name) === 0);
  const count = (log, name) => log.filter((l) => l.indexOf(name) === 0).length;
  const MINE = /^(tf-|histoire-|auto-|dnb-|bilan-)/;          // noms de chorégraphie du module
  const mine = (log) => log.filter((l) => MINE.test(l));
  /* Portion du journal à partir de la chorégraphie « name » (les autres modules — transition d'écran,
     bandeau de niveau… — peuvent journaliser avant elle). */
  const from = (log, name) => { const i = log.findIndex((l) => l.indexOf(name) === 0); return i < 0 ? [] : log.slice(i); };
  /* Ce qu'une épreuve (profil sobre) ne doit jamais montrer : particules, teinte, bandeau, cut-in. */
  const LOUD = /^(burst|streaks|trail|confetti|sprite|anim\[fx-(tint|banner|cutin)\])/;
  const sober = (log) => !log.some((l) => LOUD.test(l)) && log.every((l) => /~$/.test(l));
  /* Le contour (nœud .fx-tm-box) entoure-t-il l'élément ? Comparé à sa boîte de mise en page : le jeu
     fait battre le bouton désigné (correctPulse) pendant 0,5 s. */
  const around = (page, sel, idx) => page.evaluate(([sel, idx]) => {
    const b = document.querySelector('.fx-tm-box'), t = document.querySelectorAll(sel)[idx];
    if (!b || !t) return null;
    const q = b.getBoundingClientRect(), g = t.getBoundingClientRect(), bw = parseFloat(getComputedStyle(b).borderTopWidth);
    return { dx: Math.round(Math.abs((q.left + q.right) / 2 - (g.left + g.right) / 2)), dy: Math.round(Math.abs((q.top + q.bottom) / 2 - (g.top + g.bottom) / 2)),
      hollow: q.width - 2 * bw >= t.offsetWidth && q.height - 2 * bw >= t.offsetHeight, bg: getComputedStyle(b).backgroundColor, kids: b.childNodes.length };
  }, [sel, idx]);
  const isAround = (a) => !!a && a.dx <= 2 && a.dy <= 2 && a.hollow && a.bg === 'rgba(0, 0, 0, 0)' && a.kids === 0;

  /* Injecté avant tout script de page, après le harnais commun. */
  function holdLongTimers() {
    const real = window.setTimeout, realClear = window.clearTimeout, held = new Map();
    let n = 0;
    window.setTimeout = function (fn, ms) {
      if (!(ms >= 2000)) return real.apply(window, arguments);
      held.set(--n, fn);
      return n;
    };
    window.clearTimeout = function (id) { if (!held.delete(id)) realClear(id); };
    window.__later = function () { const l = Array.from(held.values()); held.clear(); l.forEach((f) => f()); return l.length; };
  }
  async function open(browser, url, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 412, height: 800 }, reducedMotion: 'no-preference',
      colorScheme: opts.colorScheme || 'light' });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) page.errors.push('console: ' + m.text());
    });
    await page.addInitScript(harness, SEED);
    await page.addInitScript(holdLongTimers);
    await page.goto(url);
    await page.waitForTimeout(150);
    return page;
  }

  /* Photographie de tout ce que ces quatre modes exposent. Le texte de l'accueil est écarté
     (le bouton de réglage de la couche y vit) ; les autres écrans doivent être identiques. */
  function snap(page, label) {
    return page.evaluate((label) => {
      const el = (id) => document.getElementById(id);
      const txt = (id) => (el(id) ? el(id).textContent : null);
      const ae = document.activeElement;
      const vis = Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none');
      const btns = (sel) => Array.from(document.querySelectorAll(sel)).map((b) => b.className + (b.disabled ? ':off' : '') + '|' + b.textContent);
      const fb = (id) => el(id).style.display + '|' + el(id).className + '|' + el(id).textContent;
      const r1 = (v) => Math.round(v * 10) / 10;
      return {
        label,
        auto: [autoState.mode, autoState.qIdx, autoState.score, autoState.correct, autoState.answered, r1(autoState.qTimeLeft), autoState.globalTimeLeft,
          JSON.stringify(autoState.history.map((x) => [x.ok, x.userAns, String(x.correctAns), r1(x.timeUsed)])), JSON.stringify(autoState.themeStats)],
        tf: [tfState.qIdx, tfState.score, tfState.correct, tfState.streak, tfState.bestStreak, tfState.answered, r1(tfState.timeLeft)],
        story: [storyState.missionIdx, storyState.stepIdx, storyState.score, storyState.correct, storyState.answered],
        dnb: [dnbState.active, dnbState.phase, dnbState.autoCorrect, dnbState.exerciseIdx, dnbState.stepIdx, dnbState.exerciseAnswered,
          JSON.stringify(dnbState.exerciseCorrectByExo), !!dnbState._inIntro],
        state: [state.score, state.xp, state.level],
        stats: JSON.stringify([playerStats.gamesByMode, playerStats.totalGames, playerStats.totalCorrect, playerStats.totalAnswered]),
        focus: ae ? (ae.id || (ae.tagName + '.' + ae.className)) : null,
        toast: txt('toast') + '|' + el('toast').className, sr: txt('sr-live'),
        hud: [txt('hud-score'), txt('hud-streak'), txt('hud-level')],
        screens: vis.map((e) => e.id),
        text: vis.filter((e) => e.id !== 'screen-home').map((e) => e.textContent.replace(/\s+/g, ' ')),
        modals: Array.from(document.querySelectorAll('.modal-overlay.show')).map((m) => m.id),
        input: [el('auto-input').value, el('auto-input').disabled],
        tfCard: [el('tf-card').className, el('tf-btn-true').disabled, el('tf-btn-false').disabled],
        answers: btns('#story-answers .answer-btn').concat(btns('#dnb-ex-answers .answer-btn')),
        feedback: [fb('auto-feedback'), fb('tf-feedback'), fb('story-feedback'), fb('dnb-ex-feedback')],
        /* Attribut style des rangées de compteurs : un seul .style écrit dessus casserait la règle ≤ 380 px du jeu. */
        grids: ['#screen-auto', '#screen-tf', '#screen-dnb-ex'].map((s) => document.querySelectorAll(s + ' > div[style*="grid-template-columns:1fr 1fr 1fr"]').length),
        bodyOverflow: document.body.style.overflow,
        storage: Object.keys(localStorage).sort()
      };
    }, label);
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

  /* ════════════ Sessions scriptées (identiques pour toutes les pages) ════════════ */
  const ev = (page, fn, arg) => page.evaluate(fn, arg);

  async function sessionTf(page, shot) {
    const truth = () => ev(page, () => tfState.questions[tfState.qIdx].isTrue);
    await shot('accueil');
    await ev(page, () => startTrueFalse()); await shot('a1');
    await ev(page, () => __tick(12));
    await page.keyboard.press((await truth()) ? 'v' : 'f'); await shot('a1 juste (clavier)');
    await page.keyboard.press('v'); await shot('a1 touche ignorée (déjà répondu)');
    await ev(page, () => __later()); await shot('a2');
    await page.click((await truth()) ? '#tf-btn-false' : '#tf-btn-true'); await shot('a2 fausse (clic)');
    await ev(page, () => __later()); await shot('a3');
    await ev(page, () => __tick(91)); await shot('a3 temps écoulé');
    await ev(page, () => __later());
    for (let i = 1; i <= 4; i++) {                              // combo ×1 à ×4 (multiplicateur dès ×3)
      await ev(page, () => __tick(5));
      await page.keyboard.press((await truth()) ? '1' : '2'); await shot('combo ' + i);
      await ev(page, () => __later());
    }
    await ev(page, () => { answerTf(tfState.questions[tfState.qIdx].isTrue); answerTf(null); __later(); answerTf(!tfState.questions[tfState.qIdx].isTrue); });
    await shot('même tick : juste, appel ignoré, suivante, fausse');
    await ev(page, () => {
      let g = 0;
      __later();
      while (document.getElementById('screen-tf').style.display !== 'none' && g++ < 40) {
        const t = tfState.questions[tfState.qIdx].isTrue;
        if (g % 4 === 0) __tick(91); else answerTf(g % 3 === 0 ? !t : t);
        __later();
      }
    });
    await shot('résultat');
    await page.click('#screen-tf-result .btn-main'); await shot('rejouer');
    /* Abandon pendant la correction : les minuteries « suivante » du jeu tournent encore sur l'accueil. */
    await page.keyboard.press((await truth()) ? 'v' : 'f'); await shot('juste');
    await page.click('#screen-tf .btn-control'); await shot('abandon pendant la correction');
    await ev(page, () => __later()); await shot('fantôme : affirmation suivante chargée sur l\'accueil');
    await ev(page, () => __tick(91)); await shot('fantôme : temps écoulé sur l\'accueil');
    await ev(page, () => { let g = 0; while (getComputedStyle(document.getElementById('screen-tf-result')).display === 'none' && g++ < 40) { __later(); __tick(91); } });
    await shot('fantôme : le jeu affiche le résultat');
    await ev(page, () => showHome()); await shot('retour accueil');
  }

  async function sessionStory(page, shot) {
    const good = () => ev(page, () => storyState.currentStep.correct);
    const btn = (i) => '#story-answers .answer-btn:nth-child(' + (i + 1) + ')';
    await ev(page, () => startStoryMode()); await shot('intro');
    await page.click('#story-next-btn'); await shot('étape 1');
    await page.click(btn(await good())); await shot('étape 1 juste (clic)');
    await page.keyboard.press('1'); await shot('touche 1 : sans effet dans ce mode');
    await page.click('#story-next-btn'); await shot('étape 2');
    await page.click(btn(((await good()) + 1) % 4)); await shot('étape 2 fausse (clic)');
    await page.click('#story-next-btn'); await shot('étape 3');
    await ev(page, () => { answerStoryStep(storyState.currentStep.correct); answerStoryStep(0); }); await shot('étape 3 juste + appel ignoré');
    await ev(page, () => { nextStoryStep(); answerStoryStep(storyState.currentStep.correct); }); await shot('étape 4 juste, même tick');
    await page.click('#story-next-btn'); await shot('résultat 3/4');
    await page.click('#screen-story-result .btn-main'); await shot('nouvelle histoire');
    await ev(page, () => { nextStoryStep(); for (let i = 0; i < 4; i++) { answerStoryStep((storyState.currentStep.correct + (i ? 1 : 0)) % 4); nextStoryStep(); } });
    await shot('résultat 1/4');
    await ev(page, () => { startStoryMode(); nextStoryStep(); for (let i = 0; i < 4; i++) { answerStoryStep(storyState.currentStep.correct); nextStoryStep(); } });
    await shot('résultat 4/4');
    await ev(page, () => { startStoryMode(); nextStoryStep(); answerStoryStep(storyState.currentStep.correct); quitStoryMode(); }); await shot('abandon');
  }

  /* Réponse attendue de la question d'automatisme courante. */
  const autoAns = (page) => ev(page, () => String(autoState.questions[autoState.qIdx].a));
  /* Fin d'épreuve d'une traite : « juste » sauf une sur quatre, jusqu'à ce que l'écran d'automatismes disparaisse. */
  const autoFinish = (page) => ev(page, () => {
    let g = 0;
    while (document.getElementById('screen-auto').style.display !== 'none' && g++ < 40) {
      if (!autoState.answered) {
        document.getElementById('auto-input').value = g % 4 === 0 ? '?' : String(autoState.questions[autoState.qIdx].a);
        submitAutoAnswer();
      }
      __later();
    }
  });

  async function sessionAuto(page, shot) {
    const valider = '#screen-auto .question-wrap .btn-main';
    await ev(page, () => showAutoMenu()); await shot('menu');
    await ev(page, () => startAutoMode('auto_6e')); await wait(page, 130); await shot('q1');
    await ev(page, () => __tick(23));
    await page.keyboard.type(await autoAns(page)); await page.keyboard.press('Enter'); await shot('q1 juste (clavier)');
    await page.keyboard.press('Enter'); await shot('entrée ignorée (déjà répondu)');
    await ev(page, () => __later()); await shot('q2');
    await page.keyboard.type('zz'); await page.click(valider); await shot('q2 fausse (clic)');
    await ev(page, () => __later()); await shot('q3');
    await ev(page, () => { autoState.qTimeLeft = 0.35; __tick(4); }); await shot('q3 temps écoulé');
    await ev(page, () => __later()); await shot('q4');
    await page.click(valider); await shot('q4 champ vide = faux');
    await ev(page, () => __later());
    await page.keyboard.press('Escape'); await shot('q5 pause (Échap)');
    await page.click('#modal-auto-pause .btn-main'); await shot('q5 reprise');
    await page.click('#screen-auto .btn-control:nth-child(2)'); await shot('q5 quitter ?');
    await page.click('#modal-auto-quit .btn-main'); await shot('q5 non, continuer');
    for (let i = 5; i <= 9; i++) {                              // cinq justes d'affilée (série)
      await ev(page, () => __tick(7));
      await page.keyboard.type(await autoAns(page)); await page.keyboard.press('Enter'); await shot('q' + i + ' juste');
      await ev(page, () => __later());
    }
    await autoFinish(page); await shot('résultat');
    await page.click('#screen-auto-result .btn-main'); await wait(page, 130); await shot('rejouer');
    /* Pause PENDANT la correction (défauts hérités du jeu : la question suivante se charge derrière
       la modale et prend le focus, puis deux intervalles tournent) : la couche ne doit rien y changer. */
    await page.keyboard.type(await autoAns(page)); await page.keyboard.press('Enter'); await shot('juste');
    await ev(page, () => pauseAutoMode()); await shot('pause pendant la correction');
    await ev(page, () => __later()); await shot('question suivante chargée derrière la modale');
    await ev(page, () => resumeAutoMode()); await shot('reprise');
    await ev(page, () => __tick(30)); await shot('3 s plus tard (deux intervalles)');
    await ev(page, () => { document.getElementById('auto-input').value = String(autoState.questions[autoState.qIdx].a); submitAutoAnswer(); });
    await shot('juste (intervalle orphelin)');
    await ev(page, () => __tick(320)); await shot('32 s plus tard : submitAutoAnswer(true) appelé à vide');
    /* Abandon pendant la correction : la question suivante se charge sur l'accueil. */
    await ev(page, () => exitAutoMode()); await shot('abandon pendant la correction');
    await ev(page, () => __later()); await shot('fantôme : question chargée sur l\'accueil');
    await ev(page, () => __tick(320)); await shot('fantôme : temps écoulé sur l\'accueil');
    await ev(page, () => __later()); await shot('fantôme : suite');
  }

  async function sessionDnb(page, shot) {
    const good = () => ev(page, () => dnbState.currentStep.correct);
    const btn = (i) => '#dnb-ex-answers .answer-btn:nth-child(' + (i + 1) + ')';
    await ev(page, () => { showAutoMenu(); startDnbBlanc(); }); await shot('intro');
    await page.click('#screen-dnb-intro .btn-main'); await wait(page, 130); await shot('phase 1 q1');
    await ev(page, () => __tick(15));
    await page.keyboard.type(await autoAns(page)); await page.keyboard.press('Enter'); await shot('q1 juste (clavier)');
    await ev(page, () => __later()); await shot('q2');
    await page.keyboard.type('zz'); await page.keyboard.press('Enter'); await shot('q2 fausse');
    await ev(page, () => __later());
    await ev(page, () => { autoState.qTimeLeft = 0.35; __tick(4); }); await shot('q3 temps écoulé');
    await ev(page, () => __later());
    await ev(page, () => pauseAutoMode()); await shot('q4 pause');
    await ev(page, () => resumeAutoMode()); await shot('q4 reprise');
    await autoFinish(page); await shot('transition');
    await page.click('#screen-dnb-transition .btn-main'); await shot('exercice 1 : énoncé');
    await page.click('#dnb-ex-next-btn'); await shot('ex. 1 q1');
    await page.click(btn(await good())); await shot('ex. 1 q1 juste (clic)');
    await page.click('#dnb-ex-next-btn'); await shot('ex. 1 q2');
    await page.click(btn(((await good()) + 1) % 4)); await shot('ex. 1 q2 fausse (clic)');
    await page.click('#dnb-ex-next-btn'); await shot('ex. 1 q3');      // (le bouton cliqué vient d'être masqué : le focus retombe sur <body> à la frame suivante)
    await ev(page, () => { answerDnbStep(dnbState.currentStep.correct); answerDnbStep(0); }); await shot('ex. 1 q3 juste + appel ignoré');
    await ev(page, () => confirmQuitDnb()); await shot('abandonner ?');
    await ev(page, () => closeModal('modal-dnb-quit')); await shot('non');
    await ev(page, () => { nextDnbExStep(); answerDnbStep(dnbState.currentStep.correct); nextDnbExStep(); }); await shot('exercice 2 : énoncé');
    await ev(page, () => {                                      // trois exercices d'une traite : une erreur sur trois
      let g = 0;
      while (getComputedStyle(document.getElementById('screen-dnb-result')).display === 'none' && g++ < 60) {
        nextDnbExStep();
        if (!dnbState._inIntro && !dnbState.exerciseAnswered && dnbState.exerciseIdx < 4) answerDnbStep((dnbState.currentStep.correct + (g % 3 === 0 ? 1 : 0)) % 4);
      }
    });
    await shot('résultat');
    await page.click('#screen-dnb-result .btn-main'); await shot('nouveau DNB : intro');
    /* dnbState.active périmé (défaut hérité) : phase 1 quittée par le bouton des automatismes, puis une
       épreuve auto_6e ordinaire se termine… sur la transition du DNB. La couche suit l'écran affiché. */
    await ev(page, () => { startDnbPhase1(); exitAutoMode(); startAutoMode('auto_6e'); }); await wait(page, 130); await shot('auto_6e après un DNB quitté');
    await autoFinish(page); await shot('fin : transition du DNB (défaut hérité)');
    await ev(page, () => showHome()); await shot('accueil');
  }

  /* ── Scénario 1 : différentiel classique / off / complet / chaos, mode par mode ── */
  async function diffMode(browser, name, session, expected) {
    const run = async (url, prepare) => {
      const page = await open(browser, url);
      if (prepare) await ev(page, prepare);
      const shots = [], played = new Set();
      const shot = async (label) => {
        await wait(page, 90);
        shots.push(await snap(page, label));
        if (url === ANIME) (await ev(page, () => FX.debug.log.map((e) => e.fx))).forEach((n) => played.add(n));
      };
      await session(page, shot);
      const stats = url === ANIME ? await ev(page, () => FX.stats()) : null;
      await page.context().close();
      return { shots, played: Array.from(played), stats, errors: page.errors };
    };
    const [classic, off, full, chaos] = await Promise.all([
      run(INDEX),
      run(ANIME, () => { FX.setLevel('off'); }),
      run(ANIME, () => { FX.seed(7); }),
      run(ANIME, () => { FX.debug.chaos = true; })
    ]);
    check(name + ' : la session classique se déroule (' + classic.shots.length + ' étapes)', classic.shots.length > 12 && classic.errors.length === 0, classic.errors);
    check(name + ' : niveau off, jeu identique', !firstDiff(classic.shots, off.shots), firstDiff(classic.shots, off.shots));
    check(name + ' : niveau complet, jeu identique', !firstDiff(classic.shots, full.shots), firstDiff(classic.shots, full.shots));
    check(name + ' : chaos, jeu identique', !firstDiff(classic.shots, chaos.shots), firstDiff(classic.shots, chaos.shots));
    check(name + ' : aucune erreur console / page', off.errors.length + full.errors.length + chaos.errors.length === 0, [off.errors, full.errors, chaos.errors]);
    check(name + ' : niveau off, rien de joué', off.played.length === 0, off.played);
    check(name + ' : niveau complet, moments joués', expected.every((n) => full.played.indexOf(n) >= 0), [expected.filter((n) => full.played.indexOf(n) < 0), full.played]);
    check(name + ' : niveau complet, couche saine', full.stats.errCount === 0 && !full.stats.dead && full.stats.missing.length + full.stats.denied.length === 0 &&
      full.stats.modules.textes === 'ok', [full.stats.errors, full.stats.missing, full.stats.denied, full.stats.modules]);
    check(name + ' : chaos, les crochets ont levé et rien n\'a été joué', chaos.stats.chaos > 0 && chaos.played.length === 0 && !chaos.stats.dead, [chaos.stats.chaos, chaos.played]);
    return classic.shots;
  }
  async function scenarioDiff(browser) {
    let s = await diffMode(browser, 'Vrai/Faux', sessionTf, ['tf-juste', 'tf-erreur', 'tf-temps', 'bilan-tf']);
    check('Vrai/Faux : la session passe par le résultat puis par les fantômes de l\'accueil',
      s.some((x) => x.label === 'résultat' && x.screens[0] === 'screen-tf-result') &&
      s.some((x) => /fantôme : temps écoulé/.test(x.label) && x.screens[0] === 'screen-home' && /Temps écoulé/.test(x.sr || '')), s.map((x) => [x.label, x.screens[0]]));
    s = await diffMode(browser, 'Histoire', sessionStory, ['histoire-scene', 'histoire-juste', 'histoire-erreur', 'bilan-story']);
    check('Histoire : résultats 3/4, 1/4 et 4/4 atteints', ['résultat 3/4', 'résultat 1/4', 'résultat 4/4'].every((l) => s.some((x) => x.label === l && x.screens[0] === 'screen-story-result')),
      s.map((x) => [x.label, x.screens[0]]));
    s = await diffMode(browser, 'Automatismes 6e', sessionAuto, ['auto-juste', 'auto-erreur', 'auto-temps', 'bilan-auto']);
    check('Automatismes 6e : juste, fausse, temps écoulé, pause, résultat, focus dans le champ',
      s.some((x) => x.label === 'q1' && x.focus === 'auto-input') && s.some((x) => x.label === 'q3 temps écoulé' && /Temps écoulé/.test(x.sr || '')) &&
      s.some((x) => x.label === 'q5 pause (Échap)' && x.modals[0] === 'modal-auto-pause') && s.some((x) => x.label === 'résultat' && x.screens[0] === 'screen-auto-result'),
      s.map((x) => [x.label, x.screens[0], x.focus, x.modals[0]]));
    s = await diffMode(browser, 'DNB Blanc', sessionDnb, ['auto-juste', 'auto-erreur', 'auto-temps', 'dnb-transition', 'dnb-juste', 'dnb-erreur', 'bilan-dnb']);
    check('DNB Blanc : intro → phase 1 (auto_dnb) → transition → 4 exercices → résultat',
      s.some((x) => x.label === 'phase 1 q1' && x.auto[0] === 'auto_dnb' && x.screens[0] === 'screen-auto') && s.some((x) => x.label === 'transition' && x.screens[0] === 'screen-dnb-transition') &&
      s.some((x) => x.label === 'résultat' && x.screens[0] === 'screen-dnb-result' && x.dnb[3] === 4) &&
      s.some((x) => /défaut hérité/.test(x.label) && x.screens[0] === 'screen-dnb-transition'), s.map((x) => [x.label, x.screens[0]]));
  }

  /* ── Scénario 2 : les moments, mode par mode (journal, niveaux, restes) ── */
  const idle = async (page, name) => { const l = await leftovers(page); check(name, isIdle(l), l); };
  const raw = (page) => ev(page, () => FX.debug.log.map((e) => ({ fx: e.fx, n: e.n, level: e.level, profile: e.profile })));
  const calmXp = (page) => ev(page, () => { state.xp = (state.level - 1) * 500; });       // loin d'un changement de niveau (bandeau de la vague 1)
  /* Rectangles (fenêtre) de nœuds : [x, y, droite, bas]. */
  const rects = (page, sels) => ev(page, (sels) => sels.map((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom];
  }), sels);
  const apart = (a, b) => !a || !b || a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3];
  const desktop = { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' };

  async function momentsTf(browser) {
    const page = await open(browser, ANIME, desktop);
    const ok = () => ev(page, () => answerTf(tfState.questions[tfState.qIdx].isTrue));
    const ko = () => ev(page, () => answerTf(!tfState.questions[tfState.qIdx].isTrue));
    const next = () => ev(page, () => __later());
    let log, r;
    await ev(page, () => { FX.seed(3); startTrueFalse(); }); await wait(page, 350);
    log = await during(page, ok, 150);
    r = await rects(page, ['.fx-float', '#tf-statement']);
    check('vrai/faux juste : entaille du bouton + trait sur le bord de la carte, onde, éclats, points',
      has(log, 'tf-juste[×1]') && count(log, 'slash') === 2 && has(log, 'ring') && has(log, 'burst[streak]') && count(log, 'anim[fx-float]') === 1, log);
    check('vrai/faux juste : les points ne recouvrent pas l\'affirmation', r[0] && apart(r[0], r[1]), r);
    await wait(page, 650);
    await idle(page, 'vrai/faux juste : tout est fini 800 ms après la réponse');
    log = await during(page, ok);
    check('vrai/faux : appel ignoré par le jeu (déjà répondu) → aucun effet', mine(log).length === 0 && !has(log, 'slash') && !has(log, 'burst'), log);
    await next(); await ok(); await next(); await wait(page, 60);
    log = await during(page, ok, 150);
    check('vrai/faux combo ×3 : multiplicateur affiché près du compteur', has(log, 'tf-juste[×3]') && count(log, 'anim[fx-float]') === 2, log);
    await next(); await wait(page, 700);
    log = await during(page, ko, 200);
    check('vrai/faux erreur : repère calme vers l\'explication (un trait), ni éclat ni teinte ni bandeau',
      has(log, 'tf-erreur') && count(log, 'slash') === 1 && !has(log, 'burst') && !has(log, 'ring') && !has(log, 'anim[fx-tint]') && !has(log, 'anim[fx-banner]') && !has(log, 'anim[fx-float]'), log);
    await wait(page, 450);
    await idle(page, 'vrai/faux erreur : tout est fini 650 ms après la réponse');
    await next(); await wait(page, 60);
    log = await during(page, () => ev(page, () => __tick(91)), 200);
    check('vrai/faux temps écoulé : effet propre (onde sur le chrono), distinct d\'une erreur', has(log, 'tf-temps') && !has(log, 'tf-erreur') && has(log, 'ring'), log);
    /* Jeu rapide : réponse + affirmation suivante dans le même tick. */
    await next(); await wait(page, 500);
    log = await during(page, async () => { for (let i = 0; i < 6; i++) await ev(page, () => { answerTf(tfState.questions[tfState.qIdx].isTrue); __later(); }); }, 150);
    check('vrai/faux jeu rapide ×6 : aucune chorégraphie périmée', mine(log).length === 0, log);
    /* Le raccourci V/F du jeu répond même quand une modale est ouverte : la couche, elle, ne joue rien. */
    await ev(page, () => openModal('modal-back-home')); await wait(page, 120);
    log = await during(page, () => page.keyboard.press('v'), 150);
    r = await ev(page, () => [tfState.answered, document.querySelectorAll('.modal-overlay.show').length]);
    check('vrai/faux : réponse au clavier pendant qu\'une modale est ouverte → rien de joué', r[0] === true && r[1] === 1 && log.length === 0, [log, r]);
    await ev(page, () => { closeModal('modal-back-home'); __later(); }); await wait(page, 80);       // modale fermée, affirmation suivante
    /* Niveau léger : forme courte. */
    await ev(page, () => FX.setLevel('leger')); await calmXp(page);
    log = await during(page, ok, 200);
    r = await raw(page);
    check('vrai/faux léger : forme courte (un seul trait, particules réduites), tout au niveau léger',
      has(log, 'tf-juste') && count(log, 'slash') === 1 && from(log, 'tf-juste').every((l) => /~$/.test(l)) && r.every((e) => e.n <= 8), [log, r]);
    await ev(page, () => FX.setLevel('off'));
    await next();
    log = await during(page, ok, 150);
    check('vrai/faux off : rien', log.length === 0, log);                 // au niveau off, plus rien n'est journalisé
    await ev(page, () => FX.setLevel('complet'));
    /* Résultat : sans faute de fin → palier haut, confettis. */
    await ev(page, () => { tfState.correct = 19; tfState.qIdx = 19; }); await calmXp(page);
    log = await during(page, next, 600);
    check('vrai/faux résultat (19/20) : cérémonie du palier le plus haut (émoji, tuiles, onde, étoiles, confettis)',
      has(log, 'bilan-tf[palier 4]') && has(log, 'anim[tf-result-emoji]') && count(from(log, 'bilan-tf'), 'anim') >= 4 && has(log, 'ring') && has(log, 'burst[star]') && has(log, 'confetti'), log);
    r = await ev(page, () => FX.stats().particles);
    check('vrai/faux résultat : plafond de particules respecté', r <= 160, r);
    await wait(page, 2000);
    await idle(page, 'vrai/faux résultat : tout est fini 2,6 s après l\'arrivée');
    /* Abandon pendant la correction : les minuteries fantômes du jeu ne jouent rien sur l'accueil. */
    await ev(page, () => startTrueFalse()); await wait(page, 300);
    await ok(); await wait(page, 100);
    await ev(page, () => quitTrueFalse()); await wait(page, 400);
    log = await during(page, () => ev(page, () => { __later(); __tick(91); }), 250);
    r = await ev(page, () => ({ screen: FX.env.screen(), q: tfState.qIdx, sr: document.getElementById('sr-live').textContent }));
    check('fantômes du Vrai/Faux sur l\'accueil (suivante chargée, temps écoulé annoncé par le jeu) : rien de joué',
      mine(log).length === 0 && r.screen === 'home' && r.q === 1 && /Temps écoulé/.test(r.sr), [log, r]);
    log = await during(page, () => ev(page, () => { let g = 0; while (getComputedStyle(document.getElementById('screen-tf-result')).display === 'none' && g++ < 40) { __later(); __tick(91); } }), 400);
    check('fantômes : le jeu finit par afficher son résultat, la couche ne le fête pas', mine(log).length === 0 && (await ev(page, () => FX.env.screen())) === 'tf-result', log);
    await wait(page, 300);
    await idle(page, 'vrai/faux : aucun reste');
    check('vrai/faux : aucune erreur', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsStory(browser) {
    const page = await open(browser, ANIME, desktop);
    let log, r;
    log = await during(page, () => ev(page, () => { FX.seed(3); startStoryMode(); }), 200);
    check('histoire intro : la page se tourne (décor, trait, étoiles)', has(log, 'histoire-scene[0]') && has(log, 'anim[story-decor]') && has(log, 'slash') && has(log, 'trail'), log);
    await wait(page, 600);
    await idle(page, 'histoire intro : tout est fini 800 ms après');
    log = await during(page, () => page.click('#story-next-btn'), 200);
    check('histoire étape 1 : page tournée', has(log, 'histoire-scene[1]') && has(log, 'anim[story-decor]'), log);
    r = await ev(page, () => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
      .map((a) => a.effect.target.id || a.effect.target.className));
    check('histoire : le récit et la question ne sont jamais animés', r.every((t) => !/narrative|question|feedback|answers|answer-btn/.test(t)), r);
    await wait(page, 600); await calmXp(page);
    log = await during(page, () => ev(page, () => answerStoryStep(storyState.currentStep.correct)), 350);
    check('histoire juste : éclat sur la réponse, énergie vers le décor qui réagit, étoiles',
      has(log, 'histoire-juste') && has(log, 'streaks') && count(log, 'burst') === 2 && count(log, 'ring') === 2 && has(log, 'anim[story-decor]'), log);
    await wait(page, 450);
    await idle(page, 'histoire juste : tout est fini 800 ms après la réponse');
    log = await during(page, () => ev(page, () => answerStoryStep(0)));
    check('histoire : appel ignoré par le jeu → aucun effet', mine(log).length === 0 && !has(log, 'burst') && !has(log, 'anim[fx-tm-box]'), log);
    await ev(page, () => nextStoryStep()); await wait(page, 500);
    log = await during(page, () => ev(page, () => answerStoryStep((storyState.currentStep.correct + 1) % 4)), 200);
    check('histoire erreur : la bonne réponse est entourée, repère calme, aucune particule',
      has(log, 'histoire-erreur') && count(log, 'anim[fx-tm-box]') === 1 && !has(log, 'burst') && !has(log, 'streaks') && !has(log, 'anim[story-decor]') && !has(log, 'anim[fx-tint]'), log);
    r = [await around(page, '#story-answers .answer-btn', await ev(page, () => storyState.currentStep.correct)), await ev(page, () => document.getElementById('story-feedback-title').textContent)];
    check('histoire erreur : le contour entoure la bonne réponse ; le titre de l\'explication est celui du jeu', isAround(r[0]) && /Pas tout à fait/.test(r[1]), r);
    await wait(page, 500);
    await idle(page, 'histoire erreur : tout est fini 700 ms après la réponse');
    /* Léger : pas de bond du décor, moins de particules. */
    await ev(page, () => { FX.setLevel('leger'); nextStoryStep(); }); await wait(page, 400); await calmXp(page);
    log = await during(page, () => ev(page, () => answerStoryStep(storyState.currentStep.correct)), 350);
    check('histoire léger : forme courte (le décor ne bondit pas), tout au niveau léger', has(log, 'histoire-juste') && !has(log, 'anim[story-decor]') && from(log, 'histoire-juste').every((l) => /~$/.test(l)), log);
    await ev(page, () => { FX.setLevel('off'); nextStoryStep(); });
    log = await during(page, () => ev(page, () => answerStoryStep(storyState.currentStep.correct)), 150);
    check('histoire off : rien', log.length === 0, log);
    /* Fin de mission : 3/4 → palier ⭐ (complet). */
    await ev(page, () => FX.setLevel('complet')); await calmXp(page);
    log = await during(page, () => ev(page, () => nextStoryStep()), 600);
    check('histoire résultat 3/4 : cérémonie (émoji, tuiles, onde, étoiles, confettis)',
      has(log, 'bilan-story[palier 3]') && has(log, 'anim[story-result-emoji]') && has(log, 'ring') && has(log, 'burst[star]') && has(log, 'confetti'), log);
    await wait(page, 2000);
    await idle(page, 'histoire résultat : tout est fini 2,6 s après l\'arrivée');
    /* Palier le plus bas : étincelle douce, jamais de moquerie ; puis léger : sans confettis, ≤ 1,2 s. */
    await ev(page, () => { startStoryMode(); nextStoryStep(); for (let i = 0; i < 3; i++) { answerStoryStep((storyState.currentStep.correct + 1) % 4); nextStoryStep(); } answerStoryStep((storyState.currentStep.correct + 1) % 4); });
    await wait(page, 500);
    log = await during(page, () => ev(page, () => nextStoryStep()), 500);
    r = await raw(page);
    check('histoire résultat 0/4 : étincelle douce (une onde, 7 étoiles), pas de confettis',
      has(log, 'bilan-story[palier 0]') && !has(log, 'confetti') && count(from(log, 'bilan-story'), 'ring') === 1 && r.filter((e) => e.fx === 'burst').every((e) => e.n === 7), [log, r]);
    await ev(page, () => { FX.setLevel('leger'); startStoryMode(); nextStoryStep(); for (let i = 0; i < 4; i++) { answerStoryStep(storyState.currentStep.correct); if (i < 3) nextStoryStep(); } });
    await wait(page, 300); await calmXp(page);
    log = await during(page, () => ev(page, () => nextStoryStep()), 500);
    check('histoire résultat léger (4/4) : sans confettis, tout au niveau léger', has(log, 'bilan-story[palier 4]') && !has(log, 'confetti') && from(log, 'bilan-story').every((l) => /~$/.test(l)), log);
    await wait(page, 800);
    await idle(page, 'histoire résultat léger : tout est fini 1,3 s après l\'arrivée');
    r = await ev(page, () => document.querySelectorAll('[id^="screen-"] [class*="fx-"], [id^="screen-"] [id^="fx-"]').length - document.querySelectorAll('#screen-game [class*="fx-"], #screen-game [id^="fx-"], #screen-home [class*="fx-"], #screen-home [id^="fx-"]').length);
    check('histoire : aucun nœud de la couche dans les écrans de ces modes', r === 0, r);
    check('histoire : aucune erreur', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsAuto(browser) {
    const page = await open(browser, ANIME, desktop);
    const answer = (good) => ev(page, (good) => { document.getElementById('auto-input').value = good ? String(autoState.questions[autoState.qIdx].a) : '?'; submitAutoAnswer(); }, good);
    const next = () => ev(page, () => __later());
    let log, r;
    await ev(page, () => { FX.seed(3); startAutoMode('auto_6e'); }); await wait(page, 300);
    r = await ev(page, () => [FX.env.profile(), FX.effective(), FX.level()]);
    check('automatismes : profil sobre, plafonné au niveau léger', r[0] === 'sobre' && r[1] === 1 && r[2] === 'complet', r);
    log = await during(page, () => answer(true), 150);
    check('automatismes juste : un seul contour bref, au niveau léger, rien d\'autre', has(log, 'auto-juste~') && count(log, 'anim[fx-tm-box]~') === 1 && sober(log) && !has(log, 'anim[fx-float]') && !has(log, 'slash') && !has(log, 'ring'), log);
    r = [await around(page, '#screen-auto .question-wrap', 0),
      await ev(page, () => ({ dur: document.querySelector('.fx-tm-box').getAnimations()[0].effect.getTiming().duration, boxes: document.querySelectorAll('.fx-tm-box').length,
        focus: document.activeElement.id || document.activeElement.tagName })),
      await rects(page, ['.fx-tm-box', '#auto-input', '#auto-feedback'])];
    check('automatismes juste : le contour est AUTOUR de la carte (creux : rien sur le champ ni sur la correction), ≤ 400 ms',
      isAround(r[0]) && r[1].dur <= 400 && r[1].boxes === 1 && r[2][0][1] < r[2][1][1] && r[2][0][3] > r[2][2][3], r);
    await wait(page, 350);
    await idle(page, 'automatismes juste : tout est fini 500 ms après la réponse');
    log = await during(page, () => ev(page, () => { submitAutoAnswer(); submitAutoAnswer(true); }));
    check('automatismes : appels ignorés par le jeu (déjà répondu) → aucun effet', mine(log).length === 0 && !has(log, 'anim[fx-tm-box]'), log);
    await next(); await wait(page, 60);
    log = await during(page, () => answer(false), 150);
    check('automatismes erreur : un contour calme, rien d\'autre', has(log, 'auto-erreur~') && count(log, 'anim[fx-tm-box]~') === 1 && sober(log) && !has(log, 'anim[fx-float]') && !has(log, 'slash') && !has(log, 'ring'), log);
    r = await ev(page, () => [getComputedStyle(document.querySelector('.fx-tm-box')).color, FX.palette().calm, FX.palette().good]);
    check('automatismes erreur : couleur calme (jamais de rouge)', FX_rgb(r[1]) === r[0] && r[1] !== r[2], r);
    await next(); await wait(page, 450);
    log = await during(page, () => ev(page, () => { autoState.qTimeLeft = 0.35; __tick(4); }), 150);
    check('automatismes temps écoulé : même repère calme', has(log, 'auto-temps~') && count(log, 'anim[fx-tm-box]~') === 1 && sober(log) && !has(log, 'slash') && !has(log, 'ring'), log);
    /* Pause : tout est coupé ; la question suivante chargée derrière la modale ne joue rien. */
    await next(); await wait(page, 450);
    await answer(true); await wait(page, 80);                          // le contour de la réponse est en cours
    log = await during(page, () => ev(page, () => { pauseAutoMode(); __later(); }), 150);
    r = await leftovers(page);
    check('automatismes : pause pendant la correction → tout est coupé, rien de joué derrière la modale', mine(log).length === 0 && isIdle(r), [log, r]);
    await ev(page, () => resumeAutoMode()); await wait(page, 80);
    /* Série : la 5e bonne réponse d'affilée ajoute une petite mention près du compteur. */
    await ev(page, () => { autoState.history.forEach((x) => { x.ok = true; }); });      // 4 réponses déjà données : la suivante est la 5e
    await calmXp(page);
    log = await during(page, () => answer(true), 150);
    r = await rects(page, ['.fx-float', '#auto-input', '#auto-feedback', '#auto-question']);
    check('automatismes série ×5 : mention discrète (contour + un texte), loin du champ et de la question',
      has(log, 'auto-juste~') && count(log, 'anim[fx-tm-box]~') === 1 && count(log, 'anim[fx-float]~') === 1 && sober(log) && r[0] && apart(r[0], r[1]) && apart(r[0], r[2]) && apart(r[0], r[3]), [log, r]);
    r = await ev(page, () => [document.querySelector('.fx-float').textContent, autoState.history.length]);
    check('automatismes série : texte « SÉRIE ×5 »', r[0] === 'SÉRIE ×5' && r[1] === 5, r);
    await wait(page, 800);
    r = await raw(page);
    check('automatismes : aucune particule, tout au niveau léger', r.every((e) => e.n === 0 && e.level === 'leger' && e.profile === 'sobre'), r);
    /* Résultat : 13/20 → 🥷 (palier 2), sans confettis ; la seule fête de l'épreuve. */
    await ev(page, () => { autoState.qIdx = 18; });
    await next(); await wait(page, 450); await calmXp(page);           // dernière question (20/20)
    log = await during(page, () => ev(page, () => { autoState.correct = 12; document.getElementById('auto-input').value = String(autoState.questions[19].a); submitAutoAnswer(); __later(); }), 600);
    check('automatismes résultat (13/20) : cérémonie mesurée (émoji, tuiles, onde, étoiles), au niveau complet',
      has(log, 'bilan-auto[palier 2]') && has(log, 'anim[auto-result-emoji]') && has(log, 'ring') && has(log, 'burst[star]') && !has(log, 'confetti') && !from(log, 'bilan-auto').some((l) => /~$/.test(l)), log);
    await wait(page, 1400);
    await idle(page, 'automatismes résultat : tout est fini 2 s après l\'arrivée');
    /* Les cinq autres épreuves (dont le format brevet) : même sobriété. */
    r = [];
    for (const pool of ['auto_5e', 'auto_4e', 'auto_3e', 'auto_mix', 'auto_dnb']) {
      await ev(page, (pool) => { startAutoMode(pool); state.xp = (state.level - 1) * 500; }, pool); await wait(page, 250);
      log = await during(page, () => answer(true), 120);
      r.push([pool, await ev(page, () => [autoState.mode, autoState.correct, FX.env.profile()]), log]);
      await ev(page, () => { exitAutoMode(); __later(); clearInterval(autoState.qTimer); }); await wait(page, 60);
    }
    check('automatismes : les six épreuves ont le même contour sobre (5e, 4e, 3e, mix, DNB)',
      r.every((x) => x[1][0] === x[0] && x[1][1] === 1 && x[1][2] === 'sobre' && has(x[2], 'auto-juste~') && count(x[2], 'anim[fx-tm-box]~') === 1 && sober(x[2])), r);
    /* Abandon pendant la correction, puis fantômes sur l'accueil. */
    await ev(page, () => startAutoMode('auto_6e')); await wait(page, 300);
    await answer(true); await wait(page, 60);
    await ev(page, () => exitAutoMode()); await wait(page, 400);
    log = await during(page, () => ev(page, () => { __later(); autoState.qTimeLeft = 0.35; __tick(4); }), 250);
    r = await ev(page, () => ({ screen: FX.env.screen(), q: autoState.qIdx, n: autoState.history.length }));
    check('fantômes des automatismes sur l\'accueil (question chargée, temps écoulé) : rien de joué', mine(log).length === 0 && r.screen === 'home' && r.q === 1 && r.n === 2, [log, r]);
    await ev(page, () => { clearInterval(autoState.qTimer); __later(); clearInterval(autoState.qTimer); });
    r = await ev(page, () => ['#screen-auto', '#screen-tf', '#screen-dnb-ex'].map((s) => document.querySelectorAll(s + ' > div[style*="grid-template-columns:1fr 1fr 1fr"]').length));
    check('automatismes : attribut style des rangées de compteurs intact', r.join() === '1,1,1', r);
    check('automatismes : aucune erreur', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }
  /* '#RRGGBB' → 'rgb(r, g, b)' (forme du style calculé). */
  function FX_rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgb(' + (n >> 16 & 255) + ', ' + (n >> 8 & 255) + ', ' + (n & 255) + ')';
  }

  async function momentsDnb(browser) {
    const page = await open(browser, ANIME, desktop);
    let log, r;
    log = await during(page, () => ev(page, () => { FX.seed(3); showAutoMenu(); startDnbBlanc(); }), 250);
    check('DNB intro : sobre, rien du module', mine(log).length === 0 && (await ev(page, () => FX.env.profile())) === 'sobre', log);
    await ev(page, () => startDnbPhase1()); await wait(page, 250);
    log = await during(page, () => ev(page, () => { document.getElementById('auto-input').value = String(autoState.questions[0].a); submitAutoAnswer(); }), 150);
    check('DNB phase 1 (auto_dnb) : même contour sobre que les automatismes', (await ev(page, () => autoState.mode)) === 'auto_dnb' && has(log, 'auto-juste~') && count(log, 'anim[fx-tm-box]~') === 1 && sober(log) && !has(log, 'anim[fx-float]'), log);
    await wait(page, 400);
    /* Fin de phase 1 : endAutoMode bifurque vers la transition → pas de bilan d'automatismes. */
    await ev(page, () => { __later(); autoState.correct = 15; autoState.qIdx = 19; });
    log = await during(page, () => ev(page, () => { document.getElementById('auto-input').value = '?'; submitAutoAnswer(); __later(); }), 250);
    r = await ev(page, () => { const b = document.querySelector('#screen-dnb-transition .btn-main'); return [b.getAnimations().length, getComputedStyle(b).opacity, document.getElementById('dnb-trans-points').textContent]; });
    check('DNB transition : révélation discrète bloc par bloc (5 fondus), pas de bilan, bouton CONTINUER jamais animé',
      has(log, 'dnb-transition~') && count(from(log, 'dnb-transition'), 'anim') === 5 && sober(from(log, 'dnb-transition')) && !has(log, 'bilan-') && r[0] === 0 && r[1] === '1' && r[2] === '4.5', [log, r]);
    await wait(page, 600);
    await idle(page, 'DNB transition : tout est fini 850 ms après l\'arrivée');
    /* Exercices : contour seulement. */
    log = await during(page, () => ev(page, () => { continueDnbBlanc(); nextDnbExStep(); }), 150);
    check('DNB exercice (énoncé, première question) : rien', mine(log).length === 0 && !has(log, 'anim[fx-tm-box]'), log);
    await calmXp(page);
    log = await during(page, () => ev(page, () => answerDnbStep(dnbState.currentStep.correct)), 150);
    check('DNB juste : un seul contour sur la réponse choisie, rien d\'autre', has(log, 'dnb-juste~') && count(log, 'anim[fx-tm-box]~') === 1 && sober(log) && !has(log, 'slash') && !has(log, 'ring') && !has(log, 'anim[fx-float]'), log);
    r = await around(page, '#dnb-ex-answers .answer-btn', await ev(page, () => dnbState.currentStep.correct));
    check('DNB juste : le contour entoure le bouton choisi (rien n\'est dessiné dessus)', isAround(r), r);
    log = await during(page, () => ev(page, () => answerDnbStep(0)));
    check('DNB : appel ignoré par le jeu → aucun effet', mine(log).length === 0 && !has(log, 'anim[fx-tm-box]'), log);
    await ev(page, () => { nextDnbExStep(); window.scrollTo(0, document.getElementById('dnb-ex-answers').getBoundingClientRect().top + pageYOffset - 200); }); await wait(page, 450);
    log = await during(page, () => ev(page, () => answerDnbStep((dnbState.currentStep.correct + 1) % 4)), 150);
    check('DNB erreur : bonne réponse entourée + repère calme vers l\'explication (trait), rien d\'autre',
      has(log, 'dnb-erreur~') && count(log, 'anim[fx-tm-box]~') === 1 && count(log, 'slash~') === 1 && sober(log) && !has(log, 'anim[fx-float]'), log);
    await wait(page, 500);
    await idle(page, 'DNB erreur : tout est fini 650 ms après la réponse');
    r = await raw(page);
    check('DNB exercices : aucune particule, niveau léger', r.every((e) => e.n === 0 && e.level === 'leger'), r);
    /* Fin : tout juste ensuite → note haute ; cérémonie digne (note tamponnée, détail déroulé, pas de confettis). */
    await ev(page, () => {
      let g = 0;
      while (dnbState.exerciseIdx < 4 && g++ < 60) {
        nextDnbExStep();
        if (dnbState.exerciseIdx === 3 && dnbState.stepIdx === 3 && !dnbState._inIntro) break;
        if (!dnbState._inIntro && !dnbState.exerciseAnswered && dnbState.exerciseIdx < 4) answerDnbStep(dnbState.currentStep.correct);
      }
      answerDnbStep(dnbState.currentStep.correct);
      window.scrollTo(0, 0);                                    // résultat en haut de page : l'émoji du palier est à l'écran
    });
    await wait(page, 450); await calmXp(page);
    log = await during(page, () => ev(page, () => nextDnbExStep()), 950);
    r = await ev(page, () => [document.getElementById('dnb-result-emoji').textContent, document.getElementById('dnb-result-grade').textContent, FX.env.profile()]);
    check('DNB résultat (' + r[1] + '/40) : la fête de l\'épreuve — émoji, note tamponnée, 5 lignes déroulées, ondes, étoiles, sans confettis',
      has(log, 'bilan-dnb[palier 4]') && r[0] === '🏆' && r[2] === 'ceremony' && has(log, 'anim[dnb-result-emoji]') && count(from(log, 'bilan-dnb'), 'anim') === 7 &&
      count(from(log, 'bilan-dnb'), 'ring') === 2 && has(log, 'burst[star]') && !has(log, 'confetti') && !from(log, 'bilan-dnb').some((l) => /~$/.test(l)), [log, r]);
    await wait(page, 900);
    await idle(page, 'DNB résultat : tout est fini 1,9 s après l\'arrivée');
    /* dnbState.active périmé : une épreuve auto_6e ordinaire finit sur la transition → pas de bilan d'automatismes. */
    await ev(page, () => { startDnbBlanc(); startDnbPhase1(); exitAutoMode(); startAutoMode('auto_6e'); autoState.correct = 18; autoState.qIdx = 19; });
    await wait(page, 300);
    log = await during(page, () => ev(page, () => { document.getElementById('auto-input').value = '?'; submitAutoAnswer(); __later(); }), 300);
    check('drapeau DNB périmé : la couche suit l\'écran réellement affiché (transition), aucun bilan d\'automatismes',
      (await ev(page, () => FX.env.screen())) === 'dnb-transition' && has(log, 'dnb-transition~') && !has(log, 'bilan-'), log);
    await wait(page, 700);
    await idle(page, 'DNB : aucun reste');
    check('DNB : aucune erreur', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }

  async function scenarioMoments(browser) {
    await Promise.all([momentsTf(browser), momentsStory(browser), momentsAuto(browser), momentsDnb(browser)]);
  }

  /* ── Scénario 3 : téléphone 360×640 ── */
  async function scenarioPhone(browser) {
    const page = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
    let log, r;
    /* Histoire : la page n'a pas défilé, l'explication s'ouvre sous le bas de l'écran → un 👇 discret. */
    await ev(page, () => { FX.seed(3); selectUniverse('onepiece'); startStoryMode(); nextStoryStep(); }); await wait(page, 500);
    r = await ev(page, () => { const p = FX.palette(); return [p.universe, p.theme, p.u, FX.color.contrast(p.u, p.bg) >= 3, FX.color.contrast(p.good, p.bg) >= 3, FX.color.contrast(p.calm, p.bg) >= 3]; });
    check('téléphone : autre univers, thème clair → couleurs de la palette (contraste ≥ 3:1)', r[0] === 'onepiece' && r[1] === 'light' && r[3] && r[4] && r[5], r);
    log = await during(page, () => ev(page, () => answerStoryStep((storyState.currentStep.correct + 1) % 4)), 200);
    r = await ev(page, () => {
      const f = document.querySelector('.fx-float'), b = f && f.getBoundingClientRect(), p = document.getElementById('story-feedback').getBoundingClientRect();
      return { txt: f && f.textContent, below: p.top > innerHeight - 40, x: b && b.left, y: b && b.top, w: b && b.width, vw: document.documentElement.clientWidth, vh: innerHeight };
    });
    check('téléphone : explication sous l\'écran → repère 👇 dans le coin bas droit, petit', has(log, 'histoire-erreur') && r.below && r.txt === '👇' && r.w <= 40 && r.x > r.vw - 60 && r.y > r.vh - 80, [log, r]);
    await wait(page, 1900);
    check('téléphone : le repère a disparu (≤ 2 s)', isIdle(await leftovers(page)), await leftovers(page));
    /* Explication visible (page défilée) → trait le long de son bord, pas de 👇. */
    await ev(page, () => { nextStoryStep(); }); await wait(page, 400);
    await ev(page, () => { answerStoryStep((storyState.currentStep.correct + 1) % 4); window.scrollTo(0, document.getElementById('story-feedback').getBoundingClientRect().top + pageYOffset - 200); FX.bump('q'); });
    await ev(page, () => { nextStoryStep(); window.scrollTo(0, document.getElementById('story-answers').getBoundingClientRect().top + pageYOffset - 120); }); await wait(page, 400);
    log = await during(page, () => ev(page, () => answerStoryStep((storyState.currentStep.correct + 1) % 4)), 150);
    r = await ev(page, () => { const p = document.getElementById('story-feedback').getBoundingClientRect(); return [p.top < innerHeight - 40, !!document.querySelector('.fx-float')]; });
    check('téléphone : explication à l\'écran → trait calme, pas de 👇', r[0] === true && has(log, 'histoire-erreur') && has(log, 'slash') && !r[1], [log, r]);
    /* Résultat : le jeu ne remonte pas la page ; si l'émoji du palier est hors champ, vignette en haut. */
    await ev(page, () => { answerStoryStep(0); nextStoryStep(); });        // dernière étape (appel ignoré), puis fin de mission
    await ev(page, () => { if (FX.env.screen() !== 'story-result') { answerStoryStep(storyState.currentStep.correct); nextStoryStep(); } });
    await wait(page, 2200);
    await ev(page, () => { startTrueFalse(); window.scrollTo(0, 400); }); await wait(page, 400);
    await ev(page, () => { tfState.correct = 15; tfState.qIdx = 19; answerTf(tfState.questions[19].isTrue); state.xp = (state.level - 1) * 500; });
    log = await during(page, () => ev(page, () => __later()), 500);
    r = await ev(page, () => {
      const e = document.getElementById('tf-result-emoji').getBoundingClientRect(), b = document.querySelector('.fx-banner'), q = b && b.getBoundingClientRect();
      return { emojiVu: e.bottom > 0 && e.top < innerHeight, banner: b && b.textContent, x: q && q.left, r: q && q.right, vw: document.documentElement.clientWidth, scroll: pageYOffset };
    });
    check('téléphone : résultat avec émoji hors champ → vignette (palier + titre du jeu) qui tient dans l\'écran',
      has(log, 'bilan-tf[palier 3]') && !r.emojiVu && r.scroll > 0 && /EXCELLENT/.test(r.banner || '') && r.x >= 0 && r.r <= r.vw, [log, r]);
    await wait(page, 2200);
    check('téléphone : aucun reste', isIdle(await leftovers(page)), await leftovers(page));
    r = await ev(page, () => document.documentElement.scrollWidth);
    check('téléphone : aucune erreur', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, r]);
    await page.context().close();
  }

  return [
    ['txt-diff', 'textes : différentiel par mode (Vrai/Faux, Histoire, Automatismes, DNB Blanc)', scenarioDiff],
    ['txt-moments', 'textes : moments (journal, niveaux, fantômes, restes)', scenarioMoments],
    ['txt-tel', 'textes : téléphone (repère d\'explication, résultat hors champ)', scenarioPhone]
  ];
};
