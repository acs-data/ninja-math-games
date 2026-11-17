/* ═══ 04-hooks.js — crochets du noyau : suivi de l'écran, modales, visibilité ═══
   Le noyau ne suit que ce dont TOUS les modules ont besoin. Chaque module pose ses propres
   crochets avec FX.wrap (plusieurs modules peuvent envelopper la même fonction). */

function setScreen(id) {
  S.screen = id;
  S.profile = FX.PROFILES.hasOwnProperty(id) ? FX.PROFILES[id] : 'home';
  ROOT.setAttribute('data-fx-screen', id);
  ROOT.setAttribute('data-fx-profile', S.profile);
}
function installHooks() {
  /* showScreen(id) : seule porte de changement d'écran. L'appel arrive AVANT que le jeu ne
     remplisse l'écran : l'évènement 'screen' n'est donc traité qu'à la frame suivante.
     Toujours actif (même au niveau off) pour que l'écran courant soit juste si on rallume. */
  FX.wrap('showScreen', function () { return S.screen; }, function (prev, args) {
    var id = String(args[0]);
    if (id === prev) return;
    setScreen(id);
    FX.bump('screen'); FX.bump('q');
    FX.emit('screen', { id: id, prev: prev, profile: S.profile });
  }, { always: true });

  /* Une modale s'ouvre : tout s'arrête dans le même tick (en thème sombre le fond n'est pas voilé). */
  FX.wrap('openModal', null, function () { if (modalOpen()) suspend('modale'); });
  /* Fermeture : reprise si plus aucune modale. popstate ferme les modales SANS closeModal,
     et la boucle revérifie de toute façon l'état réel avant chaque frame. */
  FX.wrap('closeModal', null, resume);
  W.addEventListener('popstate', function () { setTimeout(function () { try { resume(); } catch (e) {} }, 0); });
  /* Signal 'fx:input' ('key' | 'pointer') : écoute passive, pour « un appui passe la cérémonie ».
     Ne retarde ni n'annule jamais l'évènement (pas de preventDefault, pas de stopPropagation). */
  var onInput = function (e) {
    if (!S.dead && S.pref !== 'off' && handlers['fx:input']) dispatch('fx:input', e.type === 'keydown' ? 'key' : 'pointer');
  };
  D.addEventListener('pointerdown', onInput, { capture: true, passive: true });
  D.addEventListener('keydown', onInput, { capture: true, passive: true });
  D.addEventListener('visibilitychange', function () {
    try { if (D.hidden) { if (S.pref !== 'off' && !S.dead) suspend('caché'); } else resume(); } catch (e) {}
  });
}
