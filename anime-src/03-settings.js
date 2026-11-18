/* ═══ 03-settings.js — réglage « Animations » : niveaux, boutons, persistance ═══
   Seul fichier de la couche autorisé à toucher au stockage local, et uniquement derrière
   isSaveEnabled() (opt-in RGPD du jeu). Clé : amat_fx_v1 = {"v":1,"n":niveau,"d":dernier niveau actif,
   "r":1 si le système demandait moins d'animations au moment du choix, sinon 0}.
   Sans opt-in, le choix reste en mémoire pour la durée de la page.
   Les boutons sont de vrais <button> (aria-pressed), créés une fois et mis à jour sur place :
   closeModal() redonne le focus à un nœud mémorisé, il ne faut donc jamais les remplacer.
   Aucun toast, aucune annonce : le changement d'aria-pressed est restitué nativement.
   L'état est porté par le texte et par aria-pressed, jamais par la classe « active » du jeu (en thème
   clair elle donne un vert à 2,76:1 — acceptable pour un état rare, pas pour un bouton allumé par défaut). */

var FX_KEY = 'amat_fx_v1';
var ui = [];        // { btn, label, kind: 'power' | 'lite', modal, wait }
var choice = null;  // choix explicite du joueur : { n: niveau, d: dernier niveau actif, r: fait sous « mouvement réduit » }

/* Écrit le choix si la sauvegarde est activée ET que le joueur a choisi ; sinon efface la clé
   (la désactivation a pu se faire dans index.html, qui ne connaît pas cette clé). */
function storePref() {
  try {
    if (FX.game.saveOn() && choice) localStorage.setItem(FX_KEY, JSON.stringify({ v: 1, n: choice.n, d: choice.d, r: choice.r ? 1 : 0 }));
    else localStorage.removeItem(FX_KEY);
  } catch (e) {}
}
/* Relit la clé (sauvegarde activée seulement). Tout est dans le try, types compris : une valeur de mauvais
   type ({"n":["off"]}, {"n":{"toString":1}}), une autre version ou un texte illisible ne donnent aucun
   choix, et la clé est effacée (comme elle l'est quand la sauvegarde est inactive). */
function loadPref() {
  var o;
  try {
    if (FX.game.saveOn()) {
      o = JSON.parse(localStorage.getItem(FX_KEY));
      if (o && o.v === 1 && typeof o.n === 'string' && LEVELS.hasOwnProperty(o.n)) {
        choice = { n: o.n, d: o.n !== 'off' ? o.n : o.d === 'leger' || o.d === 'complet' ? o.d : '', r: o.r === 1 };
      }
    }
  } catch (e) {}
  if (!choice) storePref();
}
/* Niveau appliqué. Sans choix : off si le système demande moins d'animations (« ON » rallume alors au
   niveau léger), sinon complet. Avec un choix : il s'applique, SAUF s'il date d'avant que le système ne
   demande moins d'animations — le réglage du système l'emporte alors tant qu'il le demande (le choix n'est
   pas perdu : il revient si le système cesse de le demander). Un choix fait PENDANT que le système le
   demande engage le joueur : c'est le chemin « rallumer à léger ». */
function derive() {
  var c = choice && (choice.r || !S.reduced) ? choice : null;
  S.explicit = !!c;
  S.pref = c ? c.n : S.reduced ? 'off' : 'complet';
  S.lastOn = (c && c.d) || (S.reduced ? 'leger' : 'complet');
}
function applyLevel(prev) {
  ROOT.setAttribute('data-fx', S.dead ? 'off' : S.pref);
  if (LEVELS[S.pref] < LEVELS[prev]) FX.cancel('*');          // baisse de niveau : tout s'arrête dans le même tick
  S.suspended = S.pref !== 'off' && blocked();                // activé derrière une modale : reprise à sa fermeture
  syncUI();
  if (prev !== S.pref) dispatch('fx:level', { level: S.pref, prev: prev });
}

/* FX.setLevel(niveau, source) -> niveau appliqué. source 'systeme' ne remplace jamais un choix du joueur. */
FX.setLevel = function (level, source) {
  if (S.dead || !LEVELS.hasOwnProperty(level)) return FX.level();
  var prev = S.pref;
  if (source === 'systeme') {
    if (S.explicit) return prev;
    S.pref = level;
    if (level !== 'off') S.lastOn = level;
  } else {
    choice = { n: level, d: level !== 'off' ? level : S.lastOn, r: S.reduced };
    derive();
  }
  applyLevel(prev);
  if (source !== 'systeme') storePref();
  return S.pref;
};
/* Bascule off <-> dernier niveau actif. */
FX.toggle = function () { return FX.setLevel(S.pref === 'off' ? S.lastOn : 'off'); };

/* Met les boutons à jour sur place. Couche coupée : « indisponibles », inactifs — et les deux boutons des
   modales de pause sont RETIRÉS : le piège à focus du jeu prend le dernier <button> de la modale, actif ou
   non, et un bouton inactif à cette place le casserait (Tab sortirait de la modale). Celui qui a le focus à
   cet instant reste en place, inerte mais focalisable, jusqu'à ce que le focus le quitte : le retirer ferait
   tomber le focus hors de la modale. */
function syncUI() {
  var on = !S.dead && S.pref !== 'off', lite = S.pref === 'leger', i, u, pressed;
  for (i = ui.length - 1; i >= 0; i--) {
    u = ui[i];
    if (S.dead && u.modal) {
      if (D.activeElement !== u.btn) {
        if (u.btn.parentNode) u.btn.parentNode.removeChild(u.btn);
        ui.splice(i, 1);
        continue;
      }
      if (!u.wait) { u.wait = 1; u.btn.addEventListener('focusout', syncUI); }
      u.btn.setAttribute('aria-disabled', 'true');
    }
    pressed = u.kind === 'lite' ? (on && lite) : on;
    u.btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    u.btn.disabled = (S.dead && !u.modal) || (u.kind === 'lite' && !on);
    u.label.textContent = S.dead ? 'Animations : indisponibles'
      : (u.kind === 'lite' ? 'Effets légers : ' : 'Animations : ') + (pressed ? 'ON' : 'OFF');
  }
}
/* Bouton de réglage. Les classes sont celles du jeu (apparence, 44 px mini, focus visible) ;
   aucun écouteur clavier : Entrée/Espace déclenchent le clic natif du bouton. */
function makeButton(id, cls, emoji, kind, iconCls, labelCls) {
  var b = D.createElement('button'), ic = D.createElement('span'), lb = D.createElement('span');
  b.type = 'button'; b.id = id; b.className = cls;
  ic.setAttribute('aria-hidden', 'true'); ic.textContent = emoji;
  if (iconCls) ic.className = iconCls;
  if (labelCls) lb.className = labelCls;
  b.appendChild(ic); b.appendChild(D.createTextNode(' ')); b.appendChild(lb);
  b.addEventListener('click', function () {
    try {
      if (kind === 'lite') { if (S.pref !== 'off') FX.setLevel(S.pref === 'leger' ? 'complet' : 'leger'); }
      else if (FX.toggle() !== 'off') confirmBurst(b);
    } catch (e) { oops(e, 'reglage'); }
  });
  ui.push({ btn: b, label: lb, kind: kind, modal: /pause/.test(id) });
  return b;
}
/* Petit éclat de confirmation depuis le bouton (rien si une modale est ouverte : niveau effectif nul). */
function confirmBurst(b) {
  var r = FX.rect(b);
  if (r && r.inView) FX.fx.burst(r.cx, r.cy, { n: 12, kind: 'star', speed: 160, life: 550, size: 5, gravity: 120, scope: 'ui' });
}
function mountSettings() {
  var save = D.getElementById('drawer-save-toggle'), theme = D.getElementById('theme-toggle-btn'), i, box,
      pauses = ['modal-pause', 'modal-auto-pause'];
  if (save && save.parentNode) {            // tiroir : juste avant « Sauvegarde », le piège à focus reste inchangé
    save.parentNode.insertBefore(makeButton('fx-set-drawer', 'drawer-item', '✨', 'power', 'drawer-icon', 'drawer-label'), save);
    save.parentNode.insertBefore(makeButton('fx-lite-drawer', 'drawer-item', '🍃', 'lite', 'drawer-icon', 'drawer-label'), save);
  }
  if (theme && theme.parentNode) {          // accueil : après le bouton de thème
    theme.parentNode.insertBefore(makeButton('fx-set-home', 'btn-control home-action-btn', '✨', 'power'), theme.nextSibling);
  }
  /* Modales de pause : en dernier, le focus initial ne change pas. Jamais montés si la couche naît coupée
     (navigateur incompatible) : un bouton inactif en dernière position casserait le piège à focus. */
  for (i = 0; i < pauses.length && !S.dead; i++) {
    box = D.querySelector('#' + pauses[i] + ' .modal-actions');
    if (box) box.appendChild(makeButton(i ? 'fx-set-auto-pause' : 'fx-set-pause', 'btn-sec', '✨', 'power'));
  }
  syncUI();
}
function initSettings() {
  var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  S.reduced = !!(mq && mq.matches);
  loadPref();
  derive();
  ROOT.setAttribute('data-fx', S.dead ? 'off' : S.pref);
  if (mq) {
    /* Le réglage du système change en cours de route, dans un sens ou dans l'autre. */
    var onChange = function () {
      var prev = S.pref;
      S.reduced = !!mq.matches;
      if (S.dead) return;
      derive();
      applyLevel(prev);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  /* Sauvegarde activée -> on écrit le choix ; désactivée -> on efface la clé (le jeu ne la connaît pas).
     « always » : vrai aussi au niveau off et couche coupée. */
  FX.wrap('toggleSave', null, storePref, { always: true });
}
