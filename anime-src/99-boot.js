/* ═══ 99-boot.js — démarrage (dernier fragment) ═══
   Ordre : globale FX -> réglages -> montage -> crochets du noyau -> modules (un try chacun).
   Ce script s'exécute juste après celui du jeu : tout le rendu initial est déjà fait, aucun
   crochet ne l'a vu. Les modules lisent donc l'état courant eux-mêmes dans leur init. */
W.FX = FX;
(function boot() {
  var app = D.getElementById('app'), ok = false, i;
  try {
    ok = !!app && mountEngine(app);
    if (!ok) S.dead = true;                       // navigateur incompatible : jeu classique, boutons inactifs
    initSettings();
    mountSettings();
    setScreen('home');
    if (ok) installHooks();
  } catch (e) { oops(e, 'boot'); kill('boot'); }
  booted = true;
  if (!S.dead) for (i = 0; i < mods.length; i++) runModule(mods[i]);
})();
