#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Génère index.html (la page principale du site) = classique.html + la couche d'animation (anime-src/).

Le fichier édité à la main est classique.html (le jeu classique) ; index.html est GÉNÉRÉ, jamais édité à la main.

    python3 tools/build_anime.py                 construit index.html
    python3 tools/build_anime.py --check         code 1 si index.html diffère d'une construction fraîche
    python3 tools/build_anime.py --out CHEMIN    écrit ailleurs (construction de test privée)
    python3 tools/build_anime.py --modules a,b   ne garde que les fragments de module dont le nom
                                                 contient une de ces clés (le noyau est toujours inclus)
    python3 tools/build_anime.py --keep-comments garde les commentaires des sources dans la sortie
    python3 tools/build_anime.py --src DOSSIER   lit les fragments ailleurs que dans anime-src/ (essais)
    python3 tools/build_anime.py --ci            chaque avertissement et chaque refus est aussi écrit en annotation
                                                 GitHub Actions (::warning:: / ::error::) ; automatique si
                                                 la variable d'environnement GITHUB_ACTIONS vaut « true »

Codes de sortie : 0 = construit (ou « à jour » avec --check) ; 1 = --check : le fichier diffère d'une construction
fraîche ; 2 = construction REFUSÉE, rien n'est écrit (lint, syntaxe, ou contrat du noyau rompu : voir plus bas).

Règles (voir anime-src/README.md) :
  - classique.html n'est JAMAIS modifié (ouvert en lecture seule ; la sortie ne peut pas être classique.html) ;
  - index.html = classique.html recopié tel quel (<head> compris : même titre, mêmes descriptions, même manifest),
    plus un commentaire « fichier généré » juste après la ligne <!DOCTYPE html>, plus la couche :
  - anime-src/*.css  -> <style id="fx-style"> juste avant </head> ;
  - anime-src/*.js   -> UNE IIFE dans <script id="fx-script"> juste avant </body> ;
      fragments 00-09 et 99 = noyau (portée partagée) ; fragments 10-98 = modules, chacun isolé
      dans sa propre fonction et son propre try (aucune collision de noms possible) ;
  - sortie déterministe (aucune date), commentaires retirés, écriture atomique ;
  - contrôles bloquants (lints : jeu intact, réseau, média, suivi, stockage — un fil d'alarme, pas un bac à
    sable ; ils sont eux-mêmes vérifiés à chaque construction sur un tableau de formes interdites et saines)
    + « node --check » sur chaque bloc de script ;
  - contrat avec classique.html : ce dont le NOYAU de la couche dépend (fonctions qu'il enveloppe ou appelle,
    variables qu'il lit, #app, classe des modales, écrans des épreuves) est bloquant, de même que les
    fonctions enveloppées par les fragments qui tiennent l'arène du QCM (MIRROR_FRAGMENTS) — sans eux la
    page serait à moitié branchée ; une fonction enveloppée par un AUTRE module n'est qu'un avertissement :
    ce module perd un effet, le reste de la page est intact.
Bibliothèque standard uniquement.
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_HTML = os.path.join(ROOT, 'classique.html')
SRC_DIR = os.path.join(ROOT, 'anime-src')
OUT_HTML = os.path.join(ROOT, 'index.html')
SIZE_WARN = 105000            # plafond de la couche entière (injectée), en octets : avertissement au-delà

# Bandeau « fichier généré », posé juste après la ligne <!DOCTYPE html> de la sortie : la première chose que voit
# quiconque ouvre index.html. Un commentaire placé avant <html> ne crée aucun nœud dans <html> (le DOM du jeu est
# inchangé) et ne change pas le mode de rendu (la ligne <!DOCTYPE html> reste la première).
DOCTYPE = re.compile(r'<!doctype html>\n', re.I)     # première ligne de classique.html (casse libre), recopiée telle quelle
BANNER = ('<!-- FICHIER GÉNÉRÉ — ne pas éditer à la main.\n'
          '     index.html = classique.html + la couche d\'animation (anime-src/), construit par tools/build_anime.py.\n'
          '     Pour modifier le jeu : éditer classique.html, puis lancer python3 tools/build_anime.py\n'
          '     (et node tools/test_anime.js). Voir anime-src/README.md. -->\n')
TAIL = '</script>\n</body>\n</html>\n'

# ── Contrat avec classique.html ──
# Ce dont le NOYAU (fragments 00–09 et 99) dépend. Absent de classique.html = construction REFUSÉE (code 2, rien
# n'est écrit) : la page serait à moitié branchée — écran courant jamais suivi (plus de profil « sobre » pour
# les épreuves), effets joués sur une modale, réglage qui ne suit plus l'opt-in de sauvegarde… Mieux vaut
# garder l'index.html précédent, plus ancien mais cohérent, le temps d'adapter la couche.
#   · les fonctions que le noyau ENVELOPPE sont lues dans ses fragments (FX.wrap), pas listées ici ;
#   · KERNEL_CALLS : fonctions du jeu que le noyau APPELLE ; KERNEL_VARS : variables globales qu'il LIT ;
#   · KERNEL_MARKS : repères du HTML (texte cherché dans classique.html, texte témoin dans le noyau, rôle).
KERNEL_CALLS = ['isSaveEnabled']       # FX.game.saveOn : porte de l'opt-in (aucune écriture de amat_fx_v1 sans elle)
KERNEL_VARS = ['state', 'currentUniverse', 'UNIVERSES', 'CHARS']      # FX.game.*, FX.palette
KERNEL_MARKS = [
    ('id="app"', "'app'", 'point de montage de la couche (sans lui elle se coupe au démarrage)'),
    ('modal-overlay', 'modal-overlay', 'classe des modales (une modale ouverte suspend tous les effets)'),
]
SOBER_PROFILE = 'sobre'                # FX.PROFILES : les écrans de ce profil (épreuves) doivent exister dans classique.html
# Fragments de MODULE dont tous les crochets sont bloquants eux aussi : ils tiennent un nœud PERSISTANT qui
# reflète l'état du jeu (l'arène du QCM, #fx-arena). Privée d'un seul de ces crochets, l'arène ment : adversaire
# et « Lis l'explication » de la question précédente restés sur la question suivante (loadQuestion), combo en
# retard d'un cran (answer), tension ou « Temps figé » jamais retirés (timeOut, updateTimerUI)… Les autres
# modules ne gardent rien entre deux effets : un crochet absent y est un effet en moins, rien de faux à l'écran
# (simple avertissement). Un nouveau module qui garde un état reflétant le jeu s'inscrit ici.
MIRROR_FRAGMENTS = ['20-arena.js', '21-qcm.js']
# Ce dont le noyau se passe (simple avertissement) : sans un point de montage, un bouton de réglage manque
# (sans AUCUN d'eux, le joueur ne pourrait plus couper les animations : refus) ; sans une ancre, les effets
# qui s'y accrochent ne jouent pas (FX.rect renvoie null).
SETTING_MARKS = [
    ('id="drawer-save-toggle"', 'drawer-save-toggle', 'boutons de réglage du tiroir'),
    ('id="theme-toggle-btn"', 'theme-toggle-btn', 'bouton de réglage de l\'accueil'),
    ('id="modal-pause"', 'modal-pause', 'bouton de réglage de la pause du QCM'),
    ('id="modal-auto-pause"', 'modal-auto-pause', 'bouton de réglage de la pause des automatismes'),
]
SOFT_MARKS = SETTING_MARKS + [
    ('role="banner"', 'role="banner"', 'ancre « header »'),
    ('id="main-logo"', '#main-logo', 'ancre « logo »'),
    ('id="hud-score"', '#hud-score', 'ancre « score »'),
    ('id="hud-streak"', '#hud-streak', 'ancre « streak »'),
    ('id="hud-level"', '#hud-level', 'ancre « level »'),
]


class BuildError(Exception):
    pass


def read(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


# ───────────────────────── retrait des commentaires ─────────────────────────

_REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
_REGEX_WORDS = {'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'do', 'else', 'instanceof'}


def strip_js(src, keep_lines=False):
    """Retire les commentaires JS (chaînes, gabarits et expressions régulières respectés).
    keep_lines=True : chaque commentaire devient des espaces, les numéros de ligne sont conservés (lints).
    Sinon : les lignes devenues vides sont supprimées et les fins de ligne nettoyées (sortie)."""
    out = []
    n = len(src)
    i = 0
    stack = []            # un compteur d'accolades par ${ … } ouvert dans un gabarit
    in_tpl = False
    line_start = 0        # index dans out du début de la ligne courante
    prev = ''             # dernier caractère significatif
    word = ''             # dernier mot (pour l'heuristique regex/division)
    run = False           # un identifiant est en cours de lecture

    def newline():
        nonlocal line_start
        if not keep_lines:
            j = len(out)
            while j > line_start and out[j - 1] in ' \t\r':
                j -= 1
            del out[j:]
            if j == line_start:           # ligne vide : supprimée
                return
        out.append('\n')
        line_start = len(out)

    while i < n:
        c = src[i]
        if in_tpl:                                    # texte d'un gabarit : recopié tel quel
            if c == '\\' and i + 1 < n:
                out.append(src[i:i + 2]); i += 2; continue
            if c == '`':
                in_tpl = False; prev = '`'; word = ''
            elif c == '$' and src[i + 1:i + 2] == '{':
                out.append('${'); i += 2; stack.append(0); in_tpl = False; prev = '{'; word = ''
                continue
            out.append(c); i += 1
            if c == '\n':
                line_start = len(out)
            continue
        d = src[i + 1:i + 2]
        if c == '/' and d == '/':                     # commentaire de ligne
            j = src.find('\n', i)
            j = n if j < 0 else j
            if keep_lines:
                out.append(' ' * (j - i))
            i = j
            continue
        if c == '/' and d == '*':                     # commentaire de bloc
            j = src.find('*/', i + 2)
            if j < 0:
                raise BuildError('commentaire /* non fermé')
            for ch in src[i:j + 2]:
                if ch == '\n':
                    newline()
                elif keep_lines:
                    out.append(' ')
            i = j + 2
            continue
        if c == '\n':
            newline(); i += 1
            continue
        if c in '"\'':                                # chaîne
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\n':
                    raise BuildError('chaîne non fermée')
                j += 2 if src[j] == '\\' else 1
            out.append(src[i:j + 1]); i = j + 1; prev = c; word = ''; run = False
            continue
        if c == '`':
            out.append(c); i += 1; in_tpl = True
            continue
        if c == '/' and (prev == '' or prev in _REGEX_PREV or (word in _REGEX_WORDS and (prev.isalnum() or prev in '_$'))):
            j = i + 1; cls = False; ok = False        # expression régulière ?
            while j < n and src[j] != '\n':
                ch = src[j]
                if ch == '\\':
                    j += 2; continue
                if ch == '[':
                    cls = True
                elif ch == ']':
                    cls = False
                elif ch == '/' and not cls:
                    ok = True; break
                j += 1
            if ok:
                out.append(src[i:j + 1]); i = j + 1; prev = '/'; word = ''; run = False
                continue
        if c == '{' and stack:
            stack[-1] += 1
        elif c == '}' and stack:
            if stack[-1] == 0:                        # fin de ${ … } : retour dans le gabarit
                stack.pop(); out.append(c); i += 1; in_tpl = True
                continue
            stack[-1] -= 1
        out.append(c); i += 1
        if c.isalnum() or c in '_$':
            word = word + c if run else c
            run = True; prev = c
        elif c.isspace():
            run = False
        else:
            prev = c; word = ''; run = False
    if in_tpl or stack:
        raise BuildError('gabarit ` non fermé')
    if not keep_lines:
        newline()
    return ''.join(out)


def selftest():
    """Garde-fou : le retrait des commentaires ne doit toucher ni aux chaînes, ni aux gabarits, ni aux regex."""
    cases = [
        ("a = b / c; // x\nd = /re\\/\\//.test(s); /* y */ e", "a = b / c;\nd = /re\\/\\//.test(s);  e\n"),
        ("s = 'it\\'s // not'; t = \"/* no */\"; // yes", "s = 'it\\'s // not'; t = \"/* no */\";\n"),
        ("x = `a // b ${ y /* c */ + `n${1}` } /* d */\n\n z`; // e", "x = `a // b ${ y  + `n${1}` } /* d */\n\n z`;\n"),
        ("return /[/]\\//g; // c", "return /[/]\\//g;\n"),
        ("f(a) / 2 / 3; // c", "f(a) / 2 / 3;\n"),
        ("var r = x ? /a/ : /b/; //c", "var r = x ? /a/ : /b/;\n"),
        ("/* a\n b */\ncode();\n\n\n// z\nmore();", "code();\nmore();\n"),
    ]
    for src, expected in cases:
        if strip_js(src) != expected:
            raise BuildError('auto-test du retrait de commentaires en échec sur : %r' % src)


def strip_css(src):
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            out.append(src[i:j + 1]); i = j + 1
        elif c == '/' and src[i + 1:i + 2] == '*':
            j = src.find('*/', i + 2)
            if j < 0:
                raise BuildError('commentaire CSS non fermé')
            i = j + 2
        else:
            out.append(c); i += 1
    lines = [ln.rstrip() for ln in ''.join(out).split('\n')]
    return '\n'.join(ln for ln in lines if ln) + '\n'


# ───────────────────────────────── lints ─────────────────────────────────

# Les lints sont un FIL D'ALARME, pas un bac à sable : ils lisent le texte des fragments, ligne par ligne,
# commentaires retirés (chaînes comprises : une URL dans une chaîne est vue). Un nom fabriqué à l'exécution
# ('inner' + 'HTML') ou un alias obtenu par un détour leur échappe : la relecture et la suite de tests
# (scénario « reseau », empreinte du DOM, audit des nœuds de la couche) font le reste.
# Chaque interdit vise un NOM (appel direct, .call / .apply, passage en valeur, alias W / D compris).
_Q = r"""['"`]"""
STORAGE_FRAGMENT = '03-settings.js'      # seul fragment autorisé à toucher au stockage (clé amat_fx_v1)
ENGINE_FRAGMENT = '01-engine.js'         # seul fragment où createElement reçoit une variable (corps de FX.el)
SVG_NS = 'http://www.w3.org/2000/svg'
# Balises qu'un fragment ne crée jamais : images, sons, cadres, scripts, feuilles de style, ressources.
MEDIA_TAGS = ('img|image|picture|audio|video|source|track|iframe|frame|frameset|object|embed|script|link|style|'
              'base|meta|portal|fencedframe')
JS_FORBIDDEN = [
    # ── jeu intact : hasard, focus, défilement, régions live, propagation ──
    (r'\.\s*random\b', 'Math.random interdit (utiliser FX.rnd : la couche a son propre générateur)'),
    (r'\.\s*(focus|blur)\b', '.focus / .blur interdits, même par .call ou en valeur (la couche ne déplace jamais le focus)'),
    (r'scrollIntoView|\bscroll(To|By)\b|\.\s*scroll\s*\(|\bscroll(Top|Left)\s*[-+*/]?=(?!=)', 'défilement interdit'),
    (r'\bshowToast\b', 'showToast interdit, même en valeur (région live + toast de mise à jour)'),
    (r'\bannounceToScreenReader\b', 'announceToScreenReader interdit, même en valeur (région live partagée)'),
    (r'(%s)#?(sr-live|toast)\1' % _Q, 'régions live du jeu (#sr-live, #toast) : la couche ne les nomme jamais'),
    (r'stop(Immediate)?Propagation', 'stopPropagation interdit (délégation de clic du jeu)'),
    # ── code fabriqué, injection HTML ──
    (r'\beval\b', 'eval interdit, même en valeur'),
    (r'\bFunction\s*\(|\bnew\s+Function\b', 'Function( / new Function interdits'),
    (r'\bset(Timeout|Interval)\s*\(\s*%s' % _Q, 'setTimeout / setInterval avec une chaîne interdits'),
    (r'\.\s*write(ln)?\s*\(|insertAdjacentHTML|\bouterHTML\b|createContextualFragment|setHTMLUnsafe|\bDOMParser\b',
     'injection HTML interdite'),
    (r'(?i)</script', '</script interdit dans le JS'),
    (r'<!--', '<!-- interdit dans le JS'),
    (r'(?i)<(%s)[\s>/\'"`]' % MEDIA_TAGS, 'balise d\'image, de son, de cadre, de script ou de style interdite dans une chaîne'),
    # ── légal et vie privée : aucun réseau, aucun média, aucun suivi, aucun autre stockage ──
    (r'\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|WebTransport|RTCPeerConnection|BroadcastChannel|'
     r'SharedWorker|Worker|importScripts|serviceWorker)\b', 'réseau interdit (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource, Worker…)'),
    (r'\bimport\s*\(|^\s*(import|export)\b', 'import() dynamique et modules ES interdits'),
    (r'\bnew\s+(Image|Audio)\b|\b(Image|Audio)\s*\(|AudioContext|speechSynthesis|SpeechSynthesisUtterance',
     'image ou son interdits (new Image, new Audio, AudioContext…)'),
    (r'(?i)\b(https?|wss?|ftp):/|%s\s*(https?:|wss?:|ftp:|//|data:|blob:)' % _Q, 'URL littérale interdite (http:, https:, //hôte, data:, blob:)'),
    (r'(?i)\burl\s*\(|@import|@font-face|image-set\s*\(', 'ressource CSS interdite dans le JS (url(, @import, @font-face)'),
    (r'\.\s*(src|srcset|href|poster|cssText)\s*=(?!=)|setAttribute(NS)?\s*\(\s*%s(src|srcset|href|xlink:href|poster|action|'
     r'formaction|ping|background|style)%s' % (_Q, _Q), 'attribut de ressource interdit (src, href, srcset, poster, style…)'),
    (r'insertRule|adoptedStyleSheets|\bCSSStyleSheet\b', 'feuille de style fabriquée à l\'exécution interdite'),
    (r'(?i)goatcounter|\btrack\s*\(', 'suivi interdit (GoatCounter, track() du jeu)'),
    (r'\bcookie\b|\bindexedDB\b|\bsessionStorage\b|\bcaches\b|\bopenDatabase\b', 'cookie, indexedDB, sessionStorage et caches interdits'),
    (r'\bnavigator\b|\blocation\b|\b(window|W)\s*\.\s*open\s*\(', 'navigator, location et window.open interdits'),
]
# Les mêmes noms atteints par un accès entre crochets : Math["random"], el["innerHTML"], W["fetch"]…
_BRACKET = re.compile(r'[\w$)\]]\s*\[\s*(%s)(random|focus|blur|scroll|scrollTo|scrollBy|scrollIntoView|scrollTop|scrollLeft|'
                      r'showToast|announceToScreenReader|stopPropagation|stopImmediatePropagation|preventDefault|eval|Function|'
                      r'write|writeln|innerHTML|outerHTML|insertAdjacentHTML|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|'
                      r'Image|Audio|AudioContext|src|srcset|href|cookie|indexedDB|localStorage|sessionStorage|navigator|location|'
                      r'open|createElement|createElementNS|goatcounter|track)\1\s*\]' % _Q)
JS_SETTINGS_ONLY = [
    (r'preventDefault', 'preventDefault interdit hors des boutons de réglage (%s)' % STORAGE_FRAGMENT),
    (r'\blocalStorage\b', 'stockage interdit hors de %s (et derrière isSaveEnabled)' % STORAGE_FRAGMENT),
]
_INNER = re.compile(r'\binnerHTML\b')
_INNER_OK = re.compile(r"""\s*\+?=(?!=)\s*(?:'[^'\\]*'|"[^"\\]*"|`[^`$\\]*`)\s*(?:;|$)""")      # affectation d'une chaîne littérale
_CREATE = re.compile(r'\b(createElement(?:NS)?|FX\s*\.\s*el)\s*\(\s*')
_TAG_ARG = re.compile(r'(%s)([A-Za-z][\w:-]*)\1' % _Q)
_MEDIA = re.compile(r'(?i)^(%s)$' % MEDIA_TAGS)


def lint_js(name, src, errors):
    code = strip_js(src, keep_lines=True)
    is_settings = name == STORAGE_FRAGMENT
    for ln, line in enumerate(code.split('\n'), 1):
        line = line.replace(SVG_NS, 'svg')      # espace de noms SVG : un identifiant, pas une requête
        for rx, msg in JS_FORBIDDEN:
            if re.search(rx, line):
                errors.append('%s:%d : %s' % (name, ln, msg))
        if _BRACKET.search(line):
            errors.append('%s:%d : accès entre crochets à un nom interdit (les lints lisent les noms : écrire objet.nom)' % (name, ln))
        if not is_settings:
            for rx, msg in JS_SETTINGS_ONLY:
                if re.search(rx, line):
                    errors.append('%s:%d : %s' % (name, ln, msg))
        for m in _INNER.finditer(line):
            if not _INNER_OK.match(line, m.end()):
                errors.append('%s:%d : innerHTML : seule l\'affectation d\'une chaîne littérale est admise (utiliser textContent / FX.el)' % (name, ln))
        for m in _CREATE.finditer(line):
            # createElement / FX.el : balise en chaîne littérale (seul le corps de FX.el reçoit une variable).
            rest = line[m.end():]
            if m.group(1).startswith('create') and name == ENGINE_FRAGMENT and re.match(r'tag\s*\)', rest):
                continue
            arg = rest.split(',', 1)[-1].lstrip() if m.group(1) == 'createElementNS' else rest
            t = _TAG_ARG.match(arg)
            if not t:
                errors.append('%s:%d : %s( attend une balise en chaîne littérale' % (name, ln, m.group(1)))
            elif _MEDIA.match(t.group(2)):
                errors.append('%s:%d : création d\'un <%s> interdite (image, son, cadre, script, feuille de style, ressource)'
                              % (name, ln, t.group(2).lower()))
    return code


CSS_FORBIDDEN = [
    (r'(?i)url\s*\(', 'url( interdit dans le CSS (aucune image, aucune police, aucune ressource)'),
    (r'(?i)@import', '@import interdit dans le CSS'),
    (r'(?i)@font-face', '@font-face interdit dans le CSS'),
    (r'(?i)image-set\s*\(', 'image-set( interdit dans le CSS'),
    (r'(?i)\b(https?|wss?|ftp)\s*:', 'URL interdite dans le CSS'),
    (r'\\', 'échappement CSS interdit (écrire le caractère lui-même : les lints lisent le texte)'),
]


def lint_css(name, src, errors):
    """Tout sélecteur contient « fx- » ou « data-fx » ; @keyframes et variables préfixés fx-."""
    css = strip_css(src)
    if re.search(r'(?i)</style', css):
        errors.append('%s : </style interdit dans le CSS' % name)
    for rx, msg in CSS_FORBIDDEN:
        if re.search(rx, css):
            errors.append('%s : %s' % (name, msg))
    for m in re.finditer(r'@keyframes\s+([^\s{]+)', css):
        if not m.group(1).startswith('fx-'):
            errors.append('%s : @keyframes %s doit commencer par fx-' % (name, m.group(1)))
    for m in re.finditer(r'(?<![\w-])(--[\w-]+)\s*:', css):
        if not m.group(1).startswith('--fx-'):
            errors.append('%s : la variable %s doit commencer par --fx-' % (name, m.group(1)))

    def walk(block):
        i = 0
        while True:
            j = block.find('{', i)
            if j < 0:
                return
            prelude = block[i:j].strip().split(';')[-1].strip()
            depth = 1
            k = j + 1
            while k < len(block) and depth:
                depth += {'{': 1, '}': -1}.get(block[k], 0)
                k += 1
            body = block[j + 1:k - 1]
            if prelude.startswith('@'):
                if not re.match(r'@(keyframes|font-face)', prelude):
                    walk(body)                     # @media, @supports…
            else:
                for sel in prelude.split(','):
                    if 'fx-' not in sel and 'data-fx' not in sel:
                        errors.append('%s : le sélecteur « %s » doit contenir fx- ou data-fx' % (name, sel.strip()))
            i = k

    walk(css)
    return css


# Formes qu'un fragment de module ne doit jamais faire passer (une par ligne du tableau), puis formes saines
# tirées de la couche. Vérifié à chaque construction : un lint cassé ne peut pas se taire.
LINT_REFUSED_JS = [
    'var x = Math.random();', 'var x = Math["random"]();', 'var M = Math, x = M.random();',
    'el.focus();', 'el.focus.call(el);', 'el["focus"]();', 'var f = el.focus;', 'el.blur();',
    'showToast("x");', 'setTimeout(showToast, 10, "x");', 'W.showToast.call(null, "x");',
    'var a = announceToScreenReader; a("x");', 'D.getElementById("sr-live").textContent = "x";',
    'D.querySelector("#toast").textContent = "x";',
    'eval("1");', '(0, eval)("1");', 'Function("return 1")();', 'new Function("return 1")();', 'setTimeout("f()", 10);',
    'W.scrollTo(0, 0);', 'W.scroll(0, 0);', 'el.scrollIntoView();', 'var s = W.scrollBy;', 'D.documentElement.scrollTop = 0;',
    'W["scrollTo"](0, 0);', 'e.stopPropagation();', 'D.write("x");', 'el.insertAdjacentHTML("beforeend", x);',
    'el.outerHTML = x;', 'el.innerHTML = x;', 'el["innerHTML"] = x;', 'Object.assign(el, { innerHTML: x });',
    'el.innerHTML = "<img alt=x>";', 'el.appendChild(D.createRange().createContextualFragment(x));',
    'fetch("x.json");', 'W.fetch.call(W, u);', 'W["fetch"](u);', 'var r = new XMLHttpRequest();',
    'navigator.sendBeacon(u, "x");', 'new WebSocket(u);', 'new EventSource(u);', 'new Worker(u);',
    'new Image().src = u;', 'var i = new Image();', 'new Audio(u).play();', 'var c = new AudioContext();',
    'var c = new (W.AudioContext || W.webkitAudioContext)();', 'import("./x.js");',
    'D.createElement("img");', "D.createElement('audio');", 'D.createElement(`video`);', 'D.createElement("iframe");',
    'D.createElement("script");', 'D.createElement("link");', 'D.createElement("source");', 'D.createElement("object");',
    'D.createElement("embed");', 'D.createElement("STYLE");', 'D.createElement(t);', 'D["createElement"]("img");',
    'FX.el("img", "fx-x", stage);', 'FX.el(t, "fx-x", stage);', 'D.createElementNS("http://www.w3.org/2000/svg", "image");',
    'var u = "http://example.invalid/a";', "var u = 'https://example.invalid/a';", 'var u = "//example.invalid/a";',
    'var u = "data:image/png;base64,AAAA";', 'el.style.background = "url(a.png)";', 'i.src = u;', 'a.href = u;',
    'el.setAttribute("src", u);', 'el.style.cssText = x;', 'sheet.insertRule(x);',
    'W.goatcounter.count({ path: "x" });', 'track("fx_level", "off");', 'D.cookie = "a=1";', 'var d = indexedDB.open("x");',
    'sessionStorage.setItem("k", "v");', 'localStorage.setItem("k", "v");', 'W["localStorage"].setItem("k", "v");',
    'e.preventDefault();', 'var ua = navigator.userAgent;', 'location.href = u;', 'W.open(u);',
    'var a = D.createElement("span"), b = D.createElement("img");', "a.innerHTML = ''; b.innerHTML = x;",
    "el.innerHTML = '' + x;", 'var u = "https:" + hote;', 'var ws = new W.WebSocket(u);',
]
LINT_REFUSED_CSS = [
    '.fx-a { background: url(a.png); }', '.fx-a { background: URL( "https://example.invalid/a.png" ); }',
    '@import "x.css"; .fx-a { color: red; }', '@font-face { font-family: "fx-f"; src: local("x"); } .fx-a { color: red; }',
    '.fx-a { background: image-set("a.png" 1x); }', '.fx-a { background: u\\72l(a.png); }',
    '.answer-btn { color: red; }', '.fx-a { --couleur: red; }', '@keyframes tourne { to { opacity: 0; } }',
]
LINT_ACCEPTED_JS = [
    "var el = FX.el('div', 'fx-x', stage), b = D.createElement('button'), cv = D.createElement(\"canvas\");",
    "W.addEventListener('scroll', function () { FX.cancel('cue'); }, { passive: true });",
    'c2d.drawImage(g.cv, -g.s / 2, -g.s / 2, g.s, g.s);', 'var h = n < 0 ? null : autoState.history[n];',
    "FX.emit('tm:tf', { type: type, data: data, ok: a / b > 1 }, 'q'); // voir http://exemple.invalid",
    "el.innerHTML = '';", "if (handlers['fx:input']) dispatch('fx:input', e.type === 'keydown' ? 'key' : 'pointer');",
    "D.documentElement[c ? 'setAttribute' : 'removeAttribute']('data-fx-combo-off', '');",
    "var p = D.createElementNS('http://www.w3.org/2000/svg', 'path');", "FX.play('tf-juste', function (niveau, pal) {});",
    "el.setAttribute('aria-hidden', 'true'); el.style.pointerEvents = 'none'; el.style.setProperty('--fx-c', o.color);",
    "var y = W.scrollY, list = ['off', 'leger', 'complet'], k = FX.pick(['BAM !', 'PAF !']);",
    "var o = { http: 1, ws: 2 }, v = ok ? o.http : o.ws; a.innerHTML = ''; b.innerHTML = \"\";",
]
LINT_ACCEPTED_CSS = [
    'html[data-fx="off"] #fx-root { display: none; } .fx-a::before { content: "→"; color: var(--fx-c); --fx-k: 2; }',
    '@media (max-width: 380px) { .fx-a { opacity: .5; } } @keyframes fx-pop { to { opacity: 0; } }',
]


def lint_selftest():
    """Garde-fou des lints : formes interdites refusées (dans un module ordinaire), formes saines acceptées."""
    for src in LINT_REFUSED_JS:
        errs = []
        lint_js('35-game-settings.js', src, errs)       # un nom contenant « settings » n'ouvre aucun droit
        if not errs:
            raise BuildError('auto-test des lints : forme interdite acceptée : %s' % src)
    for src in LINT_REFUSED_CSS:
        errs = []
        lint_css('35-essai.css', src, errs)
        if not errs:
            raise BuildError('auto-test des lints : CSS interdit accepté : %s' % src)
    for src in LINT_ACCEPTED_JS:
        errs = []
        lint_js(ENGINE_FRAGMENT if 'createElement(tag)' in src else '35-essai.js', src, errs)
        if errs:
            raise BuildError('auto-test des lints : forme saine refusée : %s\n  %s' % (src, errs[0]))
    for src in LINT_ACCEPTED_CSS:
        errs = []
        lint_css('35-essai.css', src, errs)
        if errs:
            raise BuildError('auto-test des lints : CSS sain refusé : %s\n  %s' % (src, errs[0]))
    errs = []
    lint_js(STORAGE_FRAGMENT, 'try { localStorage.setItem(FX_KEY, v); } catch (e) {}', errs)
    lint_js(ENGINE_FRAGMENT, 'var el = D.createElement(tag);', errs)
    if errs:
        raise BuildError('auto-test des lints : exception du noyau refusée : %s' % errs[0])


# ─────────────────────────────── assemblage ───────────────────────────────

def is_kernel(name):
    m = re.match(r'(\d+)', name)
    return bool(m) and (int(m.group(1)) <= 9 or int(m.group(1)) == 99)


def list_fragments(src_dir, ext, modules):
    names = sorted(f for f in os.listdir(src_dir) if f.endswith(ext) and re.match(r'\d\d-', f))
    if modules is not None:
        names = [f for f in names if is_kernel(f) or any(k and k in f for k in modules)]
    return names


def indent(text):
    return ''.join(('  ' + ln if ln.strip() else ln) for ln in text.splitlines(True))


# ── contrat avec classique.html ──

def has_function(src, name):
    """Déclaration de fonction globale (seule forme que FX.wrap sait envelopper : window[nom])."""
    return re.search(r'(?m)^[ \t]*(?:async[ \t]+)?function[ \t]+%s[ \t]*\(' % re.escape(name), src) is not None


def has_variable(src, name):
    return re.search(r'(?m)^[ \t]*(?:let|const|var)[ \t]+%s\b' % re.escape(name), src) is not None


def read_profiles(kernel_code):
    """Tableau FX.PROFILES du noyau : { écran: profil }. Lève BuildError s'il est illisible."""
    m = re.search(r'FX\.PROFILES\s*=\s*\{(.*?)\}\s*;', kernel_code, re.S)
    table = {}
    if m:
        for k1, k2, k3, prof in re.findall(r'''(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*['"]([\w-]+)['"]''', m.group(1)):
            table[k1 or k2 or k3] = prof
    if SOBER_PROFILE not in table.values():
        raise BuildError('FX.PROFILES illisible dans le noyau (aucun écran de profil « %s ») : le contrôle des écrans '
                         'des épreuves ne peut pas être fait — adapter read_profiles() dans tools/build_anime.py' % SOBER_PROFILE)
    return table


def check_contract(src, kernel_code, kernel_wrapped, mirror_wrapped, module_wrapped, report, errors):
    """Ce que la couche attend de classique.html. Noyau et arène : erreurs (construction refusée). Autres modules :
    avertissements. mirror_wrapped : { fonction: fragment } pour les fragments de MIRROR_FRAGMENTS."""
    for name in sorted(kernel_wrapped):
        if not has_function(src, name):
            errors.append('contrat du noyau : la fonction « %s » (enveloppée par le noyau) n\'est plus déclarée dans classique.html' % name)
    for name in sorted(set(mirror_wrapped) - kernel_wrapped):
        if not has_function(src, name):
            errors.append('contrat de l\'arène : la fonction « %s » (enveloppée par %s, qui tient l\'arène du QCM à l\'image '
                          'du jeu) n\'est plus déclarée dans classique.html — sans ce crochet l\'arène afficherait un état faux'
                          % (name, mirror_wrapped[name]))
    for name in KERNEL_CALLS:
        if not has_function(src, name):
            errors.append('contrat du noyau : la fonction « %s » (appelée par le noyau) n\'est plus déclarée dans classique.html' % name)
    for name in KERNEL_VARS:
        if not has_variable(src, name):
            errors.append('contrat du noyau : la variable globale « %s » (lue par le noyau) n\'est plus déclarée dans classique.html' % name)
    for token, _witness, role in KERNEL_MARKS:
        if token not in src:
            errors.append('contrat du noyau : repère « %s » absent de classique.html — %s' % (token, role))
    screens = set(re.findall(r'\bid="screen-([\w-]+)"', src))
    profiles = read_profiles(kernel_code)
    for screen in sorted(profiles):
        if screen in screens:
            continue
        if profiles[screen] == SOBER_PROFILE:
            errors.append('contrat du noyau : l\'écran d\'épreuve « screen-%s » (profil « %s ») n\'existe plus dans classique.html — '
                          'sous un autre nom, il jouerait au profil par défaut, sans plafond' % (screen, SOBER_PROFILE))
        else:
            report['warnings'].append('écran « screen-%s » de FX.PROFILES absent de classique.html' % screen)
    unknown = sorted(screens - set(profiles))
    if unknown:
        report['warnings'].append('écran(s) de classique.html sans profil dans FX.PROFILES (profil « home » par défaut, plein niveau — '
                                  'à classer, surtout une épreuve) : ' + ', '.join('screen-' + x for x in unknown))
    for token, _witness, role in SOFT_MARKS:
        if token not in src:
            report['warnings'].append('repère « %s » absent de classique.html : %s indisponible' % (token, role))
    if not any(token in src for token, _w, _r in SETTING_MARKS):
        errors.append('contrat du noyau : aucun point de montage du réglage « Animations » dans classique.html '
                      '(le joueur ne pourrait plus couper les animations)')
    missing = sorted(w for w in module_wrapped - kernel_wrapped - set(mirror_wrapped) if not has_function(src, w))
    if missing:
        report['warnings'].append('fonction(s) enveloppée(s) par un module absente(s) de classique.html : %s — le crochet '
                                  'correspondant est inactif (FX.stats().missing), le reste de la couche fonctionne'
                                  % ', '.join(missing))
    # Les listes ci-dessus décrivent le noyau : un nom qu'il ne lit plus est une liste périmée.
    for name in KERNEL_CALLS + KERNEL_VARS:
        if not re.search(r'\b%s\b' % re.escape(name), kernel_code):
            report['warnings'].append('tools/build_anime.py : « %s » est exigé de classique.html mais le noyau ne le lit plus '
                                      '(liste du contrat périmée)' % name)
    for token, witness, _role in KERNEL_MARKS + SOFT_MARKS:
        if witness not in kernel_code:
            report['warnings'].append('tools/build_anime.py : le repère « %s » est attendu de classique.html mais le noyau ne '
                                      'le lit plus (liste du contrat périmée)' % token)


def build(modules=None, keep_comments=False, src_dir=SRC_DIR):
    """Renvoie (html, rapport). Lève BuildError si un contrôle bloquant échoue."""
    selftest()
    lint_selftest()
    src = read(SRC_HTML)
    report = {'warnings': [], 'sizes': [], 'md5_src': hashlib.md5(src.encode('utf-8')).hexdigest()}
    errors = []

    for anchor in ('</head>', '</body>', '<script>', '</script>', '<style>', '</style>'):
        if src.count(anchor) != 1:
            errors.append('classique.html : « %s » doit apparaître exactement une fois (trouvé %d)' % (anchor, src.count(anchor)))
    if not src.endswith(TAIL):
        crlf = src.count('\r\n')
        if crlf and src.replace('\r\n', '\n').endswith(TAIL):
            errors.append('classique.html : fins de ligne CRLF (Windows) sur %d lignes — cause probable de cet échec : la '
                          'construction attend des fins de ligne LF (index.html est une copie exacte de classique.html).\n'
                          '  Le dépôt impose LF par .gitattributes : vérifier qu\'il est présent et que l\'éditeur '
                          'n\'enregistre pas en CRLF, puis supprimer classique.html et le restaurer '
                          '(git checkout -- classique.html), ou le convertir en LF.' % crlf)
        else:
            errors.append('classique.html : la fin attendue </script>\\n</body>\\n</html>\\n est absente'
                          + (' (le fichier contient des retours chariot « \\r » : fins de ligne à vérifier)' if '\r' in src else ''))
    if not DOCTYPE.match(src.replace('\r\n', '\n')):             # (des fins de ligne CRLF sont signalées plus haut)
        errors.append('classique.html : la première ligne doit être <!DOCTYPE html> (le bandeau « fichier '
                      'généré » de index.html se pose juste après elle)')
    if 'fx-' in src or re.search(r'\bFX\b', src):
        report['warnings'].append('classique.html contient déjà « fx- » ou « FX » : risque de collision')
    if errors:
        raise BuildError('\n'.join(errors))

    css_names = list_fragments(src_dir, '.css', modules)
    js_names = list_fragments(src_dir, '.js', modules)
    if not js_names:
        raise BuildError('aucun fragment JS dans ' + src_dir)

    css_parts = []
    for name in css_names:
        raw = read(os.path.join(src_dir, name))
        clean = lint_css(name, raw, errors)
        css_parts.append('/* %s */\n%s' % (name, raw if keep_comments else clean))
        report['sizes'].append((name, len(raw.encode('utf-8')), len(css_parts[-1].encode('utf-8'))))

    js_parts = []
    kernel_wrapped, module_wrapped, mirror_wrapped, kernel_code = set(), set(), {}, []
    for name in js_names:
        raw = read(os.path.join(src_dir, name))
        try:
            code = lint_js(name, raw, errors)
            body = raw if keep_comments else strip_js(raw)
        except BuildError as e:
            raise BuildError('%s : %s' % (name, e))
        names = set(m.group(2) for m in re.finditer(r'''FX\.wrap\(\s*(['"])(\w+)\1''', code))
        if not body.endswith('\n'):
            body += '\n'
        if is_kernel(name):
            kernel_wrapped |= names
            kernel_code.append(code)
            js_parts.append('/* %s */\n%s' % (name, body))
        else:      # module : portée et try privés
            module_wrapped |= names
            if name in MIRROR_FRAGMENTS:
                mirror_wrapped.update((n, name) for n in names)
            js_parts.append("/* %s */\ntry { (function () {\n%s})(); } catch (e) { oops(e, 'fragment:%s'); }\n"
                            % (name, body, name))
        report['sizes'].append((name, len(raw.encode('utf-8')), len(js_parts[-1].encode('utf-8'))))
    # Contrat : ce que la couche attend de classique.html (noyau = bloquant, modules = avertissement).
    check_contract(src, '\n'.join(kernel_code), kernel_wrapped, mirror_wrapped, module_wrapped, report, errors)
    if modules is None:
        for name in MIRROR_FRAGMENTS:
            if name not in js_names:
                report['warnings'].append('tools/build_anime.py : le fragment « %s » de MIRROR_FRAGMENTS n\'existe plus '
                                          '(liste du contrat périmée)' % name)
    if errors:
        raise BuildError('\n'.join(errors))
    report['wrapped'] = sorted(kernel_wrapped | module_wrapped)

    css = ('/* Couche d\'animation — généré par tools/build_anime.py depuis anime-src/. Ne pas éditer ici. */\n'
           + ''.join(css_parts))
    js = ('/* Couche d\'animation — généré par tools/build_anime.py depuis anime-src/. Ne pas éditer ici.\n'
          '   Une seule globale : FX. Voir anime-src/README.md. */\n'
          '(function () {\n\'use strict\';\n' + ''.join(js_parts) + '})();\n')
    if re.search(r'(?i)</script|<!--', js) or re.search(r'(?i)</style', css):
        raise BuildError('la couche assemblée contient </script, <!-- ou </style')

    first = DOCTYPE.match(src).end()
    html = src[:first] + BANNER + src[first:]
    html = html.replace('</head>', '<style id="fx-style">\n' + css + '</style>\n</head>', 1)
    # Pas de saut de ligne entre les deux scripts : <body> ne gagne aucun nœud texte.
    html = html[:-len(TAIL)] + '</script><script id="fx-script">\n' + js + TAIL

    report['layer_css'] = len(css.encode('utf-8'))
    report['layer_js'] = len(js.encode('utf-8'))
    report['src_total'] = sum(s for _n, s, _i in report['sizes'])
    report['src_bytes'] = len(src.encode('utf-8'))
    report['out_bytes'] = len(html.encode('utf-8'))
    if report['layer_css'] + report['layer_js'] > SIZE_WARN:
        report['warnings'].append('couche = %d octets : au-dessus du plafond de %d'
                                  % (report['layer_css'] + report['layer_js'], SIZE_WARN))
    node_checks(html, report)
    return html, report


def node_checks(html, report):
    """« node --check » sur le script du jeu, sur le script FX, puis sur les deux à la suite
    (détecte une collision de déclarations lexicales). Ignoré avec un avertissement sans node."""
    blocks = re.findall(r'<script\b[^>]*>(.*?)</script>', html, re.S)
    if len(blocks) != 2:
        raise BuildError('index.html doit contenir exactement 2 blocs <script> (trouvé %d)' % len(blocks))
    if not blocks[1].lstrip().startswith('/*') or '(function () {' not in blocks[1][:400]:
        raise BuildError('le bloc FX ne commence pas par l\'IIFE attendue')
    node = shutil.which('node')
    if not node:
        report['warnings'].append('node introuvable : contrôles de syntaxe ignorés')
        report['node'] = 'ignoré'
        return
    tmp = tempfile.mkdtemp(prefix='build_anime_')
    try:
        for label, code in (('jeu', blocks[0]), ('fx', blocks[1]), ('jeu+fx', blocks[0] + '\n;\n' + blocks[1])):
            path = os.path.join(tmp, label.replace('+', '_') + '.js')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(code)
            res = subprocess.run([node, '--check', path], capture_output=True, text=True)
            if res.returncode != 0:
                raise BuildError('node --check a échoué sur le bloc « %s » :\n%s' % (label, res.stderr.strip()[:1500]))
        report['node'] = 'ok (jeu, fx, jeu+fx)'
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def annotate(kind, message):
    """Annotation GitHub Actions (« ::warning:: » / « ::error:: ») : une ligne, sauts de ligne encodés."""
    text = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print('::%s title=Page principale (index.html)::%s' % (kind, text))


def main():
    ap = argparse.ArgumentParser(description='Construit index.html (classique.html + couche d\'animation).')
    ap.add_argument('--check', action='store_true', help='code 1 si le fichier de sortie diffère d\'une construction fraîche')
    ap.add_argument('--out', default=OUT_HTML, help='chemin de sortie (défaut : index.html à la racine)')
    ap.add_argument('--modules', default=None, help='clés de modules à inclure, séparées par des virgules')
    ap.add_argument('--keep-comments', action='store_true', help='ne retire pas les commentaires des sources')
    ap.add_argument('--src', default=SRC_DIR, help='dossier des fragments (défaut : anime-src/)')
    ap.add_argument('--ci', action='store_true', help='écrit aussi avertissements et refus en annotations GitHub Actions '
                                                      '(automatique si GITHUB_ACTIONS=true)')
    args = ap.parse_args()
    modules = None if args.modules is None else [k.strip() for k in args.modules.split(',') if k.strip()]
    ci = args.ci or os.environ.get('GITHUB_ACTIONS') == 'true'

    try:
        html, rep = build(modules, args.keep_comments, args.src)
    except BuildError as e:
        print('ÉCHEC de la construction (rien n\'est écrit) :\n' + str(e), file=sys.stderr)
        if ci:
            annotate('error', 'build_anime.py : construction refusée, rien n\'est écrit.\n' + str(e))
        return 2

    for w in rep['warnings']:
        print('AVERTISSEMENT : ' + w, file=sys.stderr)
        if ci:
            annotate('warning', 'build_anime.py : ' + w)
    print('classique.html md5 %s  %d octets (lu seulement)' % (rep['md5_src'], rep['src_bytes']))
    for name, size, injected in rep['sizes']:      # source -> injecté (commentaires retirés, enveloppe du module comprise)
        print('  %-22s %6d octets -> %6d injectés' % (name, size, injected))
    print('sources        %d octets | couche injectée : css %d + js %d = %d octets'
          % (rep['src_total'], rep['layer_css'], rep['layer_js'], rep['layer_css'] + rep['layer_js']))
    print('%-14s %d octets (+%d)' % (os.path.basename(args.out), rep['out_bytes'], rep['out_bytes'] - rep['src_bytes']))
    print('node --check   %s | fonctions enveloppées : %s' % (rep.get('node'), ', '.join(rep['wrapped']) or '-'))

    data = html.encode('utf-8')
    if args.check:
        try:
            with open(args.out, 'rb') as f:
                same = f.read() == data
        except OSError:
            same = False
        print('--check : %s' % ('à jour' if same else 'DIFFÉRENT — relancer python3 tools/build_anime.py'))
        return 0 if same else 1

    out = os.path.abspath(args.out)
    if os.path.realpath(SRC_HTML) == os.path.realpath(out) or (os.path.exists(out) and os.path.samefile(SRC_HTML, out)):
        print('ÉCHEC : la sortie ne peut pas être classique.html (le fichier source, édité à la main) : rien n\'est écrit',
              file=sys.stderr)
        if ci:
            annotate('error', 'build_anime.py : la sortie ne peut pas être classique.html, rien n\'est écrit.')
        return 2
    fd, tmp = tempfile.mkstemp(prefix='.anime_', suffix='.tmp', dir=os.path.dirname(out) or '.')
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    os.chmod(tmp, 0o644)       # mkstemp crée en 0600 : GitHub Pages exige des fichiers lisibles par tous
    os.replace(tmp, out)
    print('écrit          %s' % out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
