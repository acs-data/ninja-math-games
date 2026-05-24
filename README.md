# 🥷 Anime Math Academy

> Un jeu HTML pédagogique pour réviser les maths de 6ème et préparer la 5ème, dans l’univers des animes populaires.

Un fichier HTML autonome (aucune installation, aucun serveur), conçu pour les collégiens fans de Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer et Pokémon.

-----

## 🎯 Objectif

Préparer concrètement les élèves au programme officiel **6ème (BO 17 avril 2025)** et **5ème (BO 5 mars 2026)**, en particulier la nouvelle épreuve d’**automatismes du DNB 2027** (20 min, sans calculatrice, 6 pts/40).

L’idée : transformer la révision en quête épique. Le contenu pédagogique reste rigoureux, l’habillage est immersif.

-----

## ✨ Fonctionnalités

### 🌍 6 univers anime

|Univers               |Personnages                                         |Grades                       |
|----------------------|----------------------------------------------------|-----------------------------|
|🥷 **Naruto**          |Naruto, Sasuke, Sakura, Kakashi, Rock Lee, Shikamaru|Académicien → Hokage         |
|🏴‍☠️ **One Piece**       |Luffy, Zoro, Nami, Sanji, Chopper, Robin            |Mousse → Roi des Pirates     |
|🐉 **Dragon Ball**     |Goku, Vegeta, Gohan, Piccolo, Trunks, Bulma         |Disciple → Ultra Instinct    |
|🦸 **My Hero Academia**|Deku, Bakugo, Todoroki, Uraraka, Iida, All Might    |Élève UA → Symbole de la Paix|
|⚔️ **Demon Slayer**    |Tanjiro, Nezuko, Zenitsu, Inosuke, Giyu, Rengoku    |Aspirant → Maître Pourfendeur|
|⚡ **Pokémon**         |Sacha, Pikachu, Ondine, Pierre, Ouisticram, Léviator|Apprenti → Maître Pokémon    |

**Adaptation dynamique** : changer d’univers reformule automatiquement les questions (“Naruto mange du ramen” devient “Luffy mange de la viande”, etc.), renomme les pouvoirs (“Kage Bunshin” → “Observation” → “Scouter”), change la devise (chakra → haki → ki), et modifie la couleur dominante de l’interface.

### 🎮 6 modes de jeu

1. **🟢 Académie (6ème)** — 15 questions QCM pour réviser le programme de 6ème
1. **🔵 Genin (5ème)** — 14 questions QCM pour anticiper la 5ème
1. **🔴 Chunin (Mix)** — 10 questions piégées mélangeant les deux niveaux
1. **💀 Boss (Kage)** — 7 questions expertes chronométrées avec vies limitées
1. **✏️ Tracé géométrique** — 6 missions où on dessine au doigt sur un canvas (axes de symétrie, droites perpendiculaires, angles, diagonales). Évaluation automatique de la précision en %.
1. **🧩 Puzzle d’emboîtement** — 6 puzzles drag & drop : fractions équivalentes, formes géométriques, classement de relatifs, priorités opératoires, identification d’hypoténuses

### ⚡ Mode Automatismes — Format DNB 2027

- **20 questions en 20 minutes**, sans calculatrice (réplique exacte de la nouvelle épreuve du DNB)
- **21 générateurs aléatoires** : calculs créés à la volée, pratique quasi-infinie
- **Saisie clavier** (Entrée pour valider), normalisation tolérante (`5` = `+5`, `0,5` = `0.5`, `−3` = `-3`, etc.)
- 3 niveaux : 6ème, 5ème, Mix
- **Note DNB simulée sur 6** + analyse colorée par thème pour identifier les faiblesses

### 🧠 Pédagogie

- **Répétition espacée** (méthode Ebbinghaus) : les questions ratées sont automatiquement remises dans la pile toutes les 3 questions, puis en phase de révision en fin de session
- **Feedback détaillé** après chaque réponse avec la méthode complète
- **Multimodalité** : QCM (récupération active), tracé (kinesthésique), drag & drop (manipulation), calcul mental (fluidité)
- **Récompenses variables** : XP, combos, jutsus, trophées
- **Charge cognitive contrôlée** : interface épurée, formatage minimal

### 🎁 Gamification

- **Système de vies** (cœurs) et **chakra/haki/ki** (selon l’univers)
- **Combo multiplier** : enchaîner les bonnes réponses booste le score
- **3 jutsus/power-ups** : 50/50, indice subtil, arrêt du temps
- **XP & niveaux** persistants en session
- **Trophées débloquables** : score parfait, combo légendaire, pur chakra, révision active, apprenant tenace

-----

## 📚 Couverture du programme

### Programme 6ème (BO 17 avril 2025)

Fractions (équivalence, addition, soustraction, multiplication, division), décimaux, calcul mental, PGCD/multiples/divisibilité, symétrie axiale, angles complémentaires, périmètres, aires, volume du cube, statistiques (moyenne), probabilités, proportionnalité, conversions d’unités.

### Programme 5ème (BO 5 mars 2026)

Nombres relatifs (addition, soustraction, multiplication, classement), fractions (4 opérations), priorités opératoires, puissances entières, calcul littéral (substitution + développement), équations 1er degré, symétrie centrale, somme des angles d’un triangle, pourcentages, proportionnalité (échelles, vitesse), probabilités.

### Couverture estimée

- **6ème** : ~80%
- **5ème** : ~80%

-----

## 🚀 Utilisation

1. Télécharge `ninja-math-academy.html`
1. Double-clique dessus — il s’ouvre dans ton navigateur
1. Choisis ton univers, ton personnage, et ton mode

**C’est tout.** Aucune installation, aucun compte, aucun serveur, aucun cookie. Le jeu fonctionne 100% en local et hors-ligne.

### Compatibilité

- ✅ Chrome, Firefox, Safari, Edge (versions récentes)
- ✅ Mobile (iOS, Android) — interface tactile optimisée
- ✅ Tablette
- ✅ Hors-ligne (les polices Google sont chargées en ligne mais ont un fallback Impact/Arial Black)

### Comment l’utiliser au quotidien

- **20-30 min/jour** en mode QCM ou Automatismes : suffisant pour ancrer les notions
- **Mode Automatismes** : à pratiquer **3 fois/semaine** pour préparer le DNB
- **Modes Tracé et Puzzle** : pour varier les approches et renforcer la mémoire kinesthésique
- **Mode Boss** : à réserver aux fins de chapitre, pour challenge

-----

## 🛠 Stack technique

- **HTML5 + CSS3 + JavaScript vanilla** — un seul fichier, zéro dépendance npm
- **Canvas API** pour le mode tracé géométrique (avec gestion mouse + touch)
- **Drag & Drop manuel** (mouse + touch) pour le mode puzzle
- **Polices** : Bangers (titres) et Nunito (corps) via Google Fonts, avec fallback Impact/Arial Black pour iOS et offline
- **Pas de localStorage** : compatible avec tous les contextes d’utilisation
- **Pas d’API externe** : tout est embarqué

### Structure du fichier

```
ninja-math-academy.html  (≈ 160 KB, ≈ 3700 lignes)
├── <head>
│   └── <style>   (variables CSS, ~700 lignes)
├── <body>
│   ├── Header HUD (score, combo, XP)
│   ├── Écran accueil (sélecteur univers + personnage + mode)
│   ├── Écran QCM
│   ├── Écran Tracé (canvas)
│   ├── Écran Puzzle (drag & drop)
│   ├── Écran Automatismes (input clavier)
│   ├── Écran Résultats (général + automatismes)
│   └── <script>  (logique de jeu, ~2000 lignes)
```

-----

## 📊 Statistiques de contenu

- **6 univers** × 6 personnages × 5 grades = **36 personnages**, **30 grades**
- **46 questions QCM** réparties sur 4 modes
- **6 missions de tracé géométrique**
- **6 puzzles d’emboîtement**
- **21 générateurs aléatoires** pour les automatismes (= pratique quasi-illimitée)
- **Dictionnaire d’adaptation** : ~25 termes traduits par univers

-----

## 🎓 Conformité aux programmes officiels

- **Cycle 3 (6ème)** : programme du [BO du 17 avril 2025](https://www.education.gouv.fr/bo/2025/Hebdo16/MENE2504620A), en vigueur depuis la rentrée 2025
- **Cycle 4 (5ème)** : programme du [BO du 5 mars 2026](https://eduscol.education.fr/280/mathematiques-cycle-4), en vigueur dès la rentrée 2026
- **DNB 2027** : prise en compte de la nouvelle épreuve d’automatismes (20 min, sans calculatrice, 6 pts/40)

-----

## 🔧 Personnalisation

Le code est volontairement lisible et modulaire. Pour modifier ou enrichir :

- **Ajouter des questions** : éditer le tableau `QUESTIONS` dans le `<script>`, format :
  
  ```js
  {
    type: "Catégorie",
    theme: "🎨 Contexte narratif",
    text: "Énoncé avec <span class='math'>formule</span>",
    answers: ["A", "B", "C", "D"],
    correct: 0,  // index de la bonne réponse
    feedback: "Explication détaillée de la méthode"
  }
  ```
- **Ajouter un univers** : compléter l’objet `UNIVERSES` avec une nouvelle clé contenant `chars`, `ranks`, `place`, `mission`, `hero`, `powerName`, `currency`. Puis ajouter une entrée correspondante dans `UNIVERSE_THEMES_MAP` pour l’adaptation des questions.
- **Ajouter un générateur d’automatismes** : ajouter une fonction à `AUTO_GENERATORS` qui retourne `{ q, a, theme }`, puis l’inclure dans le pool souhaité (`AUTO_POOLS`).
- **Ajouter une mission de tracé** : compléter `DRAW_MISSIONS` avec `title`, `instruction`, `guide` (forme géométrique attendue), `tolerance`, `feedback_ok`, `feedback_bad`, `xp`.

-----

## 🐛 Limitations connues

- **Pas de persistance** : pas de localStorage = les progrès ne sont pas sauvegardés entre sessions (choix volontaire pour la portabilité)
- **Pas de dashboard de suivi long terme** : pas d’historique des erreurs sur plusieurs sessions
- **Questions QCM en banque fixe** (sauf mode Automatismes) : limité à ce qui est codé en dur
- **Mode tracé** : la validation est tolérante mais imparfaite pour les angles complexes
- **Pas d’audio** : pas de sons ni de musique (volontaire pour le calme de l’étude)

-----

## 📝 Crédits

- **Conception pédagogique** : alignée sur les programmes officiels français du collège, cycles 3 et 4
- **Univers** : références à des œuvres protégées par le droit d’auteur (Naruto, One Piece, Dragon Ball, My Hero Academia, Demon Slayer, Pokémon). Usage strictement éducatif et privé, non commercial.
- **Polices** : Bangers et Nunito via Google Fonts (licence SIL Open Font)

-----

## 📄 Licence

Usage personnel et éducatif libre. Pas de redistribution commerciale.

-----

## 💡 Idées d’évolution

- Mode “Révision sans timer” pour le travail au calme
- Dashboard de progression par thème sur plusieurs sessions (avec opt-in localStorage)
- Génération de questions par IA (via API externe optionnelle)
- Mode multijoueur local (deux élèves sur le même écran)
- Export PDF des erreurs pour révision papier
- Mode “Brevet blanc” simulant une épreuve complète

-----

*Conçu pour faire des mathématiques un terrain de jeu, sans rien sacrifier à la rigueur.*
