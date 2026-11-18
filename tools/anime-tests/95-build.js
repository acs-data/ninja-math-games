/* Scénario « build » : la chaîne de construction et l'étape de déploiement (aucun fragment ne porte ce numéro).
   Chargé par tools/test_anime.js (voir HELPERS). Tout se passe dans une COPIE de travail jetable (dossier
   temporaire) : classique.html, index.html, anime.html, anime-src/, tools/build_anime.py et le workflow y sont
   copiés, puis classique.html (le fichier édité à la main) y est retouché comme le ferait un mainteneur. Le dépôt
   n'est jamais modifié.

   · <head> recopié      : index.html reprend classique.html tel quel, <head> compris (titre, descriptions, manifest),
                           plus le bandeau « fichier généré » juste après <!DOCTYPE html> et la couche ; une retouche
                           du <head> de classique.html (titre, description, balise retirée, href du manifest) passe
                           telle quelle, sans avertissement. La sortie ne peut jamais être classique.html.
   · contrat du noyau    : une fonction, une variable ou un repère dont le NOYAU dépend a disparu de classique.html →
                           échec, rien n'est écrit (l'index.html précédent reste en place, plus ancien mais
                           cohérent). De même pour un crochet des fragments qui tiennent l'arène du QCM.
                           Une fonction enveloppée par un AUTRE module a disparu → avertissement, et la page
                           construite reste cohérente (prouvé en la jouant).
   · étape du déploiement : les lignes « run: » de .github/workflows/pages.yml sont extraites et rejouées avec
                           bash (GITHUB_ACTIONS=true) : elles ne font jamais échouer le déploiement, annotent un
                           index.html versionné périmé, et annotent une construction refusée.
   · fins de ligne       : classique.html en CRLF → l'erreur nomme la cause ; .gitattributes impose LF.

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
  const COPIED = ['classique.html', 'index.html', 'anime.html', 'manifest.json', 'sw.js'];

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
  const ORIGINAL = fs.readFileSync(path.join(ROOT, 'classique.html'), 'utf8');
  const COMMITTED = fs.readFileSync(path.join(ROOT, 'index.html'));
  /* Remet la copie dans l'état du dépôt, puis applique une retouche à classique.html. */
  function reset(dir, mutate) {
    const src = mutate ? mutate(ORIGINAL) : ORIGINAL;
    if (mutate && src === ORIGINAL) throw new Error('retouche sans effet : le test ne prouverait rien');
    fs.writeFileSync(path.join(dir, 'classique.html'), src);
    fs.writeFileSync(path.join(dir, 'index.html'), COMMITTED);
    return src;
  }
  const kept = (dir) => fs.readFileSync(path.join(dir, 'index.html')).equals(COMMITTED);
  /* Ce que la construction ajoute à classique.html : le bandeau (juste après <!DOCTYPE html>), #fx-style (juste
     avant </head>) et #fx-script (juste avant </body>). Retirés, il doit rester classique.html, octet pour octet. */
  const BANNER = /^(<!DOCTYPE html>\n)<!-- FICHIER GÉNÉRÉ [^]*?-->\n/;
  const unlayer = (s) => s.replace(BANNER, '$1').replace(/<style id="fx-style">\n[^]*?<\/style>\n(?=<\/head>)/, '')
    .replace(/<\/script><script id="fx-script">\n[^]*?(?=<\/script>\n<\/body>\n<\/html>\n$)/, '');
  const headOf = (s) => s.slice(0, s.indexOf('</head>'));
  const rename = (from, to) => (s) => s.replace(new RegExp('\\b' + from + '\\b', 'g'), to);
  const swap = (from, to) => (s) => s.split(from).join(to);
  const warns = (r) => r.err.split('\n').filter((l) => /^AVERTISSEMENT/.test(l));
  const notes = (r, kind) => r.all.split('\n').filter((l) => new RegExp('^::' + kind + '[ :]').test(l));
  const short = (r) => ({ code: r.code, err: r.err.slice(0, 400), spawn: r.spawn });

  /* Les lignes « run: | » de l'étape du workflow qui reconstruit index.html, telles qu'elles seront exécutées. */
  function ciScript(dir) {
    const lines = fs.readFileSync(path.join(dir, '.github', 'workflows', 'pages.yml'), 'utf8').split('\n');
    const start = lines.findIndex((l) => /^\s*- name:.*index\.html/.test(l));
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
      check('build : l\'index.html versionné est à jour (build_anime.py --check, code 0)', r.code === 0, short(r));
      check('build : sans CI, aucune annotation « ::warning » ni « ::error »', notes(r, 'warning').length + notes(r, 'error').length === 0, r.all.slice(0, 300));
      /* Inventaire annoncé par le build : la référence des contrôles qui suivent (aucun nombre en dur ici). */
      const wrapped = ((r.out.match(/fonctions enveloppées : (.*)/) || ['', ''])[1]).split(', ').filter(Boolean);
      check('build : le build annonce les fonctions enveloppées, dont celles du noyau', ['showScreen', 'openModal', 'closeModal', 'toggleSave'].every((n) => wrapped.indexOf(n) >= 0), wrapped);

      /* ── 1. <head> recopié tel quel, bandeau, sortie protégée ── */
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('sortie : classique.html recopié octet pour octet, <head> compris (titre, descriptions, manifest), à la couche et au bandeau près',
        r.code === 0 && html.length > ORIGINAL.length && unlayer(html) === ORIGINAL && headOf(unlayer(html)) === headOf(ORIGINAL), [short(r), html.length, unlayer(html).length, ORIGINAL.length]);
      check('sortie : <head> de index.html identique à celui de classique.html, une fois retirés le bandeau et #fx-style',
        headOf(html).replace(BANNER, '$1').replace(/<style id="fx-style">\n[^]*?<\/style>\n$/, '') === headOf(ORIGINAL)
          && /<link rel="manifest" href="manifest\.json">/.test(headOf(html)) && !/manifest-anime/.test(html) && !/Édition animée/.test(headOf(html)),
        (headOf(html).match(/<title>[^<]*<\/title>/) || [])[0]);
      const banner = (html.match(BANNER) || [''])[0];
      check('sortie : bandeau « fichier généré » en français juste après la ligne <!DOCTYPE html>, qui nomme classique.html et la commande',
        html.indexOf('<!DOCTYPE html>\n<!-- FICHIER GÉNÉRÉ') === 0 && /classique\.html/.test(banner) && /python3 tools\/build_anime\.py/.test(banner) && /ne pas éditer/.test(banner)
          && html.indexOf('<meta charset="UTF-8">') > 0 && Buffer.byteLength(html.slice(0, html.indexOf('<meta charset="UTF-8">')), 'utf8') < 1024, banner);
      check('sortie : le build seul n\'émet aucun avertissement sur le dépôt tel quel', warns(r).length === 0, warns(r));

      const TITLE = 'Anime Math Academy — Maths Collège 6e → 3e + DNB 2027';
      src = reset(dir, (s) => s.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>')
        .replace('<meta name="description" content="Jeu éducatif gratuit pour réviser', '<meta name="description" content="Jeu gratuit et éducatif pour réviser'));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : un <title> et une description retouchés dans classique.html → construction réussie (code 0, fichier écrit)', r.code === 0 && html.length > src.length, short(r));
      const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      check('<head> : le titre retouché est repris tel quel', title === TITLE, title);
      check('<head> : la description retouchée est reprise telle quelle', desc.indexOf('Jeu gratuit et éducatif pour réviser') === 0, desc.slice(0, 120));
      check('<head> : le manifest déclaré est celui de classique.html (manifest.json), et lui seul', (html.match(/<link rel="manifest"[^>]*>/g) || []).join() === '<link rel="manifest" href="manifest.json">', (html.match(/<link rel="manifest"[^>]*>/g) || []));
      check('<head> : une retouche du <head> ne produit aucun avertissement (plus aucune réécriture du <head>)', warns(r).length === 0, warns(r));
      check('<head> : la page construite est classique.html retouché, à la couche et au bandeau près', unlayer(html) === src, [unlayer(html).length, src.length]);

      /* Annotations de la CI : il faut un avertissement — une fonction enveloppée par un module, renommée. */
      reset(dir, rename('answerTf', 'answerVraiFaux'));
      r = build(dir, ['--out', out, '--ci']);
      check('CI : avec --ci, chaque avertissement est aussi une annotation « ::warning »', warns(r).length > 0 && notes(r, 'warning').length === warns(r).length, [warns(r).length, notes(r, 'warning')]);
      r = build(dir, ['--out', out], { GITHUB_ACTIONS: 'true' });
      check('CI : avec GITHUB_ACTIONS=true, chaque avertissement est aussi une annotation « ::warning »', warns(r).length > 0 && notes(r, 'warning').length === warns(r).length, [warns(r).length, notes(r, 'warning')]);

      src = reset(dir, (s) => s.replace(/<meta name="twitter:title"[^>]*>\n/, ''));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : une balise absente de classique.html (twitter:title) → construction réussie, sans avertissement, <head> repris tel quel (rien d\'inventé)',
        r.code === 0 && warns(r).length === 0 && !/twitter:title/.test(html) && unlayer(html) === src, short(r));

      src = reset(dir, swap('<link rel="manifest" href="manifest.json">', '<link rel="manifest" href="manifest.json?v=2">'));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : un href de manifest retouché dans classique.html est repris tel quel',
        r.code === 0 && /<link rel="manifest" href="manifest\.json\?v=2">/.test(html) && unlayer(html) === src, short(r));

      src = reset(dir, (s) => s.replace(/<link rel="manifest"[^>]*>\n/, ''));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('<head> : sans lien de manifest dans classique.html, la construction n\'en invente aucun (page = classique.html, à la couche près)',
        r.code === 0 && !/rel="manifest"/.test(html) && unlayer(html) === src, short(r));

      /* La sortie ne peut jamais écraser le fichier édité à la main. */
      reset(dir);
      r = build(dir, ['--out', path.join(dir, 'classique.html')]);
      check('sortie : --out classique.html → refus (code 2), classique.html intact, index.html intact',
        r.code === 2 && /classique\.html/.test(r.err) && fs.readFileSync(path.join(dir, 'classique.html'), 'utf8') === ORIGINAL && kept(dir), short(r));
      r = build(dir, ['--out', path.join(dir, 'tools', '..', 'classique.html'), '--ci']);
      check('sortie : --out vers classique.html par un autre chemin → refus (code 2) annoté « ::error », classique.html intact',
        r.code === 2 && notes(r, 'error').some((l) => /classique\.html/.test(l)) && fs.readFileSync(path.join(dir, 'classique.html'), 'utf8') === ORIGINAL, short(r));
      /* Lien symbolique vers classique.html : seul realpath/samefile le démasque (abspath ne le résout pas). */
      let lien = null;
      try { fs.symlinkSync('classique.html', path.join(dir, 'lien.html')); lien = path.join(dir, 'lien.html'); } catch (e) { lien = null; }
      if (lien) {
        r = build(dir, ['--out', 'lien.html', '--ci']);
        check('sortie : --out vers un lien symbolique qui pointe sur classique.html → refus (code 2) annoté « ::error » qui nomme classique.html, classique.html intact, index.html intact',
          r.code === 2 && notes(r, 'error').some((l) => /classique\.html/.test(l)) && fs.readFileSync(path.join(dir, 'classique.html'), 'utf8') === ORIGINAL && kept(dir), short(r));
        fs.unlinkSync(lien);
      } else {
        console.log('  (sortie : lien symbolique impossible sur ce système, vérification du lien vers classique.html non jouée)');
      }
      src = reset(dir, (s) => s.replace('<!DOCTYPE html>\n', '<!doctype html>\n'));
      fresh(); r = build(dir, ['--out', out]); html = built();
      check('sortie : ligne du doctype écrite en minuscules dans classique.html → construction réussie, ligne recopiée telle quelle, bandeau juste après',
        r.code === 0 && html.indexOf('<!doctype html>\n<!-- FICHIER GÉNÉRÉ') === 0 && html.replace(/^(<!doctype html>\n)<!-- FICHIER GÉNÉRÉ [^]*?-->\n/, '$1').indexOf(src.slice(0, 400)) === 0, short(r));
      reset(dir, (s) => s.replace('<!DOCTYPE html>\n', ''));
      r = build(dir, []);
      check('sortie : classique.html sans ligne <!DOCTYPE html> en tête → refus (code 2) qui le dit, index.html précédent conservé',
        r.code === 2 && /DOCTYPE/.test(r.err) && kept(dir), short(r));

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
        check('contrat du noyau : « ' + name + ' » absent de classique.html → échec (code 2) qui le nomme, index.html précédent conservé',
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
        check('contrat de l\'arène : « ' + name + ' » absent de classique.html → échec (code 2) qui le nomme, index.html précédent conservé',
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
      check('étape CI : les lignes « run: » de l\'étape index.html sont lisibles dans pages.yml', !!script && /build_anime\.py/.test(script), script);
      if (script) {
        reset(dir);
        r = ciStep(dir, script);
        check('étape CI, dépôt à jour : code 0, aucune annotation, index.html inchangé',
          r.code === 0 && notes(r, 'warning').length + notes(r, 'error').length === 0 && kept(dir), [short(r), notes(r, 'warning'), notes(r, 'error')]);

        /* Cas 1 : classique.html corrigé et <title> retouché, sans reconstruction locale. */
        src = reset(dir, (s) => s.replace(/<title>[^<]*<\/title>/, '<title>' + TITLE + '</title>').replace('const GOATCOUNTER_CODE', '/* CORRECTIF-QUESTION */ const GOATCOUNTER_CODE'));
        r = ciStep(dir, script);
        html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
        check('étape CI, cas 1 (correctif + <title> retouché, index.html versionné périmé) : code 0 et la page déployée contient le correctif et le titre retouché',
          r.code === 0 && html.indexOf('CORRECTIF-QUESTION') >= 0 && html.indexOf('<title>' + TITLE + '</title>') >= 0 && unlayer(html) === src, [short(r), html.indexOf('CORRECTIF-QUESTION')]);
        check('étape CI, cas 1 : une annotation dit que l\'index.html versionné était périmé', notes(r, 'warning').some((l) => /périmé|pas à jour/.test(l)), notes(r, 'warning'));
        check('étape CI, cas 1 : la construction déployée est à jour (--check, code 0)', build(dir, ['--check']).code === 0);

        /* Cas 2 et 3 : une fonction dont le noyau dépend a été renommée. */
        for (const [n, name, mutate] of [[2, 'showScreen', rename('showScreen', 'goScreen')], [3, 'toggleSave', rename('toggleSave', 'switchSave')]]) {
          src = reset(dir, mutate);
          r = ciStep(dir, script);
          check('étape CI, cas ' + n + ' (' + name + ' renommée) : le déploiement n\'échoue pas (code 0), l\'index.html versionné est conservé tel quel et classique.html n\'est pas touché',
            r.code === 0 && kept(dir) && fs.readFileSync(path.join(dir, 'classique.html'), 'utf8') === src, short(r));
          check('étape CI, cas ' + n + ' : annotation « ::error » qui nomme la cause, et annotation qui dit que la version versionnée est conservée',
            notes(r, 'error').some((l) => l.indexOf(name) >= 0) && notes(r, 'error').concat(notes(r, 'warning')).some((l) => /conservé/.test(l)), [notes(r, 'error'), notes(r, 'warning')]);
        }

        /* Une fonction enveloppée par un module a été renommée : reconstruit, et annoté. */
        src = reset(dir, rename('answerTf', 'answerVraiFaux'));
        r = ciStep(dir, script);
        html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
        check('étape CI, crochet de module absent : code 0, page principale reconstruite, annotation « ::warning » qui nomme la fonction',
          r.code === 0 && html.indexOf('answerVraiFaux') >= 0 && notes(r, 'warning').some((l) => /answerTf/.test(l)), [short(r), notes(r, 'warning')]);
        check('étape CI : index.html reste lisible par tous (0644)', (fs.statSync(path.join(dir, 'index.html')).mode & 0o444) === 0o444);
        check('étape CI : classique.html et la page de redirection anime.html ne sont jamais touchés par l\'étape',
          fs.readFileSync(path.join(dir, 'classique.html'), 'utf8') === src
            && fs.readFileSync(path.join(dir, 'anime.html')).equals(fs.readFileSync(path.join(ROOT, 'anime.html'))));
      }

      /* ── 5. Fins de ligne ── */
      reset(dir, (s) => s.replace(/\r?\n/g, '\r\n'));
      r = build(dir, ['--check']);
      check('fins de ligne : classique.html en CRLF → échec (code 2) dont le message nomme les fins de ligne CRLF', r.code === 2 && /CRLF/.test(r.err) && /fins? de ligne/.test(r.err), short(r));
      const attrs = fs.existsSync(path.join(ROOT, '.gitattributes')) ? fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8') : '';
      const rules = attrs.split('\n').map((l) => l.trim()).filter((l) => l && l[0] !== '#' && /\beol=lf\b/.test(l)).map((l) => l.split(/\s+/)[0]);
      const glob = (p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
      const lf = (file) => rules.some((p) => glob(p).test(p.indexOf('/') < 0 ? path.basename(file) : file));
      const needed = ['classique.html', 'index.html', 'anime.html', 'sw.js', 'manifest.json', 'anime-src/00-kernel.js', 'anime-src/00-core.css',
        'anime-src/README.md', 'tools/build_anime.py', 'tools/test_anime.js', 'tools/anime-tests/95-build.js'];
      check('fins de ligne : .gitattributes impose LF (eol=lf) aux fichiers dont dépend l\'édition', needed.every(lf), needed.filter((f) => !lf(f)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  return [['build', 'construction et déploiement (<head> recopié, bandeau, contrat du noyau, étape CI, fins de ligne)', scenarioBuild]];
};
