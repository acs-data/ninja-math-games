/* ═══ 40-textmodes.js — module « textes » : Vrai/Faux, Histoire, Automatismes, DNB Blanc ═══
   Quatre intensités, données par le profil de l'écran (plafonds appliqués par le noyau) :
   · Vrai/Faux (duel)      : entaille du bouton vers le bord de la carte, crans de combo ; ≤ 800 ms.
   · Histoire (récit)      : page tournée à chaque étape, l'emoji du décor réagit aux bonnes réponses.
   · Automatismes (sobre)  : un contour bref (380 ms) autour de la carte de question — vert si juste,
                             bleu calme sinon — et une mention « SÉRIE ×5 » toutes les cinq bonnes
                             réponses d'affilée ; aucune particule, rien sur #auto-input ni sur la
                             ligne de correction, le focus n'est jamais touché.
   · DNB Blanc (sobre)     : contour sur la réponse, révélation discrète de la transition ;
                             la seule fête de l'épreuve est l'écran de résultat (note « tamponnée »).
   · Résultats (cérémonie) : fête proportionnelle au palier lu sur l'émoji écrit par le jeu ; ≤ 2 s.
   Crochets en O(1) (lecture de quelques champs + FX.emit, aucune lecture du DOM) ; l'issue se lit
   sur un front d'état (avant/après), jamais sur le simple appel. Chaque crochet vérifie l'écran
   courant : les minuteries « question suivante » du jeu ne sont jamais annulées et tournent encore
   sur l'accueil après un abandon — la couche n'y joue rien (et ne corrige pas ce défaut hérité).
   Une erreur n'est jamais punie : repère calme vers l'explication, et c'est tout.
   Aucun texte du jeu n'est modifié (nextStoryStep lit celui de #story-feedback-title). */
FX.module('textes', function (FX) {
  var D = document, F = FX.fx, PI = Math.PI, VU = { opacity: 1, transform: 'none' }, FADE = [{ opacity: 0 }, { opacity: 1 }];
  var TIER = { '🏆': 4, '⭐': 3, '⚡': 3, '🥷': 2, '📚': 1 };      // émoji de palier écrit par le jeu ; 💪 = 0

  function on(id) { return FX.env.screen() === id; }
  function Q(o) { o.scope = 'q'; return o; }

  /* Contour bref autour d'un élément du jeu : un nœud FX posé sur son rectangle (rien n'est écrit
     sur l'élément, rien n'est dessiné à l'intérieur). */
  function box(el, color) {
    var r = FX.rect(el), n = r && r.inView && FX.node('fx-tm-box', 'q'), s;
    if (!n) return;
    s = n.style;
    s.left = r.x - 4 + 'px'; s.top = r.y - 4 + 'px'; s.width = r.w + 8 + 'px'; s.height = r.h + 8 + 'px'; s.color = color;
    FX.anim(n, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 380, scope: 'q', remove: true, name: 'fx-tm-box' });
  }
  /* Repère calme vers l'explication : un trait qui descend le long de son bord gauche ; si elle
     s'ouvre sous le bas de l'écran, un 👇 immobile dans le coin bas droit (hors de la zone du toast),
     retiré au premier défilement (portée « cue » du noyau). */
  function guide(sel, pal, trait) {
    var r = FX.rect(sel);
    if (!r) return;
    if (r.y > FX.vh() - 40) F.float('👇', FX.vw() - 30, FX.vh() - 40, { size: 24, ms: 1800, dy: 0, scope: 'cue' });
    else if (trait) F.slash(r.x + 2, r.y + 3, r.x + 2, r.y + r.h - 3, Q({ width: 4, ms: 420, color: pal.calm }));
  }

  /* ── Crochets ── */
  /* Nouvelle question / étape : ce qui vient de la précédente est coupé net (seulement sur son écran). */
  function cut(id) { return function () { if (on(id)) FX.bump('q'); }; }
  FX.wrap('loadAutoQuestion', null, cut('auto'));
  FX.wrap('loadTfQuestion', null, cut('tf'));
  FX.wrap('loadDnbStep', null, cut('dnb-ex'));
  FX.wrap('startStoryMode', null, function () { FX.emit('tm:scene', 0, 'q'); });
  FX.wrap('loadStoryStep', null, function () {
    if (!on('story')) return;                               // l'aventure vient de se terminer
    FX.bump('q');
    FX.emit('tm:scene', storyState.stepIdx + 1, 'q');
  });
  /* Automatismes : appelable 10 fois par seconde à vide (intervalle orphelin du jeu) → deux lectures. */
  FX.wrap('submitAutoAnswer', function () {
    return autoState.answered ? -1 : autoState.history.length;
  }, function (n, a) {
    var h = n < 0 ? null : autoState.history[n];
    if (h && on('auto')) FX.emit('tm:auto', { ok: h.ok, to: a[0] === true }, 'q');
  });
  /* Vrai/Faux : answerTf(null) = temps écoulé. */
  FX.wrap('answerTf', function () {
    var t = tfState;
    return t.answered ? null : { c: t.correct, s: t.score };
  }, function (p, a) {
    var t = tfState;
    if (p && on('tf')) FX.emit('tm:tf', { ok: t.correct > p.c, v: a[0], pts: t.score - p.s, n: t.streak }, 'q');
  });
  /* Histoire et exercices du DNB : même forme (4 boutons recréés à chaque étape, explication dessous). */
  FX.wrap('answerStoryStep', function () {
    return storyState.answered ? -1 : storyState.correct;
  }, function (c, a) {
    var s = storyState;
    if (c >= 0 && on('story')) FX.emit('tm:qcm', { p: 'story', ok: s.correct > c, i: a[0], g: s.currentStep.correct }, 'q');
  });
  FX.wrap('answerDnbStep', function () {
    var s = dnbState;
    return s.exerciseAnswered ? -1 : s.exerciseCorrectByExo[s.exerciseIdx];
  }, function (c, a) {
    var s = dnbState;
    if (c >= 0 && on('dnb-ex')) FX.emit('tm:qcm', { p: 'dnb-ex', ok: s.exerciseCorrectByExo[s.exerciseIdx] > c, i: a[0], g: s.currentStep.correct }, 'q');
  });
  /* Fins de mode : « après » de la fonction (l'écran est affiché AVANT d'être rempli), et seulement
     si elle part de son écran (chaîne fantôme après un abandon) et arrive sur son résultat
     (endAutoMode bifurque vers la transition du DNB quand dnbState.active, parfois périmé). */
  function av(id) { return function () { return on(id); }; }
  function ap(m) { return function (ok) { if (ok && on(m + '-result')) FX.emit('tm:bilan', m); }; }
  FX.wrap('endAutoMode', av('auto'), ap('auto'));
  FX.wrap('endTrueFalse', av('tf'), ap('tf'));
  FX.wrap('endStoryMode', av('story'), ap('story'));
  FX.wrap('endDnbBlanc', av('dnb-ex'), ap('dnb'));

  /* ── Automatismes : contour de la carte (vert : juste ; bleu calme : à revoir) ── */
  FX.on('tm:auto', function (d) {
    FX.play(d.ok ? 'auto-juste' : d.to ? 'auto-temps' : 'auto-erreur', function (lv, pal) {
      var h = autoState.history, n = 0, r;
      box('#screen-auto .question-wrap', d.ok ? pal.good : pal.calm);
      if (!d.ok) { guide('#auto-feedback', pal); return; }
      /* Série de 5, 10, 15, 20 : petite mention à droite du compteur « Justes », loin du champ. */
      while (n < h.length && h[h.length - 1 - n].ok) n++;
      if (n % 5 === 0 && (r = FX.rect('#auto-correct')) && r.y > 90) {
        F.float('SÉRIE ×' + n, r.cx + 16, r.cy, Q({ color: pal.good, size: 15, dy: -8 }));
      }
    });
  });

  /* ── Vrai/Faux : le bouton choisi tranche vers le bord bas de la carte (jamais sur l'affirmation) ── */
  FX.on('tm:tf', function (d) {
    var c = FX.rect('#tf-card'), b = d.v === null ? null : FX.rect(d.v ? '#tf-btn-true' : '#tf-btn-false');
    if (!c) return;
    FX.play(d.ok ? 'tf-juste' : b ? 'tf-erreur' : 'tf-temps', function (lv, pal) {
      var k = Math.min(d.n, 5), y = c.y + c.h, x = b ? b.cx : c.cx, s = FX.rect(d.ok ? '#tf-streak' : '#tf-timer-num');
      if (!d.ok) {                        // le jeu secoue déjà la carte : on guide seulement vers l'explication
        if (!b && s && s.inView) F.ring(s.cx, s.cy, Q({ r0: 24, r1: 5, ms: 420, color: pal.warn }));
        guide('#tf-feedback', pal, 1);
        return;
      }
      if (b && b.inView) F.slash(x, b.cy, x, y, Q({ width: 4 + k, ms: 220, color: pal.c }));
      if (!c.inView) return;
      F.slash(c.x + 12, y, c.x + c.w - 12, y, Q({ width: 3, ms: 320, color: pal.u, min: 2 }));
      F.ring(x, y, Q({ r1: 20 + 3 * k, color: pal.good }));
      F.burst(x, y, Q({ n: 8 + 3 * k, kind: 'streak', speed: 190 + 20 * k, life: 360, angle: PI / 2, spread: PI, gravity: 0, color: pal.c }));
      F.float('+' + d.pts, x, y + 9, Q({ color: pal.warn, size: 20 + 2 * k, ms: 600, dy: -6 }));
      /* Combo : le multiplicateur du jeu (×3 à ×5) s'affiche à côté du compteur. */
      if (d.n > 2 && s && s.y > 70) F.float('×' + k, s.cx + 24, s.cy, Q({ color: pal.u, size: 12 + 3 * k, ms: 600, dy: -12 }));
    }, { info: '×' + d.n });
  });

  /* ── Histoire : la page se tourne (le décor pivote, un trait court sur le haut de la scène) ;
        le texte du récit ne bouge jamais ── */
  FX.on('tm:scene', function (n) {
    var s = FX.rect('#story-scene');
    if (!s || !s.inView) return;
    FX.play('histoire-scene', function (lv, pal) {
      FX.anim('#story-decor', [{ opacity: 0, transform: 'perspective(240px) rotateY(-90deg)' }, VU], { duration: 340, scope: 'q', leger: FADE });
      F.slash(s.x + 10, s.y + 1, s.x + s.w - 10, s.y + 1, Q({ width: 3, ms: 340, color: pal.u }));
      F.trail([[s.x + 10, s.y], [s.x + s.w - 10, s.y]], Q({ n: 9, min: 2, size: 4, color: pal.warn, life: 420 }));
    }, { info: n });
  });

  /* ── Réponse à une étape (Histoire) ou à une question d'exercice (DNB) ── */
  FX.on('tm:qcm', function (d) {
    var l = D.querySelectorAll('#' + d.p + '-answers .answer-btn'), recit = d.p === 'story';
    FX.play((recit ? 'histoire-' : 'dnb-') + (d.ok ? 'juste' : 'erreur'), function (lv, pal) {
      var b = FX.rect(l[d.i]), e = FX.rect('#story-decor'), x = 0, y = 0;
      if (!d.ok) {                        // la bonne réponse est désignée, puis on guide vers l'explication
        box(l[d.g], pal.good);
        guide('#' + d.p + '-feedback', pal, 1);
        return;
      }
      if (!recit) { box(l[d.i], pal.good); return; }
      if (b && b.inView) {                // éclat bref sur le bord de la réponse choisie
        x = b.x + 27; y = b.y;
        F.ring(x, b.cy, Q({ r0: 12, r1: 25, color: pal.good }));
        F.burst(x, y, Q({ n: 10, speed: 170, life: 340, angle: -PI / 2, spread: PI, gravity: 0, color: pal.c }));
      }
      if (!e || !e.inView) return;
      /* L'énergie file vers le décor, qui bondit de joie ; les étoiles partent vers le haut. */
      if (x) F.streaks(x, y, e.cx, e.cy, Q({ n: 8, ms: 220, color: pal.c }));
      FX.anim('#story-decor', [{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.3) rotate(-8deg)', offset: 0.4 }, { transform: 'none' }],
        { duration: 460, delay: 200, fill: 'none', scope: 'q', leger: false });
      FX.after(200, function () {
        F.ring(e.cx, e.cy, Q({ r1: 46, width: 4, color: pal.u }));
        F.burst(e.cx, e.cy, Q({ n: 16, kind: 'star', speed: 190, life: 460, angle: -PI / 2, spread: PI * 1.3, gravity: -40, colors: [pal.u, pal.warn] }));
      }, 'q');
    });
  });

  /* ── DNB : la transition entre les deux phases se dévoile bloc par bloc (le bouton reste en place) ── */
  FX.onScreen('dnb-transition', function () {
    FX.play('dnb-transition', function () {
      var l = D.querySelectorAll('#screen-dnb-transition > *'), i;
      for (i = 0; i < l.length - 1; i++) FX.anim(l[i], FADE, { duration: 220, delay: 90 * i });
    });
  });

  /* ── Résultats : la fête est proportionnelle au palier ; le plus bas reçoit une étincelle douce.
        DNB : pas de pluie de confettis, la note est « tamponnée » et le détail se déroule. ── */
  FX.on('tm:bilan', function (m) {
    var e = D.getElementById(m + '-result-emoji'), k = TIER[e.textContent] || 0;
    FX.play('bilan-' + m, function (lv, pal) {
      var dnb = m === 'dnb', r = FX.rect(e), vu = r && r.inView && r.cy > 70, x = vu ? r.cx : FX.vw() / 2, y = vu ? r.cy : 100, i,
        l = D.querySelectorAll('#screen-' + m + '-result .result-stat, #dnb-breakdown .dnb-phase-line'),
        g = dnb && D.getElementById('dnb-result-grade').parentNode;
      FX.anim(e, [{ opacity: 0, transform: 'scale(.3)' }, VU], { duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)', leger: FADE });
      for (i = 0; i < l.length; i++) {
        FX.anim(l[i], [{ opacity: 0, transform: 'translateY(8px)' }, VU], { duration: 240, delay: 260 + 110 * i, leger: FADE });
      }
      if (g) FX.anim(g, [{ opacity: 0, transform: 'scale(1.4)' }, VU], { duration: 360, delay: 420, leger: FADE });
      /* Le jeu ne remonte jamais la page : si l'émoji du palier est hors champ ou sous l'en-tête (téléphone), le palier
         et son titre (déjà écrits par le jeu plus haut dans la page) sont rappelés dans une vignette. */
      if (!vu) F.banner(e.nextElementSibling.textContent, { y: y, emoji: e.textContent, ms: 1200 });
      FX.after(260, function () {
        F.ring(x, y, { r1: 58, width: k ? 5 : 3, ms: k ? 380 : 600, color: k ? pal.u : pal.calm });
        F.burst(x, y, k ? { n: 8 + 8 * k, kind: 'star', speed: 150 + 25 * k, life: 700, gravity: dnb ? -30 : 120, colors: pal.set }
          : { n: 7, kind: 'star', speed: 70, life: 1000, gravity: -50, spread: PI, angle: -PI / 2, color: pal.warn });
        if (lv > 1 && k > 2 && !dnb) F.confetti({ n: 24 * k - 48, ms: 1100 });
      });
      if (g) FX.after(720, function () {
        var q = FX.rect(g);
        if (q && q.inView) F.ring(q.cx, q.cy, { r0: 30, r1: 60 + 12 * k, width: 4, ms: 480, color: pal.warn });
      });
    }, { info: 'palier ' + k });
  });
});
