/* ═══ 50-interactive.js — module « ateliers » : Tracé, Puzzle, Constructeur (Pythagore / Thalès /
   Trigo), Arbre de probabilités, Lecteur de graphique, écran Stats ═══
   Profil « atelier » : le joueur manipule un canvas ou fait glisser des pièces. Rien ne joue pendant
   le geste (aucun crochet sur un chemin chaud : render*, draw*, handle*Move, glisser-déposer) ; les
   effets partent d'un front de validation, restent sur le CADRE de la zone de travail ou sur le bord
   des blocs de texte, et durent ≤ 700 ms (arbre validé : ≤ 1,1 s ; résultats : ≤ 1,4 s).
   Crochets en O(1) : quelques champs lus avant / après l'appel, puis UNE place dans la file par frame
   (seule la dernière issue compte). L'issue se lit sur un front d'état, jamais sur le simple appel :
   plusieurs validate* se martèlent ou sortent tôt, et les écouteurs « resize » du jeu relancent
   init* / load* / new* / select* (même écran caché) — un appel n'est pas une action du joueur.
   Chaque effet vérifie l'écran courant ET son affichage réel : le chrono du puzzle n'est pas arrêté
   par « Retour accueil » et sonne plus tard sur un autre écran (défaut hérité, ni corrigé ni masqué,
   comme la mission 1 du Tracé qui ne peut pas réussir).
   Une erreur n'est jamais punie : un repère calme vers l'explication, et c'est tout. */
FX.module('ateliers', function (FX) {
  var D = document, F = FX.fx, PI = Math.PI, FADE = [{ opacity: 0 }, { opacity: 1 }];
  var TIER = { '🏆': 3, '⭐': 2, '🥷': 1 };                   // émoji de palier écrit par le jeu ; 💪 = 0
  var H = {}, last = null, tok = 0, scr = 0, at = -1e9, frein = -1e9;

  function on(id) { return FX.env.screen() === id; }
  function now() { return performance.now(); }
  function Q(o) { o.scope = 'q'; return o; }

  /* Issue d'un geste : t = moment, s = écran où il se joue (rien n'est émis depuis un autre écran :
     minuteries fantômes). Une seule place dans la file du noyau par frame ; l'issue est ignorée si la
     mission / le défi a changé entre-temps (jeton de la portée « q ») ou si l'écran n'est pas affiché. */
  function send(t, s, d) {
    var n = now(), k = FX.token('screen');
    if (!on(s)) return;
    last = d || {}; last.t = t; last.s = s; tok = FX.token('q');
    if ((n - at > 100 || k !== scr) && FX.emit('at:ev')) { at = n; scr = k; }
  }
  FX.on('at:ev', function () {
    var d = last;
    last = null; at = -1e9;
    if (d && tok === FX.token('q') && on(d.s) && FX.env.visible(d.s)) H[d.t](d);
  });

  /* ── Géométrie, mesurée au moment de l'effet (sur téléphone, les ancres sont souvent hors champ) ── */
  /* Partie visible d'un bloc : sous l'en-tête (collant sur Tracé et Puzzle, défilant ailleurs) et dans
     la fenêtre ; null s'il est absent, masqué ou presque entièrement hors champ. */
  function vu(t) {
    var r = FX.rect(t), h = FX.rect('header'), y, b;
    if (!r) return null;
    y = Math.max(r.y, h && h.inView ? h.y + h.h : 0); b = Math.min(r.y + r.h, FX.vh());
    return b - y < 16 ? null : { x: r.x, y: y, w: r.w, h: b - y, cx: r.cx, cy: (y + b) / 2 };
  }
  /* Lumière qui court le long du cadre d'un bloc : deux traits (haut, bas) et des étincelles sur le
     pourtour — jamais à l'intérieur (zone de travail ou de lecture). */
  function tour(r, n, color) {
    var x = r.x - 2, y = r.y - 2, X = r.x + r.w + 2, Y = r.y + r.h + 2;
    F.slash(x, y, X, y, Q({ width: 3, ms: 420, color: color }));
    F.slash(X, Y, x, Y, Q({ width: 3, ms: 420, color: color }));
    F.trail([[x, Y], [x, y], [X, y], [X, Y], [x, Y]], Q({ n: n, color: color, jitter: 3, stagger: 380 }));
  }
  /* Anneau sur un élément (case, pièce) s'il est visible. */
  function anneau(el, color) {
    var r = vu(el);
    if (r) F.ring(r.cx, r.cy, Q({ r0: 8, r1: Math.min(r.w, r.h) * 0.62, color: color }));
  }
  /* Mention brève à cheval sur le coin haut droit d'un bloc (jamais sur son texte) ; si ce coin est
     hors champ, sur le coin bas droit du cadre de repli ; sinon rien. */
  function mention(txt, color, sel, alt, o) {
    var r = FX.rect(sel), y = r && r.y;
    if (!r || y < 76 || y > FX.vh() - 24) { r = alt; y = r && r.y + r.h; }
    if (!r) return;
    o = Q(o || { dy: -14 });
    o.color = color; o.size = 20;
    F.float(txt, r.x + r.w - Math.min(44, r.w / 2), y, o);
  }
  /* Éclat bref sur le bord gauche de la réponse choisie (le geste du QCM), jamais sur son texte. */
  function eclat(b, pal) {
    if (!b) return;
    F.ring(b.x + 27, b.cy, Q({ r0: 12, r1: 25, color: pal.good }));
    F.burst(b.x + 27, b.y, Q({ n: 10, speed: 170, life: 340, angle: -PI / 2, spread: PI, gravity: 0, color: pal.c }));
  }
  /* Repère calme vers l'explication : un trait descend le long de son bord gauche ; si elle s'ouvre
     sous le bas de l'écran, un 👇 immobile dans le coin bas droit (hors de la zone du toast). */
  function guide(sel, pal) {
    var r = FX.rect(sel), h = FX.vh();
    if (!r) return;
    if (r.y > h - 40) F.float('👇', FX.vw() - 30, h - 40, Q({ size: 24, ms: 1800, dy: 0 }));
    else F.slash(r.x + 2, Math.max(r.y, 0) + 3, r.x + 2, Math.min(r.y + r.h, h) - 3, Q({ width: 4, ms: 420, color: pal.calm }));
  }

  /* ── Crochets ── */
  /* Nouvelle mission / puzzle / défi / scénario : ce qui vient du précédent est coupé net — seulement
     sur son écran (un « resize » sur l'accueil relance ces fonctions sur des écrans cachés). */
  function cut(id) { return function () { if (on(id)) FX.bump('q'); }; }
  FX.wrap('loadDrawMission', null, cut('draw'));
  FX.wrap('loadPuzzle', null, cut('puzzle'));
  FX.wrap('newPythChallenge', null, cut('pythagore'));
  FX.wrap('loadProbaScenario', null, cut('proba-tree'));
  FX.wrap('loadGraphChallenge', null, cut('graph-reader'));

  /* Tracé : vraie validation = drawState.validated passe à vrai ; note = écart de drawState.score. */
  FX.wrap('validateDraw', function () { return drawState.validated ? -1 : drawState.score; }, function (s) {
    if (s >= 0 && drawState.validated) send('trace', 'draw', { n: drawState.score - s });
  });
  /* Tracé et Puzzle n'ont pas d'écran de résultat : un toast puis l'accueil, dans le même appel. */
  FX.wrap('nextDrawMission', function () { return drawState.missionIdx; }, function (i) {
    if (i === DRAW_MISSIONS.length - 1) send('fin', 'home', { m: 'tracé' });
  });
  FX.wrap('nextPuzzle', function () { return puzzleState.idx; }, function (i) {
    if (i === PUZZLES.length - 1) send('fin', 'home', { m: 'puzzle' });
  });
  /* Puzzle : pièce posée dans une case libre qui l'attendait (même test que le jeu, fait avant lui). */
  FX.wrap('dropOnSlot', function (piece, slot) {
    return !slot.dataset.filled && slot.dataset.correct === piece.dataset.value;
  }, function (ok, a) {
    if (ok) send('pose', 'puzzle', { el: a[1] });
  });
  /* Verdict du puzzle (paires, tri, temps écoulé) : front de puzzleState.validated. */
  function avP() { return puzzleState.validated ? -1 : puzzleState.score; }
  function apP(s) { if (s >= 0 && puzzleState.validated) send('puzzle', 'puzzle', { n: puzzleState.score - s }); }
  FX.wrap('validateMatchPuzzle', avP, apP);
  FX.wrap('validateSortPuzzle', avP, apP);
  FX.wrap('autoValidatePuzzle', avP, apP);

  /* Constructeur : réussite = challengeAnswered passe à vrai (jamais les classes du message, qui se
     cumulent) ; changement d'onglet = l'atelier change vraiment (init et resize repassent le même). */
  FX.wrap('validatePythChallenge', function () {
    return !pythState.challengeAnswered && !!pythState.challenge;
  }, function (vif) {
    if (vif) send('defi', 'pythagore', { ok: pythState.challengeAnswered });
  });
  FX.wrap('selectPythAtelier', function () { return pythState.atelier; }, function (avant, a) {
    if (a[0] !== avant) send('onglet', 'pythagore', { k: a[0] });
  });

  /* Arbre : pose = la case reçoit une autre pièce ; validation = front de probaState.validated (la
     fonction n'a aucun garde : un double clic la rejoue). probaState est réassigné : jamais en cache. */
  FX.wrap('placeProbaPiece', function (id) {
    var p = probaState.placements[id];
    return p ? p.pieceIdx : -1;
  }, function (avant, a) {
    if (avant !== a[1]) send('ppose', 'proba-tree', { id: a[0] });
  });
  FX.wrap('validateProbaPlacement', function () { return probaState.validated; }, function (v) {
    if (!v && probaState.validated) send('arbre', 'proba-tree');
  });
  FX.wrap('answerProbaQuestion', function () {
    var p = probaState;
    return p.questionAnswered ? -1 : (p.currentQuestion || PROBA_SCENARIOS[p.scenarioIdx].question).correct;
  }, function (c, a) {
    if (c >= 0) send('pq', 'proba-tree', { ok: a[0] === c, i: a[0] });
  });
  /* Graphique : le premier argument de finalizeGraphAnswer est l'issue. */
  FX.wrap('finalizeGraphAnswer', null, function (x, a) {
    send('graph', 'graph-reader', { ok: !!a[0], n: graphState.combo });
  });
  /* Résultats : « après » de la fonction — l'écran de résultat est affiché une fois rempli. */
  FX.wrap('endProbaTree', null, function () { send('bilan', 'proba-tree-result', { m: 'proba' }); });
  FX.wrap('endGraphReader', null, function () { send('bilan', 'graph-reader-result', { m: 'graph' }); });
  /* Stats : à l'arrivée seulement (renderStats tourne aussi quand l'écran est déjà affiché). */
  FX.wrap('showStatsScreen', function () { return !on('stats'); }, function (arrive) {
    if (arrive) send('stats', 'stats');
  });

  /* ── Tracé : réussi → la lumière court sur le cadre du canvas et la note est « tamponnée » près de
        l'explication ; sinon (dont la mission 1, toujours) un simple repère vers l'explication ── */
  H.trace = function (d) {
    var ok = d.n >= 70;
    FX.play(ok ? 'trace-juste' : 'trace-presque', function (lv, pal) {
      var c = vu('#draw-canvas');
      if (!ok) { guide('#draw-feedback', pal); return; }
      if (c) tour(c, d.n > 99 ? 28 : 16, pal.good);
      mention((d.n > 99 ? '🎯 ' : '✔ ') + d.n + ' %', pal.good, '#draw-feedback', c, { cls: 'fx-at-stamp', rotate: -8, dy: 0 });
    }, { info: d.n });
  };

  /* ── Pose d'une pièce : un petit anneau sur la case, dessiné sur le calque (le contenu de la case
        est re-généré par le jeu). Puzzle : seulement la bonne case — une mauvaise n'a rien de plus que
        le jeu. Arbre : anneau neutre, aucun indice de justesse avant « VÉRIFIER ». ── */
  function pose(nom, el, c) {
    if (vu(el)) FX.play(nom, function (lv, pal) { anneau(el, pal[c]); });
  }
  H.pose = function (d) { pose('puzzle-pose', d.el, 'good'); };
  H.ppose = function (d) {
    var l = D.querySelectorAll('.proba-slot'), i;
    for (i = 0; i < l.length; i++) if (l[i].dataset.slot === d.id) pose('proba-pose', l[i], 'calm');
  };

  /* ── Verdict du puzzle : résolu (le panneau n'a pas la classe d'erreur) → anneaux en file sur les
        pièces, éclat au-dessus du plateau, points ; tri à revoir ou temps écoulé → repère calme ── */
  H.puzzle = function (d) {
    var ok = D.getElementById('puzzle-feedback').className === 'feedback-panel';
    FX.play(ok ? 'puzzle-resolu' : d.n ? 'puzzle-revoir' : 'puzzle-temps', function (lv, pal) {
      var l = D.querySelectorAll('.puzzle-slot.correct, #sort-zone .puzzle-piece'), a = vu('#puzzle-game-area'), i;
      if (!ok) { guide('#puzzle-feedback', pal); return; }
      for (i = 0; i < l.length && i < 8; i++) FX.after(i * 70, anneau.bind(null, l[i], pal.good), 'q');
      if (a) F.burst(a.cx, a.y, Q({ n: 22, kind: 'star', angle: -PI / 2, spread: PI, colors: [pal.u, pal.warn] }));
      mention('+' + d.n + ' pts', pal.warn, '#puzzle-score-display', a);
    }, { info: d.n });
  };
  /* Dernière mission / dernier puzzle : l'accueil est déjà affiché. */
  H.fin = function (d) {
    FX.play('atelier-fin', function (lv, pal) {
      F.banner(d.m === 'puzzle' ? 'PUZZLES TERMINÉS !' : 'MISSIONS TERMINÉES !', { emoji: '🏆', color: pal.warn, ms: 1100 });
      F.confetti({ n: 30, ms: 1100, min: 2 });
    }, { info: d.m });
  };

  /* ── Constructeur : défi réussi → lumière sur le cadre du canvas (ou du message s'il est seul à
        l'écran : téléphone) ; essai manqué → repère calme, au plus un par 1,5 s (bouton martelable) ── */
  H.defi = function (d) {
    var n = now();
    if (!d.ok && n - frein < 1500) return;
    frein = n;
    FX.play(d.ok ? 'defi-juste' : 'defi-encore', function (lv, pal) {
      var c = vu('#pyth-canvas') || vu('#pyth-challenge-feedback');
      if (!d.ok) { guide('#pyth-challenge-feedback', pal); return; }
      if (c) tour(c, 24, pal.good);
      mention('+40 XP', pal.warn, '#pyth-challenge-feedback', c);
    });
  };
  /* Changement d'atelier : un trait sous l'onglet, la figure arrive en fondu. */
  H.onglet = function (d) {
    FX.play('atelier-onglet', function (lv, pal) {
      var t = vu('#screen-pythagore .chapter-tab.active');
      if (t) F.slash(t.x + 8, t.y + t.h, t.x + t.w - 8, t.y + t.h, Q({ width: 3, color: pal.u }));
      FX.anim('#pyth-canvas', FADE, { duration: 200, scope: 'q' });
    }, { info: d.k });
  };

  /* ── Arbre validé : la lumière descend branche par branche (départ → 1er tirage → 2e tirage), sur
        le calque ; fini à 0,9 s — le jeu masque l'arbre 1,5 s après la validation. Niveau léger : les
        anneaux seuls. Un arbre à corriger : rien de plus que le jeu. ── */
  H.arbre = function () {
    FX.play('proba-arbre', function (lv, pal) {
      var l = D.querySelectorAll('.proba-slot'), i;
      function branche(i) {
        var r = vu(l[i]), p = vu(i < 2 ? '.proba-root' : l[i < 4 ? 0 : 1]);
        if (r && p) F.slash(p.cx, p.cy, r.cx, r.cy, Q({ min: 2, width: 3, ms: 280, color: pal.u }));
        FX.after(180, anneau.bind(null, l[i], pal.good), 'q');
      }
      for (i = 0; i < l.length && i < 6; i++) FX.after(i < 2 ? 0 : 340, branche.bind(null, i), 'q');
      mention('+40 XP', pal.warn, '#proba-placement-feedback');
    });
  };
  /* Question finale du scénario. */
  H.pq = function (d) {
    FX.play(d.ok ? 'proba-juste' : 'proba-erreur', function (lv, pal) {
      if (!d.ok) { guide('#proba-question-feedback', pal); return; }
      eclat(vu(D.querySelectorAll('#proba-question-answers .answer-btn')[d.i]), pal);
      mention('+50 XP', pal.warn, '#proba-question-feedback');
    });
  };

  /* ── Graphique : juste → anneau sur le point choisi (ou lumière sur le cadre s'il sort du repère
        dessiné, cas fréquent hérité ; ou éclat sur la réponse du QCM) ; faux → un anneau calme se
        referme sur le point attendu, que le jeu vient de donner, puis repère vers l'explication ── */
  H.graph = function (d) {
    FX.play(d.ok ? 'graph-juste' : 'graph-erreur', function (lv, pal) {
      var g = graphState, c = g.current, v = vu('#graph-canvas'), r = FX.rect('#graph-canvas'), k = r && r.w / (g.W || r.w),
        m = v && c.mode === 'click' && (d.ok ? g.clickedPoint : c.target),
        x = m && r.x + (g.origin.x + m.x * g.scale) * k, y = m && r.y + (g.origin.y - m.y * g.scale) * k;
      if (!m || x < r.x + 6 || x > r.x + r.w - 6 || y < v.y + 6 || y > v.y + v.h - 6) m = 0;     // hors du canvas visible
      if (!d.ok) {
        if (m) F.ring(x, y, Q({ r0: 30, r1: 8, ms: 560, color: pal.calm }));
        guide('#graph-feedback', pal);
        return;
      }
      if (m) F.ring(x, y, Q({ r0: 8, r1: 34, width: 4, color: pal.good }));
      else if (c.mode === 'qcm') eclat(vu('#graph-qcm-answers .answer-btn.correct'), pal);
      else if (v) tour(v, 16, pal.good);
      mention('+' + (30 + 5 * d.n) + ' XP', pal.warn, '#graph-feedback', v);
    }, { info: '×' + d.n });
  };

  /* ── Résultats (arbre, graphique) : fête proportionnelle au palier ; le plus bas reçoit une
        étincelle douce. ≤ 1,4 s (léger : ≤ 1,1 s). ── */
  H.bilan = function (d) {
    var e = D.getElementById(d.m + '-result-emoji'), k = TIER[e.textContent] || 0;
    FX.play('bilan-' + d.m, function (lv, pal) {
      var r = vu(e), x = r ? r.cx : FX.vw() / 2, y = r ? r.cy : 110;
      FX.anim(e, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)', leger: FADE });
      FX.after(260, function () {
        F.ring(x, y, { r1: 58, width: 2 + k, color: k ? pal.u : pal.calm });
        F.burst(x, y, { n: 7 + 11 * k, kind: 'star', speed: 80 + 60 * k, life: 800, gravity: k ? 120 : -50, colors: k ? pal.set : [pal.warn] });
        if (k > 1) F.confetti({ n: 36 * k - 48, ms: 1100, min: 2 });
      });
    }, { info: 'palier ' + k });
  };

  /* ── Stats : les barres poussent une fois à l'arrivée (WAAPI finie, « fill backwards » : visibles
        par elles-mêmes si la couche tombe) ; chiffres et libellés ne bougent pas ── */
  H.stats = function () {
    var l = D.querySelectorAll('.stats-bar-fill'), i;
    if (l.length) FX.play('stats', function () {
      for (i = 0; i < l.length && i < 16; i++) {
        FX.anim(l[i], [{ transform: 'scaleX(0)', transformOrigin: '0 50%' }, { transform: 'none', transformOrigin: '0 50%' }],
          { duration: 420, delay: 160 + 40 * i, leger: FADE, name: 'fx-barre' });
      }
    }, { info: l.length });
  };
});
