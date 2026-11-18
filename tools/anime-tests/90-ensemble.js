/* Scénarios d'ENSEMBLE : ce qui ne se voit que lorsque tous les modules tournent dans la même page
   (aucun fragment ne porte ce numéro ; les scénarios propres à un module restent dans son fichier).
   Chargé par tools/test_anime.js (voir HELPERS).

   · ensemble-niveau   : un niveau gagné (crochet addXP du module « combat ») n'est jamais un second effet
                         focal — accent sur le badge pendant un atelier, onde seule en épreuve, bandeau en
                         dernier temps de la fête sur un écran de résultat (y compris quand le jeu appelle
                         addXP AVANT showScreen), rien sur le résultat du QCM, rien sans en-tête à l'écran.
   · ensemble-fin      : fin du Tracé → accueil : UN bandeau, sur l'en-tête (jamais sur le titre), sans la
                         fioriture de retour de l'accueil ; un retour ordinaire garde la sienne.
   · ensemble-repere   : le repère « l'explication est plus bas » (👇) des trois familles de modes (QCM,
                         textes, ateliers) est retiré au premier défilement et à la question suivante
                         (portée « cue » du noyau).
   · ensemble-resultats: un effet de résultat ne se pose JAMAIS sur un texte du résultat. Les sept écrans de
                         résultat, à cinq tailles de fenêtre : arrivée normale (le jeu affiche l'écran depuis le
                         haut → cérémonie complète à la place du rang ou de l'émoji du palier) et arrivée
                         « page encore en train de défiler » (rang hors champ → UN moment sur l'en-tête collant,
                         ou rien si l'en-tête est sorti). Observé image par image : aucun nœud de la couche sur
                         le titre, le texte, les chiffres, les trophées ou les boutons ; un seul bandeau à la fois.
   · ensemble-parcours : inventaire des crochets (7 modules, 50 fonctions, rien de manquant ni refusé),
                         navigation rapide à travers tous les modes aux niveaux complet puis « chaos » :
                         aucune erreur, rien ne traîne, le jeu finit sur l'accueil, et chacune des 50
                         globales est ENCORE l'enveloppe posée au démarrage (aucun crochet contourné).

   Les minuteries longues du jeu (« question suivante » : 2,5 à 5 s ; toast : 2,2 s) sont retenues et
   déclenchées par __later() ; celles de la couche sont toutes plus courtes, sauf la fin de la
   cérémonie du QCM (T + 1,5 s), sans effet ici. */
'use strict';

module.exports = function (h) {
  const { check, wait, logOf, leftovers, isIdle, harness, watchers, ANIME, SEED } = h;
  const has = (log, name) => log.some((l) => l.indexOf(name) === 0);
  const from = (log, name) => { const i = log.findIndex((l) => l.indexOf(name) === 0); return i < 0 ? [] : log.slice(i); };
  const LOUD = /^(burst|streaks|trail|confetti|sprite)/;
  const DESK = { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' };
  const TEL = { viewport: { width: 360, height: 640 }, colorScheme: 'light' };

  function holdLongTimers() {            // injecté avant tout script de page, après le harnais commun
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
  /* Photographie les enveloppes au démarrage : window.FX est posée par la couche au début de son script ;
     une micro-tâche plus tard ce script a fini (tous les FX.wrap sont faits), avant toute autre tâche de la page. */
  function trapBoot() {
    Object.defineProperty(window, 'FX', {
      configurable: true, enumerable: true,
      set: function (fx) {
        Object.defineProperty(window, 'FX', { value: fx, writable: true, configurable: true, enumerable: true });
        Promise.resolve().then(function () {
          const w = fx.stats().wrapped;
          window.__boot = { names: w.slice(), fns: w.map(function (n) { return window[n]; }), origs: w.map(function (n) { return fx.debug.orig(n); }) };
        });
      }
    });
  }
  async function open(browser, opts) {
    const ctx = await browser.newContext({ viewport: opts.viewport, reducedMotion: 'no-preference', colorScheme: opts.colorScheme });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) page.errors.push('console: ' + m.text());
    });
    await page.addInitScript(harness, SEED);
    await page.addInitScript(holdLongTimers);
    if (opts.boot) await page.addInitScript(trapBoot);
    if (opts.watch) await page.addInitScript(watchers);
    await page.goto(ANIME);
    await page.waitForTimeout(150);
    return page;
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  /* La couche au repos, journal vide (l'accueil joue son ouverture après le chargement). */
  const quiet = (page) => ev(page, () => { FX.cancel('*'); FX.debug.log.length = 0; });
  /* Journal daté : [instant en ms, nom]. */
  const tlog = (page) => ev(page, () => FX.debug.log.map((e) => [e.t, e.fx + (e.info ? '[' + e.info + ']' : '') + (e.level === 'leger' ? '~' : '')]));
  const at = (log, name) => { const e = log.find((l) => l[1].indexOf(name) === 0); return e ? e[0] : -1; };
  /* Le bandeau de la couche, s'il existe : texte, et sa position par rapport à l'en-tête et à une zone de lecture. */
  const banner = (page, readSel) => ev(page, (readSel) => {
    const b = document.querySelector('#fx-stage .fx-banner'), hd = document.querySelector('header[role="banner"]').getBoundingClientRect();
    if (!b) return null;
    const r = b.getBoundingClientRect(), cy = (r.top + r.bottom) / 2, t = readSel && document.querySelector(readSel), q = t && t.getBoundingClientRect();
    return { text: b.textContent, count: document.querySelectorAll('#fx-stage .fx-banner').length, onHeader: cy >= hd.top && cy <= hd.bottom && hd.bottom > 0,
      overRead: !!q && q.height > 0 && r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top };
  }, readSel || null);
  const level = (page) => ev(page, () => state.level);
  /* Juste sous un seuil de niveau : le prochain gain d'au moins « marge » XP fait passer le niveau. */
  const nearLevel = (page, marge) => ev(page, (m) => { state.xp = state.level * 500 - m; }, marge);
  const solveThales = (page) => ev(page, () => { pythState.thales.t = pythState.challenge.targetRatio; renderPyth(); validatePythChallenge(); });

  /* ════════════ Niveau gagné : jamais un second effet focal ════════════ */
  async function scenarioNiveau(browser) {
    let page = await open(browser, DESK), log, b, l0, l1;
    await wait(page, 200);

    /* 1. Atelier (Constructeur) : le verdict est l'effet focal ; le niveau n'ajoute qu'un accent sur le badge. */
    await ev(page, () => { window.scrollTo(0, 0); startPythMode(); }); await wait(page, 400);
    await ev(page, () => selectPythAtelier('thales')); await wait(page, 450);
    await quiet(page); l0 = await level(page);
    await nearLevel(page, 10); await solveThales(page);
    await wait(page, 250);
    log = await logOf(page); b = await banner(page); l1 = await level(page);
    check('atelier + niveau gagné : le verdict joue, le niveau n\'ajoute qu\'un accent sur le badge (aucun bandeau)',
      l1 === l0 + 1 && has(log, 'defi-juste') && has(log, 'niveau') && !has(log, 'anim[fx-banner]') && b === null &&
      from(log, 'niveau').filter((l) => l === 'ring').length === 1, [l0, l1, log, b]);
    await wait(page, 900);
    check('atelier + niveau gagné : tout est fini 1,2 s après', isIdle(await leftovers(page)), await leftovers(page));

    /* 2. Épreuve (profil sobre) : l'onde seule, au niveau léger, ni bandeau ni particule. */
    await ev(page, () => { showHome(); window.scrollTo(0, 0); startAutoMode('auto_6e'); }); await wait(page, 300);
    await quiet(page); l0 = await level(page);
    await nearLevel(page, 10);
    await ev(page, () => { document.getElementById('auto-input').value = String(autoState.questions[autoState.qIdx].a); submitAutoAnswer(); });
    await wait(page, 250);
    log = await logOf(page); b = await banner(page); l1 = await level(page);
    check('épreuve + niveau gagné : onde seule sur le badge, au niveau léger, ni bandeau ni particule',
      l1 === l0 + 1 && has(log, 'auto-juste~') && has(log, 'niveau~') && b === null && !log.some((l) => LOUD.test(l) || /fx-banner/.test(l)) && log.every((l) => /~$/.test(l)), [l0, l1, log, b]);
    await ev(page, () => { exitAutoMode(); __later(); });

    /* 3. Résultat (Vrai/Faux : addXP APRÈS showScreen) : la fête d'abord, « NIVEAU n ! » en dernier temps. */
    await ev(page, () => { showHome(); window.scrollTo(0, 0); startTrueFalse(); }); await wait(page, 400);
    await quiet(page); l0 = await level(page);
    await ev(page, () => { tfState.correct = 18; state.xp = state.level * 500 - 40; endTrueFalse(); });
    await wait(page, 700);
    b = await banner(page, '#tf-result-msg');
    check('résultat + niveau gagné : pas de bandeau pendant la fête', b === null && has(await logOf(page), 'bilan-tf') && !has(await logOf(page), 'niveau'), [b, await logOf(page)]);
    await wait(page, 850);                                    // ≈ 1,55 s : le bandeau est là
    b = await banner(page, '#tf-result-msg'); log = await tlog(page); l1 = await level(page);
    check('résultat + niveau gagné : « NIVEAU n ! » en dernier temps (≥ 1,2 s après le début de la fête), sur l\'en-tête, hors du texte',
      l1 === l0 + 1 && at(log, 'niveau') - at(log, 'bilan-tf') >= 1200 && !!b && b.count === 1 && /NIVEAU \d+ !/.test(b.text) && b.onHeader && !b.overRead, [l0, l1, b, log.map((l) => l.join(' '))]);
    await wait(page, 1250);
    check('résultat + niveau gagné : tout est fini 2,8 s après l\'arrivée', isIdle(await leftovers(page)) && (await banner(page)) === null, await leftovers(page));

    /* 4. Résultat (Arbre : addXP AVANT showScreen) : le niveau n'est pas perdu au changement d'écran. */
    await ev(page, () => { showHome(); window.scrollTo(0, 0); startProbaTree(); }); await wait(page, 400);
    await quiet(page); l0 = await level(page);
    await ev(page, () => { probaState.scenarioCorrect = [true, true, false]; state.xp = state.level * 500 - 40; endProbaTree(); });
    await wait(page, 1600);
    b = await banner(page); log = await tlog(page); l1 = await level(page);
    check('résultat de l\'arbre (addXP avant showScreen) : la fête puis « NIVEAU n ! » sur l\'en-tête',
      l1 === l0 + 1 && at(log, 'bilan-proba') >= 0 && at(log, 'niveau') - at(log, 'bilan-proba') >= 1200 && !!b && b.onHeader, [l0, l1, b, log.map((l) => l.join(' '))]);
    await wait(page, 1000);

    /* 5. Même résultat au niveau léger : l'onde seule sur le badge, et la fête courte reste sous 1,3 s. */
    await ev(page, () => { showHome(); window.scrollTo(0, 0); FX.setLevel('leger'); startTrueFalse(); }); await wait(page, 400);
    await quiet(page); l0 = await level(page);
    await ev(page, () => { tfState.correct = 18; state.xp = state.level * 500 - 40; endTrueFalse(); });
    await wait(page, 850);
    log = await logOf(page); b = await banner(page); l1 = await level(page);
    check('résultat + niveau gagné, niveau léger : l\'onde seule sur le badge (ni bandeau ni étoiles)',
      l1 === l0 + 1 && has(log, 'bilan-tf') && JSON.stringify(from(log, 'niveau')) === '["niveau~","ring~"]' && b === null, [l0, l1, log, b]);
    await wait(page, 450);
    check('résultat + niveau gagné, niveau léger : tout est fini en 1,3 s', isIdle(await leftovers(page)), await leftovers(page));
    await ev(page, () => FX.setLevel('complet'));

    /* 6. Résultat du QCM : la cérémonie du rang occupe l'écran, le niveau n'y ajoute rien (partie finie d'une traite). */
    await ev(page, () => { showHome(); window.scrollTo(0, 0); startGame('6e_facile'); });
    await page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');
    await wait(page, 300); await quiet(page); l0 = await level(page);
    await ev(page, () => {
      let g = 0;
      while (document.getElementById('screen-game').style.display === 'block' && g++ < 300) {
        if (state.qIndex >= state.questions.length - 1 && !(state.missedQueue || []).length) state.xp = state.level * 500 - 10;     // le dernier coup fait passer le niveau
        answer(state.questions[state.qIndex].correct);
        nextQuestion();
      }
    });
    await wait(page, 1900);
    log = await logOf(page); l1 = await level(page);
    check('résultat du QCM : cérémonie du rang seule, aucun « niveau » par-dessus', l1 > l0 && log.some((l) => /^bilan\[rang/.test(l)) && !has(log, 'niveau'), [l0, l1, log.filter((l) => !/^(anim|burst|ring|confetti)/.test(l))]);
    check('aucune erreur (niveau, bureau)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();

    /* 7. Téléphone. En QCM l'en-tête est collant : le bandeau s'y pose, jamais sur la question. */
    page = await open(browser, TEL);
    await ev(page, () => startGame('6e_facile'));
    await page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');
    await ev(page, () => window.scrollTo(0, 260)); await wait(page, 300);
    await quiet(page); await nearLevel(page, 10);
    await ev(page, () => answer(state.questions[state.qIndex].correct));
    await wait(page, 700);
    b = await banner(page, '#question-text'); log = await logOf(page);
    check('téléphone, QCM, page défilée : « NIVEAU n ! » sur l\'en-tête collant, hors de la question', has(log, 'niveau') && !!b && b.onHeader && !b.overRead, [b, log.filter((l) => !/^(anim|burst|ring|streaks|slash|trail)/.test(l))]);
    /* Atelier, page défilée : l'en-tête est sorti de l'écran → le niveau ne joue rien (le toast du jeu l'annonce). */
    await ev(page, () => { showHome(); startPythMode(); }); await wait(page, 400);
    await ev(page, () => selectPythAtelier('thales')); await wait(page, 450);
    await ev(page, () => document.getElementById('pyth-canvas').scrollIntoView({ block: 'center' })); await wait(page, 150);
    await quiet(page); l0 = await level(page);
    await nearLevel(page, 10); await solveThales(page);
    await wait(page, 300);
    log = await logOf(page); b = await banner(page); l1 = await level(page);
    const hdOut = await ev(page, () => document.querySelector('header[role="banner"]').getBoundingClientRect().bottom <= 0);
    check('téléphone, atelier, en-tête hors champ : le verdict joue, rien pour le niveau (ni bandeau sur la consigne)',
      hdOut && l1 === l0 + 1 && has(log, 'defi-juste') && !has(log, 'niveau') && b === null, [hdOut, l0, l1, log, b]);
    check('aucune erreur (niveau, téléphone)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }

  /* ════════════ Fin du Tracé : un seul effet focal sur l'accueil ════════════ */
  async function scenarioFin(browser) {
    for (const [nom, opts] of [['bureau', DESK], ['téléphone', TEL]]) {
      const page = await open(browser, opts);
      await ev(page, () => { window.scrollTo(0, 0); startDrawMode(); }); await wait(page, 400);
      await quiet(page);
      await ev(page, () => { for (let i = 0; i < 7; i++) nextDrawMission(); });
      await wait(page, 300);
      const b = await banner(page, '#hero-title');
      await wait(page, 450);
      let log = await logOf(page);
      check(nom + ' : fin du Tracé → un bandeau sur l\'en-tête de l\'accueil, hors du titre',
        has(log, 'arrivee[home]') && has(log, 'atelier-fin[MISSIONS TERMINÉES !]') && !!b && b.count === 1 && b.onHeader && !b.overRead, [b, log]);
      check(nom + ' : fin du Tracé → pas de fioriture de retour par-dessus le bandeau', !has(log, 'accueil'), log);
      await wait(page, 1000);
      check(nom + ' : fin du Tracé → tout est fini 1,8 s après', isIdle(await leftovers(page)), await leftovers(page));
      /* Un retour ordinaire garde sa fioriture. */
      await quiet(page);
      await ev(page, () => { startStoryMode(); }); await wait(page, 60);
      await ev(page, () => { showHome(); window.scrollTo(0, 0); }); await wait(page, 450);
      log = await logOf(page);
      check(nom + ' : retour ordinaire sur l\'accueil → sa fioriture joue', has(log, 'accueil[retour]') && !has(log, 'atelier-fin'), log);
      check(nom + ' : aucune erreur (fin)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
      await page.context().close();
    }
  }

  /* ════════════ Repère d'explication : une seule règle pour tous les modes ════════════ */
  async function scenarioRepere(browser) {
    const page = await open(browser, TEL);
    const cue = () => ev(page, () => Array.from(document.querySelectorAll('#fx-stage > *')).filter((n) => n.textContent === '👇').length);
    const cas = [
      ['QCM', async () => {
        await ev(page, () => startGame('6e_facile'));
        await page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');
        await ev(page, () => { const r = document.getElementById('fx-arena').getBoundingClientRect(); window.scrollBy(0, r.top - 70); });
        await wait(page, 300);
      }, () => ev(page, () => answer((state.questions[state.qIndex].correct + 1) % 4)), () => ev(page, () => nextQuestion())],
      ['Histoire', async () => { await ev(page, () => { window.scrollTo(0, 0); startStoryMode(); nextStoryStep(); }); await wait(page, 450); },
        () => ev(page, () => answerStoryStep((storyState.currentStep.correct + 1) % 4)), () => ev(page, () => nextStoryStep())],
      ['Constructeur', async () => { await ev(page, () => { window.scrollTo(0, 0); startPythMode(); }); await wait(page, 500); },
        () => ev(page, () => validatePythChallenge()), () => ev(page, () => newPythChallenge())]
    ];
    for (const [nom, entrer, rater, suivant] of cas) {
      await ev(page, () => { __later(); showHome(); }); await wait(page, 200);
      await entrer(); await quiet(page);
      await rater(); await wait(page, 200);
      const n1 = await cue();
      await ev(page, () => window.scrollBy(0, 40)); await wait(page, 120);
      const n2 = await cue();
      check(nom + ' : explication sous l\'écran → un repère 👇, retiré au premier défilement', n1 === 1 && n2 === 0, [n1, n2, await logOf(page)]);
      /* Même erreur, puis question / défi suivant sans défiler : le repère ne survit pas. */
      await ev(page, () => { __later(); showHome(); }); await wait(page, 200);
      await entrer(); await quiet(page);
      await wait(page, nom === 'Constructeur' ? 1550 : 0);      // un repère au plus par 1,5 s pour un essai manqué martelé
      await rater(); await wait(page, 200);
      const n3 = await cue();
      await suivant(); await wait(page, 60);
      const n4 = await cue();
      check(nom + ' : le repère 👇 ne survit pas à la question suivante', n3 === 1 && n4 === 0, [n3, n4]);
    }
    check('aucune erreur (repère)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }

  /* ════════════ Résultats : jamais un effet sur un texte du résultat ════════════ */
  /* Les sept écrans de résultat : [écran, nœud du rang ou du palier, en-tête collant ?, fin de mode jouée par le jeu]. */
  const RES = [
    ['result', 'result-rank', true],
    ['tf-result', 'tf-result-emoji', true],
    ['story-result', 'story-result-emoji', true],
    ['auto-result', 'auto-result-emoji', true],
    ['dnb-result', 'dnb-result-emoji', false],
    ['proba-tree-result', 'proba-result-emoji', false],
    ['graph-reader-result', 'graph-result-emoji', false]
  ];
  /* Dans la page : termine un mode par la fonction de fin du jeu (état de réussite posé à la main), fait
     éventuellement défiler la page DANS LE MÊME TICK (élan d'un défilement tactile encore en cours quand le
     résultat arrive : le jeu a remis la page en haut, elle repart), puis observe image par image. */
  function finish(arg) {
    const id = arg.id, e = document.getElementById(arg.node), scr = document.getElementById('screen-' + id);
    state.xp = arg.level ? state.level * 500 - 40 : (state.level - 1) * 500;
    FX.debug.log.length = 0;
    if (id === 'result') {
      let g = 0;
      while (document.getElementById('screen-game').style.display === 'block' && g++ < 400) { answer(state.questions[state.qIndex].correct); nextQuestion(); }
    } else if (id === 'tf-result') { tfState.correct = 18; tfState.score = 2400; endTrueFalse(); }
    else if (id === 'story-result') { storyState.correct = STORY_MISSIONS[storyState.missionIdx].steps.length; endStoryMode(); }
    else if (id === 'auto-result') { dnbState.active = false; autoState.correct = 19; autoState.qIdx = 20; endAutoMode(); }
    else if (id === 'dnb-result') { dnbState.autoCorrect = 18; dnbState.exerciseCorrectByExo = [4, 4, 4, 3]; endDnbBlanc(); }
    else if (id === 'proba-tree-result') { probaState.scenarioCorrect = [true, true, true]; probaState.scenarioValidated = [true, true, true]; endProbaTree(); }
    else { graphState.correct = 10; graphState.bestCombo = 6; endGraphReader(); }
    const y0 = Math.round(window.pageYOffset);
    if (arg.scrolled) window.scrollTo(0, 100000);
    const hd = document.querySelector('header[role="banner"]').getBoundingClientRect(), r = e.getBoundingClientRect(), t = e.nextElementSibling.getBoundingClientRect();
    const top = hd.bottom > 0 ? hd.bottom : 0, cy = (r.top + r.bottom) / 2, ty = (t.top + t.bottom) / 2, vh = document.documentElement.clientHeight;
    const pos = (y) => (y > top + 15 && y < vh - 15 ? 'vu' : y < top - 5 || y > vh + 5 ? 'hors champ' : 'limite');
    const out = { shown: getComputedStyle(scr).display !== 'none', y0, y: Math.round(window.pageYOffset), header: hd.top >= -1 && hd.bottom <= vh, tier: pos(cy), title: pos(ty),
      emoji: e.textContent, titleText: id === 'result' ? (RANKS.find((k) => k.emoji === e.textContent) || {}).title : e.nextElementSibling.textContent };
    const sel = { titre: '#' + arg.node + ' + *', contenu: '#screen-' + id + ' > :nth-child(n+3)', 'trophées': '#trophies-list .trophy', boutons: '#screen-' + id + ' button' };
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      /* Deux images plus tard, la couche a lancé son moment : anime-t-elle un nœud du JEU ? */
      out.gameAnims = document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) && a.effect && a.effect.target &&
        !a.effect.target.closest('#fx-root')).length;
      out.ladder = document.querySelectorAll('.fx-ladder .fx-rung').length;
      window.__watchOver(arg.ms, sel).then((w) => {
        out.log = FX.debug.log.map((l) => l.fx + (l.info ? '[' + l.info + ']' : '') + (l.level === 'leger' ? '~' : ''));
        out.stars = FX.debug.log.filter((l) => l.fx === 'burst' && l.info === 'star').length;
        res(Object.assign(out, w));
      });
    })));
  }
  /* Amène la page sur l'écran du mode, prête à finir. */
  async function enter(page, id) {
    await ev(page, () => { __later(); showHome(); window.scrollTo(0, 0); });
    if (id === 'result') {
      await ev(page, () => startGame('6e_facile'));
      await page.waitForFunction(() => document.getElementById('screen-game').style.display === 'block');
    } else {
      await ev(page, (id) => {
        if (id === 'tf-result') startTrueFalse();
        else if (id === 'story-result') startStoryMode();
        else if (id === 'auto-result') startAutoMode('auto_6e');
        else if (id === 'dnb-result') { startDnbBlanc(); showScreen('dnb-ex'); }
        else if (id === 'proba-tree-result') startProbaTree();
        else startGraphReader();
      }, id);
    }
    await wait(page, 350);
    await quiet(page);
  }
  async function resultats(browser, w, h, level, scrolled) {
    const page = await open(browser, { viewport: { width: w, height: h }, colorScheme: 'dark', watch: true });
    const full = level === 'complet', tag = w + '×' + h + (full ? '' : ', léger') + (scrolled ? ', page qui défile' : ', arrivée normale');
    const seen = { complet: 0, entete: 0, rien: 0 };
    if (!full) await ev(page, () => FX.setLevel('leger'));
    for (const [id, node, sticky] of RES) {
      await enter(page, id);
      const r = await ev(page, finish, { id, node, scrolled, ms: scrolled ? 1500 : id === 'result' ? 2800 : 2200 });
      const nom = id + ' (' + tag + ')', over = Object.keys(r.over).filter((k) => r.over[k] > 300), bilan = r.log.some((l) => /^bilan/.test(l));
      check(nom + ' : écran affiché par le jeu depuis le haut, cérémonie lancée', r.shown && r.y0 === 0 && bilan, [r.shown, r.y0, r.log.slice(0, 4)]);
      check(nom + ' : aucun nœud de la couche sur le titre, le texte, les chiffres, les trophées ou les boutons (≤ 300 ms)', over.length === 0, r.over);
      check(nom + ' : au plus un bandeau à la fois, toujours sur l\'en-tête', r.maxPlates <= 1 && r.onHeader, [r.maxPlates, r.onHeader, r.plates]);
      if (r.tier === 'vu') {
        /* Rang ou palier à l'écran : cérémonie complète à sa place, aucun bandeau (rien à répéter). */
        seen.complet++;
        check(nom + ' : rang à l\'écran → cérémonie complète à sa place (le nœud du jeu arrive, animé), sans bandeau',
          r.gameAnims > 0 && r.plates.length === 0 && (id !== 'result' || r.ladder === (full ? 5 : 0)), [r.gameAnims, r.plates, r.ladder, r.log]);
        /* Plus rien à l'écran (la minuterie de fin de la cérémonie du QCM, T + 1,5 s, est retenue par ce fichier). */
        check(nom + ' : cérémonie finie en ' + (full ? (id === 'result' ? '2,7' : '2,1') : '1,2') + ' s', r.lastDraw > 200 && r.lastDraw - r.lag <= (full ? (id === 'result' ? 2700 : 2100) : 1200), [r.lastDraw, r.lag]);
      } else if (r.tier === 'hors champ') {
        /* Hors champ : un seul moment, sur l'en-tête s'il est là ; aucun nœud du jeu retenu ni animé. */
        check(nom + ' : rang hors champ → aucun nœud du jeu animé ni retenu par la couche, pas d\'échelle', r.gameAnims === 0 && r.ladder === 0, [r.gameAnims, r.ladder, r.log]);
        if (r.header) {
          seen.entete++;
          const want = r.emoji + (r.title === 'vu' ? '' : r.titleText);
          check(nom + ' : rang hors champ, en-tête à l\'écran → UN bandeau (le palier' + (r.title === 'vu' ? ' seul : son titre est à l\'écran' : ' et son titre') + '), étoiles parties de la ligne de l\'en-tête',
            r.plates.length === 1 && (r.title === 'limite' ? r.plates[0].indexOf(r.emoji) === 0 : r.plates[0] === want) && r.stars === 1 && sticky, [r.plates, want, r.stars, r.title]);
          check(nom + ' : moment d\'en-tête fini en ' + (full ? '1,2' : '0,6') + ' s (retard de la machine déduit)', r.last > 100 && r.last - r.lag <= (full ? 1200 : 600) + 60, [r.last, r.lag]);
        } else {
          seen.rien++;
          check(nom + ' : rang hors champ et en-tête sorti → la couche ne pose rien', r.plates.length === 0 && r.stars === 0 && !sticky, [r.plates, r.stars, r.log]);
        }
      }
    }
    check('aucune erreur (résultats, ' + tag + ')', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
    return seen;
  }
  async function scenarioResultats(browser) {
    const sum = (l, k) => l.reduce((a, x) => a + x[k], 0);
    /* Arrivée normale : la cérémonie complète partout (y compris sur les plus petites fenêtres). */
    const normal = await Promise.all([[360, 640, 'complet'], [1280, 800, 'complet'], [640, 360, 'complet'], [360, 640, 'leger']].map(([w, h, l]) => resultats(browser, w, h, l, false)));
    check('résultats, arrivée normale : la cérémonie complète joue sur les 7 écrans aux 4 réglages (28 cas)', sum(normal, 'complet') === 28, normal);
    /* Page qui défile à l'arrivée : cinq tailles de fenêtre (les mesures de la revue), plus le niveau léger. */
    const moving = await Promise.all([[360, 640, 'complet'], [412, 915, 'complet'], [640, 360, 'complet'], [1280, 800, 'complet'], [1366, 768, 'complet'], [360, 640, 'leger']].map(([w, h, l]) => resultats(browser, w, h, l, true)));
    check('résultats, page qui défile : le moment d\'en-tête (≥ 12 cas) et le cas « en-tête sorti » (≥ 6 cas) ont bien été joués',
      sum(moving, 'entete') >= 12 && sum(moving, 'rien') >= 6, moving);

    /* Un seul effet focal : palier sur l'en-tête PUIS niveau gagné, jamais ensemble (Vrai/Faux, page qui défile). */
    const page = await open(browser, { viewport: { width: 360, height: 640 }, colorScheme: 'light', watch: true });
    await enter(page, 'tf-result');
    const r = await ev(page, finish, { id: 'tf-result', node: 'tf-result-emoji', scrolled: true, level: true, ms: 3000 });
    check('résultat hors champ + niveau gagné : le bandeau du palier d\'abord et jusqu\'au bout de son animation (le niveau ne le chasse pas), « NIVEAU n ! » ensuite, jamais ensemble, tous deux sur l\'en-tête',
      r.tier === 'hors champ' && r.plates.length === 2 && r.plates[0].indexOf(r.emoji) === 0 && /^⭐NIVEAU \d+ !$/.test(r.plates[1]) && r.maxPlates === 1 && r.onHeader &&
      r.plateCut[0] <= 150 && r.plateCut[1] <= 150 && Object.keys(r.over).length === 0, r);
    check('aucune erreur (résultats, niveau gagné)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }

  /* ════════════ Tous les modules ensemble : inventaire, navigation rapide, chaos ════════════ */
  const MODULES = ['arrivee', 'arene', 'combat', 'verdict', 'accueil', 'textes', 'ateliers'];
  const SEQ = ['startTrueFalse', 'showHome', 'startStoryMode', 'showHome', 'startPythMode', 'showStatsScreen', 'startGame:boss', 'showHome', 'showAutoMenu',
    'startAutoMode:auto_mix', 'exitAutoMode', 'startDrawMode', 'startPuzzleMode', 'showHome', 'startProbaTree', 'startGraphReader', 'showHome', 'startDnbBlanc',
    'showHome', 'startGame:libre', 'showHome', 'toggleTheme', 'toggleTheme', 'startTrueFalse', 'quitTrueFalse', 'startStoryMode', 'quitStoryMode'];
  const call = (page, c) => ev(page, (c) => { const p = c.split(':'); window[p[0]].apply(window, p.slice(1)); }, c);
  async function storm(page) {
    for (let i = 0; i < SEQ.length; i++) { await call(page, SEQ[i]); await wait(page, i % 3 === 0 ? 0 : i % 3 === 1 ? 30 : 80); }
    await ev(page, () => { for (let i = 0; i < 6; i++) { startTrueFalse(); showHome(); startStoryMode(); showHome(); startProbaTree(); showHome(); } });   // même tick
    await wait(page, 1500);                                   // l'écran de chargement du QCM « libre » (1200 ms) arrive encore
    await ev(page, () => { __later(); showHome(); window.scrollTo(0, 0); });
  }
  const rest = (page) => ev(page, () => {
    const s = FX.stats();
    return { particles: s.particles, shapes: s.shapes, anims: s.anims, nodes: s.nodes, timers: s.timers, queue: s.queue, loop: s.loop, errors: s.errors,
      stage: document.getElementById('fx-stage').children.length, live: document.getElementById('fx-root').classList.contains('fx-live'),
      waapi: document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length,
      screens: Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id).join(),
      modals: document.querySelectorAll('.modal-overlay.show').length, dead: s.dead, errCount: s.errCount };
  });
  const atRest = (r) => r.particles + r.shapes + r.anims + r.nodes + r.timers + r.queue + r.stage + r.waapi === 0 && !r.loop && !r.live && r.errors.length === 0;

  /* Les globales enveloppées sont-elles encore celles du démarrage ? Liste des noms qui ne le sont plus. */
  const hooksLost = (page) => ev(page, () => {
    const b = window.__boot, out = [];
    if (!b) return ['(démarrage non photographié)'];
    b.names.forEach((n, i) => {
      if (typeof b.fns[i] !== 'function' || b.fns[i] === b.origs[i]) out.push(n + ' : jamais enveloppée');
      else if (window[n] !== b.fns[i]) out.push(n + ' : remplacée depuis le démarrage');
      else if (FX.debug.orig(n) !== b.origs[i]) out.push(n + ' : original changé');
    });
    return out;
  });

  async function scenarioParcours(browser) {
    const page = await open(browser, Object.assign({ boot: true }, DESK));
    const st = await ev(page, () => { const s = FX.stats(); return { modules: s.modules, wrapped: s.wrapped, missing: s.missing, denied: s.denied, dead: s.dead }; });
    check('7 modules démarrés, 50 fonctions du jeu enveloppées, rien de manquant ni refusé',
      MODULES.every((m) => st.modules[m] === 'ok') && Object.keys(st.modules).length === MODULES.length && st.wrapped.length === 50 &&
      new Set(st.wrapped).size === 50 && st.missing.length + st.denied.length === 0 && !st.dead, st);
    check('aucun chemin chaud enveloppé (render*, draw*, handle*Move, canvas)',
      !st.wrapped.some((w) => /^(render|draw|handle|getCanvasPos|isPythDragging|init|setup)/.test(w)), st.wrapped);
    const boot = await ev(page, () => (window.__boot ? window.__boot.names.length : -1));
    check('démarrage photographié : les 50 enveloppes sont en place dès la fin du script de la couche', boot === 50 && (await hooksLost(page)).length === 0, [boot, await hooksLost(page)]);
    await wait(page, 3200);                                   // l'ouverture de l'accueil est finie
    let r = await rest(page);
    check('au repos après l\'ouverture de l\'accueil', atRest(r) && r.screens === 'screen-home', r);

    await storm(page);
    await wait(page, 2800);
    r = await rest(page);
    check('navigation rapide à travers tous les modes : rien ne traîne (particules, nœuds, animations, minuteries, canvas)', atRest(r), r);
    check('navigation rapide : le jeu finit sur l\'accueil, sans modale, couche saine', r.screens === 'screen-home' && r.modals === 0 && !r.dead && r.errCount === 0, r);
    check('navigation rapide : aucune erreur de page', page.errors.length === 0, page.errors);

    /* Même tempête quand chaque crochet et chaque gestionnaire de la couche lève : le jeu ne remarque rien. */
    await ev(page, () => { FX.debug.chaos = true; });
    await storm(page);
    await wait(page, 600);
    const c = await ev(page, () => ({ chaos: FX.stats().chaos, dead: FX.stats().dead, errCount: FX.stats().errCount }));
    r = await rest(page);
    check('chaos + navigation rapide : les crochets ont levé, le jeu finit sur l\'accueil sans erreur de page',
      c.chaos > 0 && !c.dead && c.errCount === 0 && r.screens === 'screen-home' && page.errors.length === 0, [c, r.screens, page.errors]);
    await ev(page, () => { FX.debug.chaos = false; FX.cancel('*'); });
    await wait(page, 300);
    r = await rest(page);
    check('après le chaos : rien ne traîne', atRest(r), r);
    /* L'inventaire du départ ne prouve que la présence au démarrage : après tout le parcours, chaque globale
       doit être la MÊME fonction qu'alors (une réaffectation par le jeu contournerait le crochet en silence). */
    const lost = await hooksLost(page);
    check('après le parcours : les 50 globales sont encore les enveloppes du démarrage (aucun crochet contourné)', lost.length === 0, lost);
    await page.context().close();
  }

  return [
    ['ensemble-niveau', 'ensemble : niveau gagné (accent, épreuve, résultat, QCM, téléphone)', scenarioNiveau],
    ['ensemble-fin', 'ensemble : fin du Tracé sur l\'accueil (un seul effet focal)', scenarioFin],
    ['ensemble-repere', 'ensemble : repère d\'explication (défilement, question suivante)', scenarioRepere],
    ['ensemble-resultats', 'ensemble : résultats (aucun effet sur un texte du résultat, moment d\'en-tête quand le rang est hors champ)', scenarioResultats],
    ['ensemble-parcours', 'ensemble : inventaire des crochets, navigation rapide, chaos', scenarioParcours]
  ];
};
