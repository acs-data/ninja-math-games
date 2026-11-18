# anime-src — couche d'animation de `anime.html`

`anime.html` = `index.html` (jamais modifié) + cette couche, assemblée par `tools/build_anime.py`.
Ce fichier est le **contrat** entre le noyau et les modules. Toute évolution du noyau doit être reflétée ici.

## 1. Architecture en 20 lignes

1. `python3 tools/build_anime.py` copie `index.html`, retouche le `<head>` (titre, description, OG, manifest —
   balises reconnues par leur nom, § 5.1), injecte `anime-src/*.css` dans `<style id="fx-style">` avant `</head>`
   et `anime-src/*.js` dans **une seule IIFE** (`<script id="fx-script">`) avant `</body>`. Ordre = ordre
   alphabétique des noms (`NN-nom.ext`).
2. Fragments `00`–`09` et `99` = **noyau** (portée partagée). Fragments `10`–`98` = **modules** : le build enferme
   chacun dans sa propre fonction et son propre `try` → aucune collision de noms, un module cassé n'arrête pas les autres.
3. Une seule globale : `window.FX`. Le script s'exécute juste après celui du jeu (rendu initial déjà fait).
4. Le jeu est observé en **enveloppant** ses fonctions globales (`FX.wrap`) : l'original est appelé une fois, hors `try`.
5. Un crochet ne dessine rien : il photographie l'état et appelle `FX.emit` (O(1), aucune lecture du DOM).
6. La file est vidée à la **frame suivante** (le jeu a alors fini de remplir l'écran) ; un évènement est abandonné
   si sa portée ou l'écran a changé, si une modale est ouverte ou si l'onglet est caché. L'évènement `screen` du
   noyau, lui, n'est jamais abandonné faute de place.
7. Niveaux : `off | leger | complet` sur `html[data-fx]`. Chaque écran a un **profil** qui plafonne le niveau
   **dans les primitives** (pas dans chaque chorégraphie).
8. Rendu : un canvas plein écran (particules, anneaux, entailles, émojis), des nœuds de texte dans `#fx-stage`,
   et `element.animate()` (WAAPI). Aucune animation CSS, aucune image, aucun son, aucun réseau.
9. `#fx-root` (fixe, `z-index:500`, `pointer-events:none`, `aria-hidden`) est le dernier enfant de `#app` :
   au-dessus des écrans et de l'en-tête, sous le tiroir, les modales et le toast.
10. Chaque effet a une **portée** (`screen` par défaut) ; `FX.cancel/bump` l'arrête net. Le noyau fait
    `bump('screen')` + `bump('q')` à chaque changement d'écran, et coupe tout à l'ouverture d'une modale.
11. Disjoncteur : 3 erreurs sur un crochet → ce crochet est coupé ; 8 erreurs au total → la couche se coupe
    (`data-fx="off"`), le jeu continue comme `index.html`.
12. Le hasard de la couche vient de `FX.rnd()` (jamais du générateur du jeu) : à graine égale, les deux pages
    tirent les mêmes questions (test différentiel).

| fichier | rôle |
|---|---|
| `00-core.css` | calque, textes flottants, bandeaux, boutons de réglage, pause des boucles du jeu au niveau off |
| `00-kernel.js` | `FX`, niveaux, profils, `wrap`, disjoncteur, file d'évènements, portées, modules, journal |
| `01-engine.js` | canvas, particules, formes, WAAPI, nœuds de scène, teinte, géométrie |
| `02-palette.js` | couleurs univers/personnage corrigées par thème |
| `03-settings.js` | réglage « Animations » (5 boutons), persistance `amat_fx_v1` |
| `04-hooks.js` | crochets du noyau : `showScreen`, `openModal`, `closeModal`, visibilité, signal d'appui |
| `09-arrivee.js` | module `arrivee` : transition d'écran (lame / fondu, panneau `.fx-blade`) — remplaçable |
| `99-boot.js` | démarrage |
| `20-arena.js`, `20-battle.css` | module `arene` : bande de combat du QCM (`#fx-arena`, API `FX.arena`) |
| `21-qcm.js` | module `combat` : moments du QCM (réponse, combo, revanche, pouvoirs, tension, niveau) |
| `25-result.js` | module `verdict` : cérémonie du rang (écran de résultat du QCM) et carte VS du chargement |
| `30-shell.js` | module `accueil` : ouverture de l'accueil, univers, personnage, classe, envol d'un mode, thème |
| `40-textmodes.js`, `40-textmodes.css` | module `textes` : Vrai/Faux, Histoire, Automatismes, DNB Blanc et leurs écrans de résultat |
| `50-interactive.js`, `50-interactive.css` | module `ateliers` : Tracé, Puzzle, Constructeur, Arbre de probabilités, Lecteur de graphique, Stats |

Les modules existants sont décrits au § 6 ; leurs scénarios de test sont dans `tools/anime-tests/` (§ 5).
Poids : ≈ 99 Ko injectés (plafond : 105 000 octets, avertissement du build au-delà) ; le build affiche le poids
injecté de chaque fragment.

## 2. Règles qu'un module doit respecter

**Jeu intact.** Ne jamais modifier `index.html`. Aucun changement de score, de minuteur, de flux de questions, de
focus, d'annonce lecteur d'écran ni de raccourci clavier. Ne corriger ni masquer aucun défaut hérité de `index.html`.

**Interdits vérifiés par le build (échec).** Les lints lisent le texte des fragments, ligne par ligne, commentaires
retirés (une URL dans une chaîne est donc vue). Ils visent des NOMS : l'appel direct, `.call` / `.apply`, le passage en
valeur (`setTimeout(showToast, …)`), l'alias (`W.fetch`, `D.cookie`) et l'accès entre crochets (`Math["random"]`,
`el["innerHTML"]`) sont refusés de la même façon.

- *Jeu intact* : `.random`, `.focus`, `.blur`, tout défilement (`scrollIntoView`, `scrollTo`, `scrollBy`, `.scroll(`,
  `scrollTop =`), `showToast`, `announceToScreenReader`, les chaînes `'sr-live'` et `'toast'` (régions live du jeu),
  `stopPropagation`.
- *Code et HTML fabriqués* : `eval`, `Function(`, `setTimeout('chaîne')`, `.write(`, `insertAdjacentHTML`, `outerHTML`,
  `createContextualFragment`, `setHTMLUnsafe`, `DOMParser`, `innerHTML` autrement qu'affecté d'une chaîne littérale,
  `</script`, `<!--`, une balise d'image, de son, de cadre, de script ou de style dans une chaîne.
- *Légal et vie privée (aucun réseau, aucun média, aucun suivi)* : `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`,
  `EventSource`, `Worker`, `serviceWorker`, `import(`, `new Image`, `new Audio`, `AudioContext`, toute URL littérale
  (`http:`, `https:`, `//hôte`, `data:`, `blob:` — seul l'espace de noms SVG est admis), `url(` / `@import` /
  `@font-face` dans une chaîne, `.src =`, `.href =`, `.cssText =`, `setAttribute('src' | 'href' | 'style' | …)`, une
  feuille de style fabriquée (`insertRule`, `adoptedStyleSheets`), `goatcounter`, `track(` (compteur du jeu), `cookie`,
  `indexedDB`, `sessionStorage`, `caches`, `navigator`, `location`, `window.open`.
- *Création de nœuds* : `createElement(` et `FX.el(` reçoivent une balise en chaîne littérale (seul le corps de `FX.el`,
  dans `01-engine.js`, reçoit une variable), et jamais `img`, `picture`, `audio`, `video`, `source`, `track`, `iframe`,
  `object`, `embed`, `script`, `link`, `style`, `base`, `meta`.
- *Réservés au fragment `03-settings.js`* (nom exact : un autre fichier nommé `…settings…` n'y a pas droit) :
  `localStorage` (derrière `isSaveEnabled()`), `preventDefault`.
- *CSS* : tout sélecteur contient `fx-` ou `data-fx` ; `@keyframes` et variables préfixés `fx-` / `--fx-` ; aucun
  `url(`, `@import`, `@font-face`, `image-set(`, aucune URL, aucun échappement `\` (écrire le caractère lui-même).

Ces lints sont un **fil d'alarme, pas un bac à sable** : un nom fabriqué à l'exécution (`'inner' + 'HTML'`) ou un
alias obtenu par un détour leur échappe. Deux filets les complètent : le build vérifie à chaque construction, sur un
tableau de formes interdites et de formes saines (`LINT_REFUSED_*`, `LINT_ACCEPTED_*` dans `tools/build_anime.py`),
que les lints mordent toujours ; la suite de tests contrôle à l'exécution ce qu'un texte ne peut pas prouver (§ 5 :
scénario `reseau`, empreinte du DOM, audit des nœuds de la couche). Ajouter un interdit = une ligne dans
`JS_FORBIDDEN` / `CSS_FORBIDDEN` et une forme dans le tableau.

**DOM.**
- Tout nœud créé est `aria-hidden="true"` et `pointer-events:none` (utiliser `FX.el`). Seuls les boutons de réglage
  du noyau sont interactifs.
- Ne jamais écrire dans une région live (`#hud-score`, `#hud-streak`, `#toast`, `#sr-live`), ni dans un nœud que le
  jeu re-génère (`#answers-grid`, `.answer-btn`, `#char-grid`, `#universe-grid`, `#mission-chips`, `#chakra-bg`,
  `#trophies-list`…). Parent par défaut : `#fx-stage` (ce que font `FX.node` et les primitives). Un nœud placé DANS
  un écran du jeu (`#screen-*`) entre dans sa mise en page : seuls `#fx-arena` et le bouton `#fx-set-home` y sont
  admis par l'audit de la suite (§ 5) ; en ajouter un autre, c'est l'inscrire dans cet audit et le couvrir par le
  test « mise en page ».
- Jamais de classe du jeu sur un nœud FX (`answer-btn`, `modal-overlay`, `show`, `stat-block`…), jamais d'id
  commençant par `screen-`, jamais de style en ligne sur un élément du jeu.
- Jamais de `transform`, `filter`, `will-change` sur `html`, `body`, `#app`, `main` ; jamais de `transform` animé
  sur `.answer-btn` (`FX.anim` refuse ces cibles).
- Éléments du jeu : uniquement `FX.anim` (WAAPI finie, `fill: backwards`) → visibles par eux-mêmes si la couche tombe.
- Jamais de `transform` sur un conteneur `#screen-*` (même bref) : `FX.rect` mesurerait de travers tous ses nœuds
  pendant l'animation. La transition d'écran se joue sur un panneau de la couche (`09-arrivee.js`).
- Un nœud FX qui COUVRE le jeu doit être invisible par lui-même (`opacity: 0` en CSS, montré par sa seule
  animation, `fill: 'none'`, `remove: true`) : coupé ou fini, il ne peut rien masquer (modèle : `.fx-blade`).

**Lecture d'abord.** Rien ne bouge durablement près d'un texte à lire ; pas de boucle sur un écran de question ;
effets finis : ≤ ~700 ms après une réponse, ≤ ~1,1 s pour un moment spécial, ≤ ~2,5 s (complet) / ~1,2 s (léger) pour
une cérémonie de résultat. Un effet ne couvre jamais la question, les réponses, l'explication ou un champ plus de
~400 ms. Une erreur est une étape d'apprentissage : pas de flash rouge, pas de secousse violente, pas de moquerie.

**Un seul effet focal à la fois.** Le moment d'un mode (verdict d'une réponse, fête d'un résultat) est l'effet
focal ; ce qui arrive en même temps attend son tour ou se réduit à un accent hors des zones de lecture (voir § 6.8 :
niveau gagné, retour sur l'accueil, repère d'explication). Un bandeau ne se pose jamais sur un texte du jeu : il
s'ancre sur l'en-tête (`anchor: 'header'`) ou sur un nœud de la couche.

**Photosensibilité.** Rien ne clignote plus de 3 fois par seconde ; aucun flash de luminance plein écran. Toute
teinte de grande surface passe par `FX.fx.tint` (limiteur unique).

**Légal.** Émojis Unicode et formes abstraites uniquement. Aucune image, aucun son, aucune ressource externe.
Aucune représentation dessinée d'un personnage, d'un logo ou d'un objet emblématique d'une licence. Mots de
licence : seulement ceux déjà présents dans `index.html` (via `FX.palette()` : `power`, `hero`, `uniName`…).

**Univers.** Couleurs et textes via `FX.palette()` (jamais `--orange`, jamais « Naruto » en dur) ; une clé d'univers
inconnue donne un repli générique.

**Code.** JS vanilla, pas de module ES, pas de classe ES6, aucune nouvelle globale. Commentaires et textes en
français ; gabarits (backticks) pour les apostrophes. Lire les globales du jeu par leur nom nu derrière `typeof`
(`state`, `CHARS`, `tfState`… sont réassignées : ne jamais les mettre en cache) ou via `FX.game.*`.

**Crochets.** Un crochet = lecture de quelques champs + `FX.emit`. Pas de lecture de géométrie, pas de dessin :
mesurer et dessiner dans le gestionnaire `FX.on`, exécuté à la frame suivante. Détecter un résultat en comparant
l'état avant/après l'appel (jamais en lisant le texte d'un toast).

## 3. Référence de l'API `FX`

Unités : px CSS dans le repère de la fenêtre (`getBoundingClientRect`), durées en ms, angles en radians.

### 3.1 Niveaux, contexte

| appel | résultat |
|---|---|
| `FX.version` | `'1.0.0'` |
| `FX.level()` | préférence du joueur : `'off' \| 'leger' \| 'complet'` (`'off'` si la couche est coupée) |
| `FX.setLevel(niveau, source?)` | applique dans le même tick (attribut `data-fx`, boutons, arrêt des effets si le niveau baisse, persistance). `source = 'systeme'` ne remplace jamais un choix du joueur. Renvoie le niveau appliqué |
| `FX.toggle()` | `off` ↔ dernier niveau actif |
| `FX.effective()` | `0 \| 1 \| 2` = min(préférence, plafond du profil) ; `0` si modale ouverte, onglet caché ou couche coupée |
| `FX.env.screen()` | dernier id passé à `showScreen` (`'home'` au départ ; `state.screen` du jeu est mort) |
| `FX.env.profile()` | profil de l'écran courant |
| `FX.env.visible(id?)` | l'écran est réellement affiché (style calculé) |
| `FX.env.modal()` | une `.modal-overlay.show` existe (lu dans le DOM, O(1)) |
| `FX.env.blocked()` | off, coupée, modale ouverte ou onglet caché |
| `FX.env.reduced()` | le système demande moins d'animations |
| `FX.game.state() / universe() / uni() / char() / theme() / saveOn()` | lecture sûre : `state`, `currentUniverse`, `UNIVERSES[…]`, `CHARS[state.char]`, `'dark'\|'light'`, `isSaveEnabled()` ; `null`/`false` en cas d'échec |

Attributs posés sur `<html>` (utilisables en CSS) : `data-fx="off|leger|complet"`, `data-fx-screen="<id>"`,
`data-fx-profile="<profil>"`, `data-fx-dead` (couche coupée).

**Profils** (`FX.PROFILES` : écran → profil, `FX.CAPS` : profil → `{ max, p: [particules léger, particules complet] }`) :

| profil | écrans | niveau max | particules léger / complet |
|---|---|---|---|
| `home` | `home`, `auto-menu`, `stats` (et tout écran inconnu) | complet | 24 / 160 |
| `battle` | `loading`, `game` | complet | 24 / 160 |
| `duel` | `tf` | complet | 16 / 96 |
| `recit` | `story` | complet | 16 / 96 |
| `atelier` | `draw`, `puzzle`, `pythagore`, `proba-tree`, `graph-reader` | complet | 16 / 64 |
| `ceremony` | `result`, `auto-result`, `tf-result`, `story-result`, `dnb-result`, `proba-tree-result`, `graph-reader-result` | complet | 40 / 160 |
| `sobre` | `auto`, `dnb-intro`, `dnb-transition`, `dnb-ex` | **léger** | **0 / 0** |

Ne pas assouplir `sobre`. Plafond absolu : 160 particules vivantes.

### 3.2 Crochets, évènements, modules

```js
FX.wrap(nom, avant, apres, opts) // -> boolean
//   avant(...args) -> ctx          même this et mêmes arguments que l'original ; peut être null
//   apres(ctx, args, retour)       non appelé si « avant » a levé ou si le jeu a levé ; peut être null
//   opts.always = true             le crochet tourne aussi au niveau off (suivi d'état, pas d'effet)
// Plusieurs modules peuvent envelopper la même fonction (une seule enveloppe, plusieurs paires).
// false si la fonction n'existe pas (FX.stats().missing) ou est refusée (FX.stats().denied) :
//   trapFocus, getCanvasPos, isPythDragging, getThemeColor, isSaveEnabled, handle*Move, et tout
//   render*/draw* sauf renderUniverseGrid, renderCharGrid, renderMissionChips, renderStats,
//   renderPuzzle, renderProbaTree, renderProbaPool, renderProbaQuestion, renderGraphQcm.

FX.emit(type, data, portee)      // -> boolean. Met en file (false si off, modale ouverte, onglet caché ou file
                                 //    pleine : 32 — les évènements déjà périmés sont d'abord retirés, et le type
                                 //    'screen' passe toujours). portee par défaut 'screen' ; null = ni filtre de
                                 //    portée ni filtre d'écran.
FX.on(type, fn)                  // fn(data) à la frame suivante (sauf signaux 'fx:*', synchrones)
FX.onScreen(ids, fn)             // fn({ id, prev, profile }) à l'arrivée sur un écran ; ids = 'game' | [...] | '*'
FX.play(nom, fn, opts)           // -> boolean. Si le niveau effectif (>= opts.min) le permet : journalise « nom »
                                 //    et exécute fn(niveau, palette) dans un try. opts.info = texte du journal.
FX.module(nom, init)             // init(FX) appelée au démarrage dans son propre try.
                                 //    Réenregistrer un nom REMPLACE le module (ex. 'arrivee').
```

Évènements émis par le noyau :

| type | quand | donnée |
|---|---|---|
| `screen` | frame suivant un `showScreen` vers un **autre** écran (l'écran est rempli) | `{ id, prev, profile }` |
| `fx:level` | synchrone, à chaque changement de niveau | `{ level, prev }` |
| `fx:suspend` | synchrone : une modale s'ouvre ou l'onglet se cache (tous les effets viennent d'être coupés) | raison |
| `fx:resume` | synchrone : plus aucune modale et onglet visible → resynchroniser l'affichage depuis l'état du jeu | — |
| `fx:input` | synchrone, écoute passive : `pointerdown` ou `keydown` (pour « un appui passe la cérémonie ») | `'pointer' \| 'key'` |
| `fx:kill` | synchrone : le disjoncteur a coupé la couche | raison |

Au niveau off : `FX.emit` renvoie `false`, les crochets sans `always` ne tournent pas, rien n'est journalisé.

Types d'évènements des modules (préfixe par module, pour éviter les collisions) : `qcm:*` et `xp:niveau`
(`21-qcm.js`, `25-result.js`), `sh:*` (`30-shell.js`), `tm:*` (`40-textmodes.js`), `at:*` (`50-interactive.js`).
Un nouveau module prend son propre préfixe.
Un crochet appelé plusieurs fois par tick (jeu rapide, tests) ne doit prendre qu'UNE place dans la file par
frame : garder la dernière donnée dans une variable et n'émettre qu'une fois (voir `emitRep` dans `21-qcm.js`,
`send` dans `50-interactive.js`).
Une fin de mode du jeu affiche son écran de résultat AVANT ou APRÈS avoir fini son travail, selon le mode
(`addXP` puis `showScreen`, ou l'inverse) : un évènement qui doit survivre à ce changement d'écran s'émet avec une
portée `null`, et son gestionnaire décide d'après l'écran réellement affiché (`xp:niveau`, `at:ev`).

### 3.3 Portées

```js
FX.bump(portee)        // nouveau jeton (les évènements déjà en file sont abandonnés) + FX.cancel(portee)
FX.cancel(portee)      // arrête net animations, particules, formes, nœuds et minuteries de la portée ; '*' = tout
FX.token(portee)       // jeton courant (entier)
FX.after(ms, fn, portee) // setTimeout protégé : annulé avec sa portée, ignoré si la couche est bloquée à l'échéance
```

Une portée est un nom libre. Conventions : `screen` (défaut de tout effet ; changée par le noyau), `q` (une
question ou une étape : le module concerné fait `FX.bump('q')` dans son crochet `load*`), `game`, `ui`.
Portée réservée `cue` : le repère « l'explication est plus bas » (👇 posé dans le repère de la fenêtre). Le noyau
la coupe au premier défilement de la page et chaque fois que `q` est coupée : un module y range son repère
(`scope: 'cue'`) et n'a ni écouteur de défilement ni état à tenir.
Tout est annulé (`'*'`) à l'ouverture d'une modale, quand l'onglet se cache et quand le niveau baisse.

### 3.4 Primitives d'effet

Options communes : `color` (défaut `palette().c`) ou `colors: [...]`, `scope` (défaut `'screen'`),
`min` (niveau minimal : `1` défaut, `2` = complet seulement). Valeur de retour nulle = filtré.

| appel | options (défauts) | complet | léger | profil sobre |
|---|---|---|---|---|
| `FX.fx.burst(x, y, o)` → n | `n=14, speed=220 px/s, life=600, size=4, kind='dot'\|'streak'\|'rect'\|'star', angle=0, spread=2π, gravity=300 px/s², drag=1.5 /s` | n particules | ≈ n × 0,35, 8 au plus | 0 |
| `FX.fx.streaks(x1, y1, x2, y2, o)` → n | `n=10, ms=260` (trajet), `size=3, jitter=10, stagger=120` | idem | idem | 0 |
| `FX.fx.trail(points, o)` → n | `points=[[x,y],…]`, `n=24, life=500, size=3, jitter=5, stagger=300, kind='star'` | idem | idem | 0 |
| `FX.fx.confetti(o)` → n | `n=60, ms=1800, from='top'` ou cible `FX.rect`, `colors=palette().set` | idem | idem | 0 |
| `FX.fx.sprite(emoji, x, y, o)` → n | `n=1, size=28, life=700, speed=0, angle=-π/2, spread=0, gravity=0, drag=0, spin=0 rad/s` ; chaîne entière (ZWJ intact) | idem | idem | 0 |
| `FX.fx.ring(x, y, o)` → 0\|1 | `r0=6, r1=44, width=3, ms=380` | joué | joué | joué |
| `FX.fx.slash(x1, y1, x2, y2, o)` → 0\|1 | `width=6, ms=260, curve=0` (flèche de l'arc en px) | joué | joué | joué |
| `FX.fx.float(texte, x, y, o)` → nœud\|null | `color, size=22, ms=700, dy=-46, dx=0, rotate=0 deg, cls` | apparition en zoom puis dérive | sans zoom, dérive ÷ 2 | comme léger |
| `FX.fx.banner(texte, o)` → nœud\|null | `anchor` (cible `FX.rect`) ou `y` (défaut 28 % de la hauteur), `emoji, sub, color, ms=900, cls` ; un seul bandeau/cut-in à la fois | zoom d'entrée | fondu | fondu |
| `FX.fx.cutin(texte, o)` → nœud\|null | comme `banner` + `side='left'\|'right'`, `ms=1000` ; à ancrer hors des zones de lecture | bande pleine largeur | rendu en bandeau | rendu en bandeau |
| `FX.fx.tint(couleur, o)` → bool | `alpha=.1` (plafonné à .12 et réduit si la luminance varierait de plus de 0,08), `ms=500` (≥ 320), `rect` (défaut : fenêtre), `min=2` ; **une par seconde** | joué | refusé | refusé |
| `FX.anim(el, images, o)` → Animation\|null | `duration=300, delay=0, easing='ease-out', iterations=1, fill, leger` (images de remplacement au niveau léger, `false` = ne rien jouer), `remove` (retire un nœud FX à la fin/annulation), `done` (rappel en fin normale), `name` | `images` | `o.leger` sinon `images` | comme léger |
| `FX.node(cls, portee)` → nœud\|null | nœud libre dans `#fx-stage`, retiré avec sa portée | — | — | — |

`FX.anim` sur un élément **du jeu** : `fill` forcé à `'backwards'` (ou `'none'`), itérations finies (≤ 20), 3 s au
plus au total ; refus (`null`) pour `html`, `body`, `#app`, `main` et pour un `transform` sur `.answer-btn`.
Sur un nœud FX : `fill` défaut `'both'` ; `iterations: Infinity` accepté seulement en profil `home` ou `ceremony`.
WAAPI ignore la règle `prefers-reduced-motion` du jeu : le niveau est la seule porte.

Chaque primitive jouée ajoute une entrée au journal ; les émetteurs réveillent la boucle, qui s'arrête seule.
Particules et formes avancent au pas réel de l'horloge (plafonné à 100 ms par image) : les durées annoncées sont
tenues jusqu'à 10 images/s, pas seulement à 60.

### 3.5 Palette, géométrie, hasard

```js
FX.palette()   // objet en cache par (univers, personnage, thème) ; ne lève jamais
// { u, c            couleurs univers / personnage corrigées à >= 3:1 sur le fond de page (thème clair ET sombre)
//   uRaw, cRaw      couleurs brutes
//   good, warn, calm   vert / ambre / bleu doux corrigés          set : [u, c, good, warn, calm]
//   bg, ink, theme, light   fond de page, couleur de texte, 'dark'|'light', booléen
//   style           'vortex' | 'stretch' | 'beam' | 'impact' | 'crescent' | 'bolt'  (FX.STYLES[univers], défaut 'impact')
//   universe, uniName, uniEmoji, hero, power, currency, char, heroName, heroEmoji }
FX.paint(el)   // pose --fx-u, --fx-c, --fx-ink, --fx-bg sur un nœud FX (déjà fait sur #fx-root)
FX.color.fix(c, theme, min=3) / mix(a, b, t) / alpha(c, a) / contrast(a, b) / lum(c) / rgb(c) / hex([r,g,b])

FX.rect(cible) // -> { x, y, w, h, cx, cy, inView } | null. cible = élément, sélecteur, nom d'ancre ou { x, y, w, h }
FX.defAnchor(nom, cible)   // cible = sélecteur, élément ou fonction ; ancres fournies : 'center' (fenêtre),
                           // 'screen' (écran courant), 'header', 'logo', 'score', 'streak', 'level'
FX.vw() / FX.vh()          // taille de la fenêtre (documentElement.clientWidth/Height, pas innerWidth)
FX.el(tag, cls, parent, texte)   // crée un nœud décoratif : aria-hidden="true" et pointer-events:none

FX.rnd()  FX.rand(a, b)  FX.pick(tableau)  FX.seed(n)   // générateur propre à la couche
```

Mesurer **au moment de l'effet** (les grilles sont re-générées, l'en-tête défile hors écran sur certains écrans) et
ne rien jouer si `rect` est `null` ou `inView` faux. Les effets vivent dans le repère de la fenêtre : ils ne suivent
pas un défilement en cours (d'où des durées courtes).

### 3.6 Réglages (noyau)

- Défaut : `complet` ; `off` si le système demande moins d'animations (suivi en direct tant que le joueur n'a pas
  choisi) ; un joueur « mouvement réduit » qui rallume démarre à `leger`.
- Boutons (vrais `<button>`, `aria-pressed`, ≥ 44 px, mis à jour sur place) : `#fx-set-drawer` et `#fx-lite-drawer`
  (tiroir, avant « Sauvegarde »), `#fx-set-home` (accueil, après le thème), `#fx-set-pause`, `#fx-set-auto-pause`
  (dernier bouton des deux modales de pause). Aucun toast, aucune annonce. Sur l'accueil, le bouton ajoute une
  rangée (54 px) à la barre de réglages sur les écrans étroits, à tous les niveaux.
- Persistance : clé `amat_fx_v1` = `{"v":1,"n":niveau,"d":dernier niveau actif}`, écrite seulement si
  `isSaveEnabled()` et choix explicite ; effacée quand la sauvegarde est coupée (crochet `toggleSave`) et au
  démarrage si la sauvegarde est inactive. Sans opt-in, le choix vit en mémoire.
- Niveau off : calque masqué, aucun crochet d'effet, et les boucles décoratives du jeu (points de chakra, emoji
  flottant de l'accueil, spirale de chargement) sont mises en pause par CSS.

### 3.7 Diagnostic (utilisé par les tests)

```js
FX.debug.log     // 200 dernières entrées { t, fx, level, profile, screen, n, info } : une par effet joué
                 //   fx = nom de primitive ('burst', 'anim', 'ring'…) ou nom donné à FX.play ; n = particules
FX.debug.drops   // 50 derniers abandons { t, type, why }  (why : 'portée', 'bloqué', 'file pleine', 'limiteur', 'cible interdite')
FX.debug.tints   // teintes jouées { t, alpha, color }
FX.debug.chaos   // true : chaque crochet et chaque gestionnaire lève (test : le jeu ne doit rien remarquer)
FX.debug.orig(nom)  // fonction d'origine d'une enveloppe
FX.stats()       // { version, level, effective, screen, profile, dead, suspended, explicit, reduced, played, dropped,
                 //   errors, errCount, chaos, particles, shapes, anims, nodes, loop, peak, queue, timers,
                 //   wrapped, missing, denied, modules, tints }
FX.kill(raison)  // coupe la couche (ce que fait le disjoncteur)
```

## 4. Ajouter un module

Créer `anime-src/NN-nom.js` (NN entre 10 et 98) et, si besoin, `anime-src/NN-nom.css`. Tout le code va dans `init` :

```js
/* 30-exemple.js — une réponse au Vrai/Faux fait briller la carte. */
FX.module('exemple', function (FX) {
  FX.wrap('loadTfQuestion', null, function () { FX.bump('q'); });           // nouvelle question : on coupe tout
  FX.wrap('answerTf', function () {
    return typeof tfState !== 'undefined' && !tfState.answered ? { c: tfState.correct } : null;
  }, function (avant) {
    if (avant) FX.emit('tf:reponse', { ok: tfState.correct === avant.c + 1 }, 'q');   // O(1), rien d'autre
  });
  FX.on('tf:reponse', function (d) {                                         // frame suivante
    var r = FX.rect('#tf-card');
    if (!r || !r.inView) return;
    FX.play('tf-' + (d.ok ? 'juste' : 'erreur'), function (niveau, pal) {
      FX.fx.ring(r.cx, r.cy, { color: d.ok ? pal.good : pal.calm, r1: 60, scope: 'q' });
      if (d.ok) FX.fx.burst(r.cx, r.cy, { n: 16, color: pal.c, scope: 'q' });
    });
  });
  FX.on('fx:level', function () { /* resynchroniser un éventuel décor propre au module */ });
});
```

À savoir :
- Le DOM du module (ex. une arène dans `#screen-game`) se crée dans `init` avec `FX.el` ; son affichage se règle
  en CSS avec `html[data-fx="off"] #fx-… { display: none; }` : au niveau off, la mise en page doit être celle
  d'`index.html` (vérifié par le test « mise en page »).
- Un module ne dépend que de l'API ci-dessus, jamais des variables internes du noyau.
- Pour remplacer la transition d'écran : `FX.module('arrivee', function (FX) { … })` dans un fichier de
  préfixe ≥ 10 (le module du noyau n'est alors pas démarré). Elle ne doit animer aucun nœud du jeu.
- Un module qui réagit à l'arrivée d'un écran (`FX.onScreen`) joue PAR-DESSUS la transition : ses nœuds de scène
  et le canvas passent au-dessus du panneau `.fx-blade` (z-index négatif), qui ne cache que le jeu pendant
  ≤ 340 ms. Pour un effet ancré sur un nœud du jeu, attendre ~150 ms (`FX.after`) que la lame l'ait découvert.

## 5. Construire et tester

```bash
python3 tools/build_anime.py                 # construit anime.html (lints, contrat, node --check, poids par fragment)
python3 tools/build_anime.py --check         # n'écrit rien : code 1 si anime.html n'est pas à jour, 2 si la construction est refusée
python3 tools/build_anime.py --modules arena,qcm,result,battle --out /tmp/essai/anime.html   # construction privée : noyau + combat du QCM
python3 tools/build_anime.py --src /tmp/essai/anime-src --out /tmp/essai/anime.html   # fragments lus ailleurs (mutants)
python3 tools/build_anime.py --ci            # avertissements et refus aussi en annotations GitHub Actions
node tools/test_anime.js                     # toute la suite (≈ 4 min 30, Playwright + Chromium, python3, bash)
node tools/test_anime.js --only diff,combat,ensemble-niveau                 # quelques scénarios (clés ci-dessous)
node tools/test_anime.js --anime /tmp/essai/anime.html --only diff,miseenpage
node tools/test_anime.js --list              # clés des scénarios
```

`--modules` filtre les fragments de module par leur NOM DE FICHIER (le noyau, `00`–`09` et `99`, est toujours
inclus) : `--modules battle` ne garde que `20-battle.css` — une feuille de style sans aucun crochet. Le combat du
QCM, c'est `20-arena.js`, `20-battle.css`, `21-qcm.js` et `25-result.js` : `--modules arena,qcm,result,battle`.

Codes de sortie de `build_anime.py` : `0` construit (ou « à jour » avec `--check`) ; `1` `--check` seulement : le
fichier diffère d'une construction fraîche ; `2` construction **refusée**, rien n'est écrit (lint, syntaxe, contrat
avec `index.html` rompu : § 5.1) — l'`anime.html` précédent reste en place. La sortie est déterministe ; les
commentaires des sources sont retirés d'`anime.html` (`--keep-comments` pour les garder). `anime.html` est versionné :
le reconstruire après toute modification d'`index.html` ou de `anime-src/`.

Après toute modification d'`index.html` ou d'`anime-src/` : `python3 tools/build_anime.py && node tools/test_anime.js`.

### 5.1 Contrat avec `index.html` (vérifié à chaque construction)

La couche s'accroche au jeu par des NOMS. Le build vérifie qu'ils existent encore dans `index.html`, et distingue
ce sans quoi la page serait à moitié branchée (refus) de ce qui ne coûte qu'un effet (avertissement).

| ce qui a disparu d'`index.html` | effet sur la page | build |
|---|---|---|
| une fonction enveloppée par le **noyau** — `showScreen`, `openModal`, `closeModal`, `toggleSave` (lues dans les `FX.wrap` des fragments `00`–`09`) — ou appelée par lui (`isSaveEnabled`) | écran courant jamais suivi (les épreuves perdent leur profil `sobre`), effets joués sur une modale, `amat_fx_v1` qui ne suit plus l'opt-in | **refus** |
| une variable lue par le noyau : `state`, `currentUniverse`, `UNIVERSES`, `CHARS` | palette générique partout, modules aveugles | **refus** |
| `id="app"`, la classe `modal-overlay`, l'écran d'une épreuve (`id="screen-…"` de profil `sobre` dans `FX.PROFILES`), ou les quatre points de montage du réglage à la fois | couche coupée au démarrage ; modales non détectées ; épreuve jouée au profil par défaut ; plus aucun bouton pour couper les animations | **refus** |
| une fonction enveloppée par un fragment qui tient l'**arène du QCM** (`MIRROR_FRAGMENTS` : `20-arena.js`, `21-qcm.js`) | l'arène est un nœud persistant qui reflète le jeu ; privée d'un crochet elle ment (adversaire et « Lis l'explication » de la question précédente restés en place, combo en retard d'un cran, « Temps figé » jamais retiré) | **refus** |
| une fonction enveloppée par un **autre module** (`25-result.js`, `30-shell.js`, `40-textmodes.js`, `50-interactive.js`) | ce crochet est inactif (`FX.stats().missing`) : un effet en moins, rien de faux à l'écran, le reste de la couche fonctionne | avertissement |
| un point de montage du réglage (`#drawer-save-toggle`, `#theme-toggle-btn`, `#modal-pause`, `#modal-auto-pause`), une ancre (`header[role="banner"]`, `#main-logo`, `#hud-score`, `#hud-streak`, `#hud-level`) | un bouton de réglage manque à cet endroit ; les effets accrochés à cette ancre ne jouent pas | avertissement |
| un écran d'`index.html` absent de `FX.PROFILES`, ou l'inverse | profil `home` par défaut (plein niveau) : à classer, surtout une épreuve | avertissement |

- Une fonction « existe » si elle est déclarée `function nom(` au premier niveau du script (seule forme que
  `FX.wrap` sait envelopper : `window[nom]`) ; une variable, si elle est déclarée par `let` / `const` / `var`.
- Les listes du build (`KERNEL_CALLS`, `KERNEL_VARS`, `KERNEL_MARKS`, `SETTING_MARKS`, `SOFT_MARKS`,
  `MIRROR_FRAGMENTS` dans `tools/build_anime.py`) décrivent le noyau : le build avertit quand une entrée n'est plus
  lue par les fragments du noyau (liste périmée). **Toute évolution du noyau qui lit un nouveau nom du jeu, et tout
  module qui garde un état reflétant le jeu, s'y inscrit.**
- Pourquoi ce partage : chacun des 46 crochets de module a été masqué tour à tour sur la vraie page (`FX.wrap`
  rendu aveugle à un nom, ce que voit la couche quand la fonction a été renommée) pendant un parcours de tous les
  modes, et la page comparée à la page complète. Hors arène : aucune erreur, écran et profil toujours suivis,
  épreuves toujours sobres, rien qui traîne en fin de mode — le seul écart est l'effet absent, plus, pour un crochet
  `load*` (frontière entre deux questions), un repère 👇 de la réponse précédente qui n'est plus coupé à l'étape
  suivante et s'éteint seul (≤ 1,8 s). Dans l'arène, chaque crochet manquant laisse un état FAUX à l'écran jusqu'à
  la question suivante, voire toute la partie. Un module qui s'accommoderait lui-même d'un `FX.wrap` renvoyant
  `false` (en se désactivant) pourrait quitter `MIRROR_FRAGMENTS`.
- **Retouches du `<head>`** (`HEAD_PATCHES`). Chaque balise est reconnue par son nom (`<title>`, `<meta name=…>`,
  `<meta property=…>`, `<link rel="manifest">`), jamais par son texte : retoucher le titre ou la description
  d'`index.html` ne fige pas l'édition. Texte connu → formulation soignée de l'édition ; texte inconnu → forme
  générique (« … — Édition animée », « Édition animée — … ») et avertissement invitant à mettre `HEAD_PATCHES` à
  jour ; balise facultative absente ou en double → avertissement, `<head>` laissé tel quel. Seul le lien du
  manifest est obligatoire (sans lui, la page animée déclarerait l'application classique) : absent → refus.
- **Fins de ligne.** `anime.html` est une copie exacte d'`index.html` : le build refuse un `index.html` en CRLF (le
  message le dit) et `--check` compare octet par octet. `.gitattributes` impose LF aux fichiers concernés, quel
  que soit le réglage `core.autocrlf` de la machine.

### 5.2 Déploiement (`.github/workflows/pages.yml`)

L'étape « Rebuild animated edition » ne fait jamais échouer le déploiement du jeu principal. Elle s'exprime par des
annotations du déroulé GitHub Actions :

1. `--check` d'abord : si l'`anime.html` versionné ne correspond pas aux sources (versionné sans reconstruction),
   un avertissement le dit — la version déployée est alors celle reconstruite par l'étape, que la suite n'a pas vue.
2. Reconstruction. Chaque avertissement du build devient une annotation `::warning::` (`GITHUB_ACTIONS=true`, ou
   `--ci`). Si la construction est refusée, rien n'est écrit : c'est l'`anime.html` **versionné** qui est déployé —
   une édition animée qui peut être plus ancienne que le jeu classique (elle embarque l'`index.html` de sa dernière
   construction), mais cohérente — et deux annotations `::error::` le disent (la cause, puis la conséquence).

La production peut donc servir une édition animée en retard sur le jeu classique : uniquement après un refus, et
jamais en silence. La suite de tests n'est pas lancée par le déploiement (Playwright n'y est pas installé).

### 5.3 Service worker et manifests

- `sw.js` (commun aux deux pages) pré-cache le jeu classique (`CORE_ASSETS`, inchangé). `anime.html` et
  `manifest-anime.json` sont **optionnels** : un joueur qui n'a jamais ouvert l'édition animée ne les télécharge
  ni à l'installation ni aux mises à jour. Ils sont (re)mis en cache à l'installation d'une version seulement si
  `anime.html` est déjà dans un cache de ce joueur (il l'a ouverte : le gestionnaire `fetch` l'y a mise) ou si une
  fenêtre l'affiche à ce moment (première visite du site par `anime.html`), par une requête `cache: 'reload'`
  (jamais la copie du cache HTTP), tout échec étant toléré. L'installation ne les attend jamais plus de 3 s : un
  serveur lent sur `anime.html` ne retarde pas la détection d'une mise à jour (le jeu conclut « à jour » après 5 s).
- Hors-ligne, `anime.html` absente du cache retombe sur `index.html` (le jeu classique, à l'adresse de l'édition).
- `manifest-anime.json` n'a pas de membre `id` : l'identité de l'application est alors sa `start_url`
  (`…/ninja-math-games/anime.html`), distincte de celle du jeu classique (`…/ninja-math-games/`) et, comme elle, à
  l'intérieur du chemin du projet. Les deux manifests ont la même portée (`./`) : même service worker, même origine.
- **Progression partagée par profil de navigateur** : les deux pages lisent le même `localStorage` (même origine)
  tant qu'elles sont ouvertes dans le même navigateur et le même profil. Rien n'est synchronisé entre deux
  navigateurs, deux profils ou deux appareils.
- **Point ouvert, à trancher sur de vrais appareils** : une seule application installable (l'édition animée
  garderait alors `manifest.json`, ou aucun manifest) ou deux applications qui partagent une portée (état actuel) ?
  Non vérifié ici, faute d'appareil : avec le jeu classique déjà installé, Chrome sur Android propose-t-il encore
  d'installer l'édition animée (et l'inverse) ; sur iPhone, une application installée depuis l'écran d'accueil
  garde-t-elle un stockage séparé de Safari (auquel cas la progression ne suivrait pas entre l'application et le
  navigateur) ; les deux icônes, identiques, se distinguent-elles assez. À tester sur un téléphone Android et un
  iPhone avant de promouvoir l'installation de l'édition animée.

### 5.4 Suite de tests

Codes de sortie de `test_anime.js` : `0` tout est vert ; `1` au moins un échec, ou **aucune vérification exécutée** ;
`2` appel invalide (option inconnue, clé de `--only` inconnue, fichier `--anime` introuvable) ; `3` Playwright
introuvable — rien n'a été testé, ce n'est donc jamais un succès (`--allow-missing-playwright` rend `0` dans ce seul
cas, pour une machine où l'absence de test est assumée). Dernière ligne attendue : « N vérifications, 0 échec(s) ».

- Les scénarios ouvrent les pages en `file://` (aucun service worker) ; seul `pwa` passe par http, sur son propre
  serveur local. Dans `page.evaluate`, les noms nus (`state`, `CHARS`, `FX`) fonctionnent ; `window.state` est
  `undefined`.
- Scénarios de `tools/test_anime.js` : `diff` (même graine, même session QCM sur `index.html` et `anime.html` aux
  niveaux off, complet et chaos : état, focus, suite des messages de `#toast` et de `#sr-live`, HUD, empreinte du DOM
  identiques), `reglages`, `reduit`, `miseenpage`, `noyau` (garde-fous du noyau et **contrat de l'enveloppe** : sur une
  globale jetable enveloppée par `FX.wrap`, même `this`, mêmes arguments, valeur renvoyée telle quelle, exception du
  jeu propagée — le même objet —, original appelé exactement une fois ; aux niveaux complet et off, sous chaos et
  couche coupée), `reseau` (toutes les requêtes des deux pages pendant une session courte : l'édition animée ne
  demande rien qu'`index.html` ne demande, son manifest excepté ; aucune balise `img` / `audio` / `video` / `iframe` /
  `script` / `link` / `source` / `object` / `embed` en plus, hors `#fx-style` et `#fx-script` ; aucune police
  déclarée en plus), puis ceux du combat : `arene`, `combat`, `verdict`, `parties`.
- **Scénarios des modules : un fichier par module dans `tools/anime-tests/`**, nommé comme son fragment
  (`30-shell.js` pour `anime-src/30-shell.js`), chargé automatiquement par `test_anime.js` (ordre alphabétique).
  Il exporte `function (h) { return [[clé, titre, async (browser) => { … }], …]; }` ; `h` fournit
  `{ check, open, wait, settle, waapi, gameShown, snap, firstDiff, keepDom, domChecks, VOLATILE, logOf, during,
  leftovers, isIdle, harness, ROOT, INDEX, ANIME, SEED }` (hasard du jeu à graine fixe, `setInterval` piloté par
  `__tick(n)`, `setTimeout` réel mais suivi, tutoriel déjà vu). Les clés
  commencent par le nom du module et servent à `--only` : `shell-diff`, `shell-nav`, `shell-accueil` ;
  `txt-diff`, `txt-moments`, `txt-tel` ; `interactive-diff`, `interactive-moments`, `interactive-tel`.
  Les minuteries longues du jeu (« question suivante » : 1,5 à 5 s) y sont retenues et déclenchées à la main
  (`__later()`) ; un scénario chronométré fixe d'abord l'XP loin d'un seuil (`state.xp = (state.level - 1) * 500`),
  sinon un niveau gagné ajoute son propre temps (§ 6.8).
  Chaque module prouve deux choses : (1) le jeu est inchangé — même session scriptée sur `index.html` et sur
  l'édition animée aux niveaux off, complet et chaos, photographies identiques (`snap` + l'état propre au mode) et
  même empreinte du DOM (`domChecks`, voir plus bas) ;
  (2) les animations ont lieu — `FX.debug.log` (via `logOf` / `during`) montre les effets attendus au niveau
  complet, la forme courte au niveau léger, rien au niveau off, et `leftovers` retombe à zéro (`isIdle`).
  Un scénario ne suppose pas que la couche est au repos au chargement : l'accueil joue son ouverture ~0,75 s
  après le chargement (≤ 2,6 s) ; partir d'un autre écran, ou attendre puis `FX.cancel('*')`.
- **Scénarios d'ensemble** (`tools/anime-tests/90-ensemble.js`, aucun fragment ne porte ce numéro) : ce qui ne se
  voit que lorsque tous les modules tournent ensemble — `ensemble-niveau`, `ensemble-fin`, `ensemble-repere`
  (les trois règles du § 6.8), `ensemble-parcours` (7 modules et 50 fonctions enveloppées, navigation rapide à
  travers tous les modes aux niveaux complet et chaos, rien ne traîne ; les 50 enveloppes sont photographiées à la
  fin du script de la couche et, après tout le parcours, chaque globale doit être encore LA MÊME fonction : un
  crochet contourné par une réaffectation du jeu échoue ici). Un nouveau module y ajoute ses écrans.
- **Chaîne de construction et PWA** (`tools/anime-tests/95-build.js` et `96-pwa.js`, aucun fragment ne porte ces
  numéros) : ce qui entoure la couche. `build` travaille dans une copie jetable du dépôt (dossier temporaire),
  retouche `index.html` comme le ferait un mainteneur et relance `build_anime.py` : `<head>` tolérant, contrat du
  § 5.1 (chaque nom bloquant → code 2 et `anime.html` précédent intact ; un crochet de module absent →
  avertissement, et la page ainsi construite est jouée pour prouver qu'elle reste saine), annotations `--ci`, fins de
  ligne, et l'étape du déploiement elle-même — ses lignes `run:` sont extraites de `pages.yml` et rejouées avec
  `bash -e` (dépôt à jour, `anime.html` périmé, construction refusée, crochet de module absent). Il lui faut
  `python3` (variable `PYTHON` pour un autre nom) et `bash`. `pwa` sert le dépôt en http sous `/ninja-math-games/`
  (un serveur local par parcours, port libre, `anime.html` = le fichier de `--anime`) et fait tourner le VRAI
  `sw.js` : joueur du jeu classique seul (aucune requête pour `anime.html`, hors-ligne, toast de mise à jour),
  joueur déjà venu sur l'édition animée (copie fraîche après un changement de version, ouverture hors-ligne),
  arrivée directe par `anime.html`, serveur qui met 8 s à la servir, pannes (404, connexion coupée), identité des
  deux manifests.
- **Photographier sans course** (différentiels). Une photographie ne se prend jamais après un délai fixe : `snap`
  attend le calme de la page (`__settle(d)` du harnais : plus aucun `setTimeout` de délai ≤ d — 150 ms par défaut —
  en attente, focus stable, puis trois images de suite sans rien de neuf ; échec explicite après 8 s). Les
  minuteries courtes du jeu (annonce : 50 ms ; focus d'une modale : 50 ms ; focus du champ des automatismes :
  100 ms) sont donc toujours échues, et le focus d'un nœud que le jeu vient de masquer ou de désactiver est déjà
  retombé sur `<body>` (Chromium le fait en différé), quelle que soit la charge de la machine. Un état
  intermédiaire se photographie en retenant la minuterie qui le ferait disparaître (`__hold(d)` puis
  `__release()`, comme `__later()` pour les minuteries longues), jamais en visant une fenêtre de temps. Après un
  `history.back()` ou un redimensionnement, attendre l'évènement réel (`back`, `resize` dans les fichiers de
  scénarios). `#sr-live` et `#toast` sont comparés comme une SUITE de messages (observateur de mutations, champs
  `srLog` / `toastLog` de la photographie), en plus du texte de l'instant.
- **Empreinte du DOM** (différentiels). Chaque photographie embarque une empreinte de tout le document du jeu
  (`__domPrint` : `<html>`, `<head>`, `<body>` — balises, attributs triés, textes, valeur des champs) une fois
  retirés les nœuds de la couche (id en `fx-`, ou pas d'id et toutes les classes en `fx-`), les attributs `data-fx*`
  et les lignes du `<head>` que le build retouche. `domChecks` compare chaque page animée à `index.html` étape par
  étape et affiche le chemin du premier nœud qui diffère. Une classe ou un style en ligne posé sur un nœud du jeu,
  un nœud ou un texte ajouté dans un écran : tout cela est une différence. Seules les classes de `#toast` et de
  `#combo-display` sont écartées (`VOLATILE`) dans les sessions qui ne retiennent pas les minuteries longues.
- **Audit de la couche** (tous les scénarios, toutes les pages). Un observateur injecté dans chaque page contrôle
  chaque nœud marqué `fx-` à son insertion, à chaque changement de `class` / `id` / `aria-hidden`, puis à la
  fermeture de la page : nœud de la couche `aria-hidden` (lui-même ou un ancêtre) et `pointer-events: none`, sauf les
  cinq boutons de réglage ; aucun dans un `#screen-*` hors `#fx-arena` et `#fx-set-home` ; aucune classe `fx-` sur un
  nœud du jeu. Une vérification par scénario (« audit de la couche ») en rend compte.
- Une mesure de durée se fait DANS la page, sur une seule horloge (`performance.now()` dans un `rAF`), pas en
  comptant des attentes côté Node : la suite reste juste sur une machine chargée (voir `combatBoss`).
- **Charge de la machine : lancer la suite SEULE.** Les scénarios différentiels (`diff`, `reglages`, `miseenpage`,
  `shell-diff`, `txt-diff`, `interactive-diff`), `reduit`, `noyau`, `reseau` et `build` ne dépendent pas de la vitesse
  de la machine (calme attendu, minuteries retenues, animations CSS du jeu menées à leur terme avant une mesure ;
  `pwa` n'a qu'un contrôle de durée, large : mise à jour détectée en moins de 4,5 s quand le plafond est de 3 s). Les
  scénarios « moments » (`arene`, `combat`, `verdict`, `parties`, `shell-nav`, `shell-accueil`, `txt-moments`,
  `txt-tel`, `interactive-moments`, `interactive-tel`, `ensemble-*`) regardent la couche jouer en temps réel : leurs
  contrôles de durée (« tout est fini n ms après… », effet encore en cours après une attente fixe) tiennent quand
  deux suites tournent côte à côte sur 4 cœurs, mais peuvent échouer à tort quand le processeur est saturé par
  autre chose. Avant de conclure sur un échec de ce genre, relancer le scénario seul (`--only clé`).
- Une construction privée (`--anime`) n'a besoin de rien à côté d'elle : les pages s'ouvrent en `file://`, et le
  scénario `pwa` la sert avec le `sw.js`, les manifests et les icônes du dépôt.

## 6. Modules existants

Chaque module est isolé (portée et `try` privés) ; ce qui suit est ce qu'un AUTRE module peut utiliser ou doit
respecter. Les noms entre crochets sont ceux du journal (`FX.debug.log`, champ `fx[info]`).

### 6.1 `arrivee` — transition d'écran (`09-arrivee.js`, noyau)

Sur l'évènement `screen` : un panneau `.fx-blade` (couleur du fond de page, dans `#fx-stage`, sous l'en-tête
s'il est visible) couvre le nouvel écran dès sa première frame peinte, puis s'en va. Journal : `arrivee[<id>]`
puis `anim[fx-blade]`.

| cas | forme |
|---|---|
| niveau complet | « lame » : le panneau glisse vers la droite en 300 ms, bord d'attaque de 10 px aux couleurs de l'univers |
| complet, vers `home` | lame vers la gauche, 240 ms |
| complet, vers un écran de profil `ceremony` | rideau vers le bas, 340 ms |
| complet, `game` après `loading` (la carte VS a fait l'entrée) ; niveau léger partout | fondu de 140 ms |
| profil `sobre` ; niveau off ; même écran redemandé (`showScreen('dnb-ex')` par exercice) | rien |

Aucun nœud du jeu n'est animé (`FX.rect` reste exact) ; le panneau ne reçoit jamais le pointeur, est invisible
sans son animation, et est retiré par sa portée (`screen`) à tout changement d'écran ou ouverture de modale.

### 6.2 `arene` — la bande de combat du QCM (`20-arena.js`, `20-battle.css`)

- `#fx-arena` : enfant direct de `#screen-game`, inséré avant `#question-wrap` — le seul nœud de la couche placé
  DANS la mise en page du jeu (`display: none` au niveau off). `html[data-fx-arena]` est posé au démarrage et
  active les règles CSS de compaction de l'écran de jeu (jamais sans la bande).
- L'arène ne retient rien : son image fixe est recalculée depuis l'état du jeu. États = attributs de `#fx-arena` :
  `data-fx-foe` (`sbire | boss | cible | revenant | gardien`), `data-fx-etat` (`'' | ko | fuite | sorti`),
  `data-fx-combo` (cran d'aura 0–3) ; classes `fx-tense`, `fx-gel`, `fx-down`.
- API privée du combat, `FX.arena` : `{ el, hero, foe, tag, combo, hp }` (nœuds), `sync()` (recalcule tout,
  renvoie l'état ou `null` hors partie), `apres(issue, dernier)` (image fixe après une réponse : `'ok' | 'faux' |
  'temps'`), `fin()` (dernière bonne réponse possible), `geo()` (`{ a, h, f }` : rectangles de l'arène, du héros
  et de l'adversaire, ou `null` si la bande n'est pas réellement à l'écran).
- Recalée sans animation sur `fx:level`, `fx:resume` et après `applyTheme`.

### 6.3 `combat` — les moments du QCM (`21-qcm.js`)

- Crochets : `loadQuestion` (change le jeton de la portée `q`), `answer`, `timeOut`, `useJutsu`, `updateTimerUI`
  (10 Hz : deux comparaisons), `addXP`. Évènements : `qcm:q`, `qcm:rep`, `qcm:pouvoir`, `qcm:degel`,
  `qcm:tension`, `xp:niveau`.
- Journal : `qcm-question[<adversaire>]`, `qcm-juste[×n]`, `qcm-ultime[×5]`, `qcm-revanche`, `qcm-ko`,
  `qcm-erreur`, `qcm-temps`, `qcm-ko-heros`, `qcm-pouvoir[50|hint|time]`, `qcm-tension`, `niveau`.
- `html[data-fx-combo-off]` : posé tant que le bandeau de combo du jeu (`#combo-display`, fixe, au-dessus du
  calque) recouvrirait l'arène ou le verdict ; une règle CSS le masque alors (sans effet au niveau off). L'arène
  affiche le même mot. L'attribut est recalculé à chaque question : il appartient au combat, ne pas le poser ailleurs.
- Le niveau gagné (`niveau`) part du crochet `addXP`, quel que soit le mode : un autre module n'a pas à le fêter
  lui-même, et n'a rien à faire pour l'éviter (règle et formes par écran : § 6.8).
- Le repère 👇 (`.fx-cue`, pastille) utilise la portée `cue` du noyau.

### 6.4 `verdict` — résultat du QCM et carte VS (`25-result.js`)

- Crochet `endGame` → `qcm:bilan` : échelle des rangs (`.fx-ladder`, `.fx-rung`), arrivée du vrai `#result-rank`,
  confettis proportionnels, trophées un par un. Journal : `bilan[rang <i> <pct> %]`, `bilan-passe` (tout appui
  passe la cérémonie : signal `fx:input`). ≤ 2,5 s au niveau complet, ≤ 1,2 s au niveau léger.
- Crochet `startGame` → `qcm:vs` : carte `.fx-vs` (héros VS adversaire générique) pendant les 1200 ms de
  l'écran de chargement. Journal : `vs[<mode>]`.

### 6.5 `accueil` — l'écran d'accueil et la coquille (`30-shell.js`)

Aucun nœud persistant, aucune classe ni style sur le jeu ; chaque sélection change le jeton de la portée `q`
(des clics rapides ne laissent que le dernier effet).

| journal | déclencheur (comparaison avant / après) | complet | léger |
|---|---|---|---|
| `accueil[ouverture]` | une fois par chargement, ~0,75 s après (ou à la fermeture du tutoriel de première visite), si le héros ou le titre est à l'écran ; coupée au premier défilement | convergence sur le héros, onde, scintillement du titre, 15 lueurs qui montent (≤ 2,6 s) | onde + scintillement (0,4 s) |
| `accueil[retour]` | arrivée sur `home` (160 ms après le début de la lame), sauf si un bandeau occupe l'écran (fin du Tracé ou du Puzzle, § 6.7) | onde, éclat, scintillement (≈ 0,5 s) | onde + scintillement |
| `univers[<clé>]` | `selectUniverse` quand `currentUniverse` a changé | voile (`FX.fx.tint`), onde de couleur depuis la carte, éclat, émoji, puis ondulation sur les 6 nouvelles cartes de personnage (+250 ms) | anneau + éclat réduit |
| `perso[<clé>]` | `selectChar` quand `state.char` a changé | anneau + éclat à la couleur du personnage, rebond de `.char-emoji` | anneau + éclat réduit |
| `classe` | `selectMissionClass` quand `activeMissionClasse` a changé | trait sous l'onglet, fondu d'opacité de `#mission-chips` (200 ms) | idem |
| `envol[<écran>]` | arrivée sur un écran non sobre (hors `loading`) moins de 700 ms après l'activation d'une `.level-card` (clic : point d'appui ; clavier : centre de la carte) | anneau + éclat de traits, par-dessus la lame | anneau + éclat réduit |
| `theme` | `applyTheme` quand `data-theme` a changé (un seul fondu pour des bascules à moins de 100 ms) | palette recalculée, voile de l'ANCIEN fond qui s'efface en 260 ms (jamais en profil sobre) | idem |

Rien ne joue quand l'ancre est hors de la fenêtre ou sous l'en-tête collant (page défilée).

### 6.6 `textes` — Vrai/Faux, Histoire, Automatismes, DNB Blanc (`40-textmodes.js`, `40-textmodes.css`)

Crochets : `loadAutoQuestion`, `loadTfQuestion`, `loadDnbStep`, `loadStoryStep` (jeton `q`, seulement sur leur
écran), `startStoryMode`, `submitAutoAnswer`, `answerTf`, `answerStoryStep`, `answerDnbStep`, `endAutoMode`,
`endTrueFalse`, `endStoryMode`, `endDnbBlanc`. Évènements : `tm:auto`, `tm:tf`, `tm:qcm`, `tm:scene`, `tm:bilan`.
Un seul nœud propre : le contour `.fx-tm-box` (posé sur le rectangle d'une carte ou d'une réponse, jamais dedans).
Les minuteries « question suivante » du jeu tournent encore après un abandon : chaque crochet vérifie l'écran
courant, rien ne joue sur l'accueil.

| journal | mode (profil) | juste | erreur / temps écoulé |
|---|---|---|---|
| `tf-juste[×n]`, `tf-erreur`, `tf-temps` | Vrai/Faux (`duel`) | entaille du bouton vers le bord bas de la carte, onde, éclat, « +points », multiplicateur du jeu à partir de ×3 (≈ 600 ms) | un trait calme le long de l'explication ; temps écoulé : une onde se referme sur le chrono |
| `histoire-scene[n]`, `histoire-juste`, `histoire-erreur` | Histoire (`recit`) | page tournée à chaque étape (décor, trait, étoiles) ; éclat sur la réponse, l'énergie file vers le décor qui bondit | contour sur la bonne réponse + trait calme |
| `auto-juste`, `auto-erreur`, `auto-temps` | Automatismes (`sobre`) | contour vert de 380 ms autour de la carte ; « SÉRIE ×5 » toutes les 5 bonnes réponses | contour bleu calme ; rien sur `#auto-input` ni sur la correction |
| `dnb-juste`, `dnb-erreur`, `dnb-transition` | DNB Blanc (`sobre`) | contour sur la réponse choisie ; transition dévoilée bloc par bloc | contour sur la bonne réponse + trait calme |
| `bilan-auto`, `bilan-tf`, `bilan-story`, `bilan-dnb` `[palier k]` | 4 écrans de résultat (`ceremony`) | émoji du palier, tuiles en cascade, onde, étoiles, confettis aux deux paliers hauts (≤ 2 s) ; DNB : note « tamponnée », détail déroulé, pas de confettis | palier bas : onde douce et 7 étoiles qui montent |

Si l'émoji du palier est hors champ à l'arrivée (téléphone), le palier et son titre sont rappelés dans une vignette
(`FX.fx.banner`) sous l'en-tête. Ces noms `bilan-…` partagent le préfixe du `bilan[rang …]` du QCM (§ 6.4).

### 6.7 `ateliers` — Tracé, Puzzle, Constructeur, Arbre, Graphique, Stats (`50-interactive.js`, `50-interactive.css`)

21 crochets en O(1) (liste dans l'en-tête du fichier) qui passent tous par `send(type, écran, valeur)` : une seule
place dans la file par frame (`at:ev`, portée `null`), issue ignorée si le jeton `q` a changé ou si l'écran attendu
n'est pas réellement affiché (les écouteurs `resize` du jeu relancent `load*` / `new*` sur des écrans cachés ; le
chrono du puzzle sonne après un retour à l'accueil). Rien ne joue pendant un geste : aucun crochet sur `render*`,
`draw*`, `handle*Move`. Nœud propre : la mention « tamponnée » `.fx-at-stamp` (un `FX.fx.float`).

| journal | déclencheur (front d'état) | réussi | sinon |
|---|---|---|---|
| `trace-juste[note]`, `trace-erreur` | `validateDraw` : `drawState.validated` | lumière sur le cadre du canvas, « ✔ n % » sur le coin de l'explication | trait calme le long de l'explication, ou 👇 |
| `puzzle-pose`, `puzzle-juste[xp]`, `puzzle-erreur` | `dropOnSlot`, `validate*Puzzle`, `autoValidatePuzzle` | anneau sur la bonne case ; résolu : anneaux, éclat d'étoiles, « +n XP » | repère calme |
| `defi-juste`, `defi-erreur`, `atelier-onglet[k]` | `validatePythChallenge` : `challengeAnswered` ; `selectPythAtelier` | cadre du canvas (ou du message) illuminé, « +40 XP » ; onglet : fondu de 200 ms | repère calme, un par 1,5 s au plus |
| `proba-pose`, `arbre-juste`, `proba-juste`, `proba-erreur` | `placeProbaPiece`, `validateProbaPlacement`, `answerProbaQuestion` | anneau neutre à la pose ; arbre validé : la lumière descend branche par branche (≤ 0,9 s) | arbre à corriger : rien de plus que le jeu |
| `graph-juste[×n]`, `graph-erreur` | `finalizeGraphAnswer` | anneau sur le point choisi (ou cadre, ou réponse du QCM), « +n XP » | anneau calme sur le point attendu + repère |
| `bilan-proba[k]`, `bilan-graph[k]` | `endProbaTree`, `endGraphReader` | émoji du palier, onde, étoiles, confettis aux deux paliers hauts (≤ 2 s) | — |
| `atelier-fin[texte]` | dernier `nextDrawMission` / `nextPuzzle` (retour à l'accueil) | bandeau sur l'en-tête de l'accueil | — |
| `stats[n]` | `showStatsScreen` (à l'arrivée seulement) | les n barres poussent une fois (`clip-path`) | — |

### 6.8 Règles d'ensemble (vérifiées par `90-ensemble.js`)

- **Niveau gagné** (`niveau`, module `combat`, crochet `addXP`, évènement `xp:niveau` de portée `null`). Jamais un
  second effet focal, toujours sur l'en-tête et seulement s'il est entier à l'écran :

  | écran | forme |
  |---|---|
  | `game` | bandeau « NIVEAU n ! » 320 ms après le coup (le toast du jeu y est écrasé) + onde et étoiles sur `#hud-level` |
  | résultat d'un autre mode (profil `ceremony`) | le même bandeau en dernier temps de la fête, à 1,3 s ; niveau léger : onde seule à 0,6 s |
  | `result` (QCM) | rien : la cérémonie du rang occupe l'écran |
  | ateliers, Vrai/Faux, Histoire, accueil | onde et étoiles sur `#hud-level` (le toast du jeu l'annonce déjà) |
  | épreuves (profil `sobre`) | l'onde seule |

- **Retour sur l'accueil** : la fioriture `accueil[retour]` ne joue pas quand un bandeau (`.fx-banner`) est à
  l'écran ; le bandeau de fin du Tracé ou du Puzzle est alors le seul effet focal, posé sur l'en-tête.
- **Repère d'explication** (👇) : trois modules en posent un (`combat`, `textes`, `ateliers`), tous dans la portée
  `cue` — retiré au premier défilement et à la question suivante.
- **Portée `q` partagée** : chaque module ne change son jeton que sur SON écran ; `FX.cancel('q')` coupe donc aussi
  le reste de l'effet précédent d'un autre module sur le même écran (voulu : un seul repère, un seul verdict).
