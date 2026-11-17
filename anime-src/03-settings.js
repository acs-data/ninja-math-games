/* ═══ 03-settings.js — réglage « Animations » : niveaux, boutons, persistance ═══
   Seul fichier de la couche autorisé à toucher au stockage local, et uniquement derrière
   isSaveEnabled() (opt-in RGPD du jeu). Clé : amat_fx_v1 = {"v":1,"n":niveau,"d":dernier niveau actif}.
   Sans opt-in, le choix reste en mémoire pour la durée de la page.
   Les boutons sont de vrais <button> (aria-pressed), créés une fois et mis à jour sur place :
   closeModal() redonne le focus à un nœud mémorisé, il ne faut donc jamais les remplacer.
   Aucun toast, aucune annonce : le changement d'aria-pressed est restitué nativement. */

var FX_KEY = 'amat_fx_v1';
var ui = [];        // { btn, label, kind: 'power' | 'lite', active }

/* Écrit le choix si la sauvegarde est activée ET que le joueur a choisi ; sinon efface la clé
   (la désactivation a pu se faire dans index.html, qui ne connaît pas cette clé). */
function storePref() {
  try {
    if (FX.game.saveOn() && S.explicit) localStorage.setItem(FX_KEY, JSON.stringify({ v: 1, n: S.pref, d: S.lastOn }));
    else localStorage.removeItem(FX_KEY);
  } catch (e) {}
}
function loadPref() {
  var o = null;
  try { if (FX.game.saveOn()) o = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); } catch (e) { o = null; }
  if (o && LEVELS.hasOwnProperty(o.n)) {
    S.pref = o.n; S.explicit = true;
    S.lastOn = o.n !== 'off' ? o.n : (o.d === 'leger' || o.d === 'complet' ? o.d : S.lastOn);
  } else storePref();
}
/* Défaut sans choix explicite : off si le système demande moins d'animations, sinon complet.
   Un joueur « mouvement réduit » qui rallume les animations démarre au niveau léger. */
function systemDefault() {
  S.pref = S.reduced ? 'off' : 'complet';
  S.lastOn = S.reduced ? 'leger' : 'complet';
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
  if (source === 'systeme') { if (S.explicit) return prev; }
  else S.explicit = true;
  S.pref = level;
  if (level !== 'off') S.lastOn = level;
  applyLevel(prev);
  if (source !== 'systeme') storePref();
  return S.pref;
};
/* Bascule off <-> dernier niveau actif. */
FX.toggle = function () { return FX.setLevel(S.pref === 'off' ? S.lastOn : 'off'); };

function syncUI() {
  var on = !S.dead && S.pref !== 'off', lite = S.pref === 'leger', i, u, pressed;
  for (i = 0; i < ui.length; i++) {
    u = ui[i];
    pressed = u.kind === 'lite' ? (on && lite) : on;
    u.btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    u.btn.disabled = S.dead || (u.kind === 'lite' && !on);
    u.label.textContent = S.dead ? 'Animations : indisponibles'
      : (u.kind === 'lite' ? 'Effets légers : ' : 'Animations : ') + (pressed ? 'ON' : 'OFF');
    if (u.active) { if (pressed) u.btn.classList.add('active'); else u.btn.classList.remove('active'); }
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
  ui.push({ btn: b, label: lb, kind: kind, active: /home-action-btn/.test(cls) });
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
  for (i = 0; i < pauses.length; i++) {     // modales de pause : en dernier, le focus initial ne change pas
    box = D.querySelector('#' + pauses[i] + ' .modal-actions');
    if (box) box.appendChild(makeButton(i ? 'fx-set-auto-pause' : 'fx-set-pause', 'btn-sec', '✨', 'power'));
  }
  syncUI();
}
function initSettings() {
  var mq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  S.reduced = !!(mq && mq.matches);
  systemDefault();
  loadPref();
  ROOT.setAttribute('data-fx', S.dead ? 'off' : S.pref);
  if (mq) {
    var onChange = function () {
      S.reduced = !!mq.matches;
      if (S.explicit || S.dead) return;
      var prev = S.pref;
      systemDefault();
      applyLevel(prev);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }
  /* Sauvegarde activée -> on écrit le choix ; désactivée -> on efface la clé (le jeu ne la connaît pas). */
  FX.wrap('toggleSave', null, storePref, { always: true });
}
