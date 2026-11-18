/* ═══ 50-interactive.js — module « ateliers » : Tracé, Puzzle, Constructeur (Pythagore / Thalès /
   Trigo), Arbre de probabilités, Lecteur de graphique, écran Stats ═══
   Profil « atelier » : le joueur manipule un canvas ou fait glisser des pièces. Rien ne joue pendant
   le geste (aucun crochet sur un chemin chaud : render*, draw*, handle*Move, glisser-déposer) ; les
   effets partent d'un front de validation, restent sur le CADRE de la zone de travail ou sur le bord
   des blocs de texte, et durent ≤ 700 ms (arbre validé : ≤ 1 s ; résultats : ≤ 2 s, léger ≤ 1,1 s).
   Crochets en O(1) : quelques champs d'état lus avant / après l'appel, puis UNE place dans la file
   par frame (seule la dernière issue compte). L'issue se lit sur un front d'état, jamais sur le
   simple appel : plusieurs validate* se martèlent ou sortent tôt, et les écouteurs « resize » du jeu
   relancent init* / load* / new* / select* (même écran caché) — un appel n'est pas une action du
   joueur. Chaque effet vérifie l'écran courant ET son affichage réel : le chrono du puzzle n'est pas
   arrêté par « Retour accueil » et sonne plus tard sur un autre écran (défaut hérité, ni corrigé ni
   masqué, comme la mission 1 du Tracé qui ne peut pas réussir, ou le toucher du graphique).
   Une erreur n'est jamais punie : un repère calme vers l'explication, et c'est tout.
   Journal (FX.debug.log) — verdicts « nom-juste » / « nom-erreur » :
     trace-*[note]      validateDraw            cadre du canvas illuminé + note tamponnée | repère calme
     puzzle-pose        dropOnSlot              anneau sur la bonne case (rien pour une mauvaise case)
     puzzle-*[xp]       validate*Puzzle, chrono anneaux sur les cases + éclat + XP | repère calme
     defi-*             validatePythChallenge   cadre du canvas (ou du message) + XP | repère calme (1 / 1,5 s)
     atelier-onglet[k]  selectPythAtelier       la figure arrive en fondu
     proba-pose         placeProbaPiece         anneau neutre sur la branche
     arbre-juste        validateProbaPlacement  la lumière descend branche par branche (rien si à corriger)
     proba-*            answerProbaQuestion     anneau sur la bonne réponse + XP | repère calme
     graph-*[×combo]    finalizeGraphAnswer     anneau sur le point (ou cadre, ou réponse du QCM) + XP |
                                                anneau calme sur le point attendu + repère
     bilan-proba[palier], bilan-graph[palier]   endProbaTree / endGraphReader : fête selon le palier (0 à 3)
     atelier-fin[texte] nextDrawMission / nextPuzzle au bout : bandeau sur l'en-tête de l'accueil
     stats[n]           showStatsScreen         les n barres poussent une fois */
FX.module('ateliers', function (FX) {
  var D = document, F = FX.fx, FADE = [{ opacity: 0 }, { opacity: 1 }];
  var H = {}, last, tok, at = -1e3, frein = at;

  function on(id) { return FX.env.screen() === id; }
  function Q(o) { o.scope = 'q'; return o; }

  /* Issue d'un geste : t = moment, s = écran où il se joue (rien n'est émis depuis un autre écran :
     minuteries fantômes), v = sa valeur (note, XP gagnés, case…). Une seule place dans la file du
     noyau par frame ; à la frame, l'issue est ignorée si la mission / le défi a changé (jeton de la
     portée « q ») ou si l'écran n'est pas réellement affiché ; sinon elle remplace ce qui jouait
     encore (un seul repère à la fois). */
  function send(t, s, v) {
    var n = performance.now();
    if (!on(s)) return;
    last = { t: t, s: s, v: v }; tok = FX.token('q');
    if (n - at > 100 && FX.emit('at:ev', 0, null)) at = n;
  }
  FX.on('at:ev', function () {
    var d = last;
    last = 0; at = -1e3;
    if (d && tok === FX.token('q') && on(d.s) && FX.env.visible(d.s)) { FX.cancel('q'); H[d.t](d.v); }
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
  /* Lumière qui court le long du cadre d'un bloc : deux traits (haut, bas) et n étincelles sur le
     pourtour — jamais à l'intérieur (zone de travail ou de lecture). Renvoie le cadre, null s'il
     n'est pas à l'écran (rien n'est alors joué). */
  function tour(t, n, c) {
    var r = vu(t), x, y, X, Y;
    if (!r) return r;
    x = r.x - 2; y = r.y - 2; X = x + r.w + 4; Y = y + r.h + 4;
    F.slash(x, y, X, y, Q({ width: 3, ms: 420, color: c }));
    F.slash(X, Y, x, Y, Q({ width: 3, ms: 420, color: c }));
    F.trail([[x, Y], [x, y], [X, y], [X, Y], [x, Y]], Q({ n: n, size: 4, color: c, jitter: 3, stagger: 200 }));
    return r;
  }
  /* Anneau sur un élément (case, pièce) s'il est visible. */
  function anneau(el, c) {
    var r = vu(el);
    if (r) F.ring(r.cx, r.cy, Q({ r0: 8, r1: Math.min(r.w, r.h) * 0.62, color: c }));
  }
  /* Anneau bref autour de la lettre de la bonne réponse choisie (QCM), jamais sur son texte. */
  function eclat(sel, c) {
    var b = vu(sel);
    if (b) F.ring(b.x + 27, b.cy, Q({ r0: 12, r1: 25, color: c }));
  }
  /* Verdict d'un atelier (journal : nom-juste / nom-erreur).
     Réussi : dessin propre au mode (fn) puis mention « tamponnée » posée sur le coin haut droit de
     l'explication, si ce coin est à l'écran — 7 px au-dessus du bord : elle mord sur la marge
     intérieure du bloc (≥ 10 px), jamais sur son texte.
     Sinon : repère calme vers l'explication — un trait descend le long de son bord gauche ; si elle
     s'ouvre sous le bas de l'écran, un 👇 immobile dans le coin bas droit (0,7 s ; portée « cue » du
     noyau : retiré au premier défilement). */
  function verdict(nom, ok, fb, txt, fn, info) {      // txt : nombre = XP donnés par le jeu (« +n XP »), sinon texte
    FX.play(nom + (ok ? '-juste' : '-erreur'), function (lv, pal) {
      var r = FX.rect(fb), v = vu(fb), h = FX.vh(), y = r && r.y;
      if (ok) {
        fn(pal.good, pal);
        if (y > 76 && y < h - 24) F.float(txt === +txt ? '+' + txt + ' XP' : txt, r.x + r.w - 44, y - 7, Q({ cls: 'fx-at-stamp', color: pal.good, size: 16, rotate: -6, dy: 0 }));
      } else if (v) F.slash(v.x + 2, v.y + 3, v.x + 2, v.y + v.h - 3, Q({ width: 4, ms: 420, color: pal.calm }));
      else if (y > h - 40) F.float('👇', FX.vw() - 30, h - 40, { size: 24, dy: 0, scope: 'cue' });
    }, { info: info });
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
    if (s >= 0 && drawState.validated) send('trace', 'draw', drawState.score - s);
  });
  /* Tracé et Puzzle n'ont pas d'écran de résultat : un toast puis l'accueil, dans le même appel. */
  FX.wrap('nextDrawMission', null, function () {
    if (drawState.missionIdx === DRAW_MISSIONS.length) send('fin', 'home', 'MISSIONS TERMINÉES !');
  });
  FX.wrap('nextPuzzle', null, function () {
    if (puzzleState.idx === PUZZLES.length) send('fin', 'home', 'PUZZLES TERMINÉS !');
  });
  /* Puzzle : pièce posée dans la bonne case = la case entre dans puzzleState.placements (une mauvaise
     case ou une case déjà prise n'y entre pas : rien de plus que ce que montre le jeu). */
  FX.wrap('dropOnSlot', function (piece, slot) { return puzzleState.placements[slot.id]; }, function (pris, a) {
    if (!pris && puzzleState.placements[a[1].id]) send('pose', 'puzzle', a[1]);
  });
  /* Verdict du puzzle (paires, tri, temps écoulé) : front de puzzleState.validated ; valeur = XP donnés
     par le jeu pendant l'appel (0 pour un tri à revoir ou au temps écoulé : pas résolu). */
  function avP() { return puzzleState.validated ? -1 : state.xp; }
  function apP(x) { if (x >= 0 && puzzleState.validated) send('puzzle', 'puzzle', state.xp - x); }
  FX.wrap('validateMatchPuzzle', avP, apP);
  FX.wrap('validateSortPuzzle', avP, apP);
  FX.wrap('autoValidatePuzzle', avP, apP);

  /* Constructeur : réussite = challengeAnswered passe à vrai (jamais les classes du message, qui se
     cumulent) ; un essai manqué se martèle : au plus un repère par 1,5 s. Changement d'onglet =
     l'atelier change vraiment (init et resize repassent le même). */
  FX.wrap('validatePythChallenge', function () {
    return pythState.challenge && !pythState.challengeAnswered ? state.xp : -1;
  }, function (x) {
    var ok = pythState.challengeAnswered, n = performance.now();
    if (x >= 0 && (ok || n - frein > 1500)) { frein = n; send('defi', 'pythagore', ok && state.xp - x); }
  });
  FX.wrap('selectPythAtelier', function () { return pythState.atelier; }, function (avant, a) {
    if (a[0] !== avant) send('onglet', 'pythagore', a[0]);
  });

  /* Arbre : pose = la case reçoit une autre pièce ; validation = front de probaState.validated (la
     fonction n'a aucun garde : un double clic la rejoue) ; question = front de questionAnswered.
     probaState est réassigné par le jeu : jamais en cache.
     Valeur d'un verdict réussi = les XP que le jeu a réellement donnés pendant l'appel (écart de state.xp,
     comme pour le puzzle) : la mention « +n XP » ne recopie aucun montant de classique.html. false = raté. */
  FX.wrap('placeProbaPiece', function (id) {
    var p = probaState.placements[id];
    return p ? p.pieceIdx : -1;
  }, function (avant, a) {
    if (avant !== a[1]) send('ppose', 'proba-tree', a[0]);
  });
  function xpAv(k) { return function () { return probaState[k] ? -1 : state.xp; }; }
  FX.wrap('validateProbaPlacement', xpAv('validated'), function (x) {
    if (x >= 0 && probaState.validated) send('arbre', 'proba-tree', state.xp - x);
  });
  FX.wrap('answerProbaQuestion', xpAv('questionAnswered'), function (x) {
    var p = probaState;
    if (x >= 0 && p.questionAnswered) send('pq', 'proba-tree', p.scenarioCorrect[p.scenarioIdx] === true && state.xp - x);
  });
  /* Graphique : le premier argument de finalizeGraphAnswer est l'issue. */
  FX.wrap('finalizeGraphAnswer', function () { return state.xp; }, function (x, a) {
    send('graph', 'graph-reader', !!a[0] && state.xp - x);
  });
  /* Résultats : « après » de la fonction — l'écran de résultat est affiché une fois rempli. */
  FX.wrap('endProbaTree', null, function () { send('bilan', 'proba-tree-result', 'proba'); });
  FX.wrap('endGraphReader', null, function () { send('bilan', 'graph-reader-result', 'graph'); });
  /* Stats : à l'arrivée seulement (renderStats tourne aussi quand l'écran est déjà affiché). */
  FX.wrap('showStatsScreen', function () { return !on('stats'); }, function (arrive) {
    if (arrive) send('stats', 'stats');
  });

  /* ── Tracé : réussi → la lumière court sur le cadre du canvas et la note est tamponnée ; sinon
        (dont la mission 1, toujours) le repère vers l'explication ── */
  H.trace = function (n) {
    verdict('trace', n >= 70, '#draw-feedback', '✔ ' + n + ' %', function (c) {
      tour('#draw-canvas', 24, c);
    }, n);
  };

  /* ── Pose d'une pièce : un petit anneau sur la case, dessiné sur le calque (le contenu de la case
        est re-généré par le jeu). Puzzle : seulement la bonne case. Arbre : anneau neutre, aucun
        indice de justesse avant « VÉRIFIER ». ── */
  function pose(nom, el, c) {
    if (vu(el)) FX.play(nom, function (lv, pal) { anneau(el, pal[c]); });
  }
  H.pose = function (el) { pose('puzzle-pose', el, 'good'); };
  H.ppose = function (id) { pose('proba-pose', D.querySelector('.proba-slot[data-slot="' + id + '"]'), 'calm'); };

  /* ── Verdict du puzzle : résolu → anneaux en file sur les cases, éclat au-dessus du plateau, XP ;
        tri à revoir ou temps écoulé → repère calme ── */
  H.puzzle = function (n) {
    verdict('puzzle', n, '#puzzle-feedback', n, function (c, pal) {
      var l = D.querySelectorAll('.puzzle-slot.correct'), a = vu('#puzzle-game-area'), i;
      for (i = 0; i < l.length; i++) FX.after(i * 70, anneau.bind(null, l[i], c), 'q');
      if (a) F.burst(a.cx, a.y, Q({ n: 22, kind: 'star', angle: -1.57, spread: 3.14, colors: [pal.u, pal.warn] }));
    }, n);
  };
  /* Dernière mission / dernier puzzle : l'accueil est déjà affiché. Le bandeau se pose sur l'en-tête
     (collant sur l'accueil), jamais sur le titre ni sur l'accroche. */
  H.fin = function (txt) {
    FX.play('atelier-fin', function (lv, pal) {
      F.head(txt, { emoji: '🏆', color: pal.warn, ms: 1100 });
    }, { info: txt });
  };

  /* ── Constructeur : défi réussi → lumière sur le cadre du canvas (ou du message s'il est seul à
        l'écran : téléphone) ; essai manqué → repère calme ── */
  H.defi = function (xp) {
    verdict('defi', xp !== false, '#pyth-challenge-feedback', xp, function (c) {
      if (!tour('#pyth-canvas', 24, c)) tour('#pyth-challenge-feedback', 24, c);
    });
  };
  /* Changement d'atelier : la nouvelle figure arrive en fondu (200 ms), rien d'autre. */
  H.onglet = function (k) {
    FX.play('atelier-onglet', function () {
      FX.anim('#pyth-canvas', FADE, { duration: 200, scope: 'q' });
    }, { info: k });
  };

  /* ── Arbre validé : la lumière descend branche par branche (départ → 1er tirage → 2e tirage), sur
        le calque ; fini à 0,9 s — le jeu masque l'arbre 1,5 s après la validation. Niveau léger : les
        anneaux seuls. Un arbre à corriger : rien de plus que le jeu. ── */
  H.arbre = function (xp) {
    verdict('arbre', 1, '#proba-placement-feedback', xp, function (c, pal) {
      var l = D.querySelectorAll('.proba-slot'), i;
      function branche(i) {
        var r = vu(l[i]), p = vu(i < 2 ? '.proba-root' : l[i < 4 ? 0 : 1]);
        if (r && p) F.slash(p.cx, p.cy, r.cx, r.cy, Q({ min: 2, width: 3, ms: 280, color: pal.u }));
        FX.after(180, anneau.bind(null, l[i], c), 'q');
      }
      for (i = 0; i < l.length; i++) FX.after(i < 2 ? 0 : 340, branche.bind(null, i), 'q');
    });
  };
  /* Question finale du scénario. */
  H.pq = function (xp) {
    verdict('proba', xp !== false, '#proba-question-feedback', xp, function (c) {
      eclat('#proba-question-answers .correct', c);
    });
  };

  /* ── Graphique : juste → anneau sur le point choisi (ou lumière sur le cadre s'il sort du repère
        dessiné, cas fréquent hérité ; ou éclat sur la réponse du QCM) ; faux → un anneau calme se
        referme sur le point attendu, que le jeu vient de donner, puis repère vers l'explication.
        Rien ne dépend du toucher du canvas (inopérant sur écran tactile, défaut hérité). ── */
  H.graph = function (xp) {
    var g = graphState, n = xp === false ? 0 : g.combo, c = g.current, v = vu('#graph-canvas'), r = FX.rect('#graph-canvas'), k = r && r.w / g.W,
      m = v && c.mode === 'click' && (n ? g.clickedPoint : c.target), p = m && mathToPx(m.x, m.y),
      x = m && r.x + p.x * k, y = m && r.y + p.y * k;
    m = m && y > v.y + 6 && y < v.y + v.h - 6;                 // le point est dans la partie visible du canvas
    verdict('graph', n, '#graph-feedback', xp, function (col) {
      if (m) F.ring(x, y, Q({ r0: 8, r1: 34, width: 4, color: col }));
      else if (c.mode === 'qcm') eclat('#graph-qcm-answers .correct', col);
      else tour('#graph-canvas', 16, col);
    }, '×' + n);
    if (m && !n) F.ring(x, y, Q({ r0: 30, r1: 8, ms: 560, color: FX.palette().calm }));
  };

  /* ── Résultats (arbre, graphique) : l'émoji du palier arrive, puis fête proportionnelle au palier
        écrit par le jeu (💪 🥷 ⭐ 🏆 : 8 à 44 étoiles, confettis pour les deux plus hauts) ; ≤ 2 s (léger :
        ≤ 1,1 s). Le jeu affiche l'écran depuis le haut ; si l'émoji n'est pourtant pas à l'écran (page qui
        défile encore), rien ne joue : ces deux écrans sont hors de #app, l'en-tête est sorti avec lui, et
        un effet de résultat ne se pose jamais sur un texte du résultat. ── */
  H.bilan = function (m) {
    var e = D.getElementById(m + '-result-emoji'), k = Math.max(0, ['💪', '🥷', '⭐', '🏆'].indexOf(e.textContent));
    FX.play('bilan-' + m, function (lv, pal) {
      var r = FX.seen(e);
      if (!r) return;
      FX.anim(e, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 120, easing: 'cubic-bezier(.2,1.5,.4,1)', leger: FADE });
      FX.after(360, function () {
        F.ring(r.cx, r.cy, { r1: 58, color: pal.u });
        F.burst(r.cx, r.cy, { n: 8 + 12 * k, kind: 'star', speed: 90 + 50 * k, life: 700, colors: pal.set });
        if (k > 1) F.confetti({ n: 36 * k - 48, ms: 1100, min: 2 });
      });
    }, { info: k });
  };

  /* ── Stats : les barres poussent une fois à l'arrivée (WAAPI finie, « fill backwards » : visibles
        par elles-mêmes si la couche tombe) ; chiffres et libellés ne bougent pas ── */
  H.stats = function () {
    var l = D.querySelectorAll('.stats-bar-fill'), i;
    if (l.length) FX.play('stats', function () {
      for (i = 0; i < l.length; i++) {
        FX.anim(l[i], [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }], { duration: 420, delay: 160 + 40 * i, leger: FADE });
      }
    }, { info: l.length });
  };
});
