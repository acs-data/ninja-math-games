/* ═══ 99-boot.js — démarrage (dernier fragment) ═══
   Ordre : globale FX -> réglages -> montage -> crochets du noyau -> modules (un try chacun).
   Ce script s'exécute juste après celui du jeu : tout le rendu initial est déjà fait, aucun
   crochet ne l'a vu. Les modules lisent donc l'état courant eux-mêmes dans leur init. */
W.FX = FX;
(function boot() {
  var app = D.getElementById('app'), i;
  try {
    /* Navigateur incompatible (pas de canvas 2D, de Web Animations ou de rAF) : la couche naît coupée,
       comme après le disjoncteur — jeu classique, aucun bouton dans les modales de pause. */
    if (!app || !mountEngine(app)) kill('incompatible');
    initSettings();
    mountSettings();
    setScreen('home');
    if (!S.dead) {
      installHooks();
      /* Page chargée dans un onglet caché (ou derrière une modale) : la couche démarre suspendue, pour que le
         premier retour de l'onglet émette « fx:resume » (l'ouverture de l'accueil est alors jouée à l'arrivée). */
      S.suspended = S.pref !== 'off' && blocked();
    }
  } catch (e) { oops(e, 'boot'); kill('boot'); }
  booted = true;
  if (!S.dead) for (i = 0; i < mods.length; i++) runModule(mods[i]);
})();
