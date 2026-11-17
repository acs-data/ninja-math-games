/* ═══ 30-shell.js — module « accueil » : l'écran d'accueil et la coquille du jeu ═══
   (La transition d'écran elle-même est dans 09-arrivee.js, module « arrivee » du noyau.)
   Moments, tous finis — l'accueil est une longue page qu'on lit en défilant : rien n'y tourne.
     ouverture   une fois par chargement de page (après le tutoriel s'il s'ouvre) : l'énergie
                 converge sur le héros, onde, scintillement le long du titre, puis une quinzaine
                 de lueurs aux couleurs de l'univers montent autour de lui (≤ 2,6 s). Léger : onde
                 et scintillement (0,4 s). Coupée au premier défilement de la page.
     retour      à chaque retour sur l'accueil : onde et scintillement (≈ 0,5 s).
     univers     vrai changement d'univers : onde de couleur depuis la carte choisie, voile
                 (limiteur du noyau), éclat, émoji de l'univers ; puis une ondulation sur les six
                 nouvelles cartes de personnage (re-générées par le jeu 200 ms plus tard).
     perso       vrai changement de personnage : anneau et éclat à sa couleur, l'émoji de la carte
                 rebondit (seul nœud du jeu animé ici : WAAPI finie, sans transform d'état).
     classe      changement d'onglet de classe : trait sous l'onglet, fondu des nouveaux chapitres.
     envol       départ d'un mode depuis une carte de l'accueil (modes sans écran de chargement :
                 le QCM a déjà sa carte VS) : éclat de traits depuis la carte, par-dessus la lame.
     theme       bascule jour / nuit : la palette suit, fondu de 260 ms depuis l'ancien fond.
   Crochets (O(1), sans lecture de géométrie) : selectUniverse, selectChar, selectMissionClass,
   applyTheme — chacun compare l'état AVANT/APRÈS (un clic sur l'élément déjà choisi ne joue rien).
   Chaque sélection change le jeton de la portée « q » : des clics rapides ne laissent que le dernier
   effet, et le noyau coupe tout au changement d'écran. Aucun nœud persistant, aucun style ni
   classe sur le jeu : au niveau off, l'accueil est celui d'index.html. */
FX.module('accueil', function (FX) {
  var D = document, W = window, PI = Math.PI;
  var t0 = now(), tok0 = FX.token('screen'), owed = true, tap = null, thAt = 0, liveTo = 0;

  function now() { return performance.now(); }
  function Q(o) { o.scope = 'q'; return o; }
  /* Rectangle d'une cible réellement lisible : dans la fenêtre et pas sous l'en-tête collant. */
  function vis(t) {
    var r = FX.rect(t), h;
    if (!r || !r.inView || r.cy > FX.vh()) return null;
    h = FX.rect('header');
    return h && h.inView && r.cy < h.y + h.h ? null : r;
  }
  function later(ms, fn) { if (ms) FX.after(ms, fn); else fn(); }
  function pal() { return FX.palette(); }

  /* ── Ouverture (full) et retour sur l'accueil ── */
  function opening(full) {
    var r = vis('.hero-ninja'), t = vis('#hero-title');
    if (!r && !t) return;                       // page défilée : le joueur lit plus bas, rien ne joue
    FX.play('accueil', function (lv, pal) {
      var k, i;
      owed = false;
      full = full && lv > 1;
      liveTo = now() + (full ? 2700 : 600);
      if (r) {
        /* L'énergie converge sur le héros par les deux côtés (sa rangée ne contient que lui)… */
        if (full) for (k = -1; k < 2; k += 2) {
          FX.fx.streaks(r.cx + k * 170, r.cy, r.cx + k * 26, r.cy, { n: 5, ms: 220, jitter: r.h * 0.3, color: pal.u });
        }
        /* … puis l'onde : elle reste autour de lui, au-dessus du titre. */
        later(full ? 210 : 0, function () {
          FX.fx.ring(r.cx, r.cy, { r0: 12, r1: r.h * 0.62, color: pal.u, ms: full ? 420 : 340 });
          FX.fx.burst(r.cx, r.cy + r.h * 0.4, { n: full ? 12 : 8, angle: -PI / 2, spread: 3.6, speed: 170, life: full ? 520 : 360, size: 3, color: pal.c, min: 2 });
        });
        /* Lueurs : trois vagues de cinq, qui montent doucement autour du héros puis s'éteignent. */
        if (full) for (i = 0; i < 3; i++) wave(r.cx + (i - 1) * r.w * 0.7, r.y + r.h, 480 + 220 * i, pal);
      }
      /* Scintillement qui court le long du haut du titre (jamais sur le texte d'accroche). */
      if (t) later(full ? 300 : 0, function () {
        FX.fx.trail([[t.x, t.y], [t.x + t.w, t.y]], { n: full ? 14 : 8, life: full ? 460 : 260, stagger: full ? 300 : 90, size: 4, jitter: 3, color: pal.u });
      });
    }, { info: full ? 'ouverture' : 'retour' });
  }
  function wave(x, y, ms, pal) {
    FX.after(ms, function () {
      FX.fx.burst(x, y, { n: 5, angle: -PI / 2, spread: 1.2, speed: 52, gravity: -28, drag: 0.4, life: 1600, size: 5, kind: 'star', colors: [pal.u, pal.c] });
    });
  }
  /* Les effets sont posés dans le repère de la fenêtre : dès que le joueur fait défiler la page, ce qui
     reste de l'ouverture est coupé (rien ne flotte sur les textes qui arrivent dessous). */
  W.addEventListener('scroll', function () {
    if (liveTo && now() < liveTo) FX.cancel('screen');
    liveTo = 0;
  }, { passive: true });
  /* L'ouverture est due une seule fois, tant que le joueur n'a pas quitté l'accueil. Elle attend que
     la page soit posée (chargement fini, minuterie du tutoriel passée) ; si une modale la bloque
     (tutoriel de première visite), elle est rejouée à la reprise. */
  function boot() {
    if (!owed) return;
    if (FX.token('screen') !== tok0) owed = false;           // écran changé pendant que la couche était coupée
    else opening(true);
  }
  function arm() { FX.after(Math.max(400, 750 - (now() - t0)), boot); }
  if (D.readyState === 'complete') arm(); else W.addEventListener('load', arm);
  FX.on('fx:resume', function () { if (owed) FX.emit('sh:boot'); });
  FX.on('sh:boot', boot);
  FX.on('fx:level', function () { if (owed) arm(); });      // niveau changé avant l'ouverture : elle reste due

  /* ── Départ d'un mode depuis une carte : on retient le point d'appui (écoute passive, aucun
     effet ici). Clavier : centre de la carte (la carte sera masquée quand l'effet jouera). ── */
  function onTap(e) {
    try {
      var c = e.target && e.target.closest ? e.target.closest('.level-card') : null, r;
      if (!c || FX.level() === 'off' || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
      r = e.clientX || e.clientY ? null : c.getBoundingClientRect();
      tap = { x: r ? r.left + r.width / 2 : e.clientX, y: r ? r.top + r.height / 2 : e.clientY, t: now() };
    } catch (err) {}
  }
  D.addEventListener('click', onTap, { capture: true, passive: true });
  D.addEventListener('keydown', onTap, { capture: true, passive: true });

  FX.on('screen', function (d) {
    var p = tap;
    owed = false; tap = null; liveTo = 0;
    if (d.id === 'home') { FX.after(160, function () { opening(false); }); return; }
    if (!p || d.profile === 'sobre' || d.id === 'loading' || now() - p.t > 700) return;
    FX.play('envol', function (lv, pal) {
      FX.fx.ring(p.x, p.y, { r0: 10, r1: 76, color: pal.u, ms: 320 });
      FX.fx.burst(p.x, p.y, { n: 14, kind: 'streak', speed: 460, life: 340, gravity: 0, drag: 2, size: 3, color: pal.u });
    }, { info: d.id });
  });

  /* ── Univers ── */
  FX.wrap('selectUniverse', function () { return FX.game.universe(); }, function (before) {
    if (FX.game.universe() !== before) { FX.bump('q'); FX.emit('sh:univers', null, 'q'); }
  });
  FX.on('sh:univers', function () {
    var r = vis('.universe-card.selected');
    if (!r) return;
    FX.play('univers', function (lv, pal) {
      FX.fx.tint(pal.u, { alpha: 0.1, ms: 420, scope: 'q' });
      FX.fx.ring(r.cx, r.cy, Q({ r0: 20, r1: Math.max(FX.vw(), FX.vh()) * 0.8, width: 16, color: pal.u, ms: 520, min: 2 }));
      FX.fx.ring(r.cx, r.cy, Q({ r0: 14, r1: r.w * 0.7, width: 4, color: pal.u, ms: 380 }));
      FX.fx.burst(r.cx, r.cy, Q({ n: 18, speed: 260, life: 520, color: pal.u }));
      FX.fx.sprite(pal.uniEmoji, r.cx, r.y + r.h * 0.3, Q({ size: 30, life: 560, speed: 90, drag: 1.5, min: 2 }));
      if (lv > 1) FX.after(250, function () { ripple(pal.u); }, 'q');
    }, { info: pal().universe });
  });
  /* Ondulation sur les cartes de personnage visibles (mesurées après leur re-génération). */
  function ripple(color) {
    var l = D.querySelectorAll('#char-grid .char-card'), i;
    function one(el, k) {
      FX.after(45 * k, function () {
        var c = vis(el);
        if (c) FX.fx.ring(c.cx, c.cy, Q({ r0: 8, r1: c.w * 0.5, width: 2, color: color, ms: 300 }));
      }, 'q');
    }
    for (i = 0; i < l.length && i < 6; i++) one(l[i], i);
  }

  /* ── Personnage ── */
  FX.wrap('selectChar', function () { var s = FX.game.state(); return s && s.char; }, function (before, args) {
    var s = FX.game.state();
    if (s && s.char !== before) { FX.bump('q'); FX.emit('sh:perso', args[0], 'q'); }
  });
  FX.on('sh:perso', function (el) {
    var r = vis(el), e = r && el.querySelector('.char-emoji');
    if (!r) return;
    FX.play('perso', function (lv, pal) {
      FX.fx.ring(r.cx, r.cy, Q({ r0: 12, r1: Math.max(r.w, r.h) * 0.62, color: pal.c, ms: 340 }));
      FX.fx.burst(r.cx, r.cy, Q({ n: 10, speed: 190, life: 420, size: 3, kind: 'star', color: pal.c }));
      if (e) FX.anim(e, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.4 }, { transform: 'scale(1)' }],
                     Q({ duration: 320, leger: false, name: 'perso' }));
    }, { info: pal().char });
  });

  /* ── Onglet de classe ── */
  function classe() { return typeof activeMissionClasse === 'string' ? activeMissionClasse : ''; }
  FX.wrap('selectMissionClass', classe, function (before) {
    if (classe() !== before) { FX.bump('q'); FX.emit('sh:classe', null, 'q'); }
  });
  FX.on('sh:classe', function () {
    var r = vis('.mission-tab.active');
    if (r) FX.play('classe', function (lv, pal) {
      FX.fx.slash(r.x + 8, r.y + r.h + 3, r.x + r.w - 8, r.y + r.h + 3, Q({ color: pal.u, width: 3, ms: 280 }));
      FX.anim('#mission-chips', [{ opacity: 0.3 }, { opacity: 1 }], Q({ duration: 200, name: 'classe' }));
    });
  });

  /* ── Thème : la palette est recalculée (variables --fx-* de #fx-root), puis un voile de
     l'ANCIEN fond s'efface : la bascule de luminosité du jeu est adoucie, jamais amplifiée. ── */
  FX.wrap('applyTheme', pal, function (before) {          // « avant » : palette en cache de l'ancien thème
    var t = now();
    if (FX.game.theme() !== before.theme && t - thAt > 100 && FX.emit('sh:theme', before.bg, null)) thAt = t;
  });
  FX.on('sh:theme', function (bg) {
    FX.bump('th');
    FX.palette();                                  // variables --fx-* à jour même si rien ne joue
    if (FX.env.profile() !== 'sobre') FX.play('theme', function () {
      var n = FX.node('fx-blade', 'th');
      if (!n) return;
      n.style.background = bg;
      FX.anim(n, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 260, fill: 'none', remove: true, scope: 'th', name: 'theme' });
    });
  });
});
