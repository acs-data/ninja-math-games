/* Scénario « build » : la chaîne de construction et l'étape de déploiement (aucun fragment ne porte ce numéro).
   Chargé par tools/test_anime.js (voir HELPERS). Tout se passe dans une COPIE de travail jetable (dossier
   temporaire) : index.html, anime.html, anime-src/, tools/build_anime.py et le workflow y sont copiés, puis
   index.html y est retouché comme le ferait un mainteneur. Le dépôt n'est jamais modifié.

   · <head> tolérant     : un <title> ou une description retouchés, une balise optionnelle absente ne figent plus
                           l'édition (construction réussie, avertissement) ; seul le lien du manifest est exigé.
   · contrat du noyau    : une fonction, une variable ou un repère dont le NOYAU dépend a disparu d'index.html →
                           échec, rien n'est écrit (l'anime.html précédent reste en place, plus ancien mais
                           cohérent). De même pour un crochet des fragments qui tiennent l'arène du QCM.
                           Une fonction enveloppée par un AUTRE module a disparu → avertissement, et la page
                           construite reste cohérente (prouvé en la jouant).
   · étape du déploiement : les lignes « run: » de .github/workflows/pages.yml sont extraites et rejouées avec
                           bash (GITHUB_ACTIONS=true) : elles ne font jamais échouer le déploiement, annotent un
                           anime.html versionné périmé, et annotent une construction refusée.
   · fins de ligne       : index.html en CRLF → l'erreur nomme la cause ; .gitattributes impose LF.

   Dépendances : python3 (variable PYTHON pour un autre nom) et bash, en plus de Playwright. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

module.exports = function (h) {
  const { check, wait, ROOT } = h;
  const PY = process.env.PYTHON || 'python3';
  const COPIED = ['index.html', 'anime.html', 'manifest.json', 'manifest-anime.json', 'sw.js'];

  /* Copie de travail : les fichiers dont dépend la construction, et le workflow. */
  function workdir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-build-'));
    COPIED.forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)));
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.copyFileSync(path.join(ROOT, 'tools', 'build_anime.py'), path.join(dir, 'tools', 'build_anime.py'));
    fs.mkdirSync(path.join(dir, 'anime-src'));
    fs.readdirSync(path.join(ROOT, 'anime-src')).forEach((f) => fs.copyFileSync(path.join(ROOT, 'anime-src', f), path.join(dir, 'anime-src', f)));
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, '.github', 'workflows', 'pages.yml'), path.join(dir, '.github', 'workflows', 'pages.yml'));
    return dir;
  }
  const env = (extra) => {
    const e = Object.assign({}, process.env, extra || {});
    if (!extra || !('GITHUB_ACTIONS' in extra)) delete e.GITHUB_ACTIONS;      // la suite peut tourner dans une CI
    return e;
  };
  function build(dir, args, extra) {
    const r = spawnSync(PY, [path.join(dir, 'tools', 'build_anime.py')].concat(args || []), { cwd: dir, encoding: 'utf8', env: env(extra) });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || ''), spawn: r.error ? String(r.error) : '' };
  }
  const ORIGINAL = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const COMMITTED = fs.readFileSync(path.join(ROOT, 'anime.html'));
  /* Remet la copie dans l'état du dépôt, puis applique une retouche à index.html. */
  function reset(dir, mutate) {
    const src = mutate ? mutate(ORIGINAL) : ORIGINAL;
    if (mutate && src === ORIGINAL) throw new Error('retouche sans effet : le test ne prouverait rien');
    fs.writeFileSync(path.join(dir, 'index.html'), src);
    fs.writeFileSync(path.join(dir, 'anime.html'), COMMITTED);
    return src;
  }
  const kept = (dir) => fs.readFileSync(path.join(dir, 'anime.html')).equals(COMMITTED);
  const rename = (from, to) => (s) => s.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
  const swap = (from, to) => (s) => s.split(from).join(to);
  const warns = (r) => r.err.split('\n').filter((l) => /^AVERTISSEMENT/.test(l));
  const notes = (r, kind) => r.all.split('\n').filter((l) => new RegExp('^::' + kind + '[ :]').test(l));
  const short = (r) => ({ code: r.code, err: r.err.slice(0, 400), spawn: r.spawn });

  /* Les lignes « run: | » de l'étape du workflow qui reconstruit anime.html, telles qu'elles seront exécutées. */
  function ciScript(dir) {
    const lines = fs.readFileSync(path.join(dir, '.github', 'workflows', 'pages.yml'), 'utf8').split('\n');
    const start = lines.findIndex((l) => /^\s*- name:.*anime\.html/.test(l));
    if (start < 0) return null;
    let end = lines.findIndex((l, k) => k > start && /^\s*- name:/.test(l));
    if (end < 0) end = lines.length;
    const run = lines.findIndex((l, k) => k > start && k < end && /^\s*run:\s*\|\s*$/.test(l));
    if (run < 0) return null;
    const indent = lines[run].match(/^\s*/)[0].length;
    const body = [];
    for (let k = run + 1; k < end; k++) {
      if (lines[k].trim() && lines[k].match(/^\s*/)[0].length <= indent) break;
      body.push(lines[k]);
    }
    const pad = Math.min.apply(null, body.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    return body.map((l) => l.slice(pad)).join('\n') + '\n';
  }
  /* GitHub exécute « run » avec « bash -e {0} » : même appel ici, dans la copie, comme dans un déploiement. */
  function ciStep(dir, script) {
    const file = path.join(dir, 'etape-ci.sh');
    fs.writeFileSync(file, script);
    const r = spawnSync('bash', ['-e', file], { cwd: dir, encoding: 'utf8', env: env({ GITHUB_ACTIONS: 'true' }) });
    return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || ''), spawn: r.error ? String(r.error) : '' };
  }

  async function scenarioBuild(browser) {
    const dir = workdir();
    try {
      const out = path.join(dir, 'essai.html');
      const built = () => (fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '');
      const fresh = () => { if (fs.existsSync(out)) fs.unlinkSync(out); };
      let r, html, src;

      /* ── 0. État du dépôt ── */
      reset(dir);
      r = build(dir, ['--check']);
      check('build : l\'anime.html versionné est à jour (build_anime.py --check, code 0)', r.code === 0, short(r));
      check('build : sans CI, aucune annotation « ::warning » ni « ::error »', notes(r, 'warning').length + notes(r, 'error').length === 0, r.all.slice(0, 300));
      /* Inventaire annoncé par le build : la référence des contrôles qui suivent (aucun nombre en dur ici). */
      const wrapped = ((r.out.match(/fonctions enveloppées : (.*)/) || ['', ''])[1]).split(', ').filter(Boolean);
      check('build : le build annonce les fonctions enveloppées, dont celles du noyau', ['showScreen', 'openModal', 'closeModal', 'toggleSave'].every((n) => wrapped.indexOf(n) >= 0), wrapped);

      /* ── 1. <head> tolérant ── */
      const TITLE = 'Anime Math Academy — Maths Collège 6e → 3e + DNB 2027';
      src = reset(dir, (s) => s.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>')
        .replace('<meta name="description" content="Jeu éducatif gratuit pour réviser', '<meta name="description" content="Jeu gratuit et éducatif pour réviser'));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : un <title> et une description retouchés dans index.html ne figent plus l\'édition (code 0, fichier écrit)', r.code === 0 && html.length > src.length, short(r));
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      check('<head> : le titre retouché est repris et porte « Édition animée »', title.indexOf(TITLE) >= 0 && /Édition animée/.test(title), title);
      check('<head> : la description retouchée est reprise et porte « Édition animée »', /Jeu gratuit et éducatif pour réviser/.test(desc) && /^Édition animée/.test(desc), desc.slice(0, 120));
      check('<head> : le manifest de l\'édition est déclaré, et lui seul', /<link rel="manifest" href="manifest-anime\.json">/.test(html) && !/href="manifest\.json"/.test(html), (html.match(/<link rel="manifest"[^>]*>/) || [])[0]);
      check('<head> : chaque retouche générique est signalée (un avertissement par balise au texte inconnu)',
        warns(r).filter((l) => /<title>/.test(l)).length === 1 && warns(r).filter((l) => /description/.test(l)).length === 1, warns(r));
      const body = (s) => s.slice(s.indexOf('<body'));
      check('<head> : le corps de la page reste celui d\'index.html, à la couche près',
        body(html).replace(/<script id="fx-script">[\s\S]*?<\/script>/, '') === body(src), [body(html).length, body(src).length]);
      r = build(dir, ['--out', out, '--ci']);
      check('CI : avec --ci, chaque avertissement est aussi une annotation « ::warning »', warns(r).length > 0 && notes(r, 'warning').length === warns(r).length, [warns(r).length, notes(r, 'warning')]);
      r = build(dir, ['--out', out], { GITHUB_ACTIONS: 'true' });
      check('CI : avec GITHUB_ACTIONS=true, chaque avertissement est aussi une annotation « ::warning »', warns(r).length > 0 && notes(r, 'warning').length === warns(r).length, [warns(r).length, notes(r, 'warning')]);

      src = reset(dir, (s) => s.replace(/<meta name="twitter:title"[^>]*>\n/, ''));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : une balise optionnelle absente (twitter:title) → construction réussie et avertissement qui la nomme',
        r.code === 0 && warns(r).some((l) => /twitter:title/.test(l)) && /og:title" content="[^"]*Édition animée/.test(html), short(r));

      reset(dir, swap('<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json?v=2">'));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : le lien du manifest est reconnu par sa balise (href retouché) et pointe vers manifest-anime.json',
        r.code === 0 && /<link rel="manifest" href="manifest-anime\.json">/.test(html), short(r));

      reset(dir, (s) => s.replace(/<link rel="manifest"[^>]*>\n/, ''));
      fresh(); r = build(dir, ['--out', out]);
      check('<head> : sans lien de manifest (retouche obligatoire) → échec (code 2), rien n\'est écrit', r.code === 2 && !fs.existsSync(out) && /manifest/.test(r.err), short(r));

      /* ── 2. Contrat du noyau : ce dont le noyau dépend est bloquant ── */
      const CRITICAL = [
        ['showScreen', rename('showScreen', 'goScreen')],
        ['openModal', rename('openModal', 'showModal2')],
        ['closeModal', rename('closeModal', 'hideModal2')],
        ['toggleSave', rename('toggleSave', 'switchSave')],
        ['isSaveEnabled', rename('isSaveEnabled', 'saveIsOn')],
        ['state', swap('\nlet state = {', '\nlet gameState = {')],
        ['currentUniverse', swap('\nlet currentUniverse = ', '\nlet activeUniverse = ')],
        ['UNIVERSES', swap('\nconst UNIVERSES = {', '\nconst WORLDS = {')],
        ['CHARS', swap('\nlet CHARS = ', '\nlet HEROES = ')],
        ['id="app"', swap('id="app"', 'id="application"')],
        ['modal-overlay', swap('modal-overlay', 'modal-voile')],
        ['screen-auto', swap('id="screen-auto"', 'id="screen-automatismes"')]
      ];
      for (const [name, mutate] of CRITICAL) {
        reset(dir, mutate);
        r = build(dir, []);
        check('contrat du noyau : « ' + name + ' » absent d\'index.html → échec (code 2) qui le nomme, anime.html précédent conservé',
          r.code === 2 && r.err.indexOf(name) >= 0 && kept(dir), short(r));
      }
      /* L'arène du QCM reflète le jeu par les crochets de 20-arena.js et 21-qcm.js : un seul absent, elle ment. */
      const ARENA = [
        ['loadQuestion', rename('loadQuestion', 'loadQcmQuestion')],
        ['answer', swap('\nfunction answer(', '\nfunction reply(')],
        ['timeOut', rename('timeOut', 'tempsEcoule')],
        ['useJutsu', rename('useJutsu', 'usePower')],
        ['updateTimerUI', rename('updateTimerUI', 'drawTimer')]
      ];
      for (const [name, mutate] of ARENA) {
        reset(dir, mutate);
        r = build(dir, []);
        check('contrat de l\'arène : « ' + name + ' » absent d\'index.html → échec (code 2) qui le nomme, anime.html précédent conservé',
          r.code === 2 && r.err.indexOf(name) >= 0 && /arène/.test(r.err) && kept(dir), short(r));
      }
      reset(dir, rename('showScreen', 'goScreen'));
      r = build(dir, ['--check']);
      check('contrat du noyau : --check échoue de la même façon (code 2, pas « à jour »)', r.code === 2 && !/à jour/.test(r.out), short(r));
      r = build(dir, ['--ci']);
      check('CI : une construction refusée est annotée « ::error » (cause nommée)', r.code === 2 && notes(r, 'error').some((l) => /showScreen/.test(l)), notes(r, 'error'));

      /* ── 3. Fonction enveloppée par un MODULE absente : avertissement, page cohérente ── */
      reset(dir, rename('answerTf', 'answerVraiFaux'));
      fresh(); r = build(dir, ['--out', out, '--ci']);
      check('contrat des modules : « answerTf » absent → construction réussie, avertissement et annotation qui le nomment',
        r.code === 0 && warns(r).some((l) => /answerTf/.test(l)) && notes(r, 'warning').some((l) => /answerTf/.test(l)), short(r));
      if (r.code === 0 && fs.existsSync(out)) {
        const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(() => { try { sessionStorage.setItem('tutorial_seen', '1'); } catch (e) {} });
        await page.goto(pathToFileURL(out).href);
        await wait(page, 300);
        const st = await page.evaluate(() => { const s = FX.stats(); return { missing: s.missing, dead: s.dead, err: s.errCount, wrapped: s.wrapped.length, modules: s.modules }; });
        check('module sans son crochet : la couche démarre saine (seul « answerTf » manque, toutes les autres enveloppes posées, tous les modules démarrés, aucune erreur)',
          st.missing.join() === 'answerTf' && !st.dead && st.err === 0 && st.wrapped === wrapped.length - 1 && Object.keys(st.modules).length > 1 && Object.keys(st.modules).every((m) => st.modules[m] === 'ok'), [st, wrapped.length]);
        const rest = await page.evaluate(async () => {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
          FX.debug.log.length = 0;
          startGame('6e_facile');
          for (let i = 0; i < 100 && getComputedStyle(document.getElementById('screen-game')).display === 'none'; i++) await sleep(50);
          await sleep(200);
          answer(state.questions[state.qIndex].correct);
          await sleep(500);
          const qcm = FX.debug.log.map((e) => e.fx);
          showHome(); await sleep(100);
          startAutoMode('auto_6e'); await sleep(200);
          const o = { qcm, score: state.score, profile: FX.env.profile(), effective: FX.effective(), burst: FX.fx.burst(100, 100, { n: 30 }), err: FX.stats().errCount, dead: FX.stats().dead };
          exitAutoMode(); await sleep(100);
          return o;
        });
        check('module sans son crochet : les autres modules jouent (combat du QCM), l\'épreuve reste sobre (léger, zéro particule)',
          rest.qcm.some((n) => /^qcm-juste/.test(n)) && rest.score > 0 && rest.profile === 'sobre' && rest.effective === 1 && rest.burst === 0 && rest.err === 0 && !rest.dead, rest);
        const tf = await page.evaluate(async () => {
          FX.debug.log.length = 0;
          startTrueFalse();
          await new Promise((res) => setTimeout(res, 400));
          answerVraiFaux(tfState.questions[tfState.qIdx].isTrue);
          await new Promise((res) => setTimeout(res, 400));
          const o = { correct: tfState.correct, screen: FX.env.screen(), profile: FX.env.profile(), log: FX.debug.log.map((e) => e.fx) };
          quitTrueFalse();
          return o;
        });
        check('module sans son crochet : le Vrai/Faux se joue (bonne réponse comptée), sans verdict animé, écran et profil suivis',
          tf.correct === 1 && tf.screen === 'tf' && tf.profile === 'duel' && !tf.log.some((n) => /^tf-/.test(n)), tf);
        check('module sans son crochet : aucune erreur de page', errors.length === 0, errors);
        await ctx.close();
      }

      /* ── 4. Étape du déploiement, rejouée telle qu'elle est écrite dans pages.yml ── */
      const script = ciScript(dir);
      check('étape CI : les lignes « run: » de l\'étape anime.html sont lisibles dans pages.yml', !!script && /build_anime\.py/.test(script), script);
      if (script) {
        reset(dir);
        r = ciStep(dir, script);
        check('étape CI, dépôt à jour : code 0, aucune annotation, anime.html inchangé',
          r.code === 0 && notes(r, 'warning').length + notes(r, 'error').length === 0 && kept(dir), [short(r), notes(r, 'warning'), notes(r, 'error')]);

        /* Cas 1 : index.html corrigé et <title> retouché, sans reconstruction locale. */
        reset(dir, (s) => s.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>').replace('const GOATCOUNTER_CODE', '/* CORRECTIF-QUESTION */ const GOATCOUNTER_CODE'));
        r = ciStep(dir, script);
        html = fs.readFileSync(path.join(dir, 'anime.html'), 'utf8');
        check('étape CI, cas 1 (correctif + <title> retouché, anime.html versionné périmé) : code 0 et l\'édition déployée contient le correctif',
          r.code === 0 && html.indexOf('CORRECTIF-QUESTION') >= 0, [short(r), html.indexOf('CORRECTIF-QUESTION')]);
        check('étape CI, cas 1 : une annotation dit que l\'anime.html versionné était périmé', notes(r, 'warning').some((l) => /périmé|pas à jour/.test(l)), notes(r, 'warning'));
        check('étape CI, cas 1 : la construction déployée est à jour (--check, code 0)', build(dir, ['--check']).code === 0);

        /* Cas 2 et 3 : une fonction dont le noyau dépend a été renommée. */
        for (const [n, name, mutate] of [[2, 'showScreen', rename('showScreen', 'goScreen')], [3, 'toggleSave', rename('toggleSave', 'switchSave')]]) {
          reset(dir, mutate);
          r = ciStep(dir, script);
          check('étape CI, cas ' + n + ' (' + name + ' renommée) : le déploiement n\'échoue pas (code 0) et l\'anime.html versionné est conservé tel quel',
            r.code === 0 && kept(dir), short(r));
          check('étape CI, cas ' + n + ' : annotation « ::error » qui nomme la cause, et annotation qui dit que la version versionnée est conservée',
            notes(r, 'error').some((l) => l.indexOf(name) >= 0) && notes(r, 'error').concat(notes(r, 'warning')).some((l) => /conservé/.test(l)), [notes(r, 'error'), notes(r, 'warning')]);
        }

        /* Une fonction enveloppée par un module a été renommée : reconstruit, et annoté. */
        reset(dir, rename('answerTf', 'answerVraiFaux'));
        r = ciStep(dir, script);
        html = fs.readFileSync(path.join(dir, 'anime.html'), 'utf8');
        check('étape CI, crochet de module absent : code 0, édition reconstruite, annotation « ::warning » qui nomme la fonction',
          r.code === 0 && html.indexOf('answerVraiFaux') >= 0 && notes(r, 'warning').some((l) => /answerTf/.test(l)), [short(r), notes(r, 'warning')]);
        check('étape CI : anime.html reste lisible par tous (0644)', (fs.statSync(path.join(dir, 'anime.html')).mode & 0o444) === 0o444);
      }

      /* ── 5. Fins de ligne ── */
      reset(dir, (s) => s.replace(/\r?\n/g, '\r\n'));
      r = build(dir, ['--check']);
      check('fins de ligne : index.html en CRLF → échec (code 2) dont le message nomme les fins de ligne CRLF', r.code === 2 && /CRLF/.test(r.err) && /fins? de ligne/.test(r.err), short(r));
      const attrs = fs.existsSync(path.join(ROOT, '.gitattributes')) ? fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8') : '';
      const rules = attrs.split('\n').map((l) => l.trim()).filter((l) => l && l[0] !== '#' && /\beol=lf\b/.test(l)).map((l) => l.split(/\s+/)[0]);
      const glob = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
      const lf = (file) => rules.some((p) => glob(p).test(p.indexOf('/') < 0 ? path.basename(file) : file));
      const needed = ['index.html', 'anime.html', 'sw.js', 'manifest.json', 'manifest-anime.json', 'anime-src/00-kernel.js', 'anime-src/00-core.css',
        'anime-src/README.md', 'tools/build_anime.py', 'tools/test_anime.js', 'tools/anime-tests/95-build.js'];
      check('fins de ligne : .gitattributes impose LF (eol=lf) aux fichiers dont dépend l\'édition', needed.every(lf), needed.filter((f) => !lf(f)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  return [['build', 'construction et déploiement (<head> tolérant, contrat du noyau, étape CI, fins de ligne)', scenarioBuild]];
};
