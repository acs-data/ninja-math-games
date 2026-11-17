/* ═══ 09-arrivee.js — effet générique minimal : arrivée d'un écran ═══
   Prouve que la couche est vivante avant tout module de contenu. Un module peut le REMPLACER
   en enregistrant FX.module('arrivee', …) dans un fichier de préfixe supérieur.
   Complet : fondu + léger glissement (220 ms). Léger : fondu seul (140 ms). Profil sobre : rien.
   L'écran du jeu n'est animé que par WAAPI (fill « backwards ») : visible par lui-même si la couche tombe. */
FX.module('arrivee', function (FX) {
  FX.on('screen', function (d) {
    if (d.profile === 'sobre') return;
    var el = document.getElementById('screen-' + d.id);
    if (!el) return;
    FX.play('arrivee', function (lv) {
      FX.anim(el, lv > 1 ? [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }]
                         : [{ opacity: 0 }, { opacity: 1 }],
              { duration: lv > 1 ? 220 : 140, name: 'arrivee' });
    }, { info: d.id });
  });
});
