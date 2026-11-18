# CLAUDE.md — Anime Math Academy

> Ce fichier est destiné à **Claude Code** et à toute IA assistante travaillant sur ce projet. Il décrit la structure, les conventions, les pièges connus et les zones critiques à respecter. Lis-le **avant toute modification**.

-----

## 0. TL;DR pour démarrer rapidement

- **Stack** : HTML5 + CSS3 + JavaScript vanilla, aucune dépendance npm. Le jeu s'écrit dans un seul fichier, `classique.html` ; la page principale `index.html` en est **générée** par un script Python (bibliothèque standard seulement).
- **Localisation du code** : `classique.html` (le jeu classique, **le fichier à modifier**), **≈ 11 750 lignes, ≈ 560 Ko**. `index.html` (≈ 660 Ko), la page principale du site, est l'édition animée : **GÉNÉRÉE**, jamais éditée à la main.
- **PWA installable** + service worker (`sw.js`) avec cache versionné automatiquement par le SHA du commit.
- **Aucun npm/yarn/pnpm**. Pour tester : **recharge `classique.html` dans un navigateur** ; pour la page principale, reconstruis (`python3 tools/build_anime.py`) puis recharge `index.html`.
- **Tests** : pas de tests unitaires du jeu ; la suite `node tools/test_anime.js` compare la page principale au jeu classique (§ 13). Valide manuellement les flux après chaque changement.
- **Avant tout commit** : `node --check` sur le bloc `<script>` extrait de `classique.html` (voir section "Validation").
- **Pédagogie** : alignement strict sur les programmes officiels français de **6e (BO 17/04/2025)**, **5e/4e/3e (BO 05/03/2026)** et **DNB 2027**. Couverture ~90 % du programme collège.
- **A11y** : le jeu est conforme WCAG 2.1 AA sur les critères majeurs. **Ne pas régresser**.
- **Légal** : aucun visuel des œuvres utilisé, uniquement des noms. Disclaimer + email `legal@acs-dataformation.fr` dans le footer/modal.
- **Analytique** : GoatCounter (code `ninja-math`), sans cookies, RGPD-safe.
- **Page principale = édition animée** : `index.html` est **généré** (`classique.html` + `anime-src/`) — ne jamais l'éditer à la main, et le reconstruire après toute modification de `classique.html` : `python3 tools/build_anime.py && node tools/test_anime.js` (voir § 13). `anime.html` n'est plus qu'une page de redirection vers la page principale.

-----

## 1. Architecture du projet

### 1.1 Fichiers du dépôt

```
/
├── classique.html                   Jeu classique — fichier source (à modifier)
├── index.html                       Page principale = édition animée — GÉNÉRÉ, ne pas éditer (§ 13)
├── anime.html                       Ancienne adresse de l'édition animée : page de redirection vers ./ (écrite à la main)
├── anime-src/ · tools/              Couche d'animation : sources + README (contrat), build_anime.py, test_anime.js
├── manifest.json                    Manifest PWA (le seul : commun aux deux pages)
├── sw.js                            Service Worker (cache-first, versionné par CI)
├── icon-192.png / icon-512.png      Icônes PWA
├── og-image.png / og-image.svg      Image OpenGraph 1200×630 (source SVG)
├── .github/workflows/pages.yml      Déploiement GitHub Pages auto (injecte SHA dans sw.js, reconstruit index.html)
├── .gitattributes                   Fins de ligne LF pour les fichiers dont dépend la construction
├── README.md                        Documentation publique
└── CLAUDE.md                        Ce fichier
```

### 1.2 Architecture interne de `classique.html`

Le fichier monolithique se décompose en 4 zones (les numéros de ligne sont des estimations, à confirmer avec `grep -n`) :

| Zone | Lignes (approx.) | Rôle |
|---|---|---|
| `<head>` | 1–46 | Meta, OG, favicon SVG inline, link manifest, polices Google |
| `<style>` | 47–2246 | CSS complet : variables, layout, 13 écrans, animations, a11y |
| HTML body | 2248–3617 | 13 écrans + 7 modals + footer |
| `<script>` | 3618–11750 | Logique de jeu : data, état, modes, rendu, événements, PWA, analytics |

`index.html` reprend ces 4 zones telles quelles et y ajoute un commentaire « fichier généré » après le doctype, `<style id="fx-style">` avant `</head>` et `<script id="fx-script">` avant `</body>` (§ 13).

### 1.3 Pourquoi un seul fichier ?

**C'est un choix de conception, pas un accident**. Chaque page du jeu (`classique.html`, et `index.html` qui en est générée) est un fichier unique qui doit pouvoir être :

- Téléchargé en un clic
- Ouvert hors-ligne par double-clic
- Envoyé par email à un parent ou enseignant
- Hébergé sur n'importe quel CDN statique sans build

**Si tu envisages de découper le fichier**, demande confirmation explicite à l'utilisateur. C'est un changement architectural majeur. Limite douce : **500 Ko**. `classique.html` fait ≈ 560 Ko : le seuil est **dépassé** (il l'était déjà avant l'audit des questions de novembre 2026) ; `index.html`, la page que chargent les joueurs, fait ≈ 660 Ko (≈ 101 Ko de couche d'animation). Tout ajout volumineux se discute avec l'utilisateur.

-----

## 2. Modes de jeu (17 expériences)

### 2.1 QCM par niveau de difficulté (legacy)

| Mode | Écran | Fonction d'entrée | Banque | Caractéristiques |
|---|---|---|---|---|
| QCM Académie (6e) | `screen-game` | `startGame('6e_facile')` | `QUESTIONS['6e_facile']` (30 Q) | Timer 30s, vies, jutsus |
| QCM Genin (5e) | `screen-game` | `startGame('5e_medium')` | `QUESTIONS['5e_medium']` (25 Q) | Idem |
| QCM Chunin Mix | `screen-game` | `startGame('mixte_difficile')` | `QUESTIONS['mixte_difficile']` (20 Q) | Idem |
| QCM Boss (Kage) | `screen-game` | `startGame('boss')` | `QUESTIONS['boss']` (12 Q) | Timer 20s, **pas de répétition espacée** |
| Entraînement libre (Zen) | `screen-game` | `startGame('libre')` | Pool 6e+5e+mixte (échantillon 20) | **Sans timer, sans HP** — `state.freeMode=true` |

### 2.2 Réviser par chapitre (nouveau format)

| Mode | Écran | Fonction d'entrée | Banque |
|---|---|---|---|
| Chapitre 6e ou 5e | `screen-game` | `startGame('6e:fractions_6e')` etc. | `QUESTIONS_BY_CHAPTER['6e']` ou `['5e']` (auto-bucketing depuis legacy via `TYPE_TO_CHAPTER_*`) |
| Chapitre 4e | `screen-game` | `startGame('4e:pythagore')` etc. | `QUESTIONS_BY_CHAPTER['4e']` (6 chapitres × 5-9 Q) |
| Chapitre 3e | `screen-game` | `startGame('3e:thales')` etc. | `QUESTIONS_BY_CHAPTER['3e']` (6 chapitres × 5-8 Q) |

Le sélecteur de chapitre est sur l'accueil (onglets 6e/5e/4e/3e). Helper : `getChapterQuestions(classe, chap)` retourne le pool adapté à l'univers actif.

### 2.3 Modes interactifs

| Mode | Écran | Fonction d'entrée | Banque | Particularités |
|---|---|---|---|---|
| Tracé géométrique | `screen-draw` | `startDrawMode()` | `DRAW_MISSIONS` (7) | Canvas mouse+touch, validation auto |
| Puzzle emboîtement | `screen-puzzle` | `startPuzzleMode()` | `PUZZLES` (6) | Drag & drop type `match` ou `sort` |
| Vrai/Faux Speed | `screen-tf` | `startTrueFalse()` | `TRUEFALSE_STATEMENTS` (50) | 7 s/affirmation, raccourcis V/F clavier |
| Histoire interactive | `screen-story` | `startStoryMode()` | `STORY_MISSIONS` (12 aventures × 4 étapes) | Récit narratif multi-étapes |
| **DNB Blanc complet** | `screen-dnb-intro/transition/ex/result` | `startDnbBlanc()` | `DNB_EXERCISES` (4 × 4 sous-questions) + pool auto_dnb | Wrapper 2 phases, note /40 |
| **Constructeur Pythagore/Thalès/Trigo** | `screen-pythagore` | `startPythMode()` | 3 ateliers en onglets, défis aléatoires | Canvas tactile, valeurs live |
| **Arbre de probabilités** | `screen-proba-tree` | `startProbaTree()` | `PROBA_SCENARIOS` (5) | Drag&drop fractions → branches |
| **Lecteur de graphique** | `screen-graph-reader` | `startGraphReader()` | Fonctions affines générées aléatoirement | Canvas + clic-coord, 10 défis |

### 2.4 Mode Automatismes (DNB 2027)

| Mode | Écran | Fonction d'entrée | Pool |
|---|---|---|---|
| Automatismes 6e | `screen-auto` | `startAutoMode('auto_6e')` | `AUTO_POOLS['auto_6e']` (10 générateurs) |
| Automatismes 5e | `screen-auto` | `startAutoMode('auto_5e')` | `AUTO_POOLS['auto_5e']` (11 générateurs) |
| Automatismes 4e | `screen-auto` | `startAutoMode('auto_4e')` | `AUTO_POOLS['auto_4e']` (8 générateurs) |
| Automatismes 3e | `screen-auto` | `startAutoMode('auto_3e')` | `AUTO_POOLS['auto_3e']` (10 générateurs) |
| Automatismes Mix | `screen-auto` | `startAutoMode('auto_mix')` | 6e+5e+4e+3e |
| **Automatismes DNB 2027** | `screen-auto` | `startAutoMode('auto_dnb')` | 4e+3e uniquement (format brevet) |

Format : 20 questions / 20 min, saisie clavier, normalisation tolérante (`5`=`+5`, `0,5`=`0.5`, `−3`=`-3`).

-----

## 3. Structures de données critiques

### 3.1 `state` (état QCM global)

```js
let state = {
  screen: 'home',
  char: 'naruto',              // dans UNIVERSES[currentUniverse].chars
  mode: null,                  // '6e_facile' | '5e_medium' | 'mixte_difficile' | 'boss' | 'libre' | 'CLASSE:chap'
  freeMode: false,             // true en mode 'libre'
  questions: [],
  qIndex: 0,
  score: 0, streak: 0, bestStreak: 0,
  hp: 3, maxHp: 3,
  chakra: 100, maxChakra: 100,
  correct: 0,
  timer: null, timeLeft: 30, maxTime: 30,
  answered: false,
  xp: 0, level: 1,
  jutsu: { '50': 2, 'hint': 2, 'time': 1 },
  timeFrozen: false,
  totalScore: 0,
  missedQueue: [],
  reviewedRetries: 0,
  originalLength: 0
};
```

⚠️ `state.char` est une clé qui **dépend de l'univers actif**. Quand on change d'univers via `selectUniverse()`, `state.char` est réinitialisé à la première clé de l'univers cible. Ne JAMAIS supposer que `state.char === 'naruto'` partout.

### 3.2 `UNIVERSES`

6 univers × 6 personnages × 5 grades. Variables liées :
- `currentUniverse` (clé string)
- `CHARS` = alias dynamique de `UNIVERSES[currentUniverse].chars` — **réassigné** par `selectUniverse()`
- `RANKS` = alias dynamique de `UNIVERSES[currentUniverse].ranks` — idem

### 3.3 `QUESTIONS` (legacy) et `QUESTIONS_BY_CHAPTER` (nouveau)

**Format strict** d'une question :

```js
{
  type: "Catégorie",           // doit matcher TYPE_TO_CHAPTER_* pour apparaître dans le sélecteur par chapitre
  theme: "🍜 Contexte narratif",
  text: `Énoncé avec <span class='highlight'>nom</span> et <span class='math'>formule</span>`,
  answers: ["A", "B", "C", "D"],
  correct: 0,
  feedback: "Explication détaillée avec <strong>la méthode</strong>."
}
```

**Règles** :
- Toujours 4 réponses (le HTML/CSS ne gère pas d'autre nombre proprement).
- `text` accepte du HTML inline : `<span class='math'>`, `<span class='highlight'>`, `<strong>`.
- `feedback` est obligatoire et doit expliquer **la méthode**, pas seulement la réponse.
- Les apostrophes dans les chaînes JS : utiliser des template literals (backticks) ou échapper, sinon erreur de syntaxe.

**Structure `QUESTIONS_BY_CHAPTER`** :

```js
QUESTIONS_BY_CHAPTER = {
  '4e': {
    'pythagore': [...],
    'puissances_scientifique': [...],
    'calcul_litteral_4e': [...],
    'equations_4e': [...],
    'statistiques_4e': [...],
    'transformations_4e': [...]
  },
  '3e': {
    'thales': [...],
    'trigonometrie': [...],
    'fonctions': [...],
    'factorisation': [...],
    'probabilites_arbre': [...],
    'arithmetique_3e': [...]
  }
  // '6e' et '5e' sont construits dynamiquement par buildChaptersFromLegacy()
  // depuis QUESTIONS['6e_facile'] et QUESTIONS['5e_medium'] via TYPE_TO_CHAPTER_*
};
```

**Métadonnées d'affichage** : `CHAPTER_LABELS[classe][chap] = { emoji, name, desc }`.

**Auto-bucketing legacy 6e/5e** : `TYPE_TO_CHAPTER_6E` et `TYPE_TO_CHAPTER_5E` mappent `type` → clé de chapitre. L'IIFE `buildChaptersFromLegacy()` peuple `QUESTIONS_BY_CHAPTER['6e']` et `['5e']` au chargement.

### 3.4 `UNIVERSE_THEMES_MAP` et `UNIVERSE_EMOJI_MAP`

Dictionnaires de **remplacement de texte/emoji** pour adapter les questions Naruto aux 5 autres univers. La fonction `adaptQuestionToUniverse(q, universe)` fait la traduction. Elle est appelée dans `startGame()` après le mélange.

⚠️ Si tu ajoutes un mot Naruto dans une question (ex: "Akatsuki"), tu DOIS l'ajouter dans les 5 autres univers du `UNIVERSE_THEMES_MAP`. Sinon la traduction laissera le mot Naruto dans un univers One Piece.

**Ce que fait (et ne fait pas) l'adaptation** :
- Seuls `text`, `theme` et `feedback` sont adaptés. **Les réponses (`answers`) ne le sont pas** : un mot d'univers placé dans une réponse reste tel quel partout (cas connu : « ryos »).
- L'article ou la préposition juste avant un mot remplacé est refait pour le mot d'arrivée : élision (`de`/`d'`), contraction (`de le` → `du`, `à le` → `au`), `du` → `de l'` devant une voyelle.
- Seuls les QCM passent par `adaptQuestionToUniverse`. Histoire, Puzzle, Tracé et Arbre de probabilités affichent leurs textes tels quels (noms Naruto dans tous les univers) : point connu, en attente d'une décision.
- Un nom absent de la carte reste dans tous les univers : préférer un personnage déjà présent dans `UNIVERSE_THEMES_MAP`.

### 3.5 `DRAW_MISSIONS`, `PUZZLES`

Voir le code source pour le format détaillé. Types de guide tracé : `vertical`, `horizontal`, `diagonal45`, `hyp`, `angle_free`.

- **7 missions de tracé.** La tolérance se lit sur la mission (`m.tolerance`), pas sur son guide. Pour les missions d'angle, c'est le **dernier** angle tracé qui est jugé.
- **Puzzles `match`** : après un dépôt faux, la case reprend son étiquette (`slot.dataset.label`), jamais le nom de la bonne pièce.
- **Puzzles `sort`** : `correctOrder` doit contenir exactement les chaînes de `items` (même signe moins Unicode `−`).

### 3.6 `AUTO_GENERATORS` et `AUTO_POOLS`

Chaque générateur est une fonction qui retourne `{ q, a, theme, accept?, unit? }`.

**Helpers fournis** : `frFr(n)`, `signedFr(n)`, `affineFr(k, m)` (écrit `kx + m` sans « 0x », « 1x » ni « + 0 », avec le signe moins Unicode), `pgcd(a, b)`, `simpFrac(n, d)`, `normalizeAnswer(s)`.

**Règles d'acceptation (`submitAutoAnswer`)** :
- La réponse tapée est normalisée (`normalizeAnswer`) : espaces retirés, `,` → `.`, `−` → `-`, `X` → `x`, `+` initial et zéros décimaux inutiles retirés.
- Si le générateur a un `unit`, l'unité tapée par l'élève en fin de réponse est retirée (« 26 cm » vaut « 26 »).
- Une réponse attendue **fractionnaire** accepte toute écriture de même valeur : `2/16` ou `0,125` pour `1/8`.
- Une réponse attendue décimale n'accepte **pas** un arrondi : seule la valeur exacte (ou une forme listée dans `accept`) est juste.
- Affichage de l'énoncé : « = ? » n'est ajouté que si l'énoncé ne contient ni « ? » ni « : » et que le générateur n'a pas de `unit`.

**QCM générés par chapitre (`genToQcm`)** : 4 valeurs toutes différentes, bonne réponse à un rang tiré au hasard parmi les valeurs triées ; `null` si moins de 3 leurres distincts.

**Pools** : `auto_6e`, `auto_5e`, `auto_4e`, `auto_3e`, `auto_mix` (tous niveaux), **`auto_dnb`** (4e + 3e, format brevet).

⚠️ Pour un nouveau générateur, générer 50 instances et vérifier que `a` est exact.

### 3.7 `TRUEFALSE_STATEMENTS`

```js
{ text: "5 + 3 = 8", isTrue: true, explain: "..." }
```

50 affirmations couvrant 6e à 3e.

### 3.8 `STORY_MISSIONS`

12 aventures narratives de 4 étapes. Chaque étape est un QCM enrobé dans un récit. Les étapes d'une même aventure s'enchaînent : une valeur trouvée à une étape est réutilisée ensuite, donc toute correction d'une étape se vérifie sur les suivantes.

```js
{
  title: "🍜 La grande commande de ramen",
  decor: "🍜",
  intro: "Naruto doit organiser un banquet...",
  steps: [
    { narrative: "...", question: "...", type: "Calcul", answers: [...], correct: 0, feedback: "..." }
  ]
}
```

### 3.9 `DNB_EXERCISES`

4 exercices écrits du DNB Blanc complet, structure proche de `STORY_MISSIONS` mais avec un scoring spécifique (8.5 pts/exo).

```js
{
  title: "Exercice 1 — Géométrie",
  icon: "📐",
  decor: "📐",
  intro: "Contexte général de l'exercice...",
  steps: [{ narrative, question, type, answers, correct, feedback }, ...]
}
```

### 3.10 `PROBA_SCENARIOS`

5 scénarios pour le mode Arbre de probabilités.

```js
{
  title: "Tirage sans remise",
  context: "Une urne contient 4 rouges et 6 bleues...",
  branches: { 'lvl1-A': { label: 'R', desc: '...', prob: '4/10' }, ... },
  pool: ['4/10', '6/10', '3/9', '6/9', '4/9', '5/9'],
  question: { text, answers, correct, feedback }
}
```

### 3.11 État Phase 4

- `dnbState` : machine à états pour le DNB Blanc (intro → auto → trans1 → exercises → result)
- `pythState` : ateliers Pythagore/Thalès/Trigo (sous-états pour chaque atelier)
- `probaState` : arbre de probabilités (placements, validation)
- `graphState` : lecteur de graphique (canvas + courbe + clic)

### 3.12 Stats locales joueur

`playerStats` (persisté dans `localStorage.amat_player_stats_v1` si `isSaveEnabled()`) :

```js
{
  totalGames, totalCorrect, totalAnswered,
  gamesByMode: { [mode]: count },
  universesUsed: { [universe]: count },
  charsUsed: { 'univers:perso': count },
  chapterPerf: { 'classe:chap': { correct, total } },
  lastPlayedDate: 'YYYY-MM-DD',
  currentStreak, bestDayStreak,
  firstSeen, lastSeen
}
```

Helpers : `recordGameStart(mode)`, `recordGameComplete(mode, correct, total)`, `recordUniverseSelect(u)`, `recordCharSelect(u, c)`. Tous sont appelés via les fonctions `start*` et `end*` correspondantes.

-----

## 4. Conformité aux programmes officiels

### 4.1 Sources réglementaires

- **6e** : [BO du 17 avril 2025](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A), cycle 3, en vigueur depuis la rentrée 2025.
- **5e à 3e** : BO du 5 mars 2026, cycle 4, en vigueur dès la rentrée 2026.
- **DNB 2027** : nouvelle épreuve avec **automatismes** (20 min, 6 pts/40) + 4 exercices écrits (34 pts/40).

### 4.2 Notions par niveau (récapitulatif)

**6e (cycle 3)** : décimaux, fractions (addition/soustraction même dénominateur, équivalence, début de × et ÷), calcul mental, PGCD, divisibilité, symétrie axiale (pas centrale), angles, aires/périmètres/volumes simples (cube, pavé), moyenne, **probabilités** (nouveau 2025), proportionnalité, pré-algèbre **avec des mots** (pas de lettres).

**5e (cycle 4)** : relatifs (+,−,×), fractions 4 opérations, puissances entières, priorités, calcul littéral (substitution, développement simple), **équations 1er degré simples** (nouveauté 2026), symétrie centrale, somme angles triangle, pourcentages, proportionnalité (échelles, vitesse), probabilités.

**4e (cycle 4)** : **Pythagore** (direct + réciproque), puissances et **notation scientifique** (10ⁿ, a × 10ⁿ), calcul littéral avancé (développement (a+b)(c+d), factorisation simple), équations à 2 membres, statistiques (médiane, étendue, moyenne pondérée), transformations (translation, rotation).

**3e (cycle 4) + DNB 2027** : **Thalès** (direct + réciproque, configurations papillon), **trigonométrie** (cos/sin/tan, SOH-CAH-TOA, angles remarquables), fonctions linéaires & affines (image, antécédent, expression, coefficient directeur), identités remarquables, factorisation a²−b², équation produit-nul, probabilités composées (arbres, avec/sans remise), arithmétique (PGCD via Euclide, fractions irréductibles, nombres premiers).

### 4.3 Règles de placement — erreurs à éviter

❌ **Pythagore en 5e** : c'est du **4e**. Si tu trouves une question Pythagore dans `5e_medium` legacy, c'est une erreur héritée à corriger.

❌ **Thalès et trigonométrie en 4e** : c'est du **3e**. Idem.

❌ **Calcul littéral avec lettres en 6e** : pas avant la 5e. Une question 6e doit utiliser des mots ("le double d'un nombre"), pas des x ou y.

❌ **Propriétés des droites parallèles/perpendiculaires comme sujet principal en 6e** : ont disparu du programme 2025.

Si tu ajoutes une question, **vérifie le niveau** sur les BO officiels. En cas de doute, demande à l'utilisateur.

-----

## 5. Accessibilité — règles à respecter scrupuleusement

Le jeu est conforme WCAG 2.1 AA sur les critères majeurs. **Ne pas régresser**.

### 5.1 Règles fermes

1. **Aucun `<div onclick>` sans `role="button"` + `tabindex="0"` + handler `onkeydown`** (Enter et Espace activent l'élément). Préférer `<button type="button">` quand le CSS le permet.
2. **Tous les boutons à emoji** doivent avoir un `aria-label` descriptif. L'emoji lui-même doit être `aria-hidden="true"`.
3. **`:focus-visible`** doit rester visible sur tous les éléments interactifs (outline jaune épais).
4. **Min height 44px** pour tous les éléments cliquables (touch target WCAG AAA).
5. **`prefers-reduced-motion`** doit désactiver les animations non essentielles.
6. **Émojis décoratifs** dans le texte : encapsuler dans `<span aria-hidden="true">` quand ils sont décoratifs.
7. **Live regions** : utiliser `announceToScreenReader(message)` pour annoncer les changements importants (correct/faux, changement d'écran, défi réussi).
8. **Modals** : `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, **focus trap** (`trapFocus`). Le focus doit revenir à l'élément précédemment focusé après fermeture.
9. **Échap** ferme les modals (handler dans `trapFocus`).
10. **stripHtml() pour les SR** : ne JAMAIS utiliser `msg.replace(/<[^>]+>/g, '')` pour nettoyer du HTML avant `announceToScreenReader()`. Utiliser le helper `stripHtml()` existant (CodeQL flagge la regex comme sanitization incomplète).

### 5.2 Raccourcis clavier (à préserver)

- `1`/`2`/`3`/`4` : sélectionner la réponse A/B/C/D en QCM
- `V`/`F` ou `1`/`2` : Vrai / Faux en mode Speed
- `Entrée` ou `Espace` : valider en mode Automatismes, passer à la suivante en QCM
- `Échap` : ouvrir la modal Pause en QCM ou Automatismes
- `Tab` / `Shift+Tab` : navigation séquentielle (focus trap dans les modals)
- Bouton "Précédent" du navigateur : ouvre la modal Quitter au lieu de fermer l'app

-----

## 6. Conventions de style et de code

### 6.1 CSS

- **Variables CSS** dans `:root`. Toujours utiliser `var(--orange)` plutôt que `#FF6B00`.
- **Classes** : kebab-case (`puzzle-piece`, `char-card`, `chapter-tab`).
- **IDs** : kebab-case (`screen-home`, `auto-input`, `pyth-canvas`).
- **Polices** : `'Bangers', Impact, 'Arial Black', cursive` pour les titres (fallback iOS critique), `'Nunito', sans-serif` pour le corps.
- **Pas d'inline styles** sauf pour les valeurs vraiment dynamiques.

### 6.2 JavaScript

- **Pas d'ES modules** (`import`/`export`). Code en script global.
- **Pas de classes ES6**. Tout est en fonctions + objets globaux.
- **String templates (backticks) obligatoires** pour les chaînes contenant des apostrophes françaises. Sinon : erreur de syntaxe.
- **Caractères Unicode** acceptés dans les strings (×, ÷, −, ≥, π, °, ², ³, etc.). Encodage du fichier : **UTF-8 obligatoire**.
- **Timers** : toujours stockés dans `state.timer`, `autoState.qTimer`, `autoState.globalTimer`, `puzzleState.timer`, `tfState.timer`. **Toujours `clearInterval()` avant de relancer** ou avant de quitter un écran.
- **Cleanup à la sortie d'un mode** : voir `exitAutoMode()`, `showHome()`, `quitTrueFalse()`, etc.

### 6.3 Nommage des fonctions

- `start*` : démarre un mode (`startGame`, `startAutoMode`, `startTrueFalse`, `startStoryMode`, `startDrawMode`, `startPuzzleMode`, `startDnbBlanc`, `startPythMode`, `startProbaTree`, `startGraphReader`)
- `load*` : charge la donnée d'une étape (`loadQuestion`, `loadAutoQuestion`, `loadPuzzle`, `loadDrawMission`, `loadDnbExercise`, `loadProbaScenario`, `loadGraphChallenge`)
- `render*` : génère du HTML/canvas dynamiquement (`renderUniverseGrid`, `renderCharGrid`, `renderPuzzle`, `renderCanvas`, `renderPyth`, `renderGraph`, `renderProbaTree`)
- `update*` : met à jour le DOM existant (`updateHUD`, `updateStatsUI`, `updateJutsuUI`, `updateTimerUI`)
- `validate*` : valide une réponse / un tracé (`validateDraw`, `validateMatchPuzzle`, `validateSortPuzzle`, `validatePythChallenge`, `validateProbaPlacement`, `validateGraphAnswer`)
- `submit*` / `answer*` : envoie une réponse utilisateur (`submitAutoAnswer`, `answerTf`, `answerStoryStep`, `answerDnbStep`, `answerProbaQuestion`, `answerGraphQcm`)
- `select*` : sélectionne un élément (`selectUniverse`, `selectChar`, `selectChapterClass`, `selectPythAtelier`)
- `show*` / `open*` / `close*` : navigation et modals
- `record*` : tracking analytics + stats locales (`recordGameStart`, `recordGameComplete`, `recordUniverseSelect`, `recordCharSelect`)

-----

## 7. Workflow de développement

### 7.1 Avant toute modification

1. **Lire la section concernée** dans ce fichier.
2. **Identifier l'impact** :
   - Modif de question = `QUESTIONS` ou `QUESTIONS_BY_CHAPTER`
   - Modif d'univers = `UNIVERSES` + `UNIVERSE_THEMES_MAP` + `UNIVERSE_EMOJI_MAP`
   - Modif de mode = `start*`/`end*` + screen HTML + CSS
   - Modif transversale (cleanup legacy, refactor) : prévenir l'utilisateur
3. **Modifier `classique.html`, jamais `index.html`** (généré, écrasé à la construction suivante). Après toute modification de `classique.html` : `python3 tools/build_anime.py && node tools/test_anime.js`, puis versionner `classique.html` **et** `index.html` (§ 13).

### 7.2 Édition par patches Python

Pour les gros fichiers HTML mono-fichier, utiliser des scripts Python avec `str.replace()` est plus fiable que `Edit` direct pour les modifs multi-lignes :

```python
with open('classique.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = """...bloc exact à remplacer..."""
new = """...nouveau bloc..."""

assert old in content, f"NOT FOUND"
content = content.replace(old, new, 1)

with open('classique.html', 'w', encoding='utf-8') as f:
    f.write(content)
```

### 7.3 Validation systématique après modification

Ces recettes portent sur `classique.html`. Pour `index.html` (deux blocs `<script>`) : `python3 tools/build_anime.py --check` (§ 13).

```bash
# 1. Extraire le bloc <script> et vérifier la syntaxe JS
python3 -c "
with open('classique.html', 'r', encoding='utf-8') as f: c = f.read()
s = c[c.find('<script>')+8:c.rfind('</script>')]
with open('/tmp/g.js', 'w') as f: f.write(s)
"
node --check /tmp/g.js
```

```python
# 2. Vérifier les IDs (DOM)
import re
with open('classique.html', 'r', encoding='utf-8') as f: c = f.read()
html_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', c))
js_ids = set(re.findall(r"""getElementById\(['"]([^'"]+)['"]\)""", c))
missing = js_ids - html_ids - {'sort-zone', 'sr-live'}
print("Missing IDs:", missing)
```

```python
# 3. HTML well-formed (compter ouvertures/fermetures)
for tag in ['div', 'button', 'script', 'style', 'main']:
    opens = len(re.findall(rf'<{tag}\b', c))
    closes = len(re.findall(rf'</{tag}>', c))
    assert opens == closes, f"{tag}: {opens}/{closes}"
```

### 7.4 Patterns à éviter (CodeQL)

❌ `msg.replace(/<[^>]+>/g, '')` → flaggé `js/incomplete-sanitization`. **Utiliser `stripHtml(msg)` à la place.**

❌ `eval()`, `new Function()` — jamais nécessaire dans ce projet.

❌ `innerHTML = userInput` — mais `innerHTML = templateLiteral` est OK car le contenu vient de littéraux contrôlés.

### 7.5 Tests manuels obligatoires après modifications structurelles

- [ ] Ouvrir `index.html` (page principale) et `classique.html` dans Chrome / Firefox / Safari
- [ ] Tester le sélecteur d'univers (6 univers, animations OK)
- [ ] Tester chaque mode au moins une question
- [ ] Tester la pause + reprise (QCM et auto)
- [ ] Tester le bouton précédent du navigateur
- [ ] Tester la navigation 100 % clavier (Tab + Enter)
- [ ] Tester sur mobile (touch events sur canvas/drag)
- [ ] Vérifier que `prefers-reduced-motion` désactive les animations
- [ ] Tester la notification de mise à jour PWA (changer manuellement CACHE_NAME dans sw.js, rafraîchir)

### 7.6 Déploiement

- Workflow `pages.yml` se déclenche automatiquement sur push to `main`
- Avant l'upload, le step "Inject cache version" remplace `__CACHE_VERSION__` dans `sw.js` par `${GITHUB_SHA:0:8}`
- Puis le step "Rebuild main page (index.html)" reconstruit `index.html` depuis `classique.html` ; il ne fait jamais échouer le déploiement (§ 13.1)
- Site déployé à https://acs-data.github.io/ninja-math-games/ (page principale = édition animée) ; jeu classique à `…/classique.html` ; l'ancienne adresse `…/anime.html` redirige vers la page principale
- En cas d'urgence : merge sur main → workflow tourne en ~30 s → live

-----

## 8. Pièges connus et bugs déjà rencontrés

### 8.1 Apostrophes françaises dans les strings JS

**Symptôme** : `Uncaught SyntaxError: missing ) after argument list`
**Cause** : `showToast('quelque chose d'abord')` — l'apostrophe ferme la chaîne.
**Solution** : template literals (backticks) ou échapper (`\'`).

### 8.2 Polices Bangers cassées sur iOS Safari

**Solution déjà en place** : `<link rel="stylesheet">` + `@font-face` fallback + chaîne `'Bangers', Impact, 'Arial Black', cursive`.

### 8.3 IDs `sort-zone` et `sr-live` "manquants"

Ces deux IDs sont créés dynamiquement par JS. C'est normal qu'ils n'existent pas dans le HTML statique. Les exclure des audits.

### 8.4 `state.char` et changement d'univers

Lors d'un `selectUniverse()`, `state.char` est reseté à la première clé de l'univers. **Toujours utiliser `CHARS[state.char]`** pour récupérer les données du personnage actif.

### 8.5 Timer fantôme

Si on quitte un mode sans nettoyer le timer, il continue en arrière-plan et peut déclencher `timeOut()` sur un écran qui n'est plus visible. **Toujours `clearInterval()`** dans `showHome()`, `exitAutoMode()`, et tout `quit*()`.

### 8.6 Précision flottante

`0.1 + 0.2 !== 0.3` en JS. Les générateurs d'automatismes utilisent `Math.round((a+b)*10)/10` pour éviter `9.799999999999999`. **Toujours arrondir** les calculs avec décimaux.

### 8.7 Z-index et modals

L'overlay des modals a `z-index: 1000`. Si tu ajoutes un nouvel élément flottant, attention à ne pas passer au-dessus accidentellement.

### 8.8 CodeQL — sanitization HTML

Voir 7.4. Toujours `stripHtml()` pour les annonces SR, jamais de regex.

### 8.9 Pythagore "égaré" en 5e_medium (résolu)

Résolu lors de l'audit des questions de novembre 2026 : la question Pythagore du legacy `5e_medium` a été déplacée dans `QUESTIONS_BY_CHAPTER['4e']['pythagore']` (triangle 8-15-17, pour ne pas doubler le 3-4-5 déjà présent) et l'entrée `'Pythagore'` a été retirée de `TYPE_TO_CHAPTER_5E`. Ne pas remettre de Pythagore en 5e (§ 4.3).

Le même audit a relu toutes les banques (QCM, Vrai/Faux, Histoire, DNB, puzzles, tracés, générateurs, ateliers, lecteur de graphique). Pièges retrouvés plusieurs fois, à éviter dans tout nouveau contenu :
- deux réponses de même valeur dans un QCM (`6/20` et `3/10`, `√25` et `5`) ;
- une clé `correct` qui ne désigne pas la réponse donnée par l'explication ;
- une explication qui hésite (« Attends… recomptons ») ou qui garde une ancienne valeur ;
- un énoncé de géométrie sans la donnée qui rend le calcul légitime (triangle rectangle, droites parallèles, points alignés) ;
- des écritures non françaises (`2^3`, point décimal, tiret à la place du signe moins).

### 8.10 Légal — pas de visuel des œuvres

⚠️ **Crucial pour le risque IP** : ne JAMAIS ajouter sprites, fan-art, captures d'écran, logos officiels, musiques. Uniquement des **noms** et **emojis Unicode**. Tout ajout visuel ferait basculer le projet du risque "FAIBLE" au risque "ÉLEVÉ" (analyse juridique en historique).

### 8.11 Légal — pas de monétisation

⚠️ **Aussi crucial** : ne jamais ajouter pub, paywall, dons, premium, achats in-app. L'argument central de défense légale est "absence d'usage dans la vie des affaires" (CJUE Arsenal/Reed). Toute monétisation invaliderait cet argument.

### 8.12 Service worker cache pas invalidé

Si une nouvelle version ne s'affiche pas chez l'utilisateur après déploiement :
1. Vérifier que `__CACHE_VERSION__` a bien été remplacé par le SHA dans `sw.js` (regarder le workflow run logs)
2. L'utilisateur voit-il le toast "🔄 Nouvelle version disponible" ? Sinon, son SW n'a pas détecté la mise à jour (devra attendre 1h ou rafraîchir)

À l'installation, le service worker redemande les fichiers essentiels au réseau (`cache: 'reload'`) : le cache HTTP de GitHub Pages (`max-age=600`) ne peut pas lui faire ranger l'ancienne page dans le nouveau cache. Ne pas retirer cette option.

### 8.13 Défilement géré par le jeu (question et résultats)

Deux comportements du jeu (écrits dans `classique.html`, donc présents aussi dans `index.html`), ajoutés pour les petits écrans, à préserver :

- **`bringIntoView(el)`**, appelé à la fin de `loadQuestion()` sur `#question-wrap` : si la carte question (énoncé + réponses) n'est pas entièrement visible entre l'en-tête collant et le bas de la fenêtre, la page défile aussitôt (sans animation, sans toucher au focus) pour caler le bas de la carte en bas de la fenêtre, sans jamais cacher son haut sous l'en-tête. Ne fait rien si la carte est déjà visible. Avant, la page restait défilée là où se trouvait « QUESTION SUIVANTE » et l'énoncé suivant commençait caché sous l'en-tête.
- **`showScreen()`** : tout écran dont l'identifiant finit par `result` s'affiche depuis le haut (`window.scrollTo(0, 0)`).

L'édition animée en dépend (arène du QCM visible au moment de la réponse, cérémonie de résultat complète). Après toute retouche : `node tools/test_anime.js --only defilement,defilement-partie`.

-----

## 9. Évolutions possibles et leur impact

### 9.1 Ajouter une question QCM (faible impact)

- **Chapitre 4e/3e** : ajouter dans `QUESTIONS_BY_CHAPTER['4e']['pythagore']`, etc.
- **Legacy 6e/5e** : ajouter dans `QUESTIONS['6e_facile']`, etc. + vérifier que `type` est mappé dans `TYPE_TO_CHAPTER_6E`/`5E` pour apparaître dans le sélecteur par chapitre
- **Précautions** :
  - Respecter le format (4 réponses, feedback obligatoire)
  - Vérifier le niveau (6e/5e/4e/3e) selon les programmes officiels
  - Si on introduit un nouveau nom propre, l'ajouter dans `UNIVERSE_THEMES_MAP` pour les 5 autres univers

### 9.2 Ajouter un univers anime (impact moyen)

- **Quoi** : nouvelle clé dans `UNIVERSES` + entrée correspondante dans `UNIVERSE_THEMES_MAP` et `UNIVERSE_EMOJI_MAP`.
- **Précautions** :
  - 6 personnages avec bonus variés (xp, precision, hint, time, combo, score)
  - 5 grades aux paliers 0, 30, 60, 80, 95
  - Couleur principale en hex
  - Tester l'adaptation des questions (pas de mot Naruto qui traîne)

### 9.3 Ajouter un générateur d'automatismes (faible impact)

- **Quoi** : ajouter une fonction dans `AUTO_GENERATORS` + inclure dans le pool (`AUTO_POOLS`).
- **Précautions** :
  - **Tester** : générer 50 instances et vérifier que `a` est exactement le résultat
  - Utiliser les helpers (`frFr`, `signedFr`, `simpFrac`)
  - `theme` pour les stats finales
  - `accept: [...]` pour les formes équivalentes

### 9.4 Ajouter un scénario aux modes Phase 4

- **DNB Blanc** : ajouter dans `DNB_EXERCISES` (4 sous-questions par exercice)
- **Pythagore atelier** : modifier `newPythChallenge()` pour ajouter de nouveaux types de défis. Une cible doit rester atteignable à la souris sur tous les écrans : AB entre 1,5 et 8,3 cm, AC entre 1,1 et 4 cm (portée mesurée la plus courte : 4,0 cm sur une fenêtre de 768 px de large). Les longueurs s'affichent avec une virgule décimale
- **Arbre proba** : ajouter dans `PROBA_SCENARIOS` (6 branches + question)
- **Lecteur graphique** : modifier `loadGraphChallenge()` pour ajouter de nouveaux types ou supporter d'autres fonctions (paraboles, etc.). Le point demandé (image ou antécédent) est toujours tiré **dans le repère affiché** (`graphState.yRange`) ; les expressions s'écrivent avec `affineFr` et les nombres avec `formatNum` (virgule, signe moins Unicode)

### 9.5 Ajouter un mode entier (impact élevé)

- **Quoi** : nouvel écran HTML + état dédié + fonctions `start*`, `load*`, `validate*`, `end*`
- **Précautions** :
  - Ajouter l'ID dans la liste `flexScreens` de `showScreen()` si flex
  - Bouton retour accueil avec cleanup de timers
  - Respect des règles a11y (focus visible, ARIA, raccourcis clavier)
  - Carte d'entrée sur l'écran d'accueil avec `role="button"` + `tabindex="0"`
  - Hook `recordGameStart` et `recordGameComplete` pour les stats

### 9.6 Modifier le système de scoring (impact élevé)

- **Précautions** :
  - Les multiplicateurs de personnages (`CHARS[state.char].bonus`) sont appliqués dans `answer()`
  - Les paliers de grades sont dans `RANKS` de chaque univers
  - Le pourcentage de réussite détermine le rang dans `endGame()`

-----

## 10. Ce qu'il ne faut PAS faire

❌ **Ne pas casser le mono-fichier** sans demander explicitement.
❌ **Ne jamais éditer `index.html` à la main** : il est généré depuis `classique.html` (§ 13) et serait écrasé à la construction suivante.
❌ **Ne pas régresser sur l'accessibilité** : pas de `<div onclick>` sans `role="button"`, pas d'animation sans respect de `prefers-reduced-motion`.
❌ **Ne pas ajouter de dépendances externes** (npm, CDN tiers obligatoire) sans nécessité absolue. Tout doit fonctionner offline.
❌ **Ne pas hardcoder Naruto** dans le code après les changements multi-univers. Toujours passer par `UNIVERSES[currentUniverse]` ou les alias `CHARS`/`RANKS`.
❌ **Ne pas mettre du Pythagore en 5e**, du Thalès/trigo en 4e ni du calcul littéral avec lettres en 6e.
❌ **Ne pas utiliser `localStorage`** sans `isSaveEnabled()` (RGPD opt-in strict).
❌ **Ne pas casser le format français** : virgules pour les décimaux, espaces insécables, signes Unicode (`−` plutôt que `-`).
❌ **Ne pas créer de questions à 3 ou 5 réponses**. Toujours 4.
❌ **Ne pas oublier de `clearInterval()`** lors de la sortie d'un mode chronométré.
❌ **Ne pas utiliser des apostrophes françaises** (`'`) directement dans des strings JS quotées avec `'...'`. Utiliser les backticks ou échapper.
❌ **Ne pas utiliser de regex pour sanitize HTML** (`/<[^>]+>/g`). Toujours `stripHtml()` (CodeQL).
❌ **Ne pas ajouter de visuel des œuvres** (sprites, fan-art, logos, musiques). Risque IP critique.
❌ **Ne pas ajouter de monétisation** (pub, paywall, dons, premium). Invaliderait la défense légale.
❌ **Ne jamais collecter de données personnelles** sans opt-in RGPD strict. Public mineur, vigilance maximale.

-----

## 11. Ressources et références

### 11.1 Programmes officiels

- [BO 17 avril 2025 — Cycle 3 (6e)](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A)
- [Eduscol Cycle 3 — Mathématiques](https://eduscol.education.fr/251/mathematiques-cycle-3)
- [Eduscol Cycle 4 — Mathématiques](https://eduscol.education.fr/280/mathematiques-cycle-4)

### 11.2 Accessibilité

- [WCAG 2.1 niveau AA](https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_overview&levels=aaa)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- Outils de test : axe DevTools (Chrome), Lighthouse a11y audit

### 11.3 Tech PWA

- [MDN — Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Service Worker patterns](https://web.dev/articles/service-workers-cache-storage)
- [Web Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

### 11.4 Légal (analyse interne)

- Article L122-5 CPI — exceptions au droit d'auteur (Légifrance)
- Article L713-6 CPI — usage référencé de marque
- CJUE *Arsenal/Reed* C-206/01 — usage "dans la vie des affaires"
- Niveau de risque évalué : **FAIBLE** tant que (a) pas de visuel des œuvres, (b) pas de monétisation, (c) disclaimer + procédure de retrait actifs

### 11.5 Public visé

- Collégiens 11-14 ans (6e à 3e)
- Fans d'animes japonais populaires
- Niveau de lecture : 6e/5e/4e/3e selon mode
- Cadre d'usage prévu : à la maison, en autonomie, 20-30 min/jour

-----

## 12. Contact et décisions de conception

Quelques décisions importantes (à ne pas remettre en question sans discussion) :

1. **Mono-fichier** : portabilité maximale, zéro friction d'installation. Limite douce 500 KB. Le jeu s'écrit dans `classique.html` ; `index.html` (l'édition animée, page principale depuis novembre 2026) en est généré et reste un fichier unique.
2. **`localStorage` opt-in strict** : pas de persistance par défaut, évite les questions RGPD pour des mineurs.
3. **Pas de backend, pas d'API externe** : le jeu fonctionne 100 % offline une fois téléchargé (sauf chargement initial des polices Google et envoi anonyme à GoatCounter).
4. **Pas d'audio** : volontaire, pour le calme de l'étude et la concentration.
5. **6 univers anime ciblés** : Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer, Pokémon. Choix basé sur la popularité chez les 11-14 ans francophones en 2025-2026.
6. **Banque de questions fixe + générateurs aléatoires** : QCM avec feedbacks soignés (fixes), automatismes avec pratique quasi-infinie (aléatoire).
7. **Répétition espacée légère** : ré-injection des questions ratées toutes les 3 questions + phase révision en fin de session, sauf en mode Boss et Phase 4.
8. **Pas de monétisation** : choix légal et éthique (public mineur). Si la question revient, voir l'analyse juridique : la monétisation augmente significativement le risque IP.
9. **Pas de visuel des œuvres** : choix légal stratégique. Ne jamais ajouter de sprites, logos, fan-art, etc.
10. **GoatCounter pour analytics** : sans cookies, EU-hosted, RGPD-safe. Code `ninja-math`. Respect de `navigator.doNotTrack`. Depuis la bascule de novembre 2026, la page principale compte l'édition animée et `classique.html` le jeu classique (`anime.html`, simple redirection, n'est pas comptée) : ne pas comparer les chiffres d'avant et d'après sans en tenir compte.
11. **Cache versionné automatiquement** : `__CACHE_VERSION__` remplacé par le SHA du commit au déploiement. Notification utilisateur "METTRE À JOUR" via toast persistant.

-----

## 13. Édition animée = page principale (`index.html`)

`index.html` = `classique.html` (copié tel quel, `<head>` compris, **jamais modifié**) + un commentaire « fichier généré » juste après le doctype + une couche d'animation injectée (`<style id="fx-style">` et `<script id="fx-script">`, ≈ 101 Ko, une seule globale `FX`) : transitions d'écran, combat du QCM, moment de bonne réponse dans chaque mode, écrans de résultat animés. Depuis novembre 2026, l'édition animée est la page principale du site (`https://acs-data.github.io/ninja-math-games/`) ; le jeu classique reste déployé à côté (`…/classique.html`) ; l'ancienne adresse `…/anime.html` redirige vers la page principale.

### 13.1 À savoir avant toute modification

- **`index.html` est GÉNÉRÉ** : ne jamais l'éditer à la main. Modifier `classique.html` (le jeu) ou `anime-src/` (la couche), puis `python3 tools/build_anime.py`. Le build refuse d'écrire sur `classique.html` (code 2).
- **Toute modification de `classique.html` impose de reconstruire et de retester** : `python3 tools/build_anime.py && node tools/test_anime.js`, puis versionner `classique.html` **et** `index.html`. La couche enveloppe 50 fonctions globales du jeu par leur nom (`answer`, `showScreen`, `endGame`, `validateDraw`…). Le build **refuse** de construire (code 2, rien n'est écrit) si disparaît de `classique.html` un nom dont dépend le noyau de la couche (`showScreen`, `openModal`, `closeModal`, `toggleSave`, `isSaveEnabled`, `state`, `currentUniverse`, `UNIVERSES`, `CHARS`, `#app`, la classe `modal-overlay`, l'écran d'une épreuve) ou l'arène du QCM (`loadQuestion`, `answer`, `timeOut`, `useJutsu`, `updateTimerUI`, `addXP`, `applyTheme`), ou si `classique.html` ne commence plus par la ligne `<!DOCTYPE html>` ; pour les autres fonctions enveloppées il **avertit** (un effet en moins). Les tests disent si un comportement a changé. `index.html` est versionné ; le déploiement (`pages.yml`) le reconstruit aussi, sans jamais échouer : si la construction est refusée, c'est l'`index.html` versionné qui est déployé — une page principale alors en retard sur `classique.html`, signalée par une annotation d'erreur du déroulé GitHub Actions.
- **La recette de validation du § 7.3 ne s'applique pas à `index.html`** (deux blocs `<script>`) : utiliser `python3 tools/build_anime.py --check` (lints de la couche, contrat avec `classique.html`, `node --check` sur chaque bloc ; code 1 si le fichier n'est pas à jour, code 2 si la construction est refusée).
- **Tests** : `node tools/test_anime.js` (Playwright + Chromium, plus `python3` et `bash` pour le scénario `build` ; ≈ 6 min 30, à lancer seule sur la machine, aucune dépendance ajoutée au dépôt ; `--only clé1,clé2` pour quelques scénarios, `--list` pour les clés). Le script ne rend 0 que si des vérifications ont tourné et sont toutes vertes (Playwright introuvable : 3 ; option ou clé inconnue : 2 ; aucune vérification : 1). Principe : la même session scriptée sur `classique.html` et `index.html` doit donner le même état de jeu, le même focus, les mêmes toasts et annonces, et le même DOM une fois retirés les nœuds de la couche (`<head>` compris, balise pour balise). Les lints du build sont un fil d'alarme, pas un bac à sable.
- **`<head>` et manifest communs** : `index.html` reprend le `<head>` de `classique.html` sans aucune retouche (titre, descriptions, `manifest.json`). Une seule application installable ; `manifest-anime.json` n'existe plus.
- **`anime.html`** (ancienne adresse de l'édition animée) : petite page statique écrite à la main, pas générée, qui redirige vers `./` en gardant la requête et l'ancre ; `noindex`, aucun manifest, aucune ressource, aucun service worker. Ouverte depuis le disque (`file://`), elle mène au dossier et non au jeu : ouvrir `index.html` ou `classique.html`.
- **`localStorage` partagé** entre les deux pages (même origine, dans un même navigateur et un même profil) : même progression, mêmes stats, même opt-in. La couche n'ajoute qu'une clé, `amat_fx_v1` (niveau d'animation), écrite seulement si `isSaveEnabled()`.
- **Réglage joueur** : « Animations : ON / OFF » (accueil, tiroir, modales de pause) et « Effets légers » ; OFF par défaut si `prefers-reduced-motion`. Le réglage système l'emporte aussi sur un choix fait avant qu'il soit activé ; un choix fait pendant qu'il est actif est respecté (rallumage au niveau léger). Au niveau OFF, aucun effet de la couche ne joue et le jeu se déroule comme dans `classique.html` ; deux différences demeurent : les boutons de réglage restent en place (accueil, tiroir, modales de pause), et les boucles décoratives du jeu (points de chakra, emoji flottant de l'accueil, spirale de chargement) sont mises en pause.
- **Couche coupée** (disjoncteur après des erreurs répétées, ou navigateur sans Web Animations / canvas 2D) : la page redevient celle de `classique.html` — plus aucun effet, boutons de réglage retirés des modales de pause, boucles décoratives du jeu rendues à elles-mêmes.
- **Défilement** : l'édition animée s'appuie sur deux comportements du jeu (§ 8.13) — la carte question ramenée dans la fenêtre à chaque question (l'arène vient avec) et les écrans de résultat affichés depuis le haut (cérémonie complète). La couche, elle, ne fait jamais défiler la page.
- **Service worker** (`sw.js`, commun aux deux pages) : `index.html` fait partie des fichiers essentiels, redemandés au réseau à chaque installation (`cache: 'reload'`, § 8.12). `classique.html` est optionnel — jamais téléchargé pour un joueur qui ne l'a jamais ouvert, remis en cache à chaque version pour un joueur qui l'a déjà ouvert, sans retarder l'installation de plus de 3 s. `anime.html` n'est pas pré-cachée (le gestionnaire `fetch` la garde après une visite en ligne, jusqu'à la version suivante). Hors-ligne, une navigation vers `classique.html` absente du cache, ou vers `anime.html`, retombe sur `index.html`. `.gitattributes` impose des fins de ligne LF aux fichiers dont dépend la construction.
- **Non vérifié sur de vrais appareils** : le comportement d'une application installée depuis l'ancienne édition animée (son manifest a disparu ; sa page de départ redirige ; une seconde icône peut être proposée), et le stockage d'une application installée sur iPhone. Détail : `anime-src/README.md` § 5.3.
- **Contrat complet** (architecture, API `FX`, modules existants, ajout d'un module, tests) : `anime-src/README.md` — à lire avant de toucher à la couche.

### 13.2 Règles de la couche (résumé)

1. **Jeu intact** : aucun changement de score, de minuteur, de flux de questions, de focus, d'annonce lecteur d'écran ni de raccourci clavier. Un défaut du jeu se corrige dans `classique.html`, jamais par la couche (ni corrigé ni masqué).
2. **Lecture d'abord** : effets finis (≤ ~700 ms après une réponse, ≤ ~2,5 s pour un résultat), aucune boucle sur un écran de question, rien ne couvre durablement une question, une réponse, une explication ou un champ ; un effet de résultat ne se pose jamais sur un texte du résultat (bandeau sur l'en-tête collant, ou rien).
3. **Une erreur est une étape d'apprentissage** : ni flash rouge, ni secousse, ni moquerie — un repère calme vers l'explication.
4. **Épreuves sobres** : Automatismes (6 pools) et DNB Blanc plafonnés au niveau léger, zéro particule ; seule leur page de résultat fête.
5. **Un seul effet focal à la fois** : un niveau gagné ou un retour à l'accueil n'ajoute jamais un second effet sur le verdict d'un mode (`anime-src/README.md` § 6.8).
6. **Trois niveaux** `off | leger | complet` : chaque effet a une forme légère, rien ne joue à off ; les plafonds sont appliqués par les primitives du noyau, pas par chaque effet.
7. **Crochets en O(1)** via `FX.wrap`, jamais sur un chemin chaud (`render*`, `draw*`, `handle*Move`) ; une issue se lit sur un front d'état (avant/après), jamais sur le simple appel.
8. **A11y** : tout nœud de la couche est `aria-hidden` et insensible au pointeur ; jamais de `focus()`, `showToast()`, `announceToScreenReader()` ni d'écriture dans une région live.
9. **Légal (§ 8.10)** : émojis Unicode et formes abstraites uniquement ; aucune image, aucun son, aucune ressource externe, aucun nouveau mot de licence.
10. **Univers et hasard** : couleurs et textes via `FX.palette()` (jamais « Naruto » ni une couleur en dur) ; hasard via `FX.rnd()`, jamais `Math.random` (à graine égale, les deux pages tirent les mêmes questions).

La plupart de ces règles sont vérifiées par les lints du build et par la suite de tests.

-----

*Document à maintenir à jour. Toute évolution majeure du code doit être reflétée ici.*
