# 🥷 Anime Math Academy

> Un jeu HTML pédagogique pour réviser **les maths du collège (6e → 3e)** et préparer le DNB 2027, dans l'univers des animes populaires.

Un fichier HTML autonome (aucune installation, aucun serveur), PWA installable, conçu pour les collégiens fans de Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer et Pokémon.

> ⚠️ **Mention importante** — Ce projet n'est **ni affilié, ni sponsorisé, ni endossé** par Shueisha, Toei Animation, The Pokémon Company, Nintendo, Bandai Namco, ufotable, Aniplex, BONES, ou tout autre ayant droit. Les noms cités sont des marques déposées de leurs titulaires respectifs et sont utilisés à titre purement référentiel à des fins éducatives, **sans reproduction d'éléments graphiques, sonores ou d'extraits** de ces œuvres.
>
> Tout ayant droit peut demander à `legal@acs-dataformation.fr` le retrait immédiat des références concernant son œuvre. Engagement de réponse sous 72 h ouvrées.

-----

## 🎯 Objectif

Préparer les élèves au programme officiel **du collège complet (6e à 3e)**, conforme aux BO officiels et à la nouvelle épreuve d'**automatismes du DNB 2027** (20 min, sans calculatrice, 6 pts/40).

L'idée : transformer la révision en quête épique. Le contenu pédagogique reste rigoureux, l'habillage est immersif. **Couverture 90 % du programme** sur les 4 niveaux.

-----

## ✨ Fonctionnalités

### 🌍 6 univers anime, 36 personnages

|Univers               |Personnages                                         |Grades                       |
|----------------------|----------------------------------------------------|-----------------------------|
|🥷 **Naruto**          |Naruto, Sasuke, Sakura, Kakashi, Rock Lee, Shikamaru|Académicien → Hokage         |
|🏴‍☠️ **One Piece**       |Luffy, Zoro, Nami, Sanji, Chopper, Robin            |Mousse → Roi des Pirates     |
|🐉 **Dragon Ball**     |Goku, Vegeta, Gohan, Piccolo, Trunks, Bulma         |Disciple → Ultra Instinct    |
|🦸 **My Hero Academia**|Deku, Bakugo, Todoroki, Uraraka, Iida, All Might    |Élève UA → Symbole de la Paix|
|⚔️ **Demon Slayer**    |Tanjiro, Nezuko, Zenitsu, Inosuke, Giyu, Rengoku    |Aspirant → Maître Pourfendeur|
|⚡ **Pokémon**         |Sacha, Pikachu, Ondine, Pierre, Ouisticram, Léviator|Apprenti → Maître Pokémon    |

**Adaptation dynamique** : changer d'univers reformule automatiquement les questions ("Naruto mange du ramen" devient "Luffy mange de la viande"), renomme les pouvoirs (jutsu → haki → ki), change la devise (chakra → haki → ki), et modifie la couleur dominante de l'interface.

### 🎮 13 modes de jeu (4 niveaux × plusieurs formats)

**QCM par niveau de difficulté (legacy)** :

1. **🟢 Académie (6e)** — 30 questions de révision 6e
2. **🔵 Genin (5e)** — 26 questions d'anticipation 5e
3. **🔴 Chunin (Mix)** — 20 questions piégées 6e+5e
4. **💀 Boss (Kage)** — 12 questions expertes chronométrées
5. **🧘 Entraînement libre (Zen)** — 20 questions sans timer ni vies perdues

**Réviser par chapitre** (sélection par niveau + chapitre du programme) :

- 🟢 **6e** : Décimaux, Fractions, Calcul & nombres, Géométrie, Stats & probas, Proportionnalité
- 🔵 **5e** : Relatifs, Fractions 4 opérations, Puissances, Calcul littéral & équations, Géométrie, % & vitesse
- 📘 **4e** : Pythagore, Puissances & notation scientifique, Calcul littéral, Équations, Statistiques, Transformations
- 📕 **3e (DNB)** : Thalès, Trigonométrie, Fonctions, Identités & factorisation, Probabilités, Arithmétique

**Modes interactifs** :

6. **✏️ Tracé géométrique** — 6 missions au doigt sur canvas (axes de symétrie, droites, angles)
7. **🧩 Puzzle d'emboîtement** — 6 puzzles drag&drop (fractions, formes, équations)
8. **⚡ Vrai/Faux Speed** — 50 affirmations math en 7 sec chacune, raccourcis V/F au clavier
9. **📖 Histoire interactive** — 5 aventures narratives multi-étapes (Naruto/Sakura/Sasuke/Jiraiya/Orochimaru/Tanjiro)

**Modes interactifs Phase 4 (4e/3e + DNB)** :

10. **🏆 DNB Blanc complet** — Épreuve simulée /40 (20 min auto + 4 exercices écrits = ~1h45)
11. **🔺 Constructeur Pythagore/Thalès/Trigo** — Canvas tactile, 3 ateliers + défis aléatoires
12. **🌳 Arbre de probabilités** — Drag&drop 6 branches × 3 scénarios + calcul composé
13. **📈 Lecteur de graphique** — 10 défis : image, antécédent, identification d'expression, coefficient directeur

### ⚡ Mode Automatismes — Format DNB 2027

- **20 questions en 20 minutes**, sans calculatrice (réplique exacte de l'épreuve DNB)
- **39 générateurs aléatoires** (6e: 10, 5e: 11, 4e: 8, 3e: 10) → pratique quasi-infinie
- **Saisie clavier** (Entrée pour valider), normalisation tolérante (`5` = `+5`, `0,5` = `0.5`, `−3` = `-3`)
- **5 pools** : 6e seul, 5e seul, 4e seul, 3e seul, Mix tous niveaux, **Spécial DNB 2027** (4e + 3e mélangés)
- **Note DNB simulée sur 6** + analyse colorée par thème

### 🧠 Pédagogie

- **Conformité stricte aux programmes officiels** :
  - 6e : BO du 17 avril 2025 (cycle 3)
  - 5e à 3e : BO du 5 mars 2026 (cycle 4)
- **Répétition espacée** (méthode Ebbinghaus) : les questions ratées sont remises dans la pile toutes les 3 questions, puis en phase de révision en fin de session
- **Feedback détaillé** après chaque réponse avec la méthode complète
- **Multimodalité** : QCM, tracé kinesthésique, drag & drop, calcul mental, canvas interactif
- **Récompenses variables** : XP, combos, jutsus, trophées
- **Charge cognitive contrôlée** : interface épurée, formatage minimal

### 🎁 Gamification

- **Système de vies** (cœurs) et **chakra/haki/ki** (selon l'univers)
- **Combo multiplier** : enchaîner les bonnes réponses booste le score
- **3 jutsus/power-ups** : 50/50, indice subtil, arrêt du temps
- **XP & niveaux** persistants (avec sauvegarde locale opt-in)
- **Trophées débloquables** : score parfait, combo légendaire, pur chakra, révision active, apprenant tenace
- **Streak quotidien** : compteur de jours consécutifs

### 📈 Statistiques personnelles

- Écran **"Mes stats"** accessible depuis l'accueil (si sauvegarde activée)
- Compteurs : parties jouées, taux de réussite global, niveau XP, streak
- **Top univers / personnages** utilisés
- **Chapitres maîtrisés** (≥ 75 %) vs **à retravailler** (< 50 %)
- Reset utilisateur disponible à tout moment

### 📊 Analytique admin

- **GoatCounter** (gratuit, sans cookies, RGPD-safe) — hébergement EU
- Events trackés : univers/perso choisis, modes lancés, taux de complétion, chapitres révisés
- Dashboard sur https://ninja-math.goatcounter.com
- Respect de `navigator.doNotTrack`

-----

## 📚 Couverture du programme

| Niveau | BO | Couverture | Notions principales |
|---|---|---|---|
| **6e** | BO 17/04/2025 cycle 3 | ✅ ~90 % | Décimaux, fractions, calcul mental, PGCD, symétrie axiale, angles, aires/volumes simples, moyenne, probas (nouveau 2025), proportionnalité, pré-algèbre en mots |
| **5e** | BO 05/03/2026 cycle 4 | ✅ ~90 % | Relatifs, fractions 4 opérations, puissances, priorités, calcul littéral, équations 1er degré (nouveau 2026), somme angles triangle, %, vitesse, probas |
| **4e** | BO 05/03/2026 cycle 4 | ✅ ~90 % | **Pythagore**, **notation scientifique**, calcul littéral avancé, équations 2 membres, **médiane/étendue/moyenne pondérée**, transformations |
| **3e** | BO 05/03/2026 cycle 4 + DNB 2027 | ✅ ~90 % | **Thalès**, **trigonométrie**, **fonctions linéaires/affines**, identités remarquables, factorisation, équation produit-nul, probas composées, arithmétique (PGCD/premiers) |

⚠️ **Respect strict** : pas de Pythagore en 5e (réservé 4e), pas de calcul littéral avec lettres en 6e (mots seulement), Thalès et trigo en 3e uniquement.

-----

## 🚀 Utilisation

### Pour les élèves

1. Aller sur `https://acs-data.github.io/ninja-math-games/`
2. Choisir un univers, un personnage, un mode
3. Optionnellement, activer **💾 Sauvegarde** pour conserver sa progression
4. Optionnellement, **📲 Installer l'app** (Chrome/Android, ou "Ajouter à l'écran d'accueil" sur iOS) pour jouer hors-ligne

**C'est tout.** Aucune installation obligatoire, aucun compte, aucun serveur, aucun cookie. Le jeu fonctionne 100 % en local et hors-ligne après la première visite.

### Compatibilité

- ✅ Chrome, Firefox, Safari, Edge (versions récentes)
- ✅ Mobile (iOS, Android) — interface tactile optimisée
- ✅ Tablette
- ✅ Hors-ligne après la 1re visite (service worker cache-first)
- ✅ PWA installable
- ✅ Accessibilité WCAG 2.1 niveau AA (focus visible, ARIA, raccourcis clavier, lecteur d'écran, prefers-reduced-motion)

### Recommandation d'usage

- **20-30 min/jour** en mode QCM ou Automatismes : suffisant pour ancrer les notions
- **Mode Automatismes / DNB Blanc** : à pratiquer **3 fois/semaine** pour préparer le DNB
- **Modes Tracé, Puzzle, Constructeur, Arbre, Graphique** : pour varier les approches et renforcer la mémoire kinesthésique
- **Mode Boss / DNB Blanc** : à réserver aux fins de chapitre, pour challenge
- **Mode Entraînement libre / Réviser par chapitre** : pour le travail au calme sans pression

-----

## 🛠 Stack technique

- **HTML5 + CSS3 + JavaScript vanilla** — un seul fichier, **zéro dépendance npm, zéro build**
- **PWA installable** : `manifest.json` + service worker (`sw.js`)
- **Cache-versionné automatiquement** : le SHA du commit est injecté dans le SW au déploiement (workflow GitHub Pages)
- **Canvas API** pour les modes tracé, constructeur Pythagore/Thalès/Trigo, lecteur de graphique
- **Drag & Drop manuel** (mouse + touch) pour les modes puzzle et arbre de probabilités
- **Polices** : Bangers (titres) et Nunito (corps) via Google Fonts, fallback Impact/Arial Black
- **Sauvegarde locale opt-in** (`localStorage`) : XP, niveau, univers, perso, stats. RGPD-safe.
- **Service worker** : cache-first, offline-ready, notification de mise à jour avec bouton "METTRE À JOUR"
- **Analytique** : GoatCounter (sans cookies, EU-hosted, RGPD)

### Structure du fichier

```
index.html  (≈ 475 KB, ≈ 10 200 lignes — mono-fichier volontaire)
├── <head>          (lignes 1-50)    Meta, OG, favicon SVG inline, manifest, polices
├── <style>         (lignes 50-1180) CSS complet : variables, layout, écrans, animations, a11y
├── <body>          (lignes 1180-2300) 13 écrans + modals + footer
└── <script>        (lignes 2300-10200) Logique de jeu, état, modes, rendu
```

### Fichiers du projet

```
/
├── index.html              Fichier principal (à modifier)
├── manifest.json           Manifest PWA
├── sw.js                   Service Worker (cache-first, versionné)
├── icon-192.png            Icône PWA Android
├── icon-512.png            Icône PWA haute résolution
├── og-image.png            Image OpenGraph 1200×630
├── og-image.svg            Source vectorielle de l'image OG
├── .github/workflows/pages.yml  Déploiement automatique sur GitHub Pages
├── README.md               Ce fichier
└── CLAUDE.md               Guide pour IA assistantes
```

-----

## 📊 Statistiques de contenu

- **6 univers** × 6 personnages × 5 grades = **36 personnages**, **30 grades**
- **167 questions QCM** réparties sur 4 modes legacy + 12 chapitres
  - 88 QCM legacy (6e: 30, 5e: 26, mixte: 20, boss: 12)
  - 39 QCM 4e par chapitre (6 chapitres)
  - 40 QCM 3e par chapitre (6 chapitres)
- **6 missions de tracé géométrique**
- **6 puzzles d'emboîtement**
- **39 générateurs d'automatismes** (10 par niveau en moyenne)
- **9 aventures narratives** multi-étapes (32 sous-questions)
- **4 exercices DNB Blanc** (16 sous-questions)
- **50 affirmations Vrai/Faux Speed**
- **3 scénarios d'arbres de probabilités** + 3 questions composées
- **3 ateliers Pythagore/Thalès/Trigo** + défis aléatoires illimités
- **10 défis Lecteur de graphique** par session (générés aléatoirement)
- **Dictionnaire d'adaptation** : ~25 termes traduits par univers

-----

## 🎓 Conformité aux programmes officiels

- **Cycle 3 (6e)** : programme du [BO du 17 avril 2025](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A), en vigueur depuis la rentrée 2025
- **Cycle 4 (5e, 4e, 3e)** : programme du BO du 5 mars 2026, en vigueur dès la rentrée 2026
- **DNB 2027** : nouvelle épreuve d'automatismes (20 min, sans calculatrice, 6 pts/40) + 4 exercices écrits (34 pts/40)

-----

## 🔧 Personnalisation

Le code est volontairement lisible et modulaire. Pour modifier ou enrichir :

- **Ajouter une question QCM legacy** : éditer `QUESTIONS['6e_facile']`, etc. dans le `<script>`. Format :
  ```js
  {
    type: "Catégorie",                     // doit matcher un TYPE_TO_CHAPTER_* pour apparaître par chapitre
    theme: "🎨 Contexte narratif",
    text: "Énoncé avec <span class='math'>formule</span>",
    answers: ["A", "B", "C", "D"],
    correct: 0,                             // index 0..3
    feedback: "Explication détaillée de la méthode"
  }
  ```
- **Ajouter une question par chapitre 4e/3e** : éditer `QUESTIONS_BY_CHAPTER['4e']['pythagore']`, etc.
- **Ajouter un chapitre** : créer la clé dans `QUESTIONS_BY_CHAPTER` + ajouter les métadonnées dans `CHAPTER_LABELS`.
- **Ajouter un univers** : compléter l'objet `UNIVERSES` + entrée correspondante dans `UNIVERSE_THEMES_MAP` et `UNIVERSE_EMOJI_MAP`.
- **Ajouter un générateur d'automatismes** : ajouter une fonction à `AUTO_GENERATORS` qui retourne `{ q, a, theme }`, puis l'inclure dans le pool souhaité (`AUTO_POOLS`).
- **Ajouter une mission de tracé** : compléter `DRAW_MISSIONS` avec `title`, `instruction`, `guide`, `tolerance`, `feedback_ok`, `feedback_bad`, `xp`.
- **Ajouter un puzzle** : compléter `PUZZLES` (type `match` ou `sort`).
- **Ajouter une aventure narrative** : compléter `STORY_MISSIONS` avec `title`, `decor`, `intro`, `steps[]`.
- **Ajouter une affirmation V/F** : compléter `TRUEFALSE_STATEMENTS`.
- **Ajouter un exercice DNB Blanc** : compléter `DNB_EXERCISES`.
- **Ajouter un scénario d'arbre** : compléter `PROBA_SCENARIOS`.

Voir `CLAUDE.md` pour la documentation détaillée à destination des IA assistantes.

-----

## 🚧 Limitations connues

- **Persistance opt-in uniquement** : la sauvegarde locale doit être activée par l'utilisateur via le bouton dédié sur l'écran d'accueil (choix RGPD volontaire pour le public mineur)
- **Questions QCM en banque fixe** (sauf mode Automatismes) : limité à ce qui est codé en dur
- **Mode tracé** : validation tolérante mais imparfaite pour les angles complexes
- **Pas d'audio** : pas de sons ni de musique (volontaire pour le calme de l'étude)
- **Pas d'IA générative côté élève** : tout est statique, déterministe et contrôlable pédagogiquement

-----

## 📝 Crédits

- **Conception pédagogique** : alignée sur les programmes officiels français du collège, cycles 3 et 4 (BO 17/04/2025 et BO 05/03/2026)
- **Polices** : Bangers et Nunito via Google Fonts (licence SIL Open Font)
- **Édité par** : ACS Dataformation — France

-----

## ⚖️ Mentions légales et propriété intellectuelle

### Éditeur

ACS Dataformation — France.
Contact général : `contact@acs-dataformation.fr`
Contact pour les demandes de retrait et propriété intellectuelle : `legal@acs-dataformation.fr`

### Marques et œuvres tierces citées

Ce projet **cite nominativement** des personnages issus d'œuvres protégées dans le seul but de proposer un habillage thématique motivant pour des collégiens. Les marques suivantes appartiennent à leurs titulaires respectifs :

- **NARUTO**, **ONE PIECE**, **DRAGON BALL**, **MY HERO ACADEMIA**, **DEMON SLAYER / KIMETSU NO YAIBA** — Shueisha, Toei Animation, ufotable, Aniplex, BONES (selon œuvre)
- **POKÉMON**, **POKÉ BALL** — Nintendo / Creatures Inc. / Game Freak / The Pokémon Company

Aucun élément graphique, sonore ou textuel substantiel de ces œuvres n'est reproduit. Le jeu utilise uniquement :
- des **noms** de personnages dans le texte des questions,
- des **emojis Unicode** standards (🥷 🍜 ⚡ 🌸 etc.), libres de droits.

L'éditeur n'a aucune affiliation, partenariat ou endossement avec les ayants droit. Ce projet ne saurait être confondu avec un produit officiel.

### Demande de retrait (notice & takedown)

Tout titulaire de droits ou son représentant légal peut demander, par email à **`legal@acs-dataformation.fr`**, le retrait des références concernant son œuvre. L'éditeur s'engage à répondre **sous 72 heures ouvrées** et à retirer ou renommer les éléments concernés dans les meilleurs délais.

### Caractère non commercial

Ce projet est **strictement non commercial** :
- 100 % gratuit, sans pub, sans inscription, sans paywall
- Aucune donnée personnelle collectée par défaut
- Aucun transfert vers des tiers
- La sauvegarde locale est opt-in explicite (`localStorage` navigateur uniquement)
- Analytique anonyme via GoatCounter (sans cookies, EU-hosted, respect de DNT)

### Données personnelles (RGPD)

Aucune donnée personnelle n'est collectée ou transmise à un serveur tiers. Voir le modal "Mentions légales" accessible depuis l'écran d'accueil pour le détail.

-----

## 📄 Licence

Code source : usage personnel et éducatif libre. Toute redistribution doit conserver les mentions légales ci-dessus et l'adresse de contact pour demande de retrait.

Ce projet ne crée aucun droit sur les œuvres tierces citées, qui restent la propriété exclusive de leurs ayants droit.

-----

## 💡 Idées d'évolution future

- **Plus de scénarios** dans les modes interactifs Phase 4 (arbres, ateliers, graphiques)
- **Extension des grades par univers** : 7 paliers naturellement alignés sur 6e → 3e → DNB
- **Stats par chapitre dans l'écran résultat** : « tu maîtrises Pythagore à 80 % »
- **Mode multijoueur local** (deux élèves sur le même écran, duel auto)
- **Export PDF des erreurs** pour révision papier
- **Plus de fonctions** dans le Lecteur de graphique (paraboles, racine carrée, etc.)
- **Mode Constructeur Géométrique étendu** : aires, périmètres, volumes interactifs

-----

*Conçu pour faire des mathématiques un terrain de jeu, sans rien sacrifier à la rigueur.*
