/* ═══ 20-arena.js — module « arene » : la bande de combat du QCM ═══
   #fx-arena est un enfant direct de #screen-game, inséré juste avant #question-wrap (les enfants
   directs de cet écran ne sont jamais re-générés par le jeu). Héros = émoji du personnage,
   adversaire = monstre générique (jamais un personnage de licence).
   L'arène ne retient RIEN : son état immobile est entièrement recalculé depuis l'état du jeu
   (sync), ce qui la rend insensible aux rejouer / pause / changement d'univers / niveau rallumé.
   Les animations (21-qcm.js) jouent par-dessus et peuvent être coupées à tout instant.
   API privée pour les autres fragments du combat : FX.arena. */
FX.module('arene', function (FX) {
  var D = document, game = D.getElementById('screen-game'), wrap = D.getElementById('question-wrap');
  if (!game || !wrap || wrap.parentNode !== game) return;

  /* Adversaires génériques. Un sbire par question (choix déterministe, sans hasard). */
  var SBIRES = ['👾', '🤖', '🦂', '🦇', '🕷️', '🐙', '🦖', '🗿'];
  var COMBOS = { 2: 'DOUBLE !', 3: 'TRIPLE !', 4: 'QUADRA !', 5: 'PENTA !' };      // mêmes mots que le bandeau de combo du jeu
  var el = FX.el('div');
  el.id = 'fx-arena';
  var left = FX.el('span', 'fx-ar-f fx-ar-l', el), hero = FX.el('span', 'fx-ar-emo fx-ar-hero', left);
  var mid = FX.el('span', 'fx-ar-m', el), combo = FX.el('b', 'fx-ar-combo', mid), tag = FX.el('span', 'fx-ar-tag', mid);
  var right = FX.el('span', 'fx-ar-f fx-ar-r', el), hp = FX.el('span', 'fx-ar-hp', right), foe = FX.el('span', 'fx-ar-emo fx-ar-foe', right);
  var cur = null;                    // dernier état calculé { kind, boss, free, retry, first, n }
  game.insertBefore(el, wrap);
  D.documentElement.setAttribute('data-fx-arena', '');      // active la compaction CSS : jamais sans la bande

  function put(n, s) { if (n.textContent !== s) n.textContent = s; }
  function cls(c, on) { el.classList[on ? 'add' : 'remove'](c); }
  /* Barre de vie : n segments dont « alive » encore pleins (les perdus s'éteignent par la droite). */
  function bars(n, alive) {
    var i;
    while (hp.childNodes.length > n) hp.removeChild(hp.lastChild);
    while (hp.childNodes.length < n) FX.el('i', '', hp);
    for (i = 0; i < n; i++) hp.childNodes[i].className = i < alive ? '' : 'fx-off';
  }
  /* Palier de combo : cran d'aura fixe (0 à 3) et pastille ×N. */
  function step(s) {
    el.setAttribute('data-fx-combo', s >= 2 ? Math.min(3, s - 1) : 0);
    put(combo, s >= 2 ? '×' + s : '');
  }
  /* Dernière bonne réponse possible d'une partie finie (à lire APRÈS answer : une erreur qui vient
     de mettre une question en file de révision ne peut pas passer). */
  function fin() {
    var st = FX.game.state();
    return !!st && !st.infiniteChapter && st.qIndex >= st.questions.length - 1 && !(st.missedQueue && st.missedQueue.length);
  }

  /* État immobile après la réponse. res : 'ok' | 'faux' | 'temps'.
     Juste : le sbire est K.O. (le boss perd un segment, la cible d'entraînement reste debout).
     Faux / temps écoulé : le monstre s'échappe — c'est la question qui reviendra — et un repère
     calme renvoie vers l'explication. Aucune moquerie, aucun cœur brisé. */
  function apres(res, last) {
    var st = FX.game.state(), boss = cur && cur.boss, free = cur && cur.free;
    if (!st || !cur) return;
    cls('fx-tense', 0); cls('fx-gel', 0);
    step(st.streak);
    if (res === 'ok') {
      put(tag, COMBOS[st.streak] || (st.streak > 5 ? 'COMBO !' : ''));
      if (boss) bars(cur.n, last ? 0 : Math.max(0, cur.n - st.correct));
      else if (!free) bars(1, 0);
      el.setAttribute('data-fx-etat', free ? '' : last ? 'sorti' : boss ? '' : 'ko');
    } else {
      el.setAttribute('data-fx-etat', boss || free ? '' : 'fuite');
      put(tag, res === 'temps' ? '⏳ Temps écoulé' : `👇 Lis l'explication`);
      cls('fx-down', boss && st.hp <= 0);
    }
  }

  /* Recalcule toute l'arène depuis l'état du jeu. Renvoie l'état calculé, ou null hors partie. */
  function sync() {
    var st = FX.game.state(), q = st && st.questions && st.questions[st.qIndex];
    var pal, boss, free, kind, emo, t = '', n, i, g;
    if (!q) return null;
    pal = FX.palette(); boss = !!st.bossMode; free = !!st.freeMode;
    FX.paint(el);
    el.style.setProperty('--fx-ca', FX.color.alpha(pal.c, 0.24));
    el.style.setProperty('--fx-ua', FX.color.alpha(pal.u, 0.16));
    put(hero, pal.heroEmoji);
    if (free) { kind = 'cible'; emo = '🎯'; }
    else if (boss) { kind = 'boss'; emo = '👹'; }
    else if (q._retry) { kind = 'revenant'; emo = '👻'; t = 'REVANCHE !'; }
    else if (st.qIndex > 0 && fin()) { kind = 'gardien'; emo = '👺'; t = 'DERNIER ADVERSAIRE'; }
    else {
      kind = 'sbire';
      emo = SBIRES[((q._origIndex || 0) * 7 + String(q.text || '').length) % SBIRES.length];
      if (q._generated) {              // pool infini : une vague toutes les 8 questions générées
        for (g = 0, i = 0; i < st.qIndex; i++) if (st.questions[i]._generated) g++;
        if (g % 8 === 0) t = 'VAGUE ' + (g / 8 + 2);
      }
    }
    if (st.timeFrozen && !st.answered) t = '⏸️ Temps figé';
    put(foe, emo); put(tag, t);
    el.setAttribute('data-fx-foe', kind);
    el.setAttribute('data-fx-etat', '');
    n = boss ? Math.min(st.originalLength || 12, 16) : free ? 0 : 1;
    bars(n, boss ? Math.max(0, n - st.correct) : 1);
    step(st.streak);
    cls('fx-gel', st.timeFrozen && !st.answered);
    cls('fx-tense', !st.answered && !free && st.timeLeft <= 5);
    cls('fx-down', boss && st.hp <= 0);
    cur = { kind: kind, boss: boss, free: free, retry: !!q._retry, first: st.qIndex === 0, n: n };
    if (st.answered) {                 // reprise après une pause, niveau rallumé : l'issue se lit sur les boutons du jeu
      apres(D.querySelector('#answers-grid .answer-btn.wrong') ? 'faux'
          : D.querySelector('#answers-grid .answer-btn.correct') ? 'ok' : 'temps', fin());
    }
    return cur;
  }

  /* Géométrie au moment de l'effet : { a: arène, h: héros, f: adversaire }, ou null si la bande
     n'est pas réellement à l'écran (masquée, défilée, cachée sous l'en-tête collant). */
  function geo() {
    var a = FX.rect(el), hd, h, f;
    if (!a || !a.inView || a.cy > FX.vh()) return null;
    hd = FX.rect('header');
    if (hd && hd.inView && a.cy < hd.y + hd.h) return null;
    h = FX.rect(hero); f = FX.rect(foe);
    return h && f ? { a: a, h: h, f: f } : null;
  }

  FX.arena = { el: el, hero: hero, foe: foe, tag: tag, combo: combo, hp: hp,
               sync: sync, apres: apres, fin: fin, geo: geo };

  /* Niveau rallumé, modale refermée, thème changé : on recale l'image fixe (aucune animation). */
  function resync() { if (FX.level() !== 'off' && FX.env.screen() === 'game') sync(); }
  FX.on('fx:level', resync);
  FX.on('fx:resume', resync);
  FX.wrap('applyTheme', null, resync);
});
