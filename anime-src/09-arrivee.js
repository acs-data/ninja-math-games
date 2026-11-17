/* ═══ 09-arrivee.js — module « arrivee » : transition d'écran ═══
   showScreen ne connaît pas d'écran « sortant » (l'ancien est déjà masqué) : la transition est une
   RÉVÉLATION. Un panneau de la couleur du fond de page (.fx-blade, dans #fx-stage) couvre la zone
   sous l'en-tête dès la première frame peinte du nouvel écran, puis s'en va.
     complet : « lame » — le panneau glisse, bord d'attaque lumineux aux couleurs de l'univers
               (300 ms vers la droite ; vers l'accueil : vers la gauche, 240 ms ; vers un écran de
               résultat : rideau vers le bas, 340 ms) ;
     léger, et arrivée du jeu après l'écran de chargement (la carte VS a déjà fait l'entrée) :
               fondu de 140 ms ;
     profil sobre (épreuves) : rien.
   Aucun nœud du jeu n'est animé : FX.rect reste juste pendant la transition, et rien ne peut
   laisser un écran masqué (le panneau est invisible par lui-même : seule son animation le montre).
   Le panneau passe SOUS le canvas et sous les autres nœuds de la scène (carte VS, échelle des
   rangs…) : il ne cache que le jeu. Il ne reçoit jamais le pointeur et ne retarde aucune saisie.
   Le noyau n'émet « screen » que pour un vrai changement d'écran (showScreen('dnb-ex') répété :
   rien) ; un module peut remplacer celui-ci en réenregistrant FX.module('arrivee', …). */
FX.module('arrivee', function (FX) {
  FX.on('screen', function (d) {
    if (d.profile === 'sobre') return;
    FX.play('arrivee', function (lv, pal) {
      var n = FX.node('fx-blade'), h = FX.rect('header'), home = d.id === 'home', cer = d.profile === 'ceremony';
      if (!n) return;
      n.style.top = (h && h.inView ? Math.max(0, h.y + h.h) : 0) + 'px';
      if (lv < 2 || d.prev === 'loading') {
        FX.anim(n, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'none', remove: true, name: 'fx-blade' });
        return;
      }
      n.style[cer ? 'borderTop' : home ? 'borderRight' : 'borderLeft'] = '10px solid ' + pal.u;
      n.style.boxShadow = '0 0 26px 3px ' + FX.color.alpha(pal.u, 0.55);
      FX.anim(n, [{ opacity: 1, transform: 'none' },
                  { opacity: 1, transform: cer ? 'translateY(100%)' : 'translateX(' + (home ? '-' : '') + '100%)' }],
              { duration: cer ? 340 : home ? 240 : 300, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'none', remove: true, name: 'fx-blade' });
    }, { info: d.id });
  });
});
