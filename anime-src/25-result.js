/* ═══ 25-result.js — module « verdict » : cérémonie du rang (écran de résultat du QCM) + carte VS ═══
   Crochet : « après » d'endGame (pas showScreen : l'écran est affiché AVANT d'être rempli).
   Les chiffres (score, réponses, combo) restent visibles tout de suite : ce sont des textes à lire.
   Le rang, lui, se mérite : les cinq émojis de RANKS forment des marches, une lumière les gravit
   jusqu'au rang obtenu, puis le vrai #result-rank arrive avec un éclat ; confettis et feux
   proportionnels au pourcentage ; les trophées sortent un par un.
   Les nœuds du JEU ne reçoivent que des animations WAAPI finies (fill « backwards ») : si la
   couche tombe ou si le joueur appuie (toute touche / tout appui passe la cérémonie), ils sont
   visibles par eux-mêmes, dans l'état exact de classique.html.
   Le rang le plus bas reçoit une étincelle douce, jamais une moquerie.
   Un effet de résultat ne se pose JAMAIS sur un texte du résultat. Le jeu affiche l'écran depuis le haut
   (rang sous l'en-tête) : la cérémonie se joue à la place du rang. Si le rang n'est pourtant pas à l'écran
   (fenêtre minuscule, zoom très fort), elle se réduit à UN moment sur l'en-tête collant — le rang et son
   titre en bandeau, un éclat parti de la ligne de l'en-tête (≤ 1,2 s ; léger ≤ 0,6 s) — et aucun nœud du
   jeu n'est retenu : chiffres, trophées et boutons sont là tout de suite. */
FX.module('verdict', function (FX) {
  var D = document, W = window, PI = Math.PI, last = '', lastT = 0, live = false, F = FX.fx;
  var BACK = 'cubic-bezier(.2,1.5,.4,1)';

  function $(id) { return D.getElementById(id); }
  /* Centre d'un nœud d'après la mise en page (insensible au glissement d'arrivée de l'écran). */
  function centre(n) {
    var x = 0, y = 0, e = n;
    while (e) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x: x - W.pageXOffset + n.offsetWidth / 2, y: y - W.pageYOffset + n.offsetHeight / 2 };
  }

  /* endGame peut tourner deux fois (minuterie du boss) : même signature dans les 3 s = ignoré. */
  FX.wrap('endGame', null, function () {
    var s = state, total = s.infiniteChapter ? (s.attempted || 0) : s.questions.length,
        pct = total > 0 ? s.correct / total * 100 : 0, ri = 0, i, t = performance.now(),
        sig = [s.mode, s.correct, total, s.score].join('|');
    if (sig === last && t - lastT < 3000) return;
    for (i = 0; i < RANKS.length; i++) if (pct >= RANKS[i].min) ri = i;
    if (FX.emit('qcm:bilan', { ri: ri, pct: pct, ko: !!s.bossMode && s.hp <= 0 })) { last = sig; lastT = t; }
  });

  FX.on('qcm:bilan', function (d) {
    var rank = $('result-rank'), msg = $('result-msg'), quote = $('result-quote');
    if (!rank || !FX.env.visible('result')) return;          // le joueur est déjà reparti
    /* Le bandeau de combo du jeu traîne jusqu'à 1,2 s après la dernière réponse, au-dessus du calque :
       masqué pendant le verdict (même règle CSS que pour l'arène ; recalculé à la partie suivante). */
    D.documentElement.setAttribute('data-fx-combo-off', '');
    live = FX.play('bilan', function (lv, pal) {
      var full = lv > 1, doux = d.ko || d.ri === 0, ranks = FX.game.uni() ? FX.game.uni().ranks : [],
          T = !full ? 0 : d.ko ? 300 : 280 + 140 * d.ri + 180, list = D.querySelectorAll('#trophies-list .trophy'),
          hd = FX.rect('header'), o = centre(rank), hh = rank.offsetHeight, x = o.x, y = o.y, n = doux ? 7 : [0, 18, 26, 36, 48][d.ri] || 18,
          lad, i, tok;
      if (!(y > (hd && hd.inView ? hd.y + hd.h : 0) + 10 && y < FX.vh() - 10)) {
        /* Rang hors champ : un seul moment, sur l'en-tête (rien si l'en-tête est sorti lui aussi) — le rang,
           avec son titre seulement si le titre écrit par le jeu n'est pas lui-même à l'écran. */
        if (ranks[d.ri]) {
          F.head(FX.seen(msg) ? '' : ranks[d.ri].title, { emoji: ranks[d.ri].emoji, color: doux ? pal.calm : pal.u, colors: doux ? 0 : pal.set, n: n, ms: full ? 1100 : 600 });
        }
        FX.after(full ? 1100 : 600, function () { live = false; });
        return;
      }
      if (full) {
        /* Échelle des rangs : la lumière monte d'une marche toutes les 140 ms. */
        if (!d.ko && ranks.length && (lad = FX.node('fx-ladder'))) {
          lad.style.left = x + 'px'; lad.style.top = y + 'px';
          for (i = 0; i < ranks.length; i++) {
            tok = FX.el('span', 'fx-rung', lad, ranks[i].emoji);
            if (i <= d.ri) {
              FX.anim(tok, [{ opacity: 0.3, transform: 'none', filter: 'grayscale(1)' }, { opacity: 1, transform: 'scale(1.5)', filter: 'none', offset: 0.6 },
                            { opacity: 1, transform: 'scale(1.12)', filter: 'none' }], { duration: 220, delay: 160 + 140 * i, name: 'fx-rung' });
            }
          }
          FX.anim(lad, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, delay: T - 40, remove: true, name: 'fx-ladder' });
        }
        /* Le vrai rang attend la fin de l'ascension, puis s'abat (rang le plus bas : arrivée douce). */
        FX.anim(rank, doux ? [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }]
                           : [{ opacity: 0, transform: 'scale(3) rotate(-12deg)' }, { opacity: 1, transform: 'none' }],
                { duration: doux ? 480 : 380, delay: T, easing: doux ? 'ease-out' : BACK, name: 'bilan-rang' });
        FX.anim(msg, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: T + 140, name: 'bilan-titre' });
        FX.anim(quote, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: T + 300, name: 'bilan-citation' });
      } else FX.anim(rank, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, name: 'bilan-rang' });
      /* Trophées : un par un (les suivants patientent, invisibles, sans retarder aucun bouton). */
      for (i = 0; i < list.length; i++) {
        FX.anim(list[i], full ? [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'none' }] : [{ opacity: 0 }, { opacity: 1 }],
                { duration: full ? 260 : 160, delay: full ? T + 280 + 130 * Math.min(i, 5) : 120 + 80 * i, easing: full ? BACK : 'ease-out', name: 'bilan-trophee' });
      }
      /* L'éclat, à l'instant où le rang arrive. */
      FX.after(T, function () {
        var w = FX.vw(), k;
        if (doux) {                        // étincelle douce : quelques étoiles qui montent, une onde calme
          F.ring(x, y, { r1: hh * 0.9, ms: 600, color: pal.calm });
          F.burst(x, y + hh * 0.2, { n: n, kind: 'star', speed: 70, life: 1100, gravity: -50, spread: PI, angle: -PI / 2, color: pal.warn });
          return;
        }
        F.ring(x, y, { r1: hh * 0.9, width: 5, color: pal.u });
        F.ring(x, y, { r1: hh * 1.5, ms: 520, color: pal.c });
        F.burst(x, y, { n: n, kind: 'star', speed: 190 + 30 * d.ri, life: 700, gravity: 120, colors: pal.set });
        if (!full) return;
        F.confetti({ n: Math.round(d.pct * 0.6), ms: 950 });               // 18 à 60 selon le pourcentage
        for (k = 0; k < d.ri - 1; k++) {                                     // feux d'artifice de part et d'autre du rang : rangs 3 (deux) et 4 (trois)
          (function (k) {
            FX.after(200 + 200 * k, function () {
              var fx = x + [-1, 1, -0.62][k] * Math.min(w * 0.34, 250), fy = y - hh * [0, 0.3, 0.5][k];
              F.ring(fx, fy, { r1: 34, color: pal.set[k] });
              F.burst(fx, fy, { n: 20, kind: 'star', speed: 170, life: 700, gravity: 140, colors: pal.set });
            });
          })(k);
        }
      });
      FX.after(T + (full ? 1500 : 700), function () { live = false; });
    }, { info: 'rang ' + d.ri + (d.ko ? ' ko' : '') + ' ' + Math.round(d.pct) + ' %' });
  });

  /* Tout appui ou toute touche passe la cérémonie : état final immédiat (celui de classique.html). */
  FX.on('fx:input', function () {
    if (!live) return;
    live = false;
    if (FX.env.screen() !== 'result') return;
    FX.cancel('screen');
    FX.play('bilan-passe', function () {});
  });
  FX.onScreen('*', function () { live = false; });

  /* ── Carte « VS » pendant le chargement du QCM (1200 ms fixes côté jeu) ── */
  FX.wrap('startGame', null, function () { FX.emit('qcm:vs'); });
  FX.on('qcm:vs', function () {
    var s = FX.game.state();
    if (!s || FX.vh() < 500 || FX.env.screen() !== 'loading') return;
    FX.play('vs', function (lv, pal) {
      var n = FX.node('fx-vs'), a, v, b;
      if (!n) return;
      a = FX.el('span', '', n, pal.heroEmoji); v = FX.el('b', '', n, 'VS');
      b = FX.el('span', '', n, s.freeMode ? '🎯' : s.bossMode ? '👹' : '👾');
      if (lv < 2) { FX.anim(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, name: 'fx-vs' }); return; }
      FX.anim(a, [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: BACK, name: 'fx-vs' });
      FX.anim(b, [{ opacity: 0, transform: 'translateX(120px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: BACK, name: 'fx-vs' });
      FX.anim(v, [{ opacity: 0, transform: 'scale(3)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 240, name: 'fx-vs' });
      FX.after(420, function () {
        var r = FX.rect(v);
        if (!r) return;
        F.ring(r.cx, r.cy, { r1: 60, width: 4, color: pal.u });
        F.burst(r.cx, r.cy, { n: 14, kind: 'star', speed: 220, life: 500, gravity: 0, colors: [pal.u, pal.c] });
      });
    }, { info: s.mode });
  });
});
