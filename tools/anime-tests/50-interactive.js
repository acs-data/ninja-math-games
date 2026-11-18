/* Scénarios du module « ateliers » (anime-src/50-interactive.js) : Tracé géométrique, Puzzle,
   Constructeur Pythagore / Thalès / Trigo, Arbre de probabilités, Lecteur de graphique, écran Stats.
   Chargé par tools/test_anime.js (voir HELPERS).

   · interactive-diff    : pour CHAQUE mode, la même session scriptée (appels du jeu, vrais clics, vrais
                           glisser-déposer à la souris, tracés sur le canvas, clavier, fenêtre
                           redimensionnée en cours de mode, chrono fantôme du puzzle) sur classique.html et
                           sur l'édition animée aux niveaux off, complet et « chaos » : état de chaque
                           mode, focus, suite des messages de #toast et de #sr-live, HUD, texte ET
                           balisage des écrans, empreinte du DOM du jeu identiques. Chaque photographie
                           attend le calme de la page ; un redimensionnement attend l'évènement resize.
   · interactive-moments : le journal FX montre les effets attendus (complet), leur forme courte (léger),
                           rien au niveau off ; fronts d'état (un appel n'est pas une action du joueur),
                           rien pendant un glisser, rien au redimensionnement, rien sur l'accueil quand le
                           chrono fantôme sonne, rien sous une modale ; rien ne reste vivant ensuite.
   · interactive-tel     : téléphone tactile 360×640 (ancres hors champ, glisser tactile sous le calque,
                           défauts hérités ni corrigés ni masqués).

   Dans le différentiel, les minuteries longues du jeu (question de l'arbre : 1,5 s ; toast : 2,2 s)
   sont retenues et déclenchées à la main par __later() : session rapide et déterministe. Les
   setInterval sont déjà manuels (__tick) ; le hasard du jeu est à graine fixe. */
'use strict';

module.exports = function (h) {
  const { check, wait, settle: quiesce, keepDom, domChecks, logOf, during, leftovers, isIdle, harness, CLASSIC, ANIME, SEED } = h;
  const has = (log, name) => log.some((l) => l.indexOf(name) === 0);
  const count = (log, name) => log.filter((l) => l.indexOf(name) === 0).length;
  const MINE = /^(trace-|puzzle-|defi-|atelier-|proba-|arbre-|graph-|bilan-|stats)/;      // chorégraphies du module
  const mine = (log) => log.filter((l) => MINE.test(l));
  const from = (log, name) => { const i = log.findIndex((l) => l.indexOf(name) === 0); return i < 0 ? [] : log.slice(i); };
  /* Ce qu'une erreur ne doit jamais montrer : particules, teinte, bandeau, cut-in, confettis. */
  const LOUD = /^(burst|streaks|trail|confetti|sprite|anim\[fx-(tint|banner|cutin)\])/;
  const calm = (log) => !log.some((l) => LOUD.test(l));

  /* ── Pages ── */
  function holdLongTimers() {            // injecté avant tout script de page, après le harnais commun
    const real = window.setTimeout, realClear = window.clearTimeout, held = new Map();
    let n = 0;
    window.setTimeout = function (fn, ms) {
      if (!(ms >= 1000)) return real.apply(window, arguments);
      held.set(--n, fn);
      return n;
    };
    window.clearTimeout = function (id) { if (!held.delete(id)) realClear(id); };
    window.__later = function () { const l = Array.from(held.values()); held.clear(); l.forEach((f) => f()); return l.length; };
  }
  /* Aides de pilotage communes aux pages (aucune n'existe dans le jeu). */
  function pageHelpers() {
    /* Remplit l'arbre du scénario courant par des appels à placeProbaPiece ; swap = deux branches échangées. */
    window.__fillTree = function (swap) {
      const sc = PROBA_SCENARIOS[probaState.scenarioIdx], used = {}, ids = Object.keys(sc.branches), pick = {};
      ids.forEach((id) => {
        const i = sc.pool.findIndex((v, k) => v === sc.branches[id].prob && !used[k]);
        used[i] = 1; pick[id] = i;
      });
      if (swap) { const t = pick[ids[0]]; pick[ids[0]] = pick[ids[1]]; pick[ids[1]] = t; }
      ids.forEach((id) => placeProbaPiece(id, pick[id], sc.pool[pick[id]]));
    };
    /* Paires [pièce, case] du puzzle d'association courant (sélecteurs). */
    window.__pairs = function () {
      const ps = Array.from(document.querySelectorAll('.puzzle-piece'));
      return Array.from(document.querySelectorAll('.puzzle-slot')).map((s) => ['#' + ps.find((p) => p.dataset.value === s.dataset.correct).id, '#' + s.id]);
    };
    /* Pièces du puzzle de tri courant, dans l'ordre attendu (sélecteurs). */
    window.__order = function () {
      const ps = Array.from(document.querySelectorAll('.puzzle-piece'));
      return PUZZLES[puzzleState.idx].correctOrder.map((v) => '#' + ps.find((p) => p.dataset.value === v).id);
    };
    /* Règle le curseur de l'atelier trigo comme le ferait le joueur. */
    window.__angle = function (deg) {
      const s = document.getElementById('pyth-angle-slider');
      s.value = deg; s.dispatchEvent(new Event('input', { bubbles: true }));
    };
  }
  async function open(browser, url, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 412, height: 800 }, reducedMotion: 'no-preference',
      colorScheme: opts.colorScheme || 'light', hasTouch: !!opts.touch });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) page.errors.push('console: ' + m.text());
    });
    await page.addInitScript(harness, SEED);
    if (opts.hold) await page.addInitScript(holdLongTimers);
    await page.addInitScript(pageHelpers);
    await page.goto(url);
    await page.waitForTimeout(150);
    return page;
  }
  const ev = (page, fn, arg) => page.evaluate(fn, arg);
  const box = (page, sel) => ev(page, (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  const center = (page, sel) => ev(page, (s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  /* La couche au repos (l'accueil joue son ouverture après le chargement quand le module existe). */
  const quiet = (page) => ev(page, () => { FX.cancel('*'); FX.debug.log.length = 0; });

  /* Redimensionne la fenêtre et rend la main quand la page a servi l'évènement resize (les écouteurs du jeu,
     inscrits avant celui-ci, ont alors posé leurs minuteries de 100 ms : le calme suivant les attend). */
  async function resize(page, width, height) {
    const served = ev(page, () => new Promise((res) => window.addEventListener('resize', () => res(), { once: true })));
    await page.setViewportSize({ width, height });
    await served;
  }

  /* ── Gestes réels ── */
  /* Vrai clic au centre d'un élément, amené au milieu de la fenêtre (loin de l'en-tête collant et du
     toast). page.click() n'est pas utilisé : quand un toast recouvre la cible, Playwright réessaie en
     défilant autrement, et le défilement photographié dépendrait alors de la vitesse de la machine. */
  async function click(page, sel) {
    await center(page, sel);
    const b = await box(page, sel);
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  }
  /* Trait à la souris sur le canvas du Tracé ; pts(b) -> [x1, y1, x2, y2] en px du canvas (b = sa boîte). */
  async function stroke(page, pts) {
    await center(page, '#draw-canvas');
    const b = await box(page, '#draw-canvas'), p = pts(b);
    await page.mouse.move(b.x + p[0], b.y + p[1]); await page.mouse.down();
    await page.mouse.move(b.x + (p[0] + p[2]) / 2, b.y + (p[1] + p[3]) / 2);
    await page.mouse.move(b.x + p[2], b.y + p[3]); await page.mouse.up();
  }
  const frac = (x1, y1, x2, y2) => (b) => [b.w * x1, b.h * y1, b.w * x2, b.h * y2];
  /* Trois clics de l'outil Angle : côté 1, sommet, côté 2 (fractions du canvas). */
  async function angle(page, pts) {
    await center(page, '#draw-canvas');
    const b = await box(page, '#draw-canvas');
    for (const p of pts) await page.mouse.click(b.x + b.w * p[0], b.y + b.h * p[1]);
  }
  /* Glisser-déposer à la souris d'une pièce du puzzle vers une case ou vers le plateau de tri. */
  async function drag(page, fromSel, toSel) {
    await center(page, '#puzzle-game-area');
    const p = await box(page, fromSel), s = await box(page, toSel);
    await page.mouse.move(p.x + p.w / 2, p.y + p.h / 2); await page.mouse.down();
    await page.mouse.move((p.x + p.w / 2 + s.x + s.w / 2) / 2, (p.y + p.h / 2 + s.y + s.h / 2) / 2, { steps: 2 });
    await page.mouse.move(s.x + s.w / 2, s.y + s.h / 2, { steps: 2 }); await page.mouse.up();
  }
  /* Glisse une poignée du constructeur (point normalisé du jeu) vers une position (fractions du canvas). */
  async function handle(page, which, tx, ty) {
    await center(page, '#pyth-canvas');
    const b = await box(page, '#pyth-canvas');
    const p = await ev(page, (w) => { const q = pythToCanvas(w === 'M' ? pythGetThalesM() : pythState.pyth[w]); return [q.x / pythState.W, q.y / pythState.H]; }, which);
    await page.mouse.move(b.x + b.w * p[0], b.y + b.h * p[1]); await page.mouse.down();
    await page.mouse.move(b.x + b.w * (p[0] + tx) / 2, b.y + b.h * (p[1] + ty) / 2, { steps: 2 });
    await page.mouse.move(b.x + b.w * tx, b.y + b.h * ty, { steps: 2 }); await page.mouse.up();
  }

  /* ── Photographie de tout ce que ces modes exposent. L'accueil est écarté du texte, du balisage et
        du défilement (le bouton de réglage de la couche y vit) ; les autres écrans doivent être
        identiques au caractère près (aucune classe, aucun style, aucun enfant ajouté par la couche). ── */
  /* Prise au calme (voir __shot dans le harnais) ; maxDelay = délai des minuteries du jeu à laisser échoir
     (150 ms par défaut ; 400 pour la validation d'un puzzle, 950 pour la case libérée). Les minuteries
     longues étant retenues (__later), aucune classe n'est écartée de l'empreinte du DOM. */
  async function snap(page, label, maxDelay) {
    return keepDom(page, await page.evaluate(async ([label, maxDelay]) => {
      const base = await window.__shot(maxDelay, []);
      const el = (id) => document.getElementById(id);
      const txt = (id) => (el(id) ? el(id).textContent : null);
      const ae = document.activeElement;
      const vis = Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none');
      const away = vis.filter((e) => e.id !== 'screen-home');
      const r = (v, k) => Math.round(v * k) / k;
      const hash = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return s.length + ':' + x; };
      const g = graphState.current;
      return {
        label,
        draw: [drawState.missionIdx, drawState.tool, drawState.color, drawState.isDrawing, drawState.score, drawState.validated, drawState.anglePoints.length,
          JSON.stringify(drawState.lines.map((l) => (l.type === 'angle' ? ['angle'].concat(l.pts.map((p) => [Math.round(p.x), Math.round(p.y)]))
            : [l.type, Math.round(l.x1), Math.round(l.y1), Math.round(l.x2), Math.round(l.y2)])))],
        puzzle: [puzzleState.idx, puzzleState.score, r(puzzleState.timeLeft, 10), puzzleState.validated, JSON.stringify(puzzleState.placements),
          Array.from(document.querySelectorAll('#sort-zone .puzzle-piece')).map((p) => p.dataset.value).join('>')],
        pyth: [pythState.atelier, pythState.challengeAnswered, JSON.stringify(pythState.challenge), r(pythState.pyth.B.x, 1000), r(pythState.pyth.C.y, 1000),
          pythState.pyth.drag, r(pythState.thales.t, 1000), pythState.thales.drag, pythState.trigo.angle, pythState.W, pythState.H],
        proba: [probaState.scenarioIdx, JSON.stringify(probaState.placements), probaState.validated, probaState.phaseQuestion, probaState.questionAnswered,
          JSON.stringify(probaState.scenarioValidated), JSON.stringify(probaState.scenarioCorrect), JSON.stringify(probaState.selectedPiece),
          probaState.currentQuestion ? probaState.currentQuestion.correct : null],
        graph: [graphState.challengeIdx, graphState.correct, graphState.combo, graphState.bestCombo, graphState.answered, JSON.stringify(graphState.clickedPoint),
          JSON.stringify(g && [g.type, g.mode, g.fn, g.target, g.correctIdx]), graphState.W, graphState.H],
        state: [state.score, state.xp, state.level],
        stats: JSON.stringify([playerStats.gamesByMode, playerStats.totalGames, playerStats.totalCorrect, playerStats.totalAnswered]),
        focus: ae ? (ae.id || (ae.tagName + '.' + ae.className)) : null,
        toast: txt('toast') + '|' + el('toast').className, sr: txt('sr-live'), srLog: base.live.sr, toastLog: base.live.toast, dom: base.dom,
        hud: [txt('hud-score'), txt('hud-streak'), txt('hud-level')],
        screens: vis.map((e) => e.id),
        text: away.map((e) => e.textContent.replace(/\s+/g, ' ')),
        html: away.map((e) => hash(e.outerHTML)),
        canvases: ['draw-canvas', 'pyth-canvas', 'graph-canvas'].map((id) => el(id).width + '×' + el(id).height + '|' + el(id).className + '|' + (el(id).getAttribute('style') || '')),
        modals: Array.from(document.querySelectorAll('.modal-overlay.show')).map((m) => m.id),
        scroll: away.length ? Math.round(window.scrollY) : null,
        strays: Array.from(document.body.children).filter((e) => e.tagName !== 'SCRIPT').length,
        bodyOverflow: document.body.style.overflow,
        storage: Object.keys(localStorage).sort()
      };
    }, [label, maxDelay === undefined ? null : maxDelay]));
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
  /* Tracé : 6 missions. La mission 1 est tracée décentrée (axe vertical hors du milieu : 60),
     pour tester son front d'échec. La mission 6 (angle) est jugée deux fois : réussie, puis — le
     redimensionnement de la fenêtre remettant sa validation à zéro — manquée avec un angle obtus. */
  async function drawSession(page, shot) {
    await ev(page, () => { window.scrollTo(0, 0); startDrawMode(); });
    await shot('tracé : mission 1');                          // canvas préparé 50 ms après
    await ev(page, () => validateDraw()); await shot('tracé : valider sans tracé (toast, rien de validé)');
    await stroke(page, frac(0.25, 0.1, 0.25, 0.9));
    await click(page, '#screen-draw .btn-main'); await shot('tracé : mission 1, axe décentré → 60');
    await ev(page, () => validateDraw()); await shot('tracé : valider une seconde fois (ignoré)');
    await click(page, '#draw-feedback .btn-next'); await shot('tracé : mission 2');
    await stroke(page, frac(0.1, 0.5, 0.9, 0.5));
    await ev(page, () => validateDraw()); await shot('tracé : mission 2 réussie (100)');
    await ev(page, () => nextDrawMission());
    await stroke(page, (b) => [b.w * 0.2, b.h * 0.85, b.w * 0.2 + b.h * 0.7, b.h * 0.15]);          // 45°
    await ev(page, () => validateDraw()); await shot('tracé : mission 3 réussie (diagonale)');
    await ev(page, () => nextDrawMission());
    await stroke(page, frac(0.15, 0.8, 0.85, 0.2));
    await ev(page, () => { validateDraw(); nextDrawMission(); }); await shot('tracé : mission 4 validée et suivante dans le même tick');
    await stroke(page, frac(0.1, 0.2, 0.9, 0.24));
    await ev(page, () => validateDraw()); await shot('tracé : mission 5, droite décentrée → 65');
    await ev(page, () => nextDrawMission());
    await stroke(page, frac(0.2, 0.3, 0.8, 0.6));
    await ev(page, () => validateDraw()); await shot('tracé : mission 6 sans angle (toast, rien de validé)');
    await click(page, '#draw-tool-angle');
    await angle(page, [[0.7, 0.5], [0.3, 0.5], [0.6, 0.25]]);
    await ev(page, () => validateDraw()); await shot('tracé : mission 6, angle aigu → 100');
    await resize(page, 600, 800); await shot('tracé : fenêtre redimensionnée (canvas relancé, tracés effacés)');
    await resize(page, 412, 800); await quiesce(page);
    await angle(page, [[0.8, 0.6], [0.5, 0.6], [0.3, 0.3]]);
    await ev(page, () => validateDraw()); await shot('tracé : mission 6 rejouée, angle obtus → 20');
    await ev(page, () => nextDrawMission()); await shot('tracé : fin (toast + accueil)');
  }

  /* Puzzle : association (vrais glisser, appels directs), tri (vrais glisser), temps écoulé, chrono fantôme. */
  async function puzzleSession(page, shot) {
    await ev(page, () => { window.scrollTo(0, 0); startPuzzleMode(); __tick(5); }); await shot('puzzle 1');
    let pairs = await ev(page, () => __pairs());
    await ev(page, () => __hold(800));                         // la case se libère 900 ms après : retenue le temps de la photo
    await drag(page, pairs[0][0], pairs[1][1]); await shot('puzzle 1 : mauvaise case (toast)');
    await ev(page, () => __release()); await shot('puzzle 1 : case libérée', 950);
    for (const [p, s] of pairs) await drag(page, p, s);
    await shot('puzzle 1 résolu (vrais glisser-déposer)', 400);          // validation 300 ms après la dernière pièce
    await ev(page, () => { nextPuzzle(); __tick(12); });
    await ev(page, () => {                                     // puzzle 2 : appels directs, case déjà prise comprise
      __pairs().forEach((q) => { const p = document.querySelector(q[0]), s = document.querySelector(q[1]); dropOnSlot(p, s); dropOnSlot(p, s); });
    });
    await shot('puzzle 2 résolu (appels directs)', 400);
    await ev(page, () => nextPuzzle()); await quiesce(page);                   // puzzle 3 : tri ; bouton créé 100 ms après
    await click(page, '#puzzle-game-area > .btn-main'); await shot('puzzle 3 : valider trop tôt (toast, rien de validé)');
    for (const id of await ev(page, () => __order())) await drag(page, id, '#sort-zone');
    await shot('puzzle 3 : éléments dans le plateau');
    await click(page, '#puzzle-game-area > .btn-main'); await shot('puzzle 3 : tri réussi');
    await ev(page, () => { nextPuzzle(); __tick(610); }); await shot('puzzle 4 : temps écoulé');
    await ev(page, () => nextPuzzle()); await quiesce(page);                   // puzzle 5 : tri à l'envers
    for (const id of (await ev(page, () => __order())).reverse()) await drag(page, id, '#sort-zone');
    await click(page, '#puzzle-game-area > .btn-main'); await shot('puzzle 5 : tri à revoir');
    await ev(page, () => { nextPuzzle(); __tick(30); });                      // puzzle 6
    pairs = await ev(page, () => __pairs());
    await drag(page, pairs[2][0], pairs[2][1]); await shot('puzzle 6 : une pièce posée');
    await ev(page, () => showHome()); await shot('puzzle 6 : retour accueil, chrono fantôme en marche');
    await ev(page, () => __tick(610)); await shot('puzzle : le chrono fantôme sonne sur l\'accueil');
    await ev(page, () => { startPuzzleMode(); for (let i = 0; i < 6; i++) nextPuzzle(); }); await shot('puzzle : fin (toast + accueil)');
  }

  /* Constructeur : poignées glissées à la souris, trois ateliers, essais manqués martelés, réussites,
     fenêtre redimensionnée (le jeu tire alors un nouveau défi). */
  async function pythSession(page, shot) {
    await ev(page, () => { window.scrollTo(0, 0); startPythMode(); }); await shot('atelier : pythagore');     // canvas préparé 60 ms après
    await click(page, '#pyth-validate-btn'); await shot('atelier : essai manqué');
    await ev(page, () => { validatePythChallenge(); validatePythChallenge(); }); await shot('atelier : bouton martelé');
    await center(page, '#pyth-canvas');
    const b = await box(page, '#pyth-canvas');
    await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.move(b.x + 90, b.y + 60);            // survol sans glisser
    await handle(page, 'B', 0.52, 0.7);                        // AB = 4 cm
    await handle(page, 'C', 0.2, 0.3714);                      // AC = 3 cm
    await shot('atelier : poignées glissées');
    await ev(page, () => { let g = 0; while (pythState.challenge.target.name !== '3-4-5' && g++ < 80) newPythChallenge(); validatePythChallenge(); });
    await shot('atelier : défi Pythagore réussi');
    await ev(page, () => validatePythChallenge()); await shot('atelier : valider après réussite (ignoré)');
    await click(page, '#screen-pythagore .chapter-tab[data-atelier="thales"]'); await shot('atelier : onglet Thalès');
    await handle(page, 'M', 0.3, 0.5);
    await ev(page, () => validatePythChallenge()); await shot('atelier : Thalès, essai après glisser');
    await ev(page, () => { pythState.thales.t = pythState.challenge.targetRatio; renderPyth(); validatePythChallenge(); }); await shot('atelier : défi Thalès réussi');
    await click(page, '#pyth-new-btn'); await shot('atelier : nouveau défi');
    await click(page, '#screen-pythagore .chapter-tab[data-atelier="trigo"]');
    await ev(page, () => { __angle(12); validatePythChallenge(); }); await shot('atelier : trigo, essai manqué');
    await resize(page, 700, 800); await shot('atelier : fenêtre redimensionnée (nouveau défi tiré par le jeu)');
    await resize(page, 412, 800); await quiesce(page);
    await ev(page, () => { __angle(pythState.challenge.target.angle); validatePythChallenge(); }); await shot('atelier : défi trigo réussi');
    await ev(page, () => showHome()); await shot('atelier : retour accueil');
  }

  /* Arbre : pose au clic, retrait, arbre à corriger, validation double (défaut hérité : double XP),
     question juste / fausse, scénario passé, résultat, rejouer. */
  async function probaSession(page, shot) {
    const good = () => ev(page, () => probaState.currentQuestion.correct);
    await ev(page, () => { window.scrollTo(0, 0); startProbaTree(); }); await shot('arbre : scénario 1');
    await click(page, '#proba-pool .proba-piece:nth-child(1)');
    await click(page, '.proba-slot[data-slot="lvl1-A"]'); await shot('arbre : pose au clic');
    await click(page, '.proba-slot[data-slot="lvl1-A"]'); await shot('arbre : retrait au clic');
    await ev(page, () => __fillTree(true));
    await click(page, '#proba-validate-btn'); await shot('arbre : à corriger');
    await click(page, '#proba-validate-btn'); await shot('arbre : à corriger, second clic');
    await click(page, '#proba-phase-placement .btn-sec'); await shot('arbre : recommencer');
    await ev(page, () => { __fillTree(); validateProbaPlacement(); validateProbaPlacement(); }); await shot('arbre : validé deux fois dans le même tick');
    await ev(page, () => __later()); await shot('arbre : question');
    await click(page, '#proba-question-answers .answer-btn:nth-child(' + ((await good()) + 1) + ')'); await shot('arbre : question juste');
    await ev(page, () => answerProbaQuestion(0)); await shot('arbre : réponse après réponse (ignorée)');
    await click(page, '#proba-next-btn'); await shot('arbre : scénario 2');
    await ev(page, () => { __fillTree(); validateProbaPlacement(); __later(); });
    await ev(page, () => answerProbaQuestion((probaState.currentQuestion.correct + 1) % 4)); await shot('arbre : question fausse');
    await ev(page, () => { nextProbaScenario(); nextProbaScenario(); }); await shot('arbre : scénario 3 passé, scénario 4');
    await ev(page, () => { __fillTree(); validateProbaPlacement(); __later(); answerProbaQuestion(probaState.currentQuestion.correct); nextProbaScenario(); });
    await shot('arbre : scénario 5');
    await ev(page, () => { __fillTree(); validateProbaPlacement(); __later(); answerProbaQuestion(probaState.currentQuestion.correct); });
    await click(page, '#proba-next-btn'); await shot('arbre : résultat');
    await ev(page, () => startProbaTree()); await shot('arbre : rejouer');
    await ev(page, () => showHome()); await shot('arbre : retour accueil');
  }

  /* Graphique : 10 défis — QCM au clic, points au clavier (flèches + Entrée) ou à la souris sur le
     canvas, modale « Quitter » ouverte puis refermée, fenêtre redimensionnée (nouveau défi tiré). */
  async function graphSession(page, shot) {
    await ev(page, () => { window.scrollTo(0, 0); startGraphReader(); }); await shot('graphique : défi 1');   // canvas préparé 60 ms après
    for (let k = 0; k < 10; k++) {
      const c = await ev(page, () => { const g = graphState.current, p = g.target && mathToPx(g.target.x, g.target.y); return { mode: g.mode, type: g.type, t: g.target, good: g.correctIdx, p, H: graphState.H }; });
      const juste = k % 3 !== 1;
      if (c.mode === 'qcm') {
        await click(page, '#graph-qcm-answers .answer-btn:nth-child(' + ((juste ? c.good : (c.good + 1) % 4) + 1) + ')');
      } else if (k % 2 === 0) {                                // clavier : flèches puis Entrée
        await page.focus('#graph-canvas');
        const n = c.type === 'image' ? c.t.x : c.t.y, key = c.type === 'image' ? (n > 0 ? 'ArrowRight' : 'ArrowLeft') : (n > 0 ? 'ArrowUp' : 'ArrowDown');
        for (let i = 0; i < Math.abs(n) + (juste ? 0 : 1); i++) await page.keyboard.press(key);
        if (!Math.abs(n) && juste) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
      } else {                                                 // souris : clic sur le canvas, puis le bouton
        await center(page, '#graph-canvas');
        const b = await box(page, '#graph-canvas'), inside = c.p.y > 8 && c.p.y < c.H - 8;
        await page.mouse.click(b.x + c.p.x + (juste ? 0 : 60), b.y + (c.type === 'image' || !inside ? c.H / 2 : c.p.y));
        await click(page, '#graph-validate-btn');
      }
      await shot('graphique : défi ' + (k + 1) + ' répondu (' + c.mode + ')');
      if (k === 3) {
        await click(page, '#screen-graph-reader .btn-control'); await shot('graphique : modale Quitter');
        await page.keyboard.press('Escape'); await shot('graphique : modale refermée');
      }
      if (k < 9) await click(page, '#graph-next-btn'); else await ev(page, () => nextGraphChallenge());
      if (k === 5) {                                           // le jeu tire alors un nouveau défi 7 (deux fois)
        await resize(page, 700, 800); await shot('graphique : fenêtre redimensionnée (nouveau défi tiré par le jeu)');
        await resize(page, 412, 800); await quiesce(page);
      }
    }
    await shot('graphique : résultat');
    await ev(page, () => showHome()); await shot('graphique : retour accueil');
  }

  async function statsSession(page, shot) {
    await ev(page, () => { window.scrollTo(0, 0); showStatsScreen(); }); await shot('stats : arrivée');
    await ev(page, () => { renderStats(); showStatsScreen(); }); await shot('stats : re-rendu, écran déjà affiché');
    await ev(page, () => showHome()); await shot('stats : retour accueil');
  }
  const SESSIONS = [['tracé', drawSession], ['puzzle', puzzleSession], ['atelier', pythSession], ['arbre', probaSession], ['graphique', graphSession], ['stats', statsSession]];

  /* ── Scénario 1 : différentiel classique / off / complet / chaos, mode par mode ── */
  async function scenarioDiff(browser) {
    const run = async (url, prepare) => {
      const page = await open(browser, url, { hold: true });
      const fx = url === ANIME, out = { shots: {}, log: [], errors: page.errors, fx: null, broke: {} };
      if (prepare) await page.evaluate(prepare);
      for (const [name, session] of SESSIONS) {
        const shots = out.shots[name] = [];
        const shot = async (label, maxDelay) => {
          shots.push(await snap(page, label, maxDelay));
          if (fx) out.log = out.log.concat(await ev(page, () => { const l = FX.debug.log.map((e) => e.fx + (e.info ? '[' + e.info + ']' : '')); FX.debug.log.length = 0; return l; }));
        };
        try { await session(page, shot); } catch (e) { out.broke[name] = String(e && e.stack || e).slice(0, 500); }
        await page.setViewportSize({ width: 412, height: 800 });
        await ev(page, () => { __release(); __later(); showHome(); window.scrollTo(0, 0); });
        await quiesce(page, 950);
      }
      if (fx) out.fx = await ev(page, () => FX.stats());
      out.page = page;
      return out;
    };
    const [classic, off, full, chaos] = await Promise.all([
      run(CLASSIC),
      run(ANIME, () => { FX.setLevel('off'); }),
      run(ANIME, () => { FX.seed(11); }),
      run(ANIME, () => { FX.debug.chaos = true; })
    ]);
    const last = (name) => classic.shots[name][classic.shots[name].length - 1] || {};
    const at = (name, label) => classic.shots[name].find((s) => s.label.indexOf(label) === 0) || {};
    for (const [name] of SESSIONS) {
      check(name + ' : la session classique va au bout', !classic.broke[name] && classic.shots[name].length > 2, classic.broke[name]);
      for (const [lv, r] of [['off', off], ['complet', full], ['chaos', chaos]]) {
        check(name + ' : session jouée au bout (' + lv + ')', !r.broke[name], r.broke[name]);
        check(name + ' : jeu identique au niveau ' + lv, !firstDiff(classic.shots[name], r.shots[name]), firstDiff(classic.shots[name], r.shots[name]));
      }
    }
    /* La session exerce bien les deux issues de chaque mode (sinon le différentiel ne prouverait rien). */
    const m1 = at('tracé', 'tracé : mission 1, axe décentré');
    check('tracé : la mission 1 tracée décentrée obtient 60 dans le jeu d\'origine (front d\'échec)',
      m1.draw[4] === 60 && m1.draw[5] === true && /Presque/.test(String(m1.text)), [m1.draw, m1.text]);
    check('tracé : réussites, échecs, puis fin sur l\'accueil', at('tracé', 'tracé : mission 2 réussie').draw[4] === 160 && at('tracé', 'tracé : mission 6 rejouée').draw[5] === true && at('tracé', 'tracé : mission 6 rejouée').draw[0] === 5 && /Presque/.test(String(at('tracé', 'tracé : mission 6 rejouée').text)) &&
      last('tracé').screens.join() === 'screen-home' && /missions de tracé terminées/.test(last('tracé').toast), [at('tracé', 'tracé : mission 2 réussie').draw, last('tracé').toast]);
    check('tracé : la fenêtre redimensionnée relance le canvas (tracés effacés, validation remise à zéro)',
      at('tracé', 'tracé : fenêtre redimensionnée').draw[5] === false && at('tracé', 'tracé : fenêtre redimensionnée').draw[7] === '[]', at('tracé', 'tracé : fenêtre redimensionnée').draw);
    check('puzzle : vrais glisser-déposer, tri réussi, temps écoulé, tri à revoir, chrono fantôme',
      Object.keys(JSON.parse(at('puzzle', 'puzzle 1 résolu').puzzle[4])).length === 4 && at('puzzle', 'puzzle 1 résolu').puzzle[3] === true &&
      /correct/.test(String(at('puzzle', 'puzzle 3 : tri réussi').text)) && /Temps écoulé/.test(String(at('puzzle', 'puzzle 4').text)) &&
      /seulement/.test(String(at('puzzle', 'puzzle 5').text)) && at('puzzle', 'puzzle : le chrono fantôme').puzzle[3] === true &&
      at('puzzle', 'puzzle : le chrono fantôme').screens.join() === 'screen-home', classic.shots.puzzle.map((s) => [s.label, s.puzzle[3]]));
    check('atelier : poignées glissées, trois réussites, essais manqués', at('atelier', 'atelier : poignées glissées').pyth[3] !== 0.78 &&
      at('atelier', 'atelier : défi Pythagore réussi').pyth[1] === true && at('atelier', 'atelier : défi Thalès réussi').pyth[1] === true &&
      at('atelier', 'atelier : défi trigo réussi').pyth[1] === true && at('atelier', 'atelier : trigo, essai manqué').pyth[1] === false, classic.shots.atelier.map((s) => [s.label, s.pyth[1], s.pyth[3]]));
    check('arbre : validation double (XP doublés, défaut hérité), questions juste et fausse, résultat',
      at('arbre', 'arbre : validé deux fois').state[1] - at('arbre', 'arbre : recommencer').state[1] === 80 &&
      at('arbre', 'arbre : question juste').proba[6] === '[true,false,false]' && at('arbre', 'arbre : question fausse').proba[6] === '[true,false,false]' &&
      at('arbre', 'arbre : question fausse').proba[4] === true && last('arbre').screens.join() === 'screen-home' &&
      at('arbre', 'arbre : résultat').screens.join() === 'screen-proba-tree-result', classic.shots.arbre.map((s) => [s.label, s.state[1], s.proba[6]]));
    const gres = at('graphique', 'graphique : résultat');
    check('graphique : dix défis, des justes et des faux, modale, résultat', gres.screens.join() === 'screen-graph-reader-result' && gres.graph[1] >= 2 && gres.graph[1] <= 9 &&
      at('graphique', 'graphique : modale Quitter').modals.join() === 'modal-graph-quit', [gres.screens, gres.graph]);
    for (const [name, r] of [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos]]) {
      check('aucune erreur console / page (' + name + ')', r.errors.length === 0, r.errors);
    }
    check('niveau off : journal FX vide', off.log.length === 0, off.log);
    check('chaos : rien n\'a été joué, les crochets ont bien levé', chaos.log.length === 0 && chaos.fx.chaos > 20, [chaos.log.length, chaos.fx.chaos]);
    const want = ['trace-juste', 'trace-erreur', 'puzzle-pose', 'puzzle-juste', 'puzzle-erreur', 'atelier-fin', 'defi-juste', 'defi-erreur', 'atelier-onglet',
      'proba-pose', 'arbre-juste', 'proba-juste', 'proba-erreur', 'graph-juste', 'graph-erreur', 'bilan-proba', 'bilan-graph', 'stats'];
    check('niveau complet : chaque moment du module a été joué pendant la session', want.every((w) => has(full.log, w)), want.filter((w) => !has(full.log, w)));
    check('niveau complet : aucune erreur interne, rien de manquant ni refusé, module démarré',
      full.fx.errCount === 0 && full.fx.missing.length + full.fx.denied.length === 0 && full.fx.modules.ateliers === 'ok' && !full.fx.dead, [full.fx.errors, full.fx.missing, full.fx.denied, full.fx.modules]);
    check('aucun chemin chaud enveloppé (render*, draw*, handle*Move, getCanvasPos, isPythDragging)',
      !full.fx.wrapped.some((w) => /^(render(?!UniverseGrid|CharGrid|MissionChips|Stats$)|draw|handle|getCanvasPos|isPythDragging|setup|init)/.test(w)), full.fx.wrapped);
    check('ateliers : la session classique annonce (suite des messages de #sr-live non vide)',
      SESSIONS.every(([name]) => name === 'stats' || classic.shots[name].some((s) => s.srLog.length > 0)), SESSIONS.map(([name]) => [name, classic.shots[name].map((s) => s.srLog.length).join('')]));
    await domChecks('ateliers', [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos]]);
  }

  /* ════════════ Scénario 2 : les moments (journal FX, fronts d'état, coupures) ════════════ */
  const DESK = { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' };
  const lv = (page, level) => ev(page, (l) => { FX.setLevel(l); }, level);
  const settle = async (page, ms, what) => { await wait(page, ms); const s = await leftovers(page); check(what, isIdle(s), s); };
  /* Pixels encrés du calque (canvas de la couche) dans l'intérieur d'un élément du jeu, et au total. */
  const ink = (page, sel, inset) => ev(page, ([sel, inset]) => {
    const c = document.getElementById('fx-canvas'), k = c.width / document.documentElement.clientWidth, cx = c.getContext('2d');
    const n = (x, y, w, hh) => {
      if (w < 1 || hh < 1) return 0;
      const d = cx.getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(hh * k)).data;
      let t = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 12) t++;
      return t;
    };
    const r = document.querySelector(sel).getBoundingClientRect();
    return { inside: n(r.left + inset, r.top + inset, r.width - 2 * inset, r.height - 2 * inset), total: n(0, 0, document.documentElement.clientWidth, document.documentElement.clientHeight),
      live: document.getElementById('fx-root').classList.contains('fx-live') };
  }, [sel, inset]);
  /* Les nœuds de texte de la couche (mentions, 👇) : contenu, position, dans la fenêtre ? */
  /* XP du joueur : une mention « +n XP » doit reprendre l'écart réellement donné par le jeu pendant l'action
     (jamais un montant recopié de classique.html). */
  const xp = (page) => ev(page, () => state.xp);
  const floats = (page) => ev(page, () => Array.from(document.querySelectorAll('#fx-stage .fx-float')).map((n) => {
    const r = n.getBoundingClientRect();
    return { text: n.textContent, cls: n.className, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), hidden: n.getAttribute('aria-hidden'),
      inView: r.left >= -2 && r.right <= document.documentElement.clientWidth + 2 && r.top >= -2 && r.bottom <= document.documentElement.clientHeight + 2 };
  }));
  /* Coin haut droit d'un bloc d'explication (les .feedback-panel du jeu glissent de 10 px pendant 0,3 s à
     l'ouverture), et nombre de mentions de la couche qui chevauchent le TEXTE du bloc (lignes de texte). */
  const corner = (page, sel) => ev(page, (s) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect(), range = document.createRange(), lines = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      range.selectNodeContents(t);
      Array.from(range.getClientRects()).forEach((q) => { if (q.width > 0 && q.height > 0) lines.push(q); });
    }
    const over = Array.from(document.querySelectorAll('#fx-stage .fx-float')).filter((n) => {
      const f = n.getBoundingClientRect();
      return lines.some((q) => f.left < q.right && f.right > q.left && f.top < q.bottom && f.bottom > q.top);
    }).length;
    return { x: Math.round(r.right), y: Math.round(r.top), lines: lines.length, over };
  }, sel);
  const onCorner = (f, c) => Math.abs(f.x - (c.x - 44)) <= 3 && f.y - (c.y - 7) >= -3 && f.y - (c.y - 7) <= 13 && c.lines > 0 && c.over === 0;

  async function momentsDraw(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, f, c, k;
    await ev(page, () => { FX.seed(5); window.scrollTo(0, 0); startDrawMode(); }); await wait(page, 500); await quiet(page);
    log = await during(page, () => ev(page, () => validateDraw()), 150);
    check('tracé : valider sans rien tracer (sortie anticipée du jeu) → aucun effet', log.length === 0, log);
    log = await during(page, () => stroke(page, frac(0.25, 0.1, 0.25, 0.9)), 80);
    check('tracé : rien ne joue pendant le tracé', log.length === 0, log);
    await center(page, '#screen-draw .btn-main');
    log = await during(page, () => ev(page, () => validateDraw()), 160);
    check('tracé : mission 1 décentrée (60) → repère calme seul le long de l\'explication',
      has(log, 'trace-erreur[60]') && count(log, 'slash') === 1 && log.length === 2 && calm(log), log);
    await settle(page, 420, 'tracé : repère calme fini 600 ms après la validation');
    log = await during(page, () => ev(page, () => validateDraw()), 150);
    check('tracé : valider une seconde fois (ignoré par le jeu) → aucun effet', log.length === 0, log);
    await ev(page, () => nextDrawMission());
    await stroke(page, frac(0.1, 0.5, 0.9, 0.5));
    await center(page, '#screen-draw .btn-main');
    log = await during(page, () => ev(page, () => validateDraw()), 170);
    check('tracé : mission réussie → lumière sur le cadre (2 traits + étincelles) et note tamponnée',
      has(log, 'trace-juste[100]') && count(log, 'slash') === 2 && has(log, 'trail') && has(log, 'anim[fx-float]') && !has(log, 'burst') && !has(log, 'anim[fx-banner]'), log);
    f = await floats(page); c = await corner(page, '#draw-feedback'); k = await ink(page, '#draw-canvas', 26);
    check('tracé : la note est tamponnée à cheval sur le coin haut droit de l\'explication, hors de son texte',
      f.length === 1 && f[0].text === '✔ 100 %' && /fx-at-stamp/.test(f[0].cls) && f[0].hidden === 'true' && onCorner(f[0], c), [f, c]);
    check('tracé : la lumière reste sur le cadre — rien n\'est dessiné sur la zone de travail', k.live && k.total > 0 && k.inside === 0, k);
    await settle(page, 620, 'tracé : tout est fini 800 ms après la validation');
    log = await during(page, async () => {
      await ev(page, () => nextDrawMission());
      await stroke(page, (b) => [b.w * 0.2, b.h * 0.85, b.w * 0.2 + b.h * 0.7, b.h * 0.15]);
      await ev(page, () => { validateDraw(); nextDrawMission(); });
    }, 200);
    check('tracé : validation et mission suivante dans le même tick → aucune chorégraphie périmée', mine(log).length === 0 && (await ev(page, () => drawState.missionIdx)) === 3, log);
    await stroke(page, frac(0.15, 0.8, 0.85, 0.2));
    await ev(page, () => validateDraw()); await wait(page, 60);
    log = await during(page, () => page.setViewportSize({ width: 1100, height: 800 }), 450);
    check('tracé : redimensionner la fenêtre en cours de mission ne joue rien (et coupe ce qui jouait)',
      log.length === 0 && isIdle(await leftovers(page)) && (await ev(page, () => drawState.validated)) === false, [log, await leftovers(page)]);
    await page.setViewportSize({ width: 1280, height: 800 }); await wait(page, 300);
    /* Niveau léger : mêmes moments, forme courte. */
    await lv(page, 'leger');
    await stroke(page, frac(0.15, 0.8, 0.85, 0.2));
    await center(page, '#screen-draw .btn-main');
    log = await during(page, () => ev(page, () => validateDraw()), 150);
    k = await ev(page, () => FX.debug.log.filter((e) => e.fx === 'trail').map((e) => e.n));
    check('tracé, niveau léger : forme courte (8 étincelles au plus), tout au niveau léger',
      has(log, 'trace-juste[100]') && log.every((l) => /~$/.test(l)) && k.length === 1 && k[0] <= 8, [log, k]);
    await settle(page, 620, 'tracé, niveau léger : tout est fini 800 ms après la validation');
    /* Niveau off : rien. */
    await lv(page, 'off');
    await ev(page, () => nextDrawMission());
    await stroke(page, frac(0.1, 0.5, 0.9, 0.5));
    log = await during(page, () => ev(page, () => validateDraw()), 150);
    check('tracé, niveau off : rien n\'est joué (et le jeu a bien validé)', log.length === 0 && (await ev(page, () => drawState.validated)) === true, log);
    await lv(page, 'complet');
    /* Fin du mode : le jeu affiche un toast et l'accueil dans le même appel. */
    log = await during(page, () => ev(page, () => { drawState.missionIdx = DRAW_MISSIONS.length - 1; nextDrawMission(); }), 250);
    check('tracé : dernière mission → bandeau sur l\'accueil', has(log, 'atelier-fin[MISSIONS TERMINÉES !]') && has(from(log, 'atelier-fin'), 'anim[fx-banner]') &&
      (await ev(page, () => FX.env.screen())) === 'home', log);
    log = await during(page, () => ev(page, () => nextDrawMission()), 150);
    check('tracé : nextDrawMission rappelé après la fin → pas de second bandeau', !has(log, 'atelier-fin'), log);
    await settle(page, 2700, 'tracé : rien ne reste vivant après la fin du mode');
    check('aucune erreur (tracé)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsPuzzle(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, k;
    const slotState = (sel) => ev(page, (s) => document.querySelector(s).className, sel);
    await ev(page, () => { FX.seed(6); window.scrollTo(0, 0); startPuzzleMode(); }); await wait(page, 500); await quiet(page);
    let pairs = await ev(page, () => __pairs());
    log = await during(page, () => drag(page, pairs[0][0], pairs[1][1]), 160);
    check('puzzle : mauvaise case → rien de plus que ce que montre le jeu', log.length === 0 && /wrong/.test(await slotState(pairs[1][1])), [log, await slotState(pairs[1][1])]);
    await wait(page, 950);
    log = await during(page, () => drag(page, pairs[0][0], pairs[0][1]), 60);
    check('puzzle : bonne case → un petit anneau sur la case, rien d\'autre', has(log, 'puzzle-pose') && count(log, 'ring') === 1 && log.length === 2, log);
    k = await ev(page, () => document.getElementById('fx-root').classList.contains('fx-live'));
    await drag(page, pairs[1][0], pairs[1][1]);
    check('puzzle : un vrai glisser-déposer aboutit avec le calque affiché par-dessus', k === true && /correct/.test(await slotState(pairs[1][1])) &&
      (await ev(page, () => Object.keys(puzzleState.placements).length)) === 2, [k, await slotState(pairs[1][1])]);
    await wait(page, 450);
    log = await during(page, () => ev(page, (q) => dropOnSlot(document.querySelector(q[0]), document.querySelector(q[1])), pairs[0]), 120);
    check('puzzle : case déjà prise → aucun effet', log.length === 0, log);
    await drag(page, pairs[2][0], pairs[2][1]);
    log = await during(page, () => drag(page, pairs[3][0], pairs[3][1]), 470);
    check('puzzle : résolu → anneaux sur les 4 cases, éclat au-dessus du plateau, mention',
      has(log, 'puzzle-juste[120]') && has(from(log, 'puzzle-juste'), 'burst[star]') && count(from(log, 'puzzle-juste'), 'ring') >= 3 && has(log, 'anim[fx-float]'), log);
    k = await floats(page);
    check('puzzle : la mention reprend les XP donnés par le jeu, sur le coin de l\'explication, hors de son texte',
      k.length === 1 && k[0].text === '+120 XP' && k[0].inView && onCorner(k[0], await corner(page, '#puzzle-feedback')), [k, await corner(page, '#puzzle-feedback')]);
    await settle(page, 700, 'puzzle : tout est fini 900 ms après la résolution');
    /* Temps écoulé, écran affiché : repère calme. */
    await ev(page, () => nextPuzzle()); await wait(page, 80);
    await center(page, '#puzzle-game-area');
    log = await during(page, () => ev(page, () => __tick(601)), 200);
    check('puzzle : temps écoulé → repère calme seul', has(log, 'puzzle-erreur') && calm(log) && !has(log, 'ring') && !has(log, 'puzzle-juste'), log);
    await settle(page, 800, 'puzzle : repère calme fini');
    /* Chrono fantôme : « Retour accueil » ne l'arrête pas, il sonne sur l'accueil. */
    await ev(page, () => { nextPuzzle(); showHome(); }); await wait(page, 2700); await quiet(page);
    log = await during(page, () => ev(page, () => __tick(601)), 300);
    check('puzzle : le chrono fantôme sonne sur l\'accueil (défaut hérité, non masqué) → la couche ne joue rien',
      log.length === 0 && (await ev(page, () => puzzleState.validated && document.getElementById('puzzle-feedback').style.display === 'block')) === true, log);
    /* Tri réussi (vrais glisser vers le plateau) : éclat, sans anneaux de cases. */
    await ev(page, () => { window.scrollTo(0, 0); startPuzzleMode(); nextPuzzle(); nextPuzzle(); }); await wait(page, 500); await quiet(page);
    for (const id of await ev(page, () => __order())) await drag(page, id, '#sort-zone');
    log = await during(page, () => ev(page, () => document.querySelector('#puzzle-game-area > .btn-main').click()), 250);
    check('puzzle : tri réussi → éclat et mention', has(log, 'puzzle-juste[100]') && has(log, 'burst[star]') && has(log, 'anim[fx-float]'), log);
    await wait(page, 700);
    await lv(page, 'leger');
    await ev(page, () => { nextPuzzle(); }); await wait(page, 80);
    pairs = await ev(page, () => __pairs());
    log = await during(page, () => drag(page, pairs[0][0], pairs[0][1]), 80);
    check('puzzle, niveau léger : anneau de pose au niveau léger', has(log, 'puzzle-pose~') && has(log, 'ring~') && log.length === 2, log);
    await lv(page, 'complet');
    log = await during(page, () => ev(page, () => { puzzleState.idx = PUZZLES.length - 1; nextPuzzle(); }), 250);
    check('puzzle : dernier puzzle → bandeau sur l\'accueil', has(log, 'atelier-fin[PUZZLES TERMINÉS !]') && has(from(log, 'atelier-fin'), 'anim[fx-banner]'), log);
    await settle(page, 2700, 'puzzle : rien ne reste vivant après la fin du mode');
    check('aucune erreur (puzzle)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsPyth(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, k, f, c;
    await ev(page, () => { FX.seed(7); window.scrollTo(0, 0); startPythMode(); }); await wait(page, 500); await quiet(page);
    log = await during(page, async () => {
      const b = await box(page, '#pyth-canvas');
      await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.move(b.x + 90, b.y + 60);
      await handle(page, 'B', 0.52, 0.7); await handle(page, 'C', 0.2, 0.3714);
    }, 80);
    check('atelier : rien ne joue pendant le survol ni pendant qu\'on glisse une poignée',
      log.length === 0 && (await ev(page, () => Math.abs(pythState.pyth.B.x - 0.52) < 0.01 && Math.abs(pythState.pyth.C.y - 0.3714) < 0.01)) === true, log);
    await ev(page, () => { let g = 0; while (pythState.challenge.target.name !== '4-7,5-8,5' && g++ < 80) newPythChallenge(); });
    await center(page, '#pyth-validate-btn');
    log = await during(page, () => ev(page, () => validatePythChallenge()), 160);
    check('atelier : essai manqué → repère calme seul', has(log, 'defi-erreur') && count(log, 'slash') === 1 && log.length === 2, log);
    log = await during(page, async () => { for (let i = 0; i < 6; i++) { await ev(page, () => validatePythChallenge()); await wait(page, 50); } }, 150);
    check('atelier : bouton martelé (6 essais en 0,5 s) → pas un repère de plus', log.length === 0, log);
    await wait(page, 1100);
    log = await during(page, () => ev(page, () => validatePythChallenge()), 160);
    check('atelier : essai manqué 1,5 s plus tard → le repère revient', count(log, 'defi-erreur') === 1, log);
    await ev(page, () => { let g = 0; while (pythState.challenge.target.name !== '3-4-5' && g++ < 80) newPythChallenge(); }); await wait(page, 80);
    await center(page, '#pyth-challenge');
    let gain = await xp(page);
    log = await during(page, () => ev(page, () => validatePythChallenge()), 170);
    gain = (await xp(page)) - gain;
    check('atelier : défi réussi → lumière sur le cadre du canvas et mention', has(log, 'defi-juste') && count(log, 'slash') === 2 && has(log, 'trail') && has(log, 'anim[fx-float]'), log);
    f = await floats(page); c = await corner(page, '#pyth-challenge-feedback'); k = await ink(page, '#pyth-canvas', 26);
    check('atelier : mention « +n XP » (les XP donnés par le jeu) sur le coin de l\'explication, rien sur la figure',
      gain > 0 && f.length === 1 && f[0].text === '+' + gain + ' XP' && onCorner(f[0], c) && k.total > 0 && k.inside === 0, [gain, f, c, k]);
    await settle(page, 620, 'atelier : tout est fini 800 ms après la réussite');
    log = await during(page, () => ev(page, () => validatePythChallenge()), 150);
    check('atelier : valider après la réussite (ignoré par le jeu) → aucun effet', log.length === 0, log);
    await center(page, '#screen-pythagore .chapter-tabs');
    log = await during(page, () => click(page, '#screen-pythagore .chapter-tab[data-atelier="thales"]'), 120);
    check('atelier : changement d\'onglet → fondu de la figure, rien d\'autre', has(log, 'atelier-onglet[thales]') && has(log, 'anim[pyth-canvas]') && log.length === 2, log);
    log = await during(page, () => click(page, '#screen-pythagore .chapter-tab[data-atelier="thales"]'), 120);
    check('atelier : même onglet → aucun effet', log.length === 0, log);
    await wait(page, 250);
    log = await during(page, () => page.setViewportSize({ width: 1100, height: 800 }), 450);
    check('atelier : redimensionner la fenêtre (le jeu relance init / select / new) ne joue rien', log.length === 0 && isIdle(await leftovers(page)), [log, await leftovers(page)]);
    await page.setViewportSize({ width: 1280, height: 800 }); await wait(page, 300);
    await lv(page, 'leger');
    await center(page, '#pyth-challenge');
    log = await during(page, () => ev(page, () => { pythState.thales.t = pythState.challenge.targetRatio; validatePythChallenge(); }), 150);
    check('atelier, niveau léger : réussite en forme courte', has(log, 'defi-juste~') && log.every((l) => /~$/.test(l)), log);
    await settle(page, 620, 'atelier, niveau léger : tout est fini');
    check('aucune erreur (atelier)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsProba(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, k, f;
    await ev(page, () => { FX.seed(8); window.scrollTo(0, 0); startProbaTree(); }); await wait(page, 500); await quiet(page);
    await center(page, '#proba-tree-canvas');
    log = await during(page, () => ev(page, () => placeProbaPiece('lvl1-A', 0, PROBA_SCENARIOS[0].pool[0])), 120);
    check('arbre : pièce posée → petit anneau neutre sur la branche', has(log, 'proba-pose') && count(log, 'ring') === 1 && log.length === 2, log);
    log = await during(page, () => ev(page, () => placeProbaPiece('lvl1-A', 0, PROBA_SCENARIOS[0].pool[0])), 120);
    check('arbre : même pièce reposée sur la même branche → aucun effet (front)', log.length === 0, log);
    log = await during(page, async () => { await click(page, '#proba-pool .proba-piece:nth-child(2)'); await click(page, '.proba-slot[data-slot="lvl1-B"]'); }, 120);
    check('arbre : pose au clic → même anneau', has(log, 'proba-pose') && count(log, 'ring') === 1, log);
    await wait(page, 400);
    await ev(page, () => __fillTree(true)); await wait(page, 500);
    log = await during(page, () => click(page, '#proba-validate-btn'), 200);
    check('arbre : arbre à corriger → rien de plus que le jeu', log.length === 0 && (await ev(page, () => document.querySelectorAll('.proba-slot.wrong').length)) === 2, log);
    await ev(page, () => __fillTree()); await wait(page, 500);
    await center(page, '#proba-phase-placement');
    let gain = await ev(page, () => { const x = state.xp; FX.debug.log.length = 0; validateProbaPlacement(); const g = state.xp - x; validateProbaPlacement(); return g; });
    await wait(page, 150);
    f = await floats(page); k = await corner(page, '#proba-placement-feedback');
    await wait(page, 900);
    log = await logOf(page);
    check('arbre : validé (double clic) → une seule chorégraphie, la lumière descend branche par branche',
      count(log, 'arbre-juste') === 1 && count(log, 'slash') === 6 && count(log, 'ring') === 6 && !has(log, 'burst') && (await ev(page, () => state.xp)) === 80, log);
    check('arbre : mention « +n XP » (les XP donnés par l\'appel qui a validé) sur le coin du message, hors de son texte',
      gain > 0 && f.length === 1 && f[0].text === '+' + gain + ' XP' && f[0].inView && onCorner(f[0], k), [gain, f, k]);
    k = await ev(page, () => ({ arbre: getComputedStyle(document.getElementById('proba-phase-placement')).display, q: probaState.phaseQuestion }));
    check('arbre : tout est fini 1,05 s après la validation, avant que le jeu ne masque l\'arbre (1,5 s)', isIdle(await leftovers(page)) && k.arbre !== 'none' && k.q === false, [await leftovers(page), k]);
    await wait(page, 650);
    await center(page, '#proba-question-answers');
    /* Pour cet essai, le jeu donne 30 XP de plus qu'aujourd'hui (addXP majoré, comme si classique.html avait changé
       ses montants) : la mention doit suivre ce que le jeu a réellement donné, pas un montant recopié. */
    gain = await ev(page, () => { const real = window.addXP; window.__addXP = real; window.addXP = function (n) { return real.call(this, n + 30); }; return state.xp; });
    log = await during(page, async () => click(page, '#proba-question-answers .answer-btn:nth-child(' + ((await ev(page, () => probaState.currentQuestion.correct)) + 1) + ')'), 150);
    gain = (await ev(page, () => { window.addXP = window.__addXP; return state.xp; })) - gain;
    check('arbre : question juste → anneau sur la réponse et mention', has(log, 'proba-juste') && count(log, 'ring') === 1 && has(log, 'anim[fx-float]') && calm(log), log);
    f = await floats(page); k = await corner(page, '#proba-question-feedback');
    check('arbre : mention « +n XP » = les XP réellement donnés par le jeu (montant majoré de 30 pour l\'essai), sur le coin de l\'explication, hors de son texte',
      gain > 30 && f.length === 1 && f[0].text === '+' + gain + ' XP' && f[0].inView && onCorner(f[0], k), [gain, f, k]);
    log = await during(page, () => ev(page, () => answerProbaQuestion(0)), 150);
    check('arbre : réponse après réponse (ignorée par le jeu) → aucun effet', mine(log).length === 0, log);
    await wait(page, 700);
    /* Scénario 2 au niveau léger : les anneaux seuls, sans les traits de branche. */
    await lv(page, 'leger');
    await ev(page, () => { nextProbaScenario(); __fillTree(); }); await wait(page, 450);
    await center(page, '#proba-phase-placement');
    log = await during(page, () => ev(page, () => validateProbaPlacement()), 1000);
    check('arbre, niveau léger : forme courte (6 anneaux, aucun trait de branche), tout au niveau léger',
      has(log, 'arbre-juste~') && count(log, 'ring') === 6 && !has(log, 'slash') && log.every((l) => /~$/.test(l)), log);
    check('arbre, niveau léger : tout est fini 1 s après la validation', isIdle(await leftovers(page)), await leftovers(page));
    await lv(page, 'complet');
    await wait(page, 700);
    await center(page, '#proba-question-answers');
    log = await during(page, () => ev(page, () => answerProbaQuestion((probaState.currentQuestion.correct + 1) % 4)), 200);
    check('arbre : question fausse → repère calme seul', has(log, 'proba-erreur') && calm(log) && !has(log, 'ring') && !has(log, 'anim[fx-float]'), log);
    await settle(page, 500, 'arbre : repère calme fini 700 ms après la réponse');
    /* Résultat : fête proportionnelle au palier écrit par le jeu. */
    await ev(page, () => { FX.debug.log.length = 0; state.xp = (state.level - 1) * 500; probaState.scenarioIdx = 4; nextProbaScenario(); });   // loin d'un changement de niveau (vérifié dans 90-ensemble.js)
    await wait(page, 600);
    log = await logOf(page);
    k = await ev(page, () => document.getElementById('proba-result-emoji').textContent);
    check('arbre : résultat (palier 🥷) → l\'émoji arrive, anneau, étoiles, pas de confettis',
      k === '🥷' && has(log, 'bilan-proba[1]') && has(log, 'anim[proba-result-emoji]') && has(from(log, 'bilan-proba'), 'ring') && has(log, 'burst[star]') && !has(log, 'confetti'), [k, log]);
    await settle(page, 1300, 'arbre : résultat fini en moins de 2 s');
    check('aucune erreur (arbre)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsGraph(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, k, f;
    /* Tire des défis jusqu'à en trouver un du genre voulu (le jeu fait de même à chaque redimensionnement). */
    const until = (kind) => ev(page, (kind) => {
      let g = 0;
      if (kind === 'dehors') {                                  // le jeu ne tire plus de point hors du repère : on en fabrique un
        while (graphState.current.mode !== 'click' && g++ < 300) loadGraphChallenge();
        const fn = { type: 'affine', a: 3, b: 3 }, x = 3;
        graphState.current = Object.assign({}, graphState.current, { fn, type: 'image', target: { x, y: evalGraphFn(fn, x) } });
        renderGraph();
        return Math.abs(graphState.current.target.y) > graphState.yRange[1] + 2;
      }
      const ok = () => {
        const c = graphState.current, y = c.target ? Math.abs(c.target.y) : 0;
        return kind === 'qcm' ? c.mode === 'qcm' : c.mode === 'click' && (kind === 'dedans' ? y < graphState.yRange[1] : y > graphState.yRange[1] + 2);
      };
      while (!ok() && g++ < 300) loadGraphChallenge();
      return ok();
    }, kind);
    const answer = (good) => ev(page, (good) => {
      const c = graphState.current;
      if (c.mode === 'qcm') return answerGraphQcm(good ? c.correctIdx : (c.correctIdx + 1) % 4);
      graphState.clickedPoint = good ? { x: c.target.x, y: c.target.y } : { x: c.target.x + 2, y: c.target.y };
      renderGraph(); validateGraphAnswer();
    }, good);
    await ev(page, () => { FX.seed(9); window.scrollTo(0, 0); startGraphReader(); }); await wait(page, 500); await quiet(page);
    await until('dedans'); await wait(page, 60);
    await center(page, '#graph-canvas');
    log = await during(page, () => answer(true), 150);
    check('graphique : point juste dans le repère → un anneau sur le point', has(log, 'graph-juste[×1]') && count(log, 'ring') === 1 && !has(log, 'slash') && calm(log), log);
    k = await ev(page, () => {                                  // l'encre du calque est-elle autour du point choisi ?
      const c = document.getElementById('fx-canvas'), s = c.width / document.documentElement.clientWidth, r = document.getElementById('graph-canvas').getBoundingClientRect();
      const p = mathToPx(graphState.clickedPoint.x, graphState.clickedPoint.y), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0, sx = 0, sy = 0;
      for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 12) { n++; sx += x; sy += y; }
      return { n, dx: Math.round(sx / n / s - (r.left + p.x)), dy: Math.round(sy / n / s - (r.top + p.y)) };
    });
    check('graphique : l\'anneau est centré sur le point choisi (repère du canvas → fenêtre)', k.n > 0 && Math.abs(k.dx) <= 4 && Math.abs(k.dy) <= 4, k);
    await settle(page, 620, 'graphique : tout est fini 800 ms après la réponse');
    await ev(page, () => nextGraphChallenge()); await until('dehors'); await wait(page, 60);
    log = await during(page, () => answer(true), 150);
    check('graphique : point juste hors du repère dessiné (cas hérité fréquent) → lumière sur le cadre du canvas',
      has(log, 'graph-juste[×2]') && count(log, 'slash') === 2 && has(log, 'trail') && !has(log, 'ring'), log);
    k = await ink(page, '#graph-canvas', 26);
    check('graphique : rien n\'est dessiné sur le graphique', k.total > 0 && k.inside === 0, k);
    await wait(page, 700);
    await ev(page, () => nextGraphChallenge()); await until('qcm'); await wait(page, 60);
    await center(page, '#graph-qcm-answers');
    let gain = await xp(page);
    log = await during(page, () => answer(true), 150);
    gain = (await xp(page)) - gain;
    check('graphique : QCM juste → anneau sur la réponse, mention de l\'XP du combo', has(log, 'graph-juste[×3]') && count(log, 'ring') === 1 && has(log, 'anim[fx-float]'), log);
    f = await floats(page); k = await corner(page, '#graph-feedback');
    check('graphique : mention « +n XP » (les XP donnés par le jeu au combo ×3) sur le coin de l\'explication, hors de son texte',
      gain > 0 && f.length === 1 && f[0].text === '+' + gain + ' XP' && f[0].inView && onCorner(f[0], k), [gain, f, k]);
    await wait(page, 700);
    await ev(page, () => nextGraphChallenge()); await until('dedans'); await wait(page, 60);
    await center(page, '#graph-canvas');
    log = await during(page, () => answer(false), 150);
    check('graphique : point faux → repère calme (anneau qui se referme sur le point attendu), ni éclat ni mention',
      has(log, 'graph-erreur[×0]') && count(log, 'ring') === 1 && calm(log) && !(await floats(page)).some((x) => /XP/.test(x.text)), log);
    await settle(page, 700, 'graphique : repère calme fini 850 ms après la réponse');
    /* Fenêtre redimensionnée : le jeu relance le canvas et tire un nouveau défi — ce n'est pas un geste du joueur. */
    await ev(page, () => nextGraphChallenge()); await wait(page, 80);
    k = await ev(page, () => JSON.stringify(graphState.current.fn) + graphState.current.type);
    log = await during(page, () => page.setViewportSize({ width: 820, height: 800 }), 450);
    check('graphique : redimensionner la fenêtre (nouveau défi tiré par le jeu) ne joue rien',
      log.length === 0 && isIdle(await leftovers(page)) && (await ev(page, () => graphState.W)) < 804, [log, k, await ev(page, () => graphState.W)]);
    await page.setViewportSize({ width: 1280, height: 800 }); await wait(page, 300);
    /* Modale ouverte : rien ne joue dessous. */
    await until('qcm'); await wait(page, 60);
    await ev(page, () => confirmQuitGraph()); await wait(page, 120);
    log = await during(page, () => answer(true), 200);
    check('graphique : réponse donnée sous la modale « Quitter » → rien ne joue', log.length === 0 && (await ev(page, () => graphState.answered)) === true, log);
    await ev(page, () => closeModal('modal-graph-quit')); await wait(page, 150);
    /* Résultat : palier 🏆 au niveau complet. */
    await ev(page, () => { FX.debug.log.length = 0; state.xp = (state.level - 1) * 500; graphState.correct = 9; graphState.challengeIdx = 9; nextGraphChallenge(); });
    await wait(page, 650);
    log = await logOf(page);
    check('graphique : résultat (palier 🏆) → l\'émoji arrive, anneau, étoiles, confettis',
      has(log, 'bilan-graph[3]') && has(log, 'anim[graph-result-emoji]') && has(from(log, 'bilan-graph'), 'ring') && has(log, 'burst[star]') && has(log, 'confetti'), log);
    await settle(page, 1750, 'graphique : résultat fini en moins de 2,5 s');
    /* Même résultat au niveau léger : forme courte, sans confettis. */
    await lv(page, 'leger');
    await ev(page, () => { startGraphReader(); }); await wait(page, 300);
    await ev(page, () => { FX.debug.log.length = 0; state.xp = (state.level - 1) * 500; graphState.correct = 9; graphState.challengeIdx = 9; nextGraphChallenge(); });
    await wait(page, 600);
    log = await logOf(page);
    check('graphique, niveau léger : résultat en forme courte (pas de confettis), tout au niveau léger',
      has(log, 'bilan-graph[3]~') && !has(log, 'confetti') && log.every((l) => /~$/.test(l)), log);
    await settle(page, 600, 'graphique, niveau léger : résultat fini en 1,2 s');
    check('aucune erreur (graphique)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function momentsStats(browser) {
    const page = await open(browser, ANIME, DESK);
    let log, k;
    const waapi = () => ev(page, () => document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition) &&
      a.effect.target && a.effect.target.classList.contains('stats-bar-fill')).map((a) => a.effect.getTiming().fill + '/' + a.effect.getTiming().iterations));
    /* Avant toute navigation, un « resize » relance init / load / new sur les écrans CACHÉS (piège du jeu). */
    log = await during(page, () => page.setViewportSize({ width: 1200, height: 800 }), 450);
    k = await ev(page, () => ({ err: FX.stats().errCount, ecran: FX.env.screen(), defi: !!pythState.challenge, graphe: !!graphState.current }));
    check('accueil : redimensionner avant toute navigation (le jeu initialise ses ateliers cachés) → le module ne joue rien, aucune erreur',
      mine(log).length === 0 && k.err === 0 && k.ecran === 'home' && k.defi && k.graphe, [log, k]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await wait(page, 2800); await quiet(page);
    await ev(page, () => { showStatsScreen(); }); await wait(page, 500);
    log = await logOf(page);
    check('stats : aucune barre (aucune partie) → rien n\'est joué par le module', mine(log).length === 0, log);
    await ev(page, () => showHome()); await wait(page, 500);
    await ev(page, () => {
      playerStats.universesUsed = { naruto: 5, onepiece: 3, dbz: 1 }; playerStats.gamesByMode = { '6e_facile': 4, boss: 2, proba_tree: 1 }; playerStats.totalGames = 7;
      FX.debug.log.length = 0; showStatsScreen();
    });
    await wait(page, 200);
    log = await logOf(page); k = await waapi();
    check('stats : arrivée → les 6 barres poussent une fois (WAAPI finie, fill backwards)',
      has(log, 'stats[6]') && count(from(log, 'stats'), 'anim') === 6 && k.length === 6 && k.every((x) => x === 'backwards/1'), [log, k]);
    k = await ev(page, () => Array.from(document.querySelectorAll('.stats-bar-fill')).map((b) => b.getAttribute('style') + '|' + b.className));
    check('stats : aucun style ni classe écrit sur les barres', k.every((x) => /^width:\s*[\d.]+%;?\|stats-bar-fill$/.test(x)), k);
    log = await during(page, () => ev(page, () => { renderStats(); showStatsScreen(); }), 200);
    check('stats : re-rendu ou rappel, écran déjà affiché → rien de plus', log.length === 0, log);
    await settle(page, 1100, 'stats : animations finies 1,5 s après l\'arrivée');
    k = await ev(page, () => Array.from(document.querySelectorAll('.stats-bar-fill')).map((b) => getComputedStyle(b).clipPath));
    check('stats : barres entières une fois l\'effet fini', k.every((x) => x === 'none'), k);
    check('aucune erreur (stats)', page.errors.length === 0, page.errors);
    await page.context().close();
  }

  async function scenarioMoments(browser) {
    await Promise.all([momentsDraw(browser), momentsPuzzle(browser), momentsPyth(browser)]);
    await Promise.all([momentsProba(browser), momentsGraph(browser), momentsStats(browser)]);
  }

  /* ════════════ Scénario 3 : téléphone tactile 360×640 ════════════ */
  const TEL = { viewport: { width: 360, height: 640 }, touch: true };
  /* Glisser tactile synthétique d'une pièce du puzzle vers une case (touchstart sur la pièce, touchmove
     et touchend sur le document, comme les écoute le jeu). Renvoie ce qu'on voit PENDANT le geste. */
  const touchDrag = (page, fromSel, toSel) => ev(page, ([a, b]) => {
    const p = document.querySelector(a), pr = p.getBoundingClientRect(), sr = document.querySelector(b).getBoundingClientRect();
    const fire = (el, type, x, y, end) => {
      const t = new Touch({ identifier: 1, target: p, clientX: x, clientY: y });
      return el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] }));
    };
    const x0 = pr.left + pr.width / 2, y0 = pr.top + pr.height / 2, x1 = sr.left + sr.width / 2, y1 = sr.top + sr.height / 2;
    fire(p, 'touchstart', x0, y0);
    fire(document, 'touchmove', (x0 + x1) / 2, (y0 + y1) / 2);
    const prevented = !fire(document, 'touchmove', x1, y1);
    const clone = document.querySelector('body > .puzzle-piece'), root = document.getElementById('fx-root');
    const seen = { clone: !!clone, cloneZ: clone ? getComputedStyle(clone).zIndex : null, prevented,
      rootZ: getComputedStyle(root).zIndex, rootPE: getComputedStyle(root).pointerEvents, live: root.classList.contains('fx-live') };
    fire(document, 'touchend', x1, y1, true);
    seen.cloneLeft = !!document.querySelector('body > .puzzle-piece');
    return seen;
  }, [fromSel, toSel]);

  async function scenarioPhone(browser) {
    const page = await open(browser, ANIME, TEL);
    let log, f, k, c;
    /* Tracé : l'explication s'ouvre sous le bas de l'écran. */
    await ev(page, () => { FX.seed(4); window.scrollTo(0, 0); startDrawMode(); }); await wait(page, 500); await quiet(page);
    await stroke(page, frac(0.25, 0.1, 0.25, 0.9));
    await ev(page, () => window.scrollTo(0, 0));
    log = await during(page, () => ev(page, () => validateDraw()), 200);
    f = await floats(page);
    check('téléphone, tracé : explication sous l\'écran → un 👇 immobile dans le coin bas droit, rien d\'autre',
      has(log, 'trace-erreur[60]') && log.length === 2 && f.length === 1 && f[0].text === '👇' && f[0].inView && f[0].x > 300 && f[0].y > 560, [log, f]);
    await settle(page, 650, 'téléphone, tracé : repère fini 850 ms après la validation');
    await ev(page, () => nextDrawMission());
    await stroke(page, frac(0.1, 0.5, 0.9, 0.5));
    await ev(page, () => window.scrollTo(0, 0));
    log = await during(page, () => ev(page, () => validateDraw()), 170);
    f = await floats(page); k = await ink(page, '#draw-canvas', 26);
    check('téléphone, tracé : réussite, explication hors champ → lumière sur le cadre du canvas, pas de mention',
      has(log, 'trace-juste[100]') && count(log, 'slash') === 2 && f.length === 0 && k.total > 0 && k.inside === 0, [log, f, k]);
    await wait(page, 750);
    await ev(page, () => nextDrawMission());
    await stroke(page, (b) => [b.w * 0.2, b.h * 0.85, b.w * 0.2 + b.h * 0.7, b.h * 0.15]);
    await center(page, '#screen-draw .btn-main');
    log = await during(page, () => ev(page, () => validateDraw()), 170);
    f = await floats(page); k = await corner(page, '#draw-feedback');
    check('téléphone, tracé : réussite, explication visible → note tamponnée dans la fenêtre, hors du texte',
      has(log, 'trace-juste[100]') && f.length === 1 && f[0].inView && /fx-at-stamp/.test(f[0].cls) && onCorner(f[0], k), [log, f, k]);
    await settle(page, 650, 'téléphone, tracé : tout est fini');

    /* Puzzle : glisser tactile pendant qu'un anneau joue encore sur le calque. */
    await ev(page, () => { window.scrollTo(0, 0); startPuzzleMode(); }); await wait(page, 500); await quiet(page);
    await center(page, '#puzzle-game-area');
    const pairs = await ev(page, () => __pairs());
    k = await touchDrag(page, pairs[0][0], pairs[0][1]);
    await wait(page, 60);
    log = await logOf(page);
    check('téléphone, puzzle : glisser tactile → pièce posée, anneau sur la case', has(log, 'puzzle-pose') && count(log, 'ring') === 1 &&
      (await ev(page, (s) => document.querySelector(s).className, pairs[0][1])).indexOf('correct') > 0, [log, k]);
    k = await touchDrag(page, pairs[1][0], pairs[1][1]);
    check('téléphone, puzzle : le glisser suivant aboutit sous le calque affiché (clone du jeu au-dessus, calque insensible au toucher)',
      k.live === true && k.clone === true && k.cloneZ === '9999' && k.rootZ === '500' && k.rootPE === 'none' && k.prevented === true && k.cloneLeft === false &&
      (await ev(page, () => Object.keys(puzzleState.placements).length)) === 2, k);
    await ev(page, (q) => { dropOnSlot(document.querySelector(q[2][0]), document.querySelector(q[2][1])); dropOnSlot(document.querySelector(q[3][0]), document.querySelector(q[3][1])); }, pairs);
    await ev(page, () => { FX.debug.log.length = 0; }); await wait(page, 480);
    log = await logOf(page); f = await floats(page);
    check('téléphone, puzzle : résolu → effets joués, mention dans la fenêtre si l\'explication y est', has(log, 'puzzle-juste[120]') && f.every((x) => x.inView), [log, f]);
    await settle(page, 750, 'téléphone, puzzle : tout est fini');
    await ev(page, () => showHome()); await wait(page, 300);

    /* Constructeur : le canvas et le bouton Valider ne sont jamais à l'écran ensemble. */
    await ev(page, () => { window.scrollTo(0, 0); startPythMode(); }); await wait(page, 500);
    await ev(page, () => { selectPythAtelier('trigo'); __angle(pythState.challenge.target.angle); }); await wait(page, 350); await quiet(page);
    await center(page, '#pyth-validate-btn');
    k = await ev(page, () => document.getElementById('pyth-canvas').getBoundingClientRect().bottom);
    let gain = await xp(page);
    log = await during(page, () => ev(page, () => validatePythChallenge()), 170);
    gain = (await xp(page)) - gain;
    f = await floats(page); c = await corner(page, '#pyth-challenge-feedback');
    check('téléphone, atelier : canvas hors champ → la lumière entoure le message, mention (XP donnés par le jeu) dans la fenêtre, hors du texte',
      k < 0 && has(log, 'defi-juste') && count(log, 'slash') === 2 && has(log, 'trail') && gain > 0 && f.length === 1 && f[0].text === '+' + gain + ' XP' && f[0].inView && onCorner(f[0], c), [k, log, gain, f, c]);
    await settle(page, 650, 'téléphone, atelier : tout est fini');
    await ev(page, () => showHome()); await wait(page, 300);

    /* Arbre : l'arbre et le bouton Vérifier ne tiennent pas ensemble à l'écran. */
    await ev(page, () => { window.scrollTo(0, 0); startProbaTree(); __fillTree(); }); await wait(page, 600); await quiet(page);
    await center(page, '#proba-validate-btn');
    k = await ev(page, () => Array.from(document.querySelectorAll('.proba-slot')).filter((s) => { const r = s.getBoundingClientRect(); return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= 16; }).length);
    await ev(page, () => { FX.debug.log.length = 0; validateProbaPlacement(); }); await wait(page, 1050);
    log = await logOf(page);
    check('téléphone, arbre : seules les branches à l\'écran s\'allument (' + k + ' sur 6), sans erreur',
      k < 6 && has(log, 'arbre-juste') && count(log, 'ring') === k && count(log, 'slash') <= k && isIdle(await leftovers(page)), [k, log, await leftovers(page)]);
    await ev(page, () => showHome()); await wait(page, 300);

    /* Graphique : sur écran tactile, toucher le canvas lève une TypeError dans le jeu d'origine
       (défaut hérité) — elle doit rester la même, ni corrigée ni masquée ; le QCM, lui, se joue au doigt. */
    const tap = async (pg) => {
      await ev(pg, () => { window.scrollTo(0, 0); startGraphReader(); }); await wait(pg, 300);
      await ev(pg, () => { let g = 0; while (graphState.current.mode !== 'click' && g++ < 300) loadGraphChallenge(); });
      await center(pg, '#graph-canvas');
      const b = await box(pg, '#graph-canvas'), before = pg.errors.length;
      await pg.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2); await wait(pg, 200);
      return { errs: pg.errors.slice(before), point: await ev(pg, () => graphState.clickedPoint), disabled: await ev(pg, () => document.getElementById('graph-validate-btn').disabled) };
    };
    const classic = await open(browser, CLASSIC, TEL);
    const [a, b] = [await tap(classic), await tap(page)];
    await classic.context().close();
    check('téléphone, graphique : le toucher du canvas échoue comme dans le jeu d\'origine (même erreur, aucun point choisi)',
      a.errs.length === 1 && /clientX/.test(a.errs[0]) && JSON.stringify(a) === JSON.stringify(b), [a, b]);
    await quiet(page);
    await ev(page, () => { let g = 0; while (graphState.current.mode !== 'qcm' && g++ < 300) loadGraphChallenge(); }); await wait(page, 80);
    await center(page, '#graph-qcm-answers');
    const btn = await box(page, '#graph-qcm-answers .answer-btn:nth-child(' + ((await ev(page, () => graphState.current.correctIdx)) + 1) + ')');
    log = await during(page, () => page.touchscreen.tap(btn.x + btn.w / 2, btn.y + btn.h / 2), 170);
    f = await floats(page);
    check('téléphone, graphique : QCM juste au doigt → anneau sur la réponse, mentions dans la fenêtre', has(log, 'graph-juste[×1]') && count(log, 'ring') === 1 && f.every((x) => x.inView), [log, f]);
    await settle(page, 650, 'téléphone, graphique : tout est fini');
    k = await ev(page, () => FX.stats());
    check('téléphone : aucune erreur de la couche, aucune autre erreur de page', k.errCount === 0 && !k.dead && page.errors.length === 1, [k.errors, page.errors]);
    await page.context().close();
  }

  return [
    ['interactive-diff', 'ateliers : différentiel classique / off / complet / chaos (5 modes + stats)', scenarioDiff],
    ['interactive-moments', 'ateliers : moments (journal, fronts d\'état, coupures, rien ne traîne)', scenarioMoments],
    ['interactive-tel', 'ateliers : téléphone tactile 360×640 (ancres hors champ, glisser tactile, défauts hérités intacts)', scenarioPhone]
  ];
};
