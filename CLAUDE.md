# CLAUDE.md — Anime Math Academy

> Ce fichier est destiné à **Claude Code** et à toute IA assistante travaillant sur ce projet. Il décrit la structure, les conventions, les pièges connus et les zones critiques à respecter. Lis-le **avant toute modification**.

-----

## 0. TL;DR pour démarrer rapidement

- **Stack** : un seul fichier HTML5 + CSS3 + JavaScript vanilla, aucune dépendance npm, aucun build.
- **Localisation du code** : `index.html`, ≈ 4 200 lignes, ≈ 180 KB.
- **Structure du fichier** : lignes 1–9 head, 10–937 `<style>`, 938–1437 HTML body, 1438–4206 `<script>`, fin du body.
- **Aucun npm/yarn/pnpm**. Aucune compilation. **Recharge le fichier dans un navigateur** pour tester.
- **Tests** : il n’y en a pas. Valide manuellement les flux après chaque changement.
- **Avant tout commit** : `node --check` sur le bloc `<script>` extrait (voir section “Validation”).
- **Pédagogie** : alignement strict sur les programmes officiels français de 6ème (BO 17/04/2025) et 5ème (BO 05/03/2026).
- **A11y** : le jeu est conforme WCAG AA sur les critères majeurs. **Ne pas régresser**.

-----

## 1. Architecture du projet

### 1.1 Fichiers présents

```
/
├── index.html              ← Fichier principal (à modifier)
├── index.backup*.html      ← Sauvegardes manuelles éventuelles (NE PAS MODIFIER)
├── manifest.json           ← Manifest PWA (icônes, nom, theme, scope)
├── sw.js                   ← Service Worker (cache-first, offline-ready)
├── icon-192.png            ← Icône PWA Android (générée depuis SVG)
├── icon-512.png            ← Icône PWA haute résolution
├── og-image.png            ← Image OpenGraph 1200×630 (PNG pour Facebook/WhatsApp)
├── og-image.svg            ← Source vectorielle de l'image OG (pour régénérer)
├── README.md               ← Documentation publique
└── CLAUDE.md               ← Ce fichier
```

### 1.2 Architecture interne du fichier HTML

Le fichier monolithique est découpé conceptuellement en 4 zones :

|Zone          |Lignes (approx.)|Rôle                                                     |
|--------------|----------------|---------------------------------------------------------|
|**`<head>`**  |1–9             |Métadonnées, polices Google + fallback Impact/Arial Black|
|**`<style>`** |10–937          |CSS complet : variables, layout, écrans, animations, a11y|
|**HTML body** |938–1437        |9 écrans (`screen-home`, `screen-game`, etc.) + modals   |
|**`<script>`**|1438–4206       |Logique de jeu : état, modes, rendu, événements          |

### 1.3 Pourquoi un seul fichier ?

**C’est un choix de conception, pas un accident**. Le fichier doit pouvoir être :

- Téléchargé en un clic
- Ouvert hors-ligne par double-clic
- Envoyé par email à un parent ou enseignant
- Hébergé sur n’importe quel CDN statique sans build

**Si tu envisages de découper le fichier**, demande confirmation explicite à l’utilisateur. C’est un changement architectural majeur.

-----

## 2. Modes de jeu (vue d’ensemble)

|Mode                    |Écran            |Fonction d’entrée             |Banque de données                      |Caractéristiques                        |
|------------------------|-----------------|------------------------------|---------------------------------------|----------------------------------------|
|**QCM Académie (6e)**   |`screen-game`    |`startGame('6e_facile')`      |`QUESTIONS['6e_facile']` (30 questions)|4 réponses, timer 30s, vies, jutsus     |
|**QCM Genin (5e)**      |`screen-game`    |`startGame('5e_medium')`      |`QUESTIONS['5e_medium']` (26 questions)|Idem 6e                                 |
|**QCM Chunin Mix**      |`screen-game`    |`startGame('mixte_difficile')`|`QUESTIONS['mixte_difficile']` (20)    |Idem                                    |
|**QCM Boss (Kage)**     |`screen-game`    |`startGame('boss')`           |`QUESTIONS['boss']` (12 questions)     |Timer 20s, **pas de répétition espacée**|
|**QCM Entraînement libre**|`screen-game`  |`startGame('libre')`          |Pool des 3 banques (échantillon de 20) |**Sans timer, sans HP** — `state.freeMode=true`|
|**Tracé géométrique**   |`screen-draw`    |`startDrawMode()`             |`DRAW_MISSIONS` (6 missions)           |Canvas, mouse + touch, validation auto  |
|**Puzzle emboîtement**  |`screen-puzzle`  |`startPuzzleMode()`           |`PUZZLES` (6 puzzles)                  |Drag & drop, type `match` ou `sort`     |
|**Vrai / Faux Speed**   |`screen-tf`      |`startTrueFalse()`            |`TRUEFALSE_STATEMENTS` (30 affirmations)|7s par affirmation, V/F binaire, raccourcis V/F au clavier|
|**Histoire interactive**|`screen-story`   |`startStoryMode()`            |`STORY_MISSIONS` (5 aventures × 4 étapes)|Récit narratif multi-étapes, QCM par sous-question|
|**Automatismes 6e**     |`screen-auto`    |`startAutoMode('auto_6e')`    |`AUTO_GENERATORS` (21 générateurs)     |20 questions/20 min, saisie clavier     |
|**Automatismes 5e**     |`screen-auto`    |`startAutoMode('auto_5e')`    |Idem                                   |Format DNB 2027                         |
|**Automatismes Mix**    |`screen-auto`    |`startAutoMode('auto_mix')`   |Idem                                   |Réplique épreuve DNB                    |

-----

## 3. Structures de données critiques

### 3.1 `state` (état global du jeu QCM) — L1781

```js
let state = {
  screen: 'home',
  char: 'naruto',                            // Clé du personnage actif dans UNIVERSES[currentUniverse].chars
  mode: null,                                // '6e_facile' | '5e_medium' | 'mixte_difficile' | 'boss'
  questions: [],                             // Tableau de questions adaptées à l'univers
  qIndex: 0,
  score: 0, streak: 0, bestStreak: 0,
  hp: 3, maxHp: 3,
  chakra: 100, maxChakra: 100,               // Ressource pour les jutsus
  correct: 0,
  timer: null, timeLeft: 30, maxTime: 30,
  answered: false,
  xp: 0, level: 1,
  jutsu: { '50': 2, 'hint': 2, 'time': 1 }, // Utilisations restantes
  timeFrozen: false,                         // Activé par le jutsu time
  totalScore: 0,
  // Ajoutés dynamiquement par startGame() :
  missedQueue: [],                           // Répétition espacée
  reviewedRetries: 0,
  originalLength: 0,
};
```

⚠️ **Important** : `state.char` est une clé qui **dépend de l’univers actif**. Quand on change d’univers via `selectUniverse()`, `state.char` est réinitialisé à la première clé de l’univers cible. Ne JAMAIS supposer que `state.char === 'naruto'` partout.

### 3.2 `UNIVERSES` — L1808

```js
const UNIVERSES = {
  naruto: {
    name: 'Naruto', emoji: '🥷', color: '#FF6B00',
    desc: 'Le monde des ninjas de Konoha',
    chars: {
      naruto: { name, emoji, desc, bonus, bVal, color },
      // 5 autres personnages...
    },
    ranks: [
      { min: 0, emoji, title, msg, quote },
      // 5 grades au total (paliers 0, 30, 60, 80, 95)
    ],
    place, mission, hero, powerName, currency
  },
  onepiece: { ... },
  dragonball: { ... },
  myhero: { ... },
  demonslayer: { ... },
  pokemon: { ... }
};
```

**6 univers × 6 personnages × 5 grades = 36 personnages, 30 grades.**

Variables liées :

- `currentUniverse` : clé de l’univers actif (string)
- `CHARS` : alias dynamique de `UNIVERSES[currentUniverse].chars`
- `RANKS` : alias dynamique de `UNIVERSES[currentUniverse].ranks`

⚠️ `CHARS` et `RANKS` sont **réassignés** par `selectUniverse()`. Ce ne sont PAS des const figés malgré l’historique du code. Ne pas optimiser en les capturant en début de fonction.

### 3.3 `QUESTIONS` — L1442

Format strict (à respecter pour toute nouvelle question) :

```js
{
  type: "Catégorie courte",       // ex: "Fractions", "Calcul mental", "Pythagore"
  theme: "🍜 Contexte narratif",   // emoji + court contexte
  text: `Énoncé avec <span class='highlight'>nom</span> et <span class='math'>formule</span>`,
  answers: ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
  correct: 0,                      // Index de la bonne réponse (0..3)
  feedback: "Explication détaillée avec <strong>la méthode</strong> et le résultat."
}
```

**Règles** :

- **Toujours 4 réponses** (le HTML/CSS ne gère pas d’autre nombre proprement)
- `text` accepte du HTML inline : `<span class='math'>`, `<span class='highlight'>`, `<strong>`
- Le `feedback` est **obligatoire** et doit expliquer **la méthode**, pas seulement donner la réponse
- Les apostrophes dans les chaînes JS : utiliser des template literals (backticks) pour éviter les bugs `'l'angle'` → erreur de syntaxe

### 3.4 `UNIVERSE_THEMES_MAP` — L2126

Dictionnaire de **remplacement de texte** pour adapter les questions Naruto aux autres univers.

```js
const UNIVERSE_THEMES_MAP = {
  naruto: { 'Naruto': 'Naruto', 'Sasuke': 'Sasuke', ... },  // identité
  onepiece: { 'Naruto': 'Luffy', 'Sasuke': 'Zoro', 'ramen': 'viande', 'ninja': 'pirate', ... },
  dragonball: { ... },
  myhero: { ... },
  demonslayer: { ... },
  pokemon: { ... }
};
```

⚠️ Si tu ajoutes un mot dans le `text` ou `feedback` d’une question (ex: “Akatsuki”), tu DOIS l’ajouter dans les 5 autres univers du `UNIVERSE_THEMES_MAP`. Sinon la traduction laissera le mot Naruto dans un univers One Piece.

La fonction `adaptQuestionToUniverse(q, universe)` à L2187 fait la traduction. Elle est appelée dans `startGame()` après le mélange des questions.

### 3.5 `DRAW_MISSIONS` — L2638

```js
{
  title: "Court titre",
  instruction: "Consigne avec <strong>mots-clés</strong>",
  guide: { type: 'vertical'|'horizontal'|'diagonal45'|'hyp'|'angle_free', ...params },
  tolerance: 0.07,           // En fraction de largeur, ou en degrés selon le type
  feedback_ok: "Texte affiché si réussi",
  feedback_bad: "Texte affiché si raté",
  xp: 80
}
```

Types de guide supportés (codés dans `drawGuide()` L2930 et `validateDraw()` L2995) :

- `vertical` : `{ x: 0.5 }` — axe de symétrie vertical
- `horizontal` : `{ y: 0.5 }` — axe horizontal
- `diagonal45` : diagonale d’un carré centré
- `hyp` : `{ ax, ay, bx, by }` — segment entre 2 points (coordonnées normalisées 0-1)
- `angle_free` : `{ max: 89 }` — tracer un angle libre avec contrainte

### 3.6 `PUZZLES` — L3112

Deux types :

**Type `match`** (appariement) :

```js
{
  title, instruction, type: "match",
  pairs: [
    { piece: "1/2", slot: "2/4", explanation: "..." },
    // 3-4 paires
  ],
  xp: 120
}
```

**Type `sort`** (tri ordonné) :

```js
{
  title, instruction, type: "sort",
  items: ["-12°C", "-3°C", "0°C", "+5°C", "+18°C"],
  correctOrder: ["-12°C", "-3°C", "0°C", "+5°C", "+18°C"],
  explanation: "...",
  xp: 100
}
```

### 3.7 `AUTO_GENERATORS` — L3548 (mode Automatismes)

Chaque générateur est une fonction qui retourne `{ q, a, theme, accept?, unit? }`.

```js
'5e_relat_add': () => {
  const a = Math.floor(Math.random()*30-15);
  const b = Math.floor(Math.random()*30-15);
  return {
    q: `(${signedFr(a)}) + (${signedFr(b)})`,  // Énoncé affiché
    a: signedFr(a+b),                            // Réponse attendue
    theme: 'Relatifs +/−',                       // Pour les stats finales
    accept: ['+5', '5']                          // Optionnel : autres formes acceptées
  };
}
```

**Helpers fournis** :

- `frFr(n)` : formatage français (virgule au lieu du point)
- `signedFr(n)` : ajoute un signe (`+5`, `−3`, `0`)
- `pgcd(a, b)` : PGCD pour simplifier des fractions
- `simpFrac(n, d)` : retourne la fraction irréductible `"1/2"` ou `"3"` si entier
- `normalizeAnswer(s)` (L3792) : normalise les réponses utilisateur. Gère `,` → `.`, `−` → `-`, `+5` → `5`, supprime espaces et zéros décimaux inutiles.

**Pool** : `AUTO_POOLS` (L3693) liste les clés de générateurs par mode (`auto_6e`, `auto_5e`, `auto_mix`).

⚠️ **Toujours tester un nouveau générateur** : générer 50 valeurs et vérifier que `a` correspond bien au calcul attendu. Voir section “Validation”.

-----

## 4. Conformité aux programmes officiels

### 4.1 Sources réglementaires

- **6ème** : Programme du [BO du 17 avril 2025](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A), cycle 3, en vigueur depuis la rentrée 2025.
- **5ème** : Programme du BO du 5 mars 2026, cycle 4, en vigueur dès la rentrée 2026.
- **DNB 2027** : nouvelle épreuve d’automatismes — 20 minutes, sans calculatrice, 6 points sur 40.

### 4.2 Notions au programme — règles de placement

**6ème (cycle 3)** :

- Décimaux, fractions (addition/soustraction même dénominateur, fractions équivalentes, début de × et ÷)
- Calcul mental, automatismes
- PGCD, multiples, divisibilité
- Symétrie axiale (la symétrie centrale est en 5e)
- Angles (mesure, complémentaires, supplémentaires)
- Aires, périmètres, volumes simples (cube, pavé)
- Statistiques (moyenne)
- **Probabilités** (nouveau dans le programme 2025, familiarisation)
- Proportionnalité
- Pré-algèbre **avec des mots**, pas avec des lettres (ce point est nouveau en 2025)

**5ème (cycle 4)** :

- Nombres relatifs (somme, différence, produit)
- Fractions (4 opérations)
- Puissances entières
- Priorités opératoires
- Calcul littéral (substitution, développement simple)
- **Équations 1er degré simples** (nouveauté programme 2026)
- Symétrie centrale
- Somme des angles d’un triangle
- Pourcentages, proportionnalité (échelles, vitesse)
- Probabilités

❌ **Erreurs à éviter** :

- **Pythagore** est en **4ème**, PAS en 5ème. Ne pas l’ajouter en `5e_medium` ou en mode Boss étiqueté 5e.
- Les **propriétés des droites parallèles et perpendiculaires** ont DISPARU du programme de 6ème 2025 (ne plus en faire le sujet principal d’une question 6e).
- **Calcul littéral avec lettres** : pas avant la 5ème. Une question 6e doit utiliser des mots, pas des x ou y.

Si tu ajoutes une question, **vérifie le niveau** sur les BO officiels. En cas de doute, demande à l’utilisateur.

-----

## 5. Accessibilité — règles à respecter scrupuleusement

Le jeu est conforme WCAG AA sur les critères majeurs. **Ne pas régresser**.

### 5.1 Règles fermes

1. **Aucun `<div onclick>` sans `role="button"` + `tabindex="0"` + handler `onkeydown`** (Enter et Espace activent l’élément). Préférer `<button type="button">` quand le CSS le permet.
1. **Tous les boutons à emoji** doivent avoir un `aria-label` descriptif. L’emoji lui-même doit être `aria-hidden="true"`.
1. **`:focus-visible`** doit rester visible sur tous les éléments interactifs (outline jaune épais).
1. **Min height 44px** pour tous les éléments cliquables (touch target WCAG AAA).
1. **`prefers-reduced-motion`** doit désactiver les animations non essentielles. Voir le bloc `@media (prefers-reduced-motion: reduce)`.
1. **Émojis décoratifs** dans le texte : encapsuler dans `<span aria-hidden="true">🍜</span>` quand ils sont décoratifs.
1. **Live regions** : utiliser `announceToScreenReader(message)` pour annoncer les changements importants aux lecteurs d’écran.
1. **Bouton Pause et Quitter** : doivent rester accessibles en mode QCM (`screen-game`). Ne pas les supprimer.
1. **Modals** : doivent avoir `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, et **un focus trap** (`trapFocus`). Le focus doit revenir à l’élément précédemment focusé après fermeture.
1. **Échap** ferme les modals (handler dans `trapFocus`).

### 5.2 Raccourcis clavier (déjà implémentés, à préserver)

- `1`/`2`/`3`/`4` : sélectionner la réponse A/B/C/D en QCM
- `Entrée` ou `Espace` : valider en mode Automatismes, passer à la question suivante en QCM (sur écran de feedback)
- `Échap` : ouvrir la modal Pause en mode QCM
- `Tab` / `Shift+Tab` : navigation séquentielle (focus trap dans les modals)
- Bouton “Précédent” du navigateur : ouvre la modal Quitter au lieu de fermer l’app

-----

## 6. Conventions de style et de code

### 6.1 CSS

- **Variables CSS** dans `:root` (L21–35). Toujours utiliser `var(--orange)` plutôt que `#FF6B00`.
- **Classes** : kebab-case (`puzzle-piece`, `char-card`, `mission-card`).
- **IDs** : kebab-case (`screen-home`, `auto-input`).
- **Polices** : `'Bangers', Impact, 'Arial Black', cursive` pour les titres (fallback iOS critique), `'Nunito', sans-serif` pour le corps.
- **Pas d’inline styles** sauf pour les valeurs vraiment dynamiques (couleurs personnalisées par univers).

### 6.2 JavaScript

- **Pas d’ES modules** (`import`/`export`). Code en script global.
- **Pas de classes ES6**. Tout est en fonctions + objets globaux.
- **String templates (backticks) obligatoires** pour les chaînes contenant des apostrophes françaises. Sinon : erreur de syntaxe. Exemple :
  
  ```js
  // ❌ MAUVAIS — apostrophe française casse la syntaxe
  showToast('Trace quelque chose d'abord');
  // ✅ BON
  showToast(`Trace quelque chose d'abord`);
  // ✅ BON aussi
  showToast('Trace quelque chose d\'abord');
  ```
- **Caractères Unicode** acceptés dans les strings (×, ÷, −, ≥, π, °, ², ³, etc.). Encodage du fichier : **UTF-8 obligatoire**.
- **Timers** : toujours stockés dans `state.timer`, `autoState.qTimer`, `autoState.globalTimer`, `puzzleState.timer`. **Toujours `clearInterval()` avant de relancer** ou avant de quitter un écran.
- **Cleanup à la sortie d’un mode** : voir `exitAutoMode()`, `showHome()` — ils nettoient les timers.

### 6.3 Nommage des fonctions

- `start*` : démarre un mode (`startGame`, `startDrawMode`, `startAutoMode`, `startPuzzleMode`)
- `load*` : charge la donnée d’une étape (`loadQuestion`, `loadAutoQuestion`, `loadPuzzle`, `loadDrawMission`)
- `render*` : génère du HTML dynamiquement (`renderUniverseGrid`, `renderCharGrid`, `renderPuzzle`, `renderCanvas`)
- `update*` : met à jour le DOM existant (`updateHUD`, `updateStatsUI`, `updateJutsuUI`, `updateTimerUI`)
- `validate*` : valide une réponse / un tracé (`validateDraw`, `validateMatchPuzzle`, `validateSortPuzzle`)
- `submit*` : envoie une réponse utilisateur (`submitAutoAnswer`)
- `select*` : sélectionne un élément (`selectUniverse`, `selectChar`)
- `show*` / `open*` / `close*` : navigation et modals

-----

## 7. Workflow de développement

### 7.1 Avant toute modification

1. **Lire la section concernée** dans ce fichier.
1. **Faire une sauvegarde** : `cp index.html index.backup-$(date +%s).html`.
1. **Identifier l’impact** : une modif de question ne touche que `QUESTIONS`. Une modif d’univers touche `UNIVERSES` + potentiellement `UNIVERSE_THEMES_MAP`. Une modif de mode est plus large.

### 7.2 Édition par patches Python

Pour les gros fichiers HTML mono-fichier, utiliser des scripts Python avec `str.replace()` est plus fiable que `str_replace` direct, notamment pour les modifs multi-lignes :

```python
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

old = """...bloc exact à remplacer..."""
new = """...nouveau bloc..."""

if old in content:
    content = content.replace(old, new)
    print("OK")
else:
    print("NOT FOUND")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
```

### 7.3 Validation (à faire SYSTÉMATIQUEMENT après modification)

```bash
# 1. Extraire le bloc <script>
python3 -c "
with open('index.html', 'r', encoding='utf-8') as f: c = f.read()
s = c[c.find('<script>')+8:c.rfind('</script>')]
with open('/tmp/g.js', 'w') as f: f.write(s)
"

# 2. Vérifier la syntaxe JS
node --check /tmp/g.js
```

```python
# 3. Vérifier les IDs (DOM)
import re
with open('index.html', 'r', encoding='utf-8') as f: c = f.read()
html_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', c))
js_ids = set(re.findall(r"""getElementById\(['"]([^'"]+)['"]\)""", c))
missing = js_ids - html_ids
# Exceptions normales : 'sort-zone' (créé dynamiquement par puzzle), 'sr-live' (créé par announceToScreenReader)
print("Missing IDs:", missing - {'sort-zone', 'sr-live'})
```

```python
# 4. Vérifier les générateurs aléatoires (si on en modifie un)
# Générer 50 instances et vérifier la cohérence q vs a
```

### 7.4 Tests manuels obligatoires après modifications structurelles

- [ ] Ouvrir le fichier dans Chrome / Firefox / Safari
- [ ] Tester le sélecteur d’univers (6 univers, animations OK)
- [ ] Tester chaque mode au moins une question
- [ ] Tester la pause + reprise
- [ ] Tester le bouton précédent du navigateur
- [ ] Tester la navigation 100% clavier (Tab + Enter)
- [ ] Tester sur mobile (touch events)
- [ ] Vérifier que `prefers-reduced-motion` désactive les animations

-----

## 8. Pièges connus et bugs déjà rencontrés

### 8.1 Apostrophes françaises dans les strings JS

**Symptôme** : `Uncaught SyntaxError: missing ) after argument list`
**Cause** : `showToast('quelque chose d'abord')` — l’apostrophe ferme la chaîne.
**Solution** : utiliser des template literals (backticks) ou échapper (`\'`).

**Lignes historiquement problématiques** : tout JS contenant `d'abord`, `l'outil`, `l'ordre`, `d'éléments`. Vérifier après ajout de chaînes en français.

### 8.2 Polices Bangers cassées sur iOS Safari

**Symptôme** : titres affichés en cursive bizarre (police par défaut iOS).
**Cause** : `@import url(...)` parfois bloqué.
**Solution déjà en place** : `<link rel="stylesheet">` dans le head + `@font-face` fallback vers Impact/Arial Black + font-family avec fallback chain `'Bangers', Impact, 'Arial Black', cursive`.

### 8.3 IDs `sort-zone` et `sr-live` “manquants”

Ces deux IDs sont créés dynamiquement par JS (puzzle de tri et lecteur d’écran). C’est normal qu’ils n’existent pas dans le HTML statique. Les exclure des audits.

### 8.4 `state.char` et changement d’univers

Lors d’un `selectUniverse()`, `state.char` est reseté à la première clé de l’univers. Toute fonction qui suppose `state.char === 'naruto'` cassera. **Toujours utiliser `CHARS[state.char]` pour récupérer les données du personnage actif.**

### 8.5 Timer fantôme

Si on quitte un mode sans nettoyer le timer, il continue en arrière-plan et peut déclencher `timeOut()` sur un écran qui n’est plus visible. **Toujours `clearInterval()`** dans `showHome()`, `exitAutoMode()`, et tout `quit*()`.

### 8.6 Précision flottante

`0.1 + 0.2 !== 0.3` en JS. Les générateurs d’automatismes utilisent `Math.round((a+b)*10)/10` pour éviter `9.799999999999999`. **Toujours arrondir** les calculs avec décimaux.

### 8.7 Z-index et modals

L’overlay des modals a `z-index: 1000`. Si tu ajoutes un nouvel élément flottant, attention à ne pas passer au-dessus accidentellement.

-----

## 9. Évolutions possibles et leur impact

### 9.1 Ajouter une question QCM (faible impact)

- **Quoi** : ajouter un objet dans `QUESTIONS['xxx']`.
- **Où** : L1442 sqq.
- **Précautions** :
  - Respecter le format (4 réponses, feedback obligatoire)
  - Si on introduit un nouveau nom propre ou objet thématique, l’ajouter dans `UNIVERSE_THEMES_MAP` pour les 5 autres univers
  - Vérifier le niveau (6e ou 5e) selon les programmes officiels

### 9.2 Ajouter un univers anime (impact moyen)

- **Quoi** : nouvelle clé dans `UNIVERSES` + entrée correspondante dans `UNIVERSE_THEMES_MAP` et `UNIVERSE_EMOJI_MAP`.
- **Précautions** :
  - 6 personnages avec bonus variés (xp, precision, hint, time, combo, score)
  - 5 grades aux paliers 0, 30, 60, 80, 95
  - Couleur principale en hex
  - Tester l’adaptation des questions (pas de mot Naruto qui traîne)

### 9.3 Ajouter un générateur d’automatismes (faible impact)

- **Quoi** : ajouter une fonction dans `AUTO_GENERATORS` + inclure dans le pool (`AUTO_POOLS`).
- **Précautions** :
  - **Tester** : générer 50 instances et vérifier que `a` est exactement le résultat correct
  - Utiliser les helpers (`frFr`, `signedFr`, `simpFrac`)
  - Mettre un `theme` qui regroupe les stats finales par thème
  - Pour les réponses tolérantes, utiliser `accept: [...]` (ex: fractions équivalentes)

### 9.4 Ajouter une mission de tracé (impact moyen)

- **Quoi** : ajouter dans `DRAW_MISSIONS` + éventuellement supporter un nouveau type de `guide`.
- **Précautions** :
  - Si nouveau type de guide : modifier `drawGuide()` ET `validateDraw()` ensemble
  - Tester la validation (la tolérance est en fraction de largeur ou en degrés selon le type)

### 9.5 Ajouter un mode entier (impact élevé)

- **Quoi** : nouvel écran HTML + état dédié + fonctions `start*`, `load*`, `validate*`, `end*`
- **Précautions** :
  - Ajouter l’ID dans la liste `flexScreens` de `showScreen()` si flex
  - Bouton retour accueil avec cleanup de timers
  - Respect des règles a11y (focus visible, ARIA, raccourcis clavier)
  - Carte d’entrée sur l’écran d’accueil avec `role="button"` + `tabindex="0"`

### 9.6 Modifier le système de scoring (impact élevé)

- **Quoi** : changer `state.score`, XP, combos, trophées
- **Précautions** :
  - Les multiplicateurs de personnages (`CHARS[state.char].bonus`) sont appliqués dans `answer()` L2351
  - Les paliers de grades sont dans `RANKS` de chaque univers
  - Le pourcentage de réussite (`state.correct / total`) détermine le rang dans `endGame()`

-----

## 10. Ce qu’il ne faut PAS faire

❌ **Ne pas casser le mono-fichier** sans demander explicitement.
❌ **Ne pas régresser sur l’accessibilité** : pas de `<div onclick>` sans `role="button"`, pas d’animation sans respect de `prefers-reduced-motion`.
❌ **Ne pas ajouter de dépendances externes** (npm, CDN tiers obligatoire) sans nécessité absolue. Tout doit fonctionner offline.
❌ **Ne pas modifier les fichiers `.backup*.html`**. Ce sont des sauvegardes historiques.
❌ **Ne pas hardcoder Naruto** dans le code après les changements multi-univers. Toujours passer par `UNIVERSES[currentUniverse]` ou les alias `CHARS`/`RANKS`.
❌ **Ne pas mettre du Pythagore en 5e**. C’est du 4e.
❌ **Ne pas utiliser `localStorage`** sans opt-in explicite de l’utilisateur (le projet est conçu pour fonctionner sans persistance).
❌ **Ne pas casser le format français** : virgules pour les décimaux, espaces insécables, signes Unicode (`−` plutôt que `-`).
❌ **Ne pas créer de questions à 3 ou 5 réponses**. Toujours 4.
❌ **Ne pas oublier de `clearInterval()`** lors de la sortie d’un mode chronométré.
❌ **Ne pas utiliser des apostrophes françaises** (`'`) directement dans des strings JS quotées avec `'...'`. Utiliser les backticks ou échapper.
❌ **Ne jamais ajouter un test/exemple involving real children with personal data**. Ce projet est destiné à des collégiens mais ne doit collecter aucune donnée personnelle.

-----

## 11. Ressources et références

### 11.1 Programmes officiels

- [BO 17 avril 2025 — Cycle 3 (6e)](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A)
- [Eduscol Cycle 3 — Mathématiques](https://eduscol.education.fr/251/mathematiques-cycle-3)
- [Eduscol Cycle 4 — Mathématiques](https://eduscol.education.fr/280/mathematiques-cycle-4)

### 11.2 Accessibilité

- [WCAG 2.1 niveau AA](https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23col_overview&levels=aaa) (référence)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) (patterns recommandés)
- Outils de test : axe DevTools (Chrome), Lighthouse (a11y audit)

### 11.3 Public visé

- Collégiens 11–13 ans (6e et 5e)
- Fans d’animes japonais populaires
- Niveau de lecture : 6e (phrases courtes, vocabulaire courant + lexique mathématique)
- Cadre d’usage prévu : à la maison, en autonomie, 20–30 min/jour

-----

## 12. Contact et décisions de conception

Quelques décisions importantes (à ne pas remettre en question sans discussion) :

1. **Mono-fichier** : portabilité maximale, zéro friction d’installation.
1. **Pas de localStorage par défaut** : pas de persistance entre sessions, ce qui évite les questions de RGPD pour des mineurs.
1. **Pas de backend, pas d’API externe** : le jeu fonctionne 100% offline une fois téléchargé (sauf chargement initial des polices Google).
1. **Pas d’audio** : volontaire, pour le calme de l’étude et la concentration.
1. **6 univers anime ciblés** : Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer, Pokémon. Ces 6 ont été choisis comme les plus populaires chez les 11–13 ans francophones en 2025–2026.
1. **Banque de questions fixe + générateurs aléatoires** : les QCM ont des feedbacks soignés (fixes), les automatismes ont une pratique quasi-infinie (aléatoire).
1. **Répétition espacée légère** : ré-injection des questions ratées toutes les 3 questions + phase révision en fin de session, sauf en mode Boss.

-----

*Document à maintenir à jour. Toute évolution majeure du code doit être reflétée ici.*
