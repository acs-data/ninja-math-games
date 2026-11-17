#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Génère anime.html = index.html + la couche d'animation (anime-src/).

    python3 tools/build_anime.py                 construit anime.html
    python3 tools/build_anime.py --check         code 1 si anime.html diffère d'une construction fraîche
    python3 tools/build_anime.py --out CHEMIN    écrit ailleurs (construction de test privée)
    python3 tools/build_anime.py --modules a,b   ne garde que les fragments de module dont le nom
                                                 contient une de ces clés (le noyau est toujours inclus)
    python3 tools/build_anime.py --keep-comments garde les commentaires des sources dans la sortie
    python3 tools/build_anime.py --src DOSSIER   lit les fragments ailleurs que dans anime-src/ (essais)

Règles (voir anime-src/README.md) :
  - index.html n'est JAMAIS modifié (ouvert en lecture seule) ;
  - anime-src/*.css  -> <style id="fx-style"> juste avant </head> ;
  - anime-src/*.js   -> UNE IIFE dans <script id="fx-script"> juste avant </body> ;
      fragments 00-09 et 99 = noyau (portée partagée) ; fragments 10-98 = modules, chacun isolé
      dans sa propre fonction et son propre try (aucune collision de noms possible) ;
  - sortie déterministe (aucune date), commentaires retirés, écriture atomique ;
  - contrôles bloquants (lints) + « node --check » sur chaque bloc de script.
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
SRC_HTML = os.path.join(ROOT, 'index.html')
SRC_DIR = os.path.join(ROOT, 'anime-src')
OUT_HTML = os.path.join(ROOT, 'anime.html')
SIZE_WARN = 90 * 1024          # D7 : couche entière <= ~90 Ko

# Retouches du <head> : chaque ancre doit exister exactement une fois dans index.html.
HEAD_PATCHES = [
    ('<title>Anime Math Academy — Maths Collège 6e → 3e en mode anime</title>',
     '<title>Anime Math Academy — Édition animée · Maths Collège 6e → 3e</title>'),
    ('<meta name="description" content="Jeu éducatif gratuit pour réviser',
     '<meta name="description" content="Édition animée (combats, effets visuels, écran de résultat animé) '
     'du jeu éducatif gratuit pour réviser'),
    ('<meta name="application-name" content="Anime Math Academy">',
     '<meta name="application-name" content="Anime Math Academy — Édition animée">'),
    ('<meta name="apple-mobile-web-app-title" content="Math Academy">',
     '<meta name="apple-mobile-web-app-title" content="Math Animé">'),
    ('<link rel="manifest" href="manifest.json">',
     '<link rel="manifest" href="manifest-anime.json">'),
    ('<meta property="og:title" content="Anime Math Academy 🥷 — Maths Collège 6e → 3e + DNB 2027">',
     '<meta property="og:title" content="Anime Math Academy 🥷 — Édition animée · Maths Collège 6e → 3e + DNB 2027">'),
    ('<meta property="og:description" content="Révise les maths',
     '<meta property="og:description" content="Édition animée : révise les maths'),
    ('<meta name="twitter:title" content="Anime Math Academy 🥷 — Maths Collège 6e → 3e + DNB 2027">',
     '<meta name="twitter:title" content="Anime Math Academy 🥷 — Édition animée · Maths Collège 6e → 3e + DNB 2027">'),
    ('<meta name="twitter:description" content="Le jeu de maths qui',
     '<meta name="twitter:description" content="Édition animée : le jeu de maths qui'),
]
TAIL = '</script>\n</body>\n</html>\n'

# Ce dont le noyau a besoin dans index.html (simple avertissement si absent).
CONTRACT_IDS = ['id="app"', 'class="drawer-body"', 'class="home-actions"', 'id="drawer-save-toggle"',
                'id="theme-toggle-btn"', 'id="modal-pause"', 'id="modal-auto-pause"']
CONTRACT_NAMES = ['state', 'currentUniverse', 'UNIVERSES', 'CHARS']


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

JS_FORBIDDEN = [
    (r'Math\s*\.\s*random', 'Math.random interdit (utiliser FX.rnd : la couche a son propre générateur)'),
    (r'\.\s*focus\s*\(', '.focus( interdit (la couche ne déplace jamais le focus)'),
    (r'\.\s*blur\s*\(', '.blur( interdit'),
    (r'scrollIntoView|\bscrollTo\s*\(|\bscrollBy\s*\(', 'défilement interdit'),
    (r'\bshowToast\s*\(', 'showToast( interdit (région live + toast de mise à jour)'),
    (r'\bannounceToScreenReader\s*\(', 'announceToScreenReader( interdit (région live partagée)'),
    (r'\beval\s*\(', 'eval interdit'),
    (r'\bnew\s+Function\b', 'new Function interdit'),
    (r'stop(Immediate)?Propagation', 'stopPropagation interdit (délégation de clic du jeu)'),
    (r'document\s*\.\s*write|insertAdjacentHTML|\.\s*outerHTML\s*=', 'injection HTML interdite'),
    (r'(?i)</script', '</script interdit dans le JS'),
    (r'<!--', '<!-- interdit dans le JS'),
]
JS_SETTINGS_ONLY = [
    (r'preventDefault', 'preventDefault interdit hors des boutons de réglage (*settings*.js)'),
    (r'\b(localStorage|sessionStorage)\b', 'stockage interdit hors de *settings*.js (et derrière isSaveEnabled)'),
]
_INNER = re.compile(r'\.\s*innerHTML\s*\+?=\s*(.*)')
_LITERAL = re.compile(r'''^(?:'[^'\\]*'|"[^"\\]*"|`[^`$\\]*`)\s*;?\s*$''')


def lint_js(name, src, errors):
    code = strip_js(src, keep_lines=True)
    is_settings = 'settings' in name
    for ln, line in enumerate(code.split('\n'), 1):
        for rx, msg in JS_FORBIDDEN:
            if re.search(rx, line):
                errors.append('%s:%d : %s' % (name, ln, msg))
        if not is_settings:
            for rx, msg in JS_SETTINGS_ONLY:
                if re.search(rx, line):
                    errors.append('%s:%d : %s' % (name, ln, msg))
        m = _INNER.search(line)
        if m and not _LITERAL.match(m.group(1)):
            errors.append('%s:%d : innerHTML avec une valeur non littérale (utiliser textContent / createElement)' % (name, ln))
    return code


def lint_css(name, src, errors):
    """Tout sélecteur contient « fx- » ou « data-fx » ; @keyframes et variables préfixés fx-."""
    css = strip_css(src)
    if re.search(r'(?i)</style', css):
        errors.append('%s : </style interdit dans le CSS' % name)
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


def build(modules=None, keep_comments=False, src_dir=SRC_DIR):
    """Renvoie (html, rapport). Lève BuildError si un contrôle bloquant échoue."""
    selftest()
    src = read(SRC_HTML)
    report = {'warnings': [], 'sizes': [], 'md5_index': hashlib.md5(src.encode('utf-8')).hexdigest()}
    errors = []

    for anchor in ('</head>', '</body>', '<script>', '</script>', '<style>', '</style>'):
        if src.count(anchor) != 1:
            errors.append('index.html : « %s » doit apparaître exactement une fois (trouvé %d)' % (anchor, src.count(anchor)))
    if not src.endswith(TAIL):
        errors.append('index.html : la fin attendue </script>\\n</body>\\n</html>\\n est absente')
    if 'fx-' in src or re.search(r'\bFX\b', src):
        report['warnings'].append('index.html contient déjà « fx- » ou « FX » : risque de collision')
    for old, _new in HEAD_PATCHES:
        if src.count(old) != 1:
            errors.append('index.html : ancre du <head> introuvable ou multiple : %s' % old[:70])
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
        report['sizes'].append((name, len(raw.encode('utf-8'))))

    js_parts = []
    wrapped = set()
    for name in js_names:
        raw = read(os.path.join(src_dir, name))
        try:
            code = lint_js(name, raw, errors)
            body = raw if keep_comments else strip_js(raw)
        except BuildError as e:
            raise BuildError('%s : %s' % (name, e))
        wrapped.update(m.group(2) for m in re.finditer(r'''FX\.wrap\(\s*(['"])(\w+)\1''', code))
        if not body.endswith('\n'):
            body += '\n'
        if is_kernel(name):
            js_parts.append('/* %s */\n%s' % (name, body))
        else:      # module : portée et try privés
            js_parts.append("/* %s */\ntry { (function () {\n%s})(); } catch (e) { oops(e, 'fragment:%s'); }\n"
                            % (name, body, name))
        report['sizes'].append((name, len(raw.encode('utf-8'))))
    if errors:
        raise BuildError('\n'.join(errors))

    css = ('/* Couche d\'animation — généré par tools/build_anime.py depuis anime-src/. Ne pas éditer ici. */\n'
           + ''.join(css_parts))
    js = ('/* Couche d\'animation — généré par tools/build_anime.py depuis anime-src/. Ne pas éditer ici.\n'
          '   Une seule globale : FX. Voir anime-src/README.md. */\n'
          '(function () {\n\'use strict\';\n' + ''.join(js_parts) + '})();\n')
    if re.search(r'(?i)</script|<!--', js) or re.search(r'(?i)</style', css):
        raise BuildError('la couche assemblée contient </script, <!-- ou </style')

    # Contrat : chaque fonction enveloppée existe-t-elle encore dans index.html ? (avertissement)
    missing = sorted(w for w in wrapped if not re.search(r'\bfunction\s+%s\s*\(' % re.escape(w), src))
    if missing:
        report['warnings'].append('fonctions enveloppées absentes de index.html : ' + ', '.join(missing))
    for token in CONTRACT_IDS:
        if token not in src:
            report['warnings'].append('repère du noyau absent de index.html : ' + token)
    for ident in CONTRACT_NAMES:
        if not re.search(r'\b(let|const)\s+%s\b' % ident, src):
            report['warnings'].append('variable du jeu absente de index.html : ' + ident)
    report['wrapped'] = sorted(wrapped)

    html = src
    for old, new in HEAD_PATCHES:
        html = html.replace(old, new, 1)
    html = html.replace('</head>', '<style id="fx-style">\n' + css + '</style>\n</head>', 1)
    # Pas de saut de ligne entre les deux scripts : <body> ne gagne aucun nœud texte.
    html = html[:-len(TAIL)] + '</script><script id="fx-script">\n' + js + TAIL

    report['layer_css'] = len(css.encode('utf-8'))
    report['layer_js'] = len(js.encode('utf-8'))
    report['src_total'] = sum(s for _n, s in report['sizes'])
    report['index_bytes'] = len(src.encode('utf-8'))
    report['anime_bytes'] = len(html.encode('utf-8'))
    if report['layer_css'] + report['layer_js'] > SIZE_WARN:
        report['warnings'].append('couche = %d octets : au-dessus du budget de %d (D7)'
                                  % (report['layer_css'] + report['layer_js'], SIZE_WARN))
    node_checks(html, report)
    return html, report


def node_checks(html, report):
    """« node --check » sur le script du jeu, sur le script FX, puis sur les deux à la suite
    (détecte une collision de déclarations lexicales). Ignoré avec un avertissement sans node."""
    blocks = re.findall(r'<script\b[^>]*>(.*?)</script>', html, re.S)
    if len(blocks) != 2:
        raise BuildError('anime.html doit contenir exactement 2 blocs <script> (trouvé %d)' % len(blocks))
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


def main():
    ap = argparse.ArgumentParser(description='Construit anime.html (index.html + couche d\'animation).')
    ap.add_argument('--check', action='store_true', help='code 1 si le fichier de sortie diffère d\'une construction fraîche')
    ap.add_argument('--out', default=OUT_HTML, help='chemin de sortie (défaut : anime.html à la racine)')
    ap.add_argument('--modules', default=None, help='clés de modules à inclure, séparées par des virgules')
    ap.add_argument('--keep-comments', action='store_true', help='ne retire pas les commentaires des sources')
    ap.add_argument('--src', default=SRC_DIR, help='dossier des fragments (défaut : anime-src/)')
    args = ap.parse_args()
    modules = None if args.modules is None else [k.strip() for k in args.modules.split(',') if k.strip()]

    try:
        html, rep = build(modules, args.keep_comments, args.src)
    except BuildError as e:
        print('ÉCHEC de la construction :\n' + str(e), file=sys.stderr)
        return 2

    for w in rep['warnings']:
        print('AVERTISSEMENT : ' + w, file=sys.stderr)
    print('index.html   md5 %s  %d octets (lu seulement)' % (rep['md5_index'], rep['index_bytes']))
    for name, size in rep['sizes']:
        print('  %-22s %6d octets' % (name, size))
    print('sources      %d octets | couche injectée : css %d + js %d = %d octets'
          % (rep['src_total'], rep['layer_css'], rep['layer_js'], rep['layer_css'] + rep['layer_js']))
    print('anime.html   %d octets (+%d)' % (rep['anime_bytes'], rep['anime_bytes'] - rep['index_bytes']))
    print('node --check %s | fonctions enveloppées : %s' % (rep.get('node'), ', '.join(rep['wrapped']) or '-'))

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
    if os.path.abspath(SRC_HTML) == out:
        print('ÉCHEC : la sortie ne peut pas être index.html', file=sys.stderr)
        return 2
    fd, tmp = tempfile.mkstemp(prefix='.anime_', suffix='.tmp', dir=os.path.dirname(out) or '.')
    with os.fdopen(fd, 'wb') as f:
        f.write(data)
    os.replace(tmp, out)
    print('écrit        %s' % out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
