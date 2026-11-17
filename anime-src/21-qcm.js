/* ═══ 21-qcm.js — module « combat » : les moments du QCM ═══
   Crochets (O(1), aucune lecture du DOM) : loadQuestion, answer, timeOut, useJutsu, updateTimerUI
   (10 Hz : deux comparaisons), addXP. Chaque crochet photographie quelques champs et émet un
   évènement ; tout effet d'une question porte la portée « q », dont loadQuestion change le jeton :
   ce qui vient de la question précédente (issue en attente, animations, particules, minuteries,
   repère) est coupé net — le joueur peut répondre et passer à la suite dans le même tick.
   Règles tenues ici : rien ne retarde ni ne couvre « QUESTION SUIVANTE » ; une erreur n'est jamais
   punie (contre PARÉ, puis repère calme vers l'explication) ; le moment le plus fêté est une
   erreur corrigée (« REVANCHE RÉUSSIE ! ») ; effets finis (≈ 700 ms, 1,1 s pour un moment spécial). */
FX.module('combat', function (FX) {
  var A = FX.arena, D = document, PI = Math.PI;
  if (!A) return;
  var qAt = 0, lvAt = 0, tense = false, gel = false, busy = 0, rep = null, repTok = 0, repAt = 0;
  var MELEE = { vortex: 1, impact: 1, crescent: 1 };       // gestes au corps à corps : le héros se rue

  function now() { return performance.now(); }
  function Q(o) { o.scope = 'q'; return o; }
  /* Image clé : transform (+ opacité, + position dans la durée). */
  function tf(t, op, off) {
    var k = { transform: t };
    if (op != null) k.opacity = op;
    if (off != null) k.offset = off;
    return k;
  }
  /* Animation d'un nœud de l'arène. fill 'none' : à la fin (ou coupée), l'état immobile posé par
     l'arène reprend ; 'backwards' : la première image tient pendant le délai. */
  function mv(node, frames, ms, delay, fill) {
    return FX.anim(node, frames, { duration: ms, delay: delay || 0, fill: fill || 'none', scope: 'q', name: node.className });
  }
  function btnRect(i) {
    var l = D.querySelectorAll('#answers-grid .answer-btn');
    return i >= 0 && l[i] ? FX.rect(l[i]) : null;
  }

  /* Issue d'une réponse : seule la DERNIÈRE compte et une seule place est prise dans la file par
     frame (une partie jouée d'une traite ne doit pas saturer la file du noyau). L'évènement est
     ignoré si la question a changé entre-temps (jeton de la portée « q »). */
  function emitRep(d) {
    var t = now();
    rep = d; repTok = FX.token('q');
    if (t - repAt > 100 && FX.emit('qcm:rep')) repAt = t;
  }

  /* Le bandeau de combo du jeu (fixe, en haut à droite, au-dessus du calque) est masqué tant qu'il
     recouvrirait l'arène : celle-ci affiche alors le même mot. Attribut sur <html> + règle CSS
     (jamais de style en ligne sur un nœud du jeu) ; sans effet au niveau off ou couche coupée. */
  function comboGuard(g) {
    var c = g && FX.rect('#combo-display');
    D.documentElement[c && c.y - 16 < g.a.y + g.a.h && c.y + c.h + 16 > g.a.y ? 'setAttribute' : 'removeAttribute']('data-fx-combo-off', '');
  }

  /* ── Crochets ── */
  FX.wrap('loadQuestion', null, function () {
    var s = state, t = now();
    FX.bump('q');
    tense = gel = false;
    if (!s.questions[s.qIndex] || FX.env.screen() !== 'game') return;      // loadQuestion a terminé la partie
    if (t - qAt > 100 && FX.emit('qcm:q')) qAt = t;                        // une seule entrée par frame
  });
  FX.wrap('answer', function () {
    var s = state;
    return s.answered ? null : { q: s.questions[s.qIndex], sc: s.score, hp: s.hp };     // null : appel ignoré par le jeu
  }, function (p, args) {
    var s = state, ok;
    if (!p || !p.q || !s.answered) return;
    ok = args[0] === p.q.correct;
    emitRep({ ok: ok, idx: args[0], pts: s.score - p.sc, n: s.streak, retry: !!p.q._retry, fin: ok && A.fin(),
              free: !!s.freeMode, boss: !!s.bossMode, down: !!s.bossMode && s.hp <= 0, hp0: p.hp });
  });
  /* Temps écoulé : le jeu ne marque aucun bouton et ne révèle pas la bonne réponse — la couche non plus. */
  FX.wrap('timeOut', function () {
    return state.answered ? null : { hp: state.hp };
  }, function (p) {
    var s = state;
    if (p && s.answered) emitRep({ ok: false, to: true, idx: -1, n: 0, boss: !!s.bossMode, down: !!s.bossMode && s.hp <= 0, hp0: p.hp });
  });
  /* Pouvoir : réussi seulement si le compteur a baissé (trois refus silencieux côté jeu). */
  FX.wrap('useJutsu', function (type) { return state.jutsu[type]; }, function (n, args) {
    if (state.jutsu[args[0]] !== n - 1) return;
    if (args[0] === 'time') gel = true;
    FX.emit('qcm:pouvoir', String(args[0]), 'q');
  });
  /* Chemin chaud (10 appels/s) : deux comparaisons, rien d'autre. */
  FX.wrap('updateTimerUI', null, function () {
    var s = state;
    if (gel && !s.timeFrozen) { gel = false; FX.emit('qcm:degel', null, 'q'); }
    if (!tense && s.timeLeft <= 5 && s.timeLeft > 0.05 && !s.answered && !s.freeMode) { tense = true; FX.emit('qcm:tension', null, 'q'); }
  });
  /* Niveau gagné (tous les modes) : plusieurs addXP dans le même tick ne donnent qu'un effet. Portée
     nulle : les fins de mode appellent addXP juste avant OU juste après showScreen(résultat), et
     l'évènement doit survivre à ce changement d'écran (le gestionnaire décide d'après l'écran affiché). */
  FX.wrap('addXP', function () { return state.level; }, function (before) {
    var t = now();
    if (state.level > before && t - lvAt > 100 && FX.emit('xp:niveau', 0, null)) lvAt = t;
  });

  /* ── Entrée d'une question : image fixe recalculée, puis l'adversaire arrive (≤ 260 ms) ── */
  FX.on('qcm:q', function () {
    var c;
    qAt = 0;
    if (FX.env.screen() !== 'game' || !(c = A.sync())) return;
    comboGuard(A.geo());
    FX.play('qcm-question', function (lv) {
      var full = lv > 1;
      if (c.first) mv(A.hero, full ? [tf('translateX(-40px)', 0), tf('none', 1)] : [tf('none', 0), tf('none', 1)], full ? 260 : 140);
      if (!c.boss || c.first) {
        mv(A.foe, full ? [tf('translateX(40px) scale(.7)', 0), tf('translateX(-4px) scale(1.06)', 1, 0.7), tf('none', 1)]
                       : [tf('none', 0), tf('none', 1)], full ? 260 : 140);
      }
      if (c.retry && full) mv(A.tag, [tf('scale(1.7)'), tf('none')], 300);
    }, { info: c.kind });
  });

  /* ── Geste d'attaque : six formes génériques (univers), teintées par le personnage ── */
  function geste(s, h, f, pal, k) {
    var c = pal.c, u = pal.u, R = f.h * 0.55 * k, i, a, x, y, nx, pts = [];
    if (s === 'vortex') {                 // spirale d'étincelles autour de la cible
      for (i = 0; i <= 12; i++) { a = i * 0.95; pts.push([f.cx + Math.cos(a) * (5 + i * R / 9), f.cy + Math.sin(a) * (5 + i * R / 9)]); }
      FX.fx.trail(pts, Q({ n: Math.round(16 * k), color: c, life: 420, stagger: 160 }));
      FX.fx.ring(f.cx, f.cy, Q({ r1: R * 1.5, color: u }));
    } else if (s === 'stretch') {         // long trait épais, double onde de choc
      FX.fx.slash(h.cx, h.cy, f.cx, f.cy, Q({ width: 9 * k, ms: 240, color: c }));
      FX.fx.ring(f.cx, f.cy, Q({ r1: R * 1.3, width: 4, color: u }));
      FX.fx.ring(f.cx, f.cy, Q({ r1: R * 1.8, ms: 400, color: c }));
    } else if (s === 'beam') {            // charge sur le héros puis rayon droit
      FX.fx.ring(h.cx, h.cy, Q({ r0: h.h * 0.7, r1: 5, ms: 220, color: u }));
      FX.fx.slash(h.cx, h.cy, f.cx, f.cy, Q({ width: 11 * k, ms: 280, color: u }));
      FX.fx.slash(h.cx, h.cy, f.cx, f.cy, Q({ width: 4 * k, ms: 280, color: pal.light ? c : '#FFFFFF' }));
      FX.fx.streaks(h.cx, h.cy, f.cx, f.cy, Q({ n: Math.round(8 * k), ms: 170, jitter: 9, color: c }));
    } else if (s === 'crescent') {        // un à trois arcs d'entaille
      for (i = 0; i < (k > 1.3 ? 3 : k > 1 ? 2 : 1); i++) {
        FX.fx.slash(f.cx - R, f.cy - R + i * 9, f.cx + R, f.cy + R - i * 9,
                    Q({ curve: (i % 2 ? -1 : 1) * R * 0.7, width: 5, ms: 240 + i * 50, color: i ? u : c }));
      }
      FX.fx.burst(f.cx, f.cy, Q({ n: Math.round(6 * k), kind: 'rect', speed: 120, gravity: 160, color: c }));
    } else if (s === 'bolt') {            // éclair en zigzag
      x = h.cx; y = h.cy;
      for (i = 1; i <= 5; i++) {
        nx = h.cx + (f.cx - h.cx) * i / 5; a = i === 5 ? f.cy : h.cy + (i % 2 ? -1 : 1) * 9 * k;
        FX.fx.slash(x, y, nx, a, Q({ width: 3.5 * k, ms: 230, color: u }));
        x = nx; y = a;
      }
      FX.fx.burst(f.cx, f.cy, Q({ n: Math.round(8 * k), kind: 'star', speed: 240, gravity: 0, life: 380, color: c }));
    } else {                              // impact (repli générique) : éclats droits + onomatopée
      FX.fx.burst(f.cx, f.cy, Q({ n: Math.round(12 * k), kind: 'streak', speed: 300, gravity: 0, life: 300, color: c }));
      FX.fx.ring(f.cx, f.cy, Q({ r1: R * 1.6, width: 5, color: u }));
      FX.fx.float(FX.pick(['BAM !', 'PAF !', 'BOUM !']), f.cx - R * 3, f.cy - R * 0.3, Q({ rotate: -12, color: c, size: 18, ms: 460, dy: -10 }));
    }
  }

  /* ── Bonne réponse : l'énergie quitte la réponse → attaque du héros → l'adversaire encaisse ── */
  function juste(d, lv, pal, b, g, ult) {
    var full = lv > 1, c = pal.c, u = pal.u, x0 = 0, y0 = 0, h, f, sc, t0 = 0, T, dx, k, dash, seg, i, pts,
        txt = d.free ? '✔' : '+' + d.pts.toLocaleString('fr-FR');
    if (b && b.inView) {                  // éclat bref sur le bord de la réponse choisie (≤ 340 ms)
      x0 = b.x + 27; y0 = b.y;
      FX.fx.ring(x0, b.cy, Q({ r0: 12, r1: 25, color: pal.good }));
      FX.fx.burst(x0, y0, Q({ n: 8 + 2 * Math.min(d.n, 5), speed: 170, life: 340, angle: -PI / 2, spread: PI, gravity: 0, color: c }));
    }
    if (!g) {                             // arène hors champ : l'énergie file vers le score de l'en-tête
      sc = FX.rect('score');
      if (x0 && sc && sc.inView) {
        FX.fx.streaks(x0, y0, sc.cx, sc.cy, Q({ n: 6, ms: 280, color: c }));
        FX.fx.float(txt, sc.cx, sc.cy + 22, Q({ color: pal.good, size: 20, ms: 600, dy: -18 }));
      }
      return;
    }
    h = g.h; f = g.f;
    if (x0) FX.fx.streaks(x0, y0, h.cx, h.cy, Q({ n: 8, ms: 190, color: c }));
    /* Moment spécial : un seul bandeau à la fois (revanche > ULTIME), posé sur la bande de combat. */
    if (d.retry) {
      FX.fx.banner('REVANCHE RÉUSSIE !', Q({ y: g.a.y + g.a.h + 4, emoji: '🌟', color: pal.good, ms: 1000 }));
      busy = now() + 1000;
    } else if (ult && full && !d.free) {
      FX.fx.cutin(pal.power.toUpperCase() + ' ULTIME !', Q({ anchor: g.a, emoji: pal.heroEmoji, color: c, ms: 560, cls: 'fx-ult' }));
      FX.fx.tint(u, Q({ rect: g.a, alpha: 0.1, ms: 420 }));
      t0 = 340; busy = now() + 560;
    } else if (ult) FX.fx.float('ULTIME !', g.a.cx, g.a.cy + g.a.h * 0.2, Q({ color: c, size: 22, ms: 500, dy: -6 }));
    T = t0 + (full ? 180 : 90);           // instant de l'impact
    k = ult ? 2 : d.n >= 4 ? 1.35 : d.n === 3 ? 1.2 : 1;
    /* Héros : élan, ruée (ou pose de tir), retour. */
    dx = MELEE[pal.style] ? Math.min((f.cx - h.cx) * 0.55, 240) : 0;
    dash = dx ? 'translateX(' + dx + 'px) scaleX(1.15)' : 'scale(1.3)';
    if (full) mv(A.hero, [tf('none'), tf('translateX(-8px) scaleX(.9)', null, 0.13), tf(dash, null, 0.33), tf(dash, null, 0.48), tf('none')], 540, t0);
    else mv(A.hero, [tf('none'), tf('translateX(5px)'), tf('none')], 220);
    /* Adversaire : la première image tient jusqu'à l'impact, la dernière est l'état immobile. */
    if (d.free) mv(A.foe, [tf('none'), tf('rotate(14deg)', null, 0.25), tf('rotate(-9deg)', null, 0.6), tf('none')], 360, T);
    else if (d.fin) mv(A.foe, [tf('none', 1), tf('translateX(12px) rotate(10deg) scale(1.2)', 1, 0.2), tf('translate(60px,-40px) rotate(540deg) scale(.2)', 0)], 520, T, 'backwards');
    else if (d.boss) mv(A.foe, [tf('none'), tf('translateX(12px) rotate(8deg) scale(1.08)', null, 0.3), tf('none')], 320, T);
    else {
      mv(A.foe, [{ transform: 'none', opacity: 1, filter: 'none' }, { transform: 'translateX(14px) rotate(10deg) scale(1.2)', opacity: 1, filter: 'none', offset: 0.25 },
                 { transform: 'rotate(90deg) scale(.8)', opacity: 0.3, filter: 'grayscale(1)' }], 380, T, 'backwards');
    }
    seg = A.hp.querySelector('.fx-off');  // le segment de vie qui vient de s'éteindre
    if (seg) mv(seg, [tf('none', 1), tf('scaleY(1.7)', 1, 0.4), tf('none', 0.2)], 300, T, 'backwards');
    if (d.n >= 2) mv(A.combo, [tf('scale(1.8)'), tf('none')], 240);
    FX.after(T, function () {
      if (full) geste(pal.style, h, f, pal, k);
      FX.fx.burst(f.cx, f.cy, Q({ n: Math.round(8 * k), kind: 'star', speed: 180 * k, life: 420, color: u }));
      FX.fx.float(txt, Math.min(f.cx, FX.vw() - 56), f.cy - 4, Q({ color: d.free ? pal.good : pal.warn, size: d.pts > 999 ? 26 : 22, ms: full ? 520 : 420, dy: -24 }));
      if (d.retry) {                      // couronne d'étoiles : l'erreur est corrigée
        for (pts = [], i = 0; i <= 10; i++) pts.push([f.cx + Math.cos(i * 0.63) * f.h * 0.8, f.cy + Math.sin(i * 0.63) * f.h * 0.8]);
        FX.fx.trail(pts, Q({ n: 14, color: pal.warn, life: 520, stagger: 220 }));
        FX.fx.confetti(Q({ n: 20, from: f, ms: 900 }));
      }
      if (d.fin) {                        // dernier coup de la partie
        FX.fx.float(d.free ? 'BRAVO !' : d.boss ? 'BOSS VAINCU !' : 'K.O. !', g.a.cx, g.a.cy + g.a.h * 0.2, Q({ color: u, size: full ? 30 : 24, ms: 800, dy: -6 }));
        FX.fx.ring(f.cx, f.cy, Q({ r1: f.h * 1.6, width: 5, ms: 420, color: c }));
        FX.fx.confetti(Q({ n: d.free ? 12 : 30, from: f, ms: 900 }));
      }
    }, 'q');
  }

  /* Repère « l'explication est plus bas » : seulement si elle s'ouvre sous le bas de l'écran.
     Portée « cue » du noyau : retiré au premier défilement et à la question suivante. */
  function cue() {
    var p = FX.rect('#feedback-panel'), n;
    if (!p || p.y < FX.vh() - 40 || !(n = FX.node('fx-cue', 'cue'))) return;
    n.textContent = '👇';
    if (!FX.anim(n, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
                 { duration: 2600, scope: 'cue', remove: true, name: 'fx-cue' })) FX.cancel('cue');
  }

  /* ── Erreur ou temps écoulé : contre PARÉ, puis on guide vers l'explication ── */
  function faux(d, lv, pal, g) {
    var full = lv > 1, h, f, gap, t;
    if (g) {
      h = g.h; f = g.f; gap = f.cx - h.cx;
      if (d.free) mv(A.hero, [tf('none'), tf('rotate(-6deg)'), tf('none')], 300);            // la cible d'entraînement n'attaque jamais
      else if (!full) { if (!d.boss) mv(A.foe, [tf('none', 1), tf('none', 0)], 200); }
      else {
        mv(A.foe, d.boss ? [tf('none'), tf('translateX(' + -gap * 0.3 + 'px) scale(1.08)', null, 0.4), tf('none')]
                         : [tf('none', 1), tf('translateX(' + -gap * 0.35 + 'px) scale(1.1)', 1, 0.25), tf('none', 1, 0.5),
                            tf('none', 1, 0.62), tf('translateX(36px) scale(.8)', 0)], d.boss ? 400 : 640);
        if (d.ko) mv(A.hero, [tf('none', 1), tf('translate(-10px,-8px) rotate(-40deg)', 1, 0.4), tf('rotate(-90deg)', 0.55)], 480, 160, 'backwards');
        else if (!d.down) {
          mv(A.hero, [tf('none'), tf('translateX(-7px) rotate(-5deg)'), tf('none')], 260, 150);
          FX.after(150, function () {
            FX.fx.ring(h.cx + h.w * 0.45, h.cy, Q({ r0: 8, r1: h.h * 0.75, width: 4, color: pal.calm }));
            FX.fx.sprite('🛡️', h.cx + h.w * 0.75, h.cy, Q({ size: 20, life: 420 }));
          }, 'q');
        }
      }
      if (d.ko) FX.after(560, function () { FX.fx.float('FIN DU COMBAT', g.a.cx, g.a.cy - g.a.h * 0.2, Q({ color: pal.calm, size: 20, ms: 700, dy: -4 })); }, 'q');
    }
    if (d.to && (t = FX.rect('#timer-num')) && t.inView) FX.fx.ring(t.cx, t.cy, Q({ r0: 24, r1: 5, ms: 420, color: pal.warn }));
    cue();
  }

  FX.on('qcm:rep', function () {
    var d = rep, b, g, ult;
    repAt = 0; rep = null;
    if (!d || repTok !== FX.token('q') || FX.env.screen() !== 'game') return;      // le joueur est déjà à la question suivante
    b = btnRect(d.idx); g = A.geo(); ult = !!d.ok && d.n >= 5 && d.n % 5 === 0;
    d.ko = d.down && d.hp0 > 0;                                   // fin de combat contre le boss : une seule fois
    comboGuard(g);
    A.apres(d.ok ? 'ok' : d.to ? 'temps' : 'faux', d.fin);        // image fixe d'abord : juste même si tout est coupé
    if (d.ok) {
      FX.play(d.fin ? 'qcm-ko' : d.retry ? 'qcm-revanche' : ult ? 'qcm-ultime' : 'qcm-juste',
              function (lv, pal) { juste(d, lv, pal, b, g, ult); }, { info: '×' + d.n });
    } else {
      FX.play(d.ko ? 'qcm-ko-heros' : d.to ? 'qcm-temps' : 'qcm-erreur', function (lv, pal) { faux(d, lv, pal, g); });
    }
  });

  /* ── Pouvoirs : effets courts dans l'arène ; rien ne masque les réponses restantes ── */
  FX.on('qcm:pouvoir', function (type) {
    var g;
    A.sync();
    g = A.geo();
    FX.play('qcm-pouvoir', function (lv, pal) {
      var l, i, r, h = g && g.h, f = g && g.f;
      if (h) mv(A.hero, [tf('none'), tf('scale(1.25)'), tf('none')], 300);
      if (type === '50') {                // un trait sur chacune des deux réponses que le jeu vient d'éliminer
        l = D.querySelectorAll('#answers-grid .answer-btn');
        for (i = 0; i < l.length; i++) {
          if (l[i].style.opacity === '0.2' && (r = FX.rect(l[i])) && r.inView) {
            FX.fx.slash(r.x + 10, r.cy + 7, r.x + r.w - 10, r.cy - 7, Q({ width: 3, ms: 260, color: pal.calm }));
          }
        }
        if (h) FX.fx.sprite('✂️', h.cx, h.y, Q({ size: 20, life: 520, speed: 28 }));
      } else if (type === 'hint') {       // rien près des réponses : l'indice du jeu est volontairement discret
        if (h) { FX.fx.sprite('💡', h.cx, h.y, Q({ size: 20, life: 560, speed: 28 })); FX.fx.ring(h.cx, h.cy, Q({ r1: h.h * 0.8, color: pal.warn })); }
      } else if (f) {                     // temps figé : l'adversaire se fige (état fixe posé par sync)
        FX.fx.ring(f.cx, f.cy, Q({ r0: f.h, r1: 8, ms: 420, color: pal.calm }));
        FX.fx.burst(f.cx, f.cy, Q({ n: 10, speed: 60, life: 700, gravity: -40, color: pal.calm }));
      }
    }, { info: type });
  });
  FX.on('qcm:degel', function () { A.sync(); });
  /* Moins de 5 s : l'adversaire grossit d'un cran (état fixe) et une seule onde — rien ne pulse. */
  FX.on('qcm:tension', function () {
    var g;
    A.sync();
    g = A.geo();
    FX.play('qcm-tension', function (lv, pal) {
      if (g) FX.fx.ring(g.f.cx, g.f.cy, Q({ r1: g.f.h * 0.9, color: pal.warn, min: 2 }));
    });
  });

  /* ── Niveau gagné (tous les modes) : jamais un second effet focal en même temps qu'un autre. Tout
        se joue sur l'en-tête, et seulement s'il est entier à l'écran (jamais sur une zone de lecture).
        · QCM : bandeau « NIVEAU n ! » 320 ms après le coup (le toast du jeu y est écrasé dans le même
          tick), onde et étoiles sur le badge de niveau.
        · Écran de résultat d'un autre mode : le même bandeau, en dernier temps de la fête (1,3 s).
          Niveau léger : l'onde seule sur le badge, à 0,6 s (la fête courte reste sous 1,2 s).
          Résultat du QCM : rien (la cérémonie du rang occupe l'écran, le niveau a été fêté en partie).
        · Ailleurs (ateliers, Vrai/Faux, Histoire, accueil) le toast du jeu l'annonce déjà : onde et
          étoiles sur le badge seulement, s'il est visible. Épreuves : l'onde seule (profil sobre). ── */
  FX.on('xp:niveau', function () {
    var id = FX.env.screen(), game = id === 'game', fete = FX.env.profile() === 'ceremony',
        txt = game || (fete && FX.effective() > 1);
    lvAt = 0;
    if (id === 'result') return;
    FX.after(game ? Math.max(0, busy - now()) + 320 : txt ? 1300 : fete ? 600 : 0, function () {
      var hd = FX.rect('header'), r = FX.rect('level');
      if (!hd || hd.y < -4 || !(txt || (r && r.inView))) return;          // en-tête sorti (même en partie) : rien
      FX.play('niveau', function (lv, pal) {
        var st = FX.game.state();
        if (txt) FX.fx.banner('NIVEAU ' + (st ? st.level : '') + ' !', { anchor: hd, emoji: '⭐', color: pal.warn, ms: 1000 });
        if (r && r.inView) {
          FX.fx.ring(r.cx, r.cy, { r1: 30, color: pal.warn });
          FX.fx.burst(r.cx, r.cy, { n: 12, kind: 'star', speed: 140, gravity: 60, color: pal.warn, min: fete ? 2 : 1 });
        }
      });
    });
  });
});
