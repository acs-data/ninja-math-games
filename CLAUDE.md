# CLAUDE.md — Anime Math Academy

> Ce fichier est destiné à **Claude Code** et à toute IA assistante travaillant sur ce projet. Il décrit la structure, les conventions, les pièges connus et les zones critiques à respecter. Lis-le **avant toute modification**.

-----

## 0. TL;DR pour démarrer rapidement

- **Stack** : un seul fichier HTML5 + CSS3 + JavaScript vanilla, aucune dépendance npm, aucun build.
- **Localisation du code** : `index.html`, **≈ 10 200 lignes, ≈ 475 KB**.
- **PWA installable** + service worker (`sw.js`) avec cache versionné automatiquement par le SHA du commit.
- **Aucun npm/yarn/pnpm**. Aucune compilation. **Recharge le fichier dans un navigateur** pour tester.
- **Tests** : il n'y en a pas. Valide manuellement les flux après chaque changement.
- **Avant tout commit** : `node --check` sur le bloc `<script>` extrait (voir section "Validation").
- **Pédagogie** : alignement strict sur les programmes officiels français de **6e (BO 17/04/2025)**, **5e/4e/3e (BO 05/03/2026)** et **DNB 2027**. Couverture ~90 % du programme collège.
- **A11y** : le jeu est conforme WCAG 2.1 AA sur les critères majeurs. **Ne pas régresser**.
- **Légal** : aucun visuel des œuvres utilisé, uniquement des noms. Disclaimer + email `legal@acs-dataformation.fr` dans le footer/modal.
- **Analytique** : GoatCounter (code `ninja-math`), sans cookies, RGPD-safe.

-----

## 1. Architecture du projet

### 1.1 Fichiers du dépôt

```
/
├── index.html                       Fichier principal (à modifier)
├── manifest.json                    Manifest PWA
├── sw.js                            Service Worker (cache-first, versionné par CI)
├── icon-192.png / icon-512.png      Icônes PWA
├── og-image.png / og-image.svg      Image OpenGraph 1200×630 (source SVG)
├── .github/workflows/pages.yml      Déploiement GitHub Pages auto (injecte SHA dans sw.js)
├── README.md                        Documentation publique
└── CLAUDE.md                        Ce fichier
```

### 1.2 Architecture interne du fichier HTML

Le fichier monolithique se décompose en 4 zones (les numéros de ligne sont des estimations, à confirmer avec `grep -n`) :

| Zone | Lignes (approx.) | Rôle |
|---|---|---|
| `<head>` | 1–50 | Meta, OG, favicon SVG inline, link manifest, polices Google |
| `<style>` | 50–1180 | CSS complet : variables, layout, 13 écrans, animations, a11y |
| HTML body | 1180–2300 | 13 écrans + 7 modals + footer |
| `<script>` | 2300–10200 | Logique de jeu : data, état, modes, rendu, événements, PWA, analytics |

### 1.3 Pourquoi un seul fichier ?

**C'est un choix de conception, pas un accident**. Le fichier doit pouvoir être :

- Téléchargé en un clic
- Ouvert hors-ligne par double-clic
- Envoyé par email à un parent ou enseignant
- Hébergé sur n'importe quel CDN statique sans build

**Si tu envisages de découper le fichier**, demande confirmation explicite à l'utilisateur. C'est un changement architectural majeur. Limite douce actuelle : **500 KB**. À ~475 KB on s'approche du seuil.

-----

## 2. Modes de jeu (17 expériences)

### 2.1 QCM par niveau de difficulté (legacy)

| Mode | Écran | Fonction d'entrée | Banque | Caractéristiques |
|---|---|---|---|---|
| QCM Académie (6e) | `screen-game` | `startGame('6e_facile')` | `QUESTIONS['6e_facile']` (30 Q) | Timer 30s, vies, jutsus |
| QCM Genin (5e) | `screen-game` | `startGame('5e_medium')` | `QUESTIONS['5e_medium']` (26 Q) | Idem |
| QCM Chunin Mix | `screen-game` | `startGame('mixte_difficile')` | `QUESTIONS['mixte_difficile']` (20 Q) | Idem |
| QCM Boss (Kage) | `screen-game` | `startGame('boss')` | `QUESTIONS['boss']` (12 Q) | Timer 20s, **pas de répétition espacée** |
| Entraînement libre (Zen) | `screen-game` | `startGame('libre')` | Pool 6e+5e+mixte (échantillon 20) | **Sans timer, sans HP** — `state.freeMode=true` |

### 2.2 Réviser par chapitre (nouveau format)

| Mode | Écran | Fonction d'entrée | Banque |
|---|---|---|---|
| Chapitre 6e ou 5e | `screen-game` | `startGame('6e:fractions_6e')` etc. | `QUESTIONS_BY_CHAPTER['6e']` ou `['5e']` (auto-bucketing depuis legacy via `TYPE_TO_CHAPTER_*`) |
| Chapitre 4e | `screen-game` | `startGame('4e:pythagore')` etc. | `QUESTIONS_BY_CHAPTER['4e']` (6 chapitres × 6-8 Q) |
| Chapitre 3e | `screen-game` | `startGame('3e:thales')` etc. | `QUESTIONS_BY_CHAPTER['3e']` (6 chapitres × 5-8 Q) |

Le sélecteur de chapitre est sur l'accueil (onglets 6e/5e/4e/3e). Helper : `getChapterQuestions(classe, chap)` retourne le pool adapté à l'univers actif.

### 2.3 Modes interactifs

| Mode | Écran | Fonction d'entrée | Banque | Particularités |
|---|---|---|---|---|
| Tracé géométrique | `screen-draw` | `startDrawMode()` | `DRAW_MISSIONS` (6) | Canvas mouse+touch, validation auto |
| Puzzle emboîtement | `screen-puzzle` | `startPuzzleMode()` | `PUZZLES` (6) | Drag & drop type `match` ou `sort` |
| Vrai/Faux Speed | `screen-tf` | `startTrueFalse()` | `TRUEFALSE_STATEMENTS` (50) | 7 s/affirmation, raccourcis V/F clavier |
| Histoire interactive | `screen-story` | `startStoryMode()` | `STORY_MISSIONS` (9 aventures × ~4 étapes) | Récit narratif multi-étapes |
| **DNB Blanc complet** | `screen-dnb-intro/transition/ex/result` | `startDnbBlanc()` | `DNB_EXERCISES` (4 × 4 sous-questions) + pool auto_dnb | Wrapper 2 phases, note /40 |
| **Constructeur Pythagore/Thalès/Trigo** | `screen-pythagore` | `startPythMode()` | 3 ateliers en onglets, défis aléatoires | Canvas tactile, valeurs live |
| **Arbre de probabilités** | `screen-proba-tree` | `startProbaTree()` | `PROBA_SCENARIOS` (3) | Drag&drop fractions → branches |
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

### 3.5 `DRAW_MISSIONS`, `PUZZLES`

Voir le code source pour le format détaillé. Types de guide tracé : `vertical`, `horizontal`, `diagonal45`, `hyp`, `angle_free`.

### 3.6 `AUTO_GENERATORS` et `AUTO_POOLS`

Chaque générateur est une fonction qui retourne `{ q, a, theme, accept?, unit? }`.

**Helpers fournis** : `frFr(n)`, `signedFr(n)`, `pgcd(a, b)`, `simpFrac(n, d)`, `normalizeAnswer(s)`.

**Pools** : `auto_6e`, `auto_5e`, `auto_4e`, `auto_3e`, `auto_mix` (tous niveaux), **`auto_dnb`** (4e + 3e, format brevet).

⚠️ Pour un nouveau générateur, générer 50 instances et vérifier que `a` est exact.

### 3.7 `TRUEFALSE_STATEMENTS`

```js
{ text: "5 + 3 = 8", isTrue: true, explain: "..." }
```

50 affirmations couvrant 6e à 3e.

### 3.8 `STORY_MISSIONS`

9 aventures narratives multi-étapes. Chaque étape est un QCM enrobé dans un récit.

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

3 scénarios pour le mode Arbre de probabilités.

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

### 7.2 Édition par patches Python

Pour les gros fichiers HTML mono-fichier, utiliser des scripts Python avec `str.replace()` est plus fiable que `Edit` direct pour les modifs multi-lignes :

```python
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = """...bloc exact à remplacer..."""
new = """...nouveau bloc..."""

assert old in content, f"NOT FOUND"
content = content.replace(old, new, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
```

### 7.3 Validation systématique après modification

```bash
# 1. Extraire le bloc <script> et vérifier la syntaxe JS
python3 -c "
with open('index.html', 'r', encoding='utf-8') as f: c = f.read()
s = c[c.find('<script>')+8:c.rfind('</script>')]
with open('/tmp/g.js', 'w') as f: f.write(s)
"
node --check /tmp/g.js
```

```python
# 2. Vérifier les IDs (DOM)
import re
with open('index.html', 'r', encoding='utf-8') as f: c = f.read()
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

- [ ] Ouvrir le fichier dans Chrome / Firefox / Safari
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
- Site déployé à https://acs-data.github.io/ninja-math-games/
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

### 8.9 Pythagore "égaré" en 5e_medium

Une question Pythagore traîne dans le legacy `5e_medium`. Selon le BO, Pythagore est en 4e. Mappée temporairement vers `geometrie_5e` dans `TYPE_TO_CHAPTER_5E` pour ne pas la perdre, mais à corriger dans une future PR de nettoyage : déplacer cette question vers `QUESTIONS_BY_CHAPTER['4e']['pythagore']`.

### 8.10 Légal — pas de visuel des œuvres

⚠️ **Crucial pour le risque IP** : ne JAMAIS ajouter sprites, fan-art, captures d'écran, logos officiels, musiques. Uniquement des **noms** et **emojis Unicode**. Tout ajout visuel ferait basculer le projet du risque "FAIBLE" au risque "ÉLEVÉ" (analyse juridique en historique).

### 8.11 Légal — pas de monétisation

⚠️ **Aussi crucial** : ne jamais ajouter pub, paywall, dons, premium, achats in-app. L'argument central de défense légale est "absence d'usage dans la vie des affaires" (CJUE Arsenal/Reed). Toute monétisation invaliderait cet argument.

### 8.12 Service worker cache pas invalidé

Si une nouvelle version ne s'affiche pas chez l'utilisateur après déploiement :
1. Vérifier que `__CACHE_VERSION__` a bien été remplacé par le SHA dans `sw.js` (regarder le workflow run logs)
2. L'utilisateur voit-il le toast "🔄 Nouvelle version disponible" ? Sinon, son SW n'a pas détecté la mise à jour (devra attendre 1h ou rafraîchir)

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
- **Pythagore atelier** : modifier `newPythChallenge()` pour ajouter de nouveaux types de défis
- **Arbre proba** : ajouter dans `PROBA_SCENARIOS` (6 branches + question)
- **Lecteur graphique** : modifier `loadGraphChallenge()` pour ajouter de nouveaux types ou supporter d'autres fonctions (paraboles, etc.)

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

1. **Mono-fichier** : portabilité maximale, zéro friction d'installation. Limite douce 500 KB.
2. **`localStorage` opt-in strict** : pas de persistance par défaut, évite les questions RGPD pour des mineurs.
3. **Pas de backend, pas d'API externe** : le jeu fonctionne 100 % offline une fois téléchargé (sauf chargement initial des polices Google et envoi anonyme à GoatCounter).
4. **Pas d'audio** : volontaire, pour le calme de l'étude et la concentration.
5. **6 univers anime ciblés** : Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer, Pokémon. Choix basé sur la popularité chez les 11-14 ans francophones en 2025-2026.
6. **Banque de questions fixe + générateurs aléatoires** : QCM avec feedbacks soignés (fixes), automatismes avec pratique quasi-infinie (aléatoire).
7. **Répétition espacée légère** : ré-injection des questions ratées toutes les 3 questions + phase révision en fin de session, sauf en mode Boss et Phase 4.
8. **Pas de monétisation** : choix légal et éthique (public mineur). Si la question revient, voir l'analyse juridique : la monétisation augmente significativement le risque IP.
9. **Pas de visuel des œuvres** : choix légal stratégique. Ne jamais ajouter de sprites, logos, fan-art, etc.
10. **GoatCounter pour analytics** : sans cookies, EU-hosted, RGPD-safe. Code `ninja-math`. Respect de `navigator.doNotTrack`.
11. **Cache versionné automatiquement** : `__CACHE_VERSION__` remplacé par le SHA du commit au déploiement. Notification utilisateur "METTRE À JOUR" via toast persistant.

-----

*Document à maintenir à jour. Toute évolution majeure du code doit être reflétée ici.*
