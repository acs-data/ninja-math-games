# anime-src — couche d'animation de `anime.html`

`anime.html` = `index.html` (jamais modifié) + cette couche, assemblée par `tools/build_anime.py`.
Ce fichier est le **contrat** entre le noyau et les modules. Toute évolution du noyau doit être reflétée ici.

## 1. Architecture en 20 lignes

1. `python3 tools/build_anime.py` copie `index.html`, retouche le `<head>` (titre, description, OG, manifest),
   injecte `anime-src/*.css` dans `<style id="fx-style">` avant `</head>` et `anime-src/*.js` dans **une seule IIFE**
   (`<script id="fx-script">`) avant `</body>`. Ordre = ordre alphabétique des noms (`NN-nom.ext`).
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

Les modules existants sont décrits au § 6 ; leurs scénarios de test sont dans `tools/anime-tests/` (§ 5).

## 2. Règles qu'un module doit respecter

**Jeu intact.** Ne jamais modifier `index.html`. Aucun changement de score, de minuteur, de flux de questions, de
focus, d'annonce lecteur d'écran ni de raccourci clavier. Ne corriger ni masquer aucun défaut hérité de `index.html`.

**Interdits vérifiés par le build (échec)** : `Math.random`, `.focus(`, `.blur(`, `scrollIntoView/scrollTo/scrollBy`,
`showToast(`, `announceToScreenReader(`, `eval`, `new Function`, `stopPropagation`, `document.write`,
`insertAdjacentHTML`, `outerHTML =`, `innerHTML` avec autre chose qu'une chaîne littérale, `preventDefault` et
`localStorage/sessionStorage` hors de `*settings*.js`, `</script`, `<!--`. CSS : tout sélecteur contient `fx-` ou
`data-fx` ; `@keyframes` et variables préfixés `fx-` / `--fx-`.

**DOM.**
- Tout nœud créé est `aria-hidden="true"` et `pointer-events:none` (utiliser `FX.el`). Seuls les boutons de réglage
  du noyau sont interactifs.
- Ne jamais écrire dans une région live (`#hud-score`, `#hud-streak`, `#toast`, `#sr-live`), ni dans un nœud que le
  jeu re-génère (`#answers-grid`, `.answer-btn`, `#char-grid`, `#universe-grid`, `#mission-chips`, `#chakra-bg`,
  `#trophies-list`…). Parents sûrs : `#app`, les conteneurs `#screen-*`, `#fx-stage`.
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
(`21-qcm.js`, `25-result.js`), `sh:*` (`30-shell.js`). Un nouveau module prend son propre préfixe.
Un crochet appelé plusieurs fois par tick (jeu rapide, tests) ne doit prendre qu'UNE place dans la file par
frame : garder la dernière donnée dans une variable et n'émettre qu'une fois (voir `emitRep` dans `21-qcm.js`).

### 3.3 Portées

```js
FX.bump(portee)        // nouveau jeton (les évènements déjà en file sont abandonnés) + FX.cancel(portee)
FX.cancel(portee)      // arrête net animations, particules, formes, nœuds et minuteries de la portée ; '*' = tout
FX.token(portee)       // jeton courant (entier)
FX.after(ms, fn, portee) // setTimeout protégé : annulé avec sa portée, ignoré si la couche est bloquée à l'échéance
```

Une portée est un nom libre. Conventions : `screen` (défaut de tout effet ; changée par le noyau), `q` (une
question ou une étape : le module concerné fait `FX.bump('q')` dans son crochet `load*`), `game`, `ui`.
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
python3 tools/build_anime.py                 # construit anime.html (lints, node --check, tailles)
python3 tools/build_anime.py --check         # code 1 si anime.html n'est pas à jour
python3 tools/build_anime.py --modules battle --out /tmp/essai/anime.html   # construction privée : noyau + *battle*
node tools/test_anime.js                     # test différentiel + garde-fous (~15 s, Playwright + Chromium)
node tools/test_anime.js --anime /tmp/essai/anime.html --only diff,miseenpage
```

- La sortie est déterministe ; les commentaires des sources sont retirés d'`anime.html` (`--keep-comments` pour les
  garder). `anime.html` est versionné : le reconstruire après toute modification d'`index.html` ou de `anime-src/`.
- Tester en `file://` (le service worker met `anime.html` en cache en http). Dans `page.evaluate`, les noms nus
  (`state`, `CHARS`, `FX`) fonctionnent ; `window.state` est `undefined`.
- Scénarios de `tools/test_anime.js` : `diff` (même graine, même session QCM sur `index.html` et `anime.html` aux
  niveaux off, complet et chaos : état, focus, `#toast`, `#sr-live`, HUD identiques), `reglages`, `reduit`,
  `miseenpage`, `noyau`, puis ceux du combat : `arene`, `combat`, `verdict`, `parties`.
- **Scénarios des modules : un fichier par module dans `tools/anime-tests/`**, nommé comme son fragment
  (`30-shell.js` pour `anime-src/30-shell.js`), chargé automatiquement par `test_anime.js` (ordre alphabétique).
  Il exporte `function (h) { return [[clé, titre, async (browser) => { … }], …]; }` ; `h` fournit
  `{ check, open, wait, waapi, gameShown, snap, firstDiff, logOf, during, leftovers, isIdle, harness, ROOT, INDEX,
  ANIME, SEED }` (hasard du jeu à graine fixe, `setInterval` piloté par `__tick(n)`, tutoriel déjà vu). Les clés
  commencent par le nom du module (`shell-diff`, `shell-nav`, `shell-accueil`) et servent à `--only`.
  Chaque module prouve deux choses : (1) le jeu est inchangé — même session scriptée sur `index.html` et sur
  l'édition animée aux niveaux off, complet et chaos, photographies identiques (`snap` + l'état propre au mode) ;
  (2) les animations ont lieu — `FX.debug.log` (via `logOf` / `during`) montre les effets attendus au niveau
  complet, la forme courte au niveau léger, rien au niveau off, et `leftovers` retombe à zéro (`isIdle`).
  Un scénario ne suppose pas que la couche est au repos au chargement : l'accueil joue son ouverture ~0,75 s
  après le chargement (≤ 2,6 s) ; partir d'un autre écran, ou attendre puis `FX.cancel('*')`.
- Une construction privée placée hors du dépôt doit avoir `manifest-anime.json`, `sw.js` et les icônes à côté
  d'elle seulement si l'on teste la PWA ; en `file://` ce n'est pas nécessaire.

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
- Le bandeau « NIVEAU n ! » (`niveau`) part du crochet `addXP`, quel que soit le mode (abandonné si l'écran
  change dans le même tick) : un autre module n'a pas à fêter lui-même un niveau gagné.

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
| `accueil[retour]` | arrivée sur `home` (160 ms après le début de la lame) | onde, éclat, scintillement (≈ 0,5 s) | onde + scintillement |
| `univers[<clé>]` | `selectUniverse` quand `currentUniverse` a changé | voile (`FX.fx.tint`), onde de couleur depuis la carte, éclat, émoji, puis ondulation sur les 6 nouvelles cartes de personnage (+250 ms) | anneau + éclat réduit |
| `perso[<clé>]` | `selectChar` quand `state.char` a changé | anneau + éclat à la couleur du personnage, rebond de `.char-emoji` | anneau + éclat réduit |
| `classe` | `selectMissionClass` quand `activeMissionClasse` a changé | trait sous l'onglet, fondu d'opacité de `#mission-chips` (200 ms) | idem |
| `envol[<écran>]` | arrivée sur un écran non sobre (hors `loading`) moins de 700 ms après l'activation d'une `.level-card` (clic : point d'appui ; clavier : centre de la carte) | anneau + éclat de traits, par-dessus la lame | anneau + éclat réduit |
| `theme` | `applyTheme` quand `data-theme` a changé (un seul fondu pour des bascules à moins de 100 ms) | palette recalculée, voile de l'ANCIEN fond qui s'efface en 260 ms (jamais en profil sobre) | idem |

Rien ne joue quand l'ancre est hors de la fenêtre ou sous l'en-tête collant (page défilée).

