/* Scénarios de la coquille (anime-src/09-arrivee.js, 30-shell.js et correctifs du noyau) :
     shell-diff     même session scriptée (univers, personnage, onglets, thème, cartes de mode, tiroir,
                    logo, QCM avec chargement, bouton Précédent) sur classique.html et sur l'édition animée
                    aux niveaux off, complet et chaos : état du jeu, focus, suite des messages de #toast
                    et de #sr-live, empreinte du DOM du jeu identiques ; chaque photographie attend le
                    calme de la page (aucun délai fixe), les états intermédiaires sont retenus (__hold) ;
     shell-nav      transitions entre les 23 écrans (lame, fondu, profil sobre, off), navigation rapide,
                    modale en pleine transition, chargement du QCM, Précédent, ordre d'empilement ;
     shell-accueil  ouverture, univers, personnage, classe, envol, thème : journal attendu aux niveaux
                    complet / léger / off, rien ne reste vivant, file d'évènements du noyau.
   Lancés par tools/test_anime.js (qui fournit les aides « h »). */
'use strict';

module.exports = function (h) {
  const { check, open, wait, waapi, gameShown, snap, firstDiff, domChecks, logOf, during, leftovers, isIdle, CLASSIC, ANIME } = h;
  const has = (log, name) => log.some((l) => l.indexOf(name) === 0);
  const count = (log, name) => log.filter((l) => l.indexOf(name) === 0).length;
  const blades = (page) => page.evaluate(() => document.querySelectorAll('.fx-blade').length);
  const shown = (page) => page.evaluate(() => Array.from(document.querySelectorAll('[id^="screen-"]'))
    .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id.slice(7)).join());
  /* Attend la fin de l'ouverture de l'accueil (ou son absence) pour partir d'une couche au repos. */
  const settle = async (page) => { await wait(page, 900); await page.evaluate(() => FX.cancel('*')); };
  const center = (page, sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

  /* ── 1. Différentiel ── */
  const shell = (page) => page.evaluate(() => ({
    uni: currentUniverse, char: state.char, classe: activeMissionClasse,
    theme: document.documentElement.dataset.theme, orange: document.documentElement.style.getPropertyValue('--orange'),
    cards: Array.from(document.querySelectorAll('.universe-card, .char-card')).map((c) => (c.dataset.universe || c.dataset.char) + ':' + c.className + ':' + c.getAttribute('aria-pressed')),
    tabs: Array.from(document.querySelectorAll('.mission-tab')).map((t) => t.className + ':' + t.getAttribute('aria-selected')).join(),
    chips: document.getElementById('mission-chips').textContent, label: document.getElementById('char-section-label').textContent,
    themeBtn: document.getElementById('theme-toggle-btn').textContent.trim() + '|' + document.getElementById('theme-toggle-btn').getAttribute('aria-pressed'),
    grid: document.getElementById('char-grid').className, burger: document.getElementById('topbar-menu-btn').getAttribute('aria-expanded'),
    tf: [tfState.qIdx, tfState.score, tfState.correct, tfState.streak], puzzle: [puzzleState.idx, puzzleState.score, puzzleState.timeLeft],
    draw: drawState.missionIdx, dots: document.querySelectorAll('#chakra-bg .chakra-dot').length, hash: location.hash
  }));
  /* Mise en page de l'accueil : boîtes (décalage, largeur, hauteur) et nombre de nœuds du jeu, hors nœuds de la couche
     et hors barre de réglages (le bouton « Animations » du noyau peut lui ajouter une rangée). */
  const layout = (page) => page.evaluate(() => {
    const home = document.getElementById('screen-home');
    const own = (e) => /^fx-/.test(e.id) || !!e.closest('[id^="fx-"]');
    const box = (e) => [e.offsetLeft, e.offsetWidth, e.offsetHeight].join(',');      // boîtes de mise en page : insensibles aux transform du jeu (flottement, survol)
    return {
      kids: Array.from(home.children).filter((k) => !k.classList.contains('home-actions')).map((k) => (k.id || k.className) + ' ' + box(k)),
      cards: Array.from(home.querySelectorAll('.hero-ninja, #hero-title, .universe-card, .char-card, .level-card, .mission-tab, .mission-quick-btn, .mission-chip')).map(box).join(';'),
      count: Array.from(home.querySelectorAll('*')).filter((e) => !own(e)).length, sw: document.documentElement.scrollWidth,
      header: box(document.querySelector('header')), app: Array.from(document.getElementById('app').children).filter((e) => !own(e)).length,
      body: Array.from(document.body.children).filter((e) => e.tagName !== 'SCRIPT').length,
      inline: ['screen-home', 'universe-grid', 'char-grid', 'mission-chips', 'main-content', 'app'].map((id) => document.getElementById(id).getAttribute('style') || '').join('|') + '|' + (document.body.getAttribute('style') || '')
    };
  });
  /* Précédent du navigateur : rend la main quand le popstate a été servi (écouteurs du jeu compris). */
  const back = (page) => page.evaluate(() => new Promise((res) => { window.addEventListener('popstate', () => res(), { once: true }); history.back(); }));
  async function session(page) {
    const shots = [];
    /* ms = délai des minuteries du jeu à laisser échoir avant la photographie (150 par défaut : annonces,
       focus des modales ; 700 pour la grille de personnages re-générée en 200 + 400 ms). */
    const shot = async (label, ms) => { shots.push(Object.assign(await snap(page, label, { settle: ms }), { shell: await shell(page) })); };
    const card = (fn) => '.level-card[onclick="' + fn + '"]';
    await shot('accueil');
    await page.click('.universe-card[data-universe="onepiece"]'); await shot('univers one piece (clic)', 700);
    await page.click('#char-grid .char-card:nth-child(3)'); await shot('personnage 3 (clic)');
    await page.click('#char-grid .char-card:nth-child(3)'); await shot('même personnage');
    /* État intermédiaire : les minuteries de 200 ms du jeu (grille re-générée) sont retenues le temps de la photo. */
    await page.evaluate(() => { __hold(180); document.querySelector('.universe-card[data-universe="pokemon"]').click(); document.querySelector('.universe-card[data-universe="dragonball"]').click(); });
    await shot('deux univers dans le même tick');                           // grille encore en cours de remplacement
    await page.evaluate(() => __release());
    await shot('grille de personnages re-générée', 700);
    await page.click('.universe-card[data-universe="dragonball"]'); await shot('même univers');
    await page.focus('#char-grid .char-card:nth-child(2)'); await page.keyboard.press('Enter'); await shot('personnage 2 (clavier)');
    await page.click('.mission-tab[data-classe="4e"]'); await shot('onglet 4e');
    await page.click('.mission-tab[data-classe="4e"]'); await shot('même onglet');
    await page.click('.mission-tab[data-classe="mix"]'); await shot('onglet mix');
    await page.click('#theme-toggle-btn'); await shot('thème basculé');
    await page.click('#theme-toggle-btn'); await shot('thème rétabli');
    await page.click(card('startTrueFalse()')); await shot('vrai/faux (carte, clic)');
    await page.click('#screen-tf .game-controls .btn-control'); await shot('retour accueil (bouton)');
    await page.focus(card('startDrawMode()')); await page.keyboard.press('Enter'); await shot('tracé (carte, clavier)');
    await page.evaluate(() => showHome()); await shot('retour accueil');
    await page.click('#stats-btn'); await shot('statistiques');
    await page.click('#screen-stats .game-controls .btn-control'); await shot('retour des statistiques');
    await page.click('#topbar-menu-btn'); await shot('tiroir ouvert');
    await page.keyboard.press('Escape'); await shot('tiroir fermé');
    await page.click(card('startPuzzleMode()')); await shot('puzzle');
    await page.click('#main-logo'); await shot('logo : modale retour accueil');
    await page.click('#modal-back-home .btn-sec--danger'); await shot('retour confirmé');
    await page.evaluate(() => __hold(1000));                                // l'écran de chargement dure 1200 ms : retenu le temps de la photo
    await page.click('.mission-quick-btn.qb-mix'); await shot('chargement du QCM');
    await page.evaluate(() => __release());
    await gameShown(page); await shot('QCM affiché');
    await page.keyboard.press('Escape'); await shot('pause');
    await page.evaluate(() => quitFromPause()); await shot('quitter depuis la pause');
    await page.click(card('showAutoMenu()')); await shot('menu des automatismes');
    await page.click(card('startDnbBlanc()')); await shot('DNB blanc : introduction');
    await page.evaluate(() => showHome()); await shot('retour accueil');
    await page.evaluate(() => { location.hash = '#main-content'; });       // crée l'entrée d'historique (comme le lien d'évitement)
    await page.click(card('startStoryMode()')); await shot('histoire');
    await back(page); await shot('Précédent : accueil');
    await page.evaluate(() => { location.hash = '#x'; openModal('modal-legal'); }); await shot('modale ouverte');
    await back(page); await shot('Précédent : modale fermée sans closeModal');
    await page.click(card('startProbaTree()')); await shot('arbre de probabilités');
    await page.evaluate(() => showHome()); await shot('fin');
    return shots;
  }
  async function scenarioDiff(browser) {
    const run = async (url, prepare, phone) => {
      const page = await open(browser, url, phone ? { viewport: { width: 360, height: 640 }, colorScheme: 'light' } : { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
      if (prepare) await page.evaluate(prepare);
      const lay = await layout(page);
      const shots = await session(page);
      const fx = url === ANIME ? await page.evaluate(() => ({ log: FX.debug.log.map((e) => e.fx + (e.info ? '[' + e.info + ']' : '')), stats: FX.stats() })) : null;
      const end = await layout(page);
      return { page, shots, fx, errors: page.errors, lay, end };
    };
    const [classic, off, full, chaos, telClassic, telFull] = await Promise.all([
      run(CLASSIC),
      run(ANIME, () => { FX.setLevel('off'); }),
      run(ANIME, () => { FX.seed(11); }),
      run(ANIME, () => { FX.debug.chaos = true; }),
      run(CLASSIC, null, true),
      run(ANIME, () => { FX.seed(12); }, true)
    ]);
    const seen = (label, scr) => classic.shots.some((s) => s.label === label && s.screens.join() === 'screen-' + scr);
    check('coquille : la session classique passe par chaque étape (vrai/faux, tracé, stats, puzzle, QCM, DNB, histoire, arbre)',
      seen('vrai/faux (carte, clic)', 'tf') && seen('tracé (carte, clavier)', 'draw') && seen('statistiques', 'stats') && seen('puzzle', 'puzzle') &&
      seen('chargement du QCM', 'loading') && seen('QCM affiché', 'game') && seen('DNB blanc : introduction', 'dnb-intro') && seen('histoire', 'story') &&
      seen('Précédent : accueil', 'home') && seen('arbre de probabilités', 'proba-tree') && seen('fin', 'home'), classic.shots.map((s) => s.label + '=' + s.screens.join()));
    const s0 = classic.shots.find((s) => s.label === 'deux univers dans le même tick'), s1 = classic.shots.find((s) => s.label === 'thème basculé');
    check('coquille : la session classique change bien d\'univers, de personnage, de classe et de thème',
      s0.shell.uni === 'dragonball' && s1.shell.theme === 'light' && s1.shell.classe === 'mix' && classic.shots.some((s) => s.modals.join() === 'modal-back-home') &&
      classic.shots.find((s) => s.label === 'Précédent : modale fermée sans closeModal').modals.length === 0, [s0.shell.uni, s1.shell.theme, s1.shell.classe]);
    check('coquille, niveau off : état du jeu identique', !firstDiff(classic.shots, off.shots), firstDiff(classic.shots, off.shots));
    check('coquille, niveau complet : état du jeu identique', !firstDiff(classic.shots, full.shots), firstDiff(classic.shots, full.shots));
    check('coquille, chaos : état du jeu identique', !firstDiff(classic.shots, chaos.shots), firstDiff(classic.shots, chaos.shots));
    check('coquille, téléphone 360×640 (thème clair), niveau complet : état du jeu identique', !firstDiff(telClassic.shots, telFull.shots), firstDiff(telClassic.shots, telFull.shots));
    check('coquille, téléphone : effets joués sans erreur interne', telFull.fx.log.length > 20 && telFull.fx.stats.errCount === 0, [telFull.fx.log.length, telFull.fx.stats.errors]);
    for (const [name, r] of [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos], ['téléphone classique', telClassic], ['téléphone complet', telFull]]) {
      check('coquille : aucune erreur console / page (' + name + ')', r.errors.length === 0, r.errors);
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b), diffKey = (a, b) => Object.keys(a).filter((k) => !same(a[k], b[k]));
    for (const [name, r] of [['off', off], ['complet', full], ['chaos', chaos]]) {
      check('coquille : accueil — mise en page, nombre de nœuds et styles en ligne du jeu identiques à classique.html, avant et après la session (' + name + ')',
        same(classic.lay, r.lay) && same(classic.end, r.end), [diffKey(classic.lay, r.lay), diffKey(classic.end, r.end)]);
    }
    check('coquille, niveau off : journal FX vide', off.fx.log.length === 0, off.fx.log);
    check('coquille, chaos : les crochets ont levé, rien n\'a été joué', chaos.fx.stats.chaos > 0 && chaos.fx.log.length === 0, [chaos.fx.stats.chaos, chaos.fx.log]);
    const log = full.fx.log;
    check('coquille, niveau complet : chaque moment a joué (univers, perso, classe, thème, envol, transitions)',
      ['univers[onepiece]', 'univers[dragonball]', 'perso[', 'classe', 'theme', 'envol[tf]', 'envol[draw]', 'envol[puzzle]', 'envol[auto-menu]', 'envol[story]',
        'arrivee[tf]', 'arrivee[home]', 'arrivee[stats]', 'arrivee[loading]', 'arrivee[game]'].every((n) => has(log, n)), log.filter((l) => !/^(anim|ring|burst|streaks|trail|sprite|slash)/.test(l)));
    check('coquille, niveau complet : rien pour un choix déjà fait, un seul effet pour deux univers dans le même tick',
      count(log, 'univers[') === 2 && !has(log, 'univers[pokemon]') && count(log, 'perso[') === 2 && count(log, 'classe') === 2 && count(log, 'theme') === 2, log.filter((l) => /^(univers|perso|classe|theme)/.test(l)));
    check('coquille, niveau complet : profil sobre sans transition ni envol, QCM sans envol (carte VS)',
      !has(log, 'arrivee[dnb-intro]') && !has(log, 'envol[dnb-intro]') && !has(log, 'envol[loading]') && !has(log, 'envol[game]') && !has(log, 'envol[stats]'), log.filter((l) => /^(arrivee|envol)/.test(l)));
    check('coquille, niveau complet : aucune erreur interne, rien de manquant, modules démarrés',
      full.fx.stats.errCount === 0 && full.fx.stats.missing.length + full.fx.stats.denied.length === 0 && full.fx.stats.modules.arrivee === 'ok' && full.fx.stats.modules.accueil === 'ok' &&
      Object.values(full.fx.stats.modules).every((v) => v === 'ok'), [full.fx.stats.errors, full.fx.stats.missing, full.fx.stats.denied, full.fx.stats.modules]);
    await domChecks('coquille', [['classique', classic], ['off', off], ['complet', full], ['chaos', chaos]]);
    await domChecks('coquille, téléphone', [['classique', telClassic], ['complet', telFull]]);
  }

  /* ── 2. Transitions d'écran ── */
  const SCREENS = ['draw', 'puzzle', 'auto-menu', 'auto', 'auto-result', 'loading', 'game', 'result', 'tf', 'tf-result', 'story', 'story-result', 'stats',
    'dnb-intro', 'dnb-transition', 'dnb-ex', 'dnb-result', 'pythagore', 'proba-tree', 'proba-tree-result', 'graph-reader', 'graph-reader-result', 'home'];
  const SOBRE = ['auto', 'dnb-intro', 'dnb-transition', 'dnb-ex'];
  const CEREMONY = ['result', 'auto-result', 'tf-result', 'story-result', 'dnb-result', 'proba-tree-result', 'graph-reader-result'];
  /* Dans la page, sans aller-retour pendant la mesure : déclenche l'arrivée d'un écran (showScreen(id), ou
     clic sur « how », ou simple attente si how === 'wait'), laisse passer deux frames, photographie la
     transition (panneau, animation, écran du jeu intact), puis chronomètre la disparition du panneau. */
  const transit = (page, id, how) => page.evaluate(([id, how]) => new Promise((res) => {
    const scr = document.getElementById('screen-' + id), t0 = performance.now(), root = document.getElementById('fx-root');
    const layer = (e) => e.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition));
    const photo = () => {
      const b = document.querySelectorAll('.fx-blade'), cs = getComputedStyle(scr), a = b.length ? b[0].getAnimations()[0] : null, kf = a ? a.effect.getKeyframes() : [];
      const hd = document.querySelector('header').getBoundingClientRect(), vs = document.querySelector('.fx-vs');
      return {
        n: b.length, ms: a ? a.effect.getTiming().duration : 0, to: kf.length ? String(kf[kf.length - 1].transform || 'none') : '', inRoot: b.length ? root.contains(b[0]) : null,
        op: b.length ? Number(getComputedStyle(b[0]).opacity) : -1, pe: b.length ? getComputedStyle(b[0]).pointerEvents : null, z: b.length ? getComputedStyle(b[0]).zIndex : null,
        top: b.length ? Math.round(parseFloat(b[0].style.top)) : null, headerBottom: Math.round(Math.max(0, hd.bottom)),
        stripe: b.length ? [b[0].style.borderLeftWidth, b[0].style.borderRightWidth, b[0].style.borderTopWidth].join('|') : null,
        /* Écran du jeu : affiché, sans transform ni animation de transform (une opacité reste permise aux modules). */
        game: [cs.display !== 'none', cs.transform, layer(scr).filter((x) => x.effect.getKeyframes().some((k) => k.transform && k.transform !== 'none')).length,
          layer(document.documentElement).length + layer(document.body).length + layer(document.getElementById('app')).length + layer(document.querySelector('main')).length].join('|'),
        waapi: document.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition)).map((x) => x.effect.getTiming().duration),
        particles: FX.stats().particles, vs: vs ? getComputedStyle(vs).zIndex : null,
        log: FX.debug.log.filter((e) => e.fx === 'arrivee').map((e) => e.info + (e.level === 'leger' ? '~' : '')).join(),
        all: FX.debug.log.map((e) => e.fx + (e.info ? '[' + e.info + ']' : '') + (e.level === 'leger' ? '~' : ''))
      };
    };
    const measure = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = photo(), t1 = performance.now();
      (function poll() {
        const n = document.querySelectorAll('.fx-blade').length;
        if (!n || performance.now() - t1 > 1500) {
          p.gone = Math.round(performance.now() - t1); p.left = n;
          p.shown = Array.from(document.querySelectorAll('[id^="screen-"]')).filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id.slice(7)).join();
          return res(p);
        }
        requestAnimationFrame(poll);
      })();
    }));
    if (how === 'wait') {
      (function w() {
        if (getComputedStyle(scr).display !== 'none') return measure();
        if (performance.now() - t0 > 4000) return res({ timeout: true });
        requestAnimationFrame(w);
      })();
      return;
    }
    FX.debug.log.length = 0;
    if (how) document.querySelector(how).click(); else showScreen(id);
    measure();
  }), [id, how || null]);
  async function navAll(browser, level, vp, scheme) {
    const page = await open(browser, ANIME, { viewport: vp, colorScheme: scheme });
    const tag = level + ', ' + vp.width + '×' + vp.height + ', ' + scheme;
    if (level !== 'complet') await page.evaluate((l) => FX.setLevel(l), level);
    await settle(page);
    const bad = [], forms = {};
    let prev = 'home';
    for (const id of SCREENS) {
      const p = await transit(page, id), sobre = SOBRE.indexOf(id) >= 0;
      const fade = level === 'leger' || prev === 'loading';
      const want = level === 'off' || sobre ? { n: 0, log: '' }
        : { n: 1, log: id + (level === 'leger' ? '~' : ''), ms: fade ? 140 : CEREMONY.indexOf(id) >= 0 ? 340 : id === 'home' ? 240 : 300,
            to: fade ? 'none' : CEREMONY.indexOf(id) >= 0 ? 'translateY(100%)' : id === 'home' ? 'translateX(-100%)' : 'translateX(100%)' };
      forms[id] = p.n ? p.ms + ' ' + p.to : '-';
      if (p.n !== want.n || p.log !== want.log) bad.push([id, 'panneau/journal', p.n, p.log]);
      if (p.n && (p.ms !== want.ms || p.to !== want.to)) bad.push([id, 'forme', p.ms, p.to]);
      if (p.n && (p.pe !== 'none' || !p.inRoot || p.z !== '-1' || p.top !== p.headerBottom || !(p.op > 0))) bad.push([id, 'panneau', p.pe, p.inRoot, p.z, p.top, p.headerBottom, p.op]);
      if (p.n && !fade && p.stripe !== (CEREMONY.indexOf(id) >= 0 ? '||10px' : id === 'home' ? '|10px|' : '10px||')) bad.push([id, 'bord', p.stripe]);
      if (p.game !== 'true|none|0|0') bad.push([id, 'écran du jeu animé', p.game]);
      if (p.left !== 0 || (p.n && p.gone > want.ms + 200)) bad.push([id, 'panneau resté', p.left, p.gone]);
      if (p.shown !== id) bad.push([id, 'écran affiché', p.shown]);
      if (id === 'home') await wait(page, 450);                 // fin de l'effet de retour sur l'accueil
      prev = id;
    }
    check('transitions (' + tag + ') : 23 écrans, forme attendue, jeu jamais animé, panneau retiré à la fin de son animation', bad.length === 0, bad.slice(0, 6));
    /* Le même écran redemandé (showScreen('dnb-ex') par exercice) : rien. */
    const again = await during(page, () => page.evaluate(() => { showScreen('dnb-ex'); showScreen('dnb-ex'); showScreen('stats'); showScreen('stats'); }), 60);
    check('transitions (' + tag + ') : un écran déjà affiché ne rejoue rien', count(again, 'arrivee') === (level === 'off' ? 0 : 1) && (await blades(page)) <= 1, again);
    await wait(page, 400);
    const st = await page.evaluate(() => { const s = FX.stats(); return { err: s.errCount, errors: s.errors, dead: s.dead, screen: s.screen }; });
    check('transitions (' + tag + ') : aucune erreur (page, console, couche)', page.errors.length === 0 && st.err === 0 && !st.dead && st.screen === 'stats', [page.errors, st]);
    if (level === 'off') check('transitions (off) : journal vide, aucune animation', (await page.evaluate(() => FX.debug.log.length)) === 0 && (await waapi(page)).length === 0);
    await page.context().close();
    return forms;
  }
  async function navEdge(browser) {
    const page = await open(browser, ANIME, { viewport: { width: 412, height: 800 } });
    await settle(page);
    /* La lame couvre la zone sous l'en-tête dès la première frame, sans bouger ni fausser le jeu. */
    const first = await page.evaluate(() => new Promise((res) => {
      const el = document.querySelector('#screen-tf .game-controls');
      showScreen('tf');
      const before = el.getBoundingClientRect().top;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const b = document.querySelector('.fx-blade'), r = b ? b.getBoundingClientRect() : null, f = FX.rect(el);
        const hit = document.elementFromPoint(innerWidth / 2, el.getBoundingClientRect().top + 10), op = b ? getComputedStyle(b).opacity : null;
        setTimeout(() => res({ blade: !!b, op, w: r ? Math.round(r.width) : 0, vw: document.documentElement.clientWidth,
          dy: Math.round((f.y - before) * 10) / 10, hit: hit ? hit.closest('[id^="screen-"]').id : null, after: Math.round((FX.rect(el).y - before) * 10) / 10 }), 450);
      }));
    }));
    check('lame : panneau présent et opaque à la première frame, pleine largeur', first.blade && first.op === '1' && first.w === first.vw, first);
    check('lame : FX.rect d\'un nœud du jeu identique pendant et après la transition (0 px)', first.dy === 0 && first.after === 0, first);
    check('lame : le pointeur atteint le jeu à travers le panneau', first.hit === 'screen-tf', first);
    /* Navigation rapide : accueil → mode → accueil ×20, espacée puis dans le même tick. */
    for (let i = 0; i < 20; i++) { await page.evaluate((i) => { showScreen(i % 2 ? 'puzzle' : 'tf'); }, i); await wait(page, i % 4 === 0 ? 30 : 5); await page.evaluate(() => showHome()); await wait(page, i % 3 === 0 ? 20 : 0); }
    await page.evaluate(() => { for (let i = 0; i < 20; i++) { showScreen('story'); showHome(); } });
    await wait(page, 30);
    check('navigation rapide ×40 : un panneau au plus à la fois', (await blades(page)) <= 1, await blades(page));
    await wait(page, 700);
    let left = await leftovers(page);
    check('navigation rapide ×40 : aucun panneau resté, couche au repos, accueil affiché', (await blades(page)) === 0 && isIdle(left) && (await shown(page)) === 'home' && (await page.evaluate(() => FX.stats().screen)) === 'home', left);
    /* Une modale s'ouvre en pleine transition : tout est coupé dans le même tick. */
    const mid = await page.evaluate(() => new Promise((res) => {
      showScreen('puzzle');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const before = document.querySelectorAll('.fx-blade').length;
        openModal('modal-legal');
        const s = FX.stats();
        res({ before, after: document.querySelectorAll('.fx-blade').length, anims: s.anims, nodes: s.nodes, particles: s.particles });
      }));
    }));
    check('modale en pleine transition : panneau retiré dans le même tick', mid.before === 1 && mid.after === 0 && mid.anims + mid.nodes + mid.particles === 0, mid);
    await page.evaluate(() => closeModal('modal-legal')); await wait(page, 120);
    check('modale refermée : écran visible, aucun panneau, couche reprise', (await blades(page)) === 0 && (await shown(page)) === 'puzzle' && (await page.evaluate(() => FX.stats().suspended)) === false);
    /* Chargement du QCM : lame vers le chargement (carte VS au-dessus du panneau), fondu vers le jeu. */
    await page.evaluate(() => showHome()); await wait(page, 60);
    await wait(page, 600);
    const load = await transit(page, 'loading', '.mission-quick-btn.qb-mix');
    check('chargement du QCM : lame (300 ms) et carte VS au-dessus du panneau', load.n === 1 && load.ms === 300 && load.shown === 'loading' && load.vs !== null && load.z === '-1' && load.vs !== '-1' && load.left === 0, load);
    const game = await transit(page, 'game', 'wait');
    check('arrivée du jeu après le chargement : fondu de 140 ms, pas d\'envol, panneau retiré', game.n === 1 && game.ms === 140 && game.to === 'none' && /(^|,)game$/.test(game.log) && !has(game.all, 'envol') && game.left === 0 && game.gone <= 340, game);
    /* Minuterie fantôme du jeu : accueil pendant le chargement, le jeu s'affiche quand même à 1200 ms. */
    await page.evaluate(() => { clearInterval(state.timer); showHome(); startGame('6e_facile'); });
    await wait(page, 200);
    await page.evaluate(() => showHome());
    await gameShown(page); await wait(page, 500);
    check('minuterie de chargement du jeu (héritée) : aucun panneau resté, aucune erreur', (await blades(page)) === 0 && page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [await blades(page), page.errors]);
    await page.evaluate(() => { clearInterval(state.timer); showHome(); }); await wait(page, 700);
    /* Bouton Précédent du navigateur. */
    await page.evaluate(() => { location.hash = '#main-content'; startTrueFalse(); }); await wait(page, 450);
    let log = await during(page, () => page.evaluate(() => history.back()), 150);
    check('Précédent depuis un mode : retour accueil avec sa transition', has(log, 'arrivee[home]') && (await shown(page)) === 'home', log);
    await wait(page, 600);
    check('Précédent : aucun panneau resté, couche au repos', (await blades(page)) === 0 && isIdle(await leftovers(page)), await leftovers(page));
    await page.evaluate(() => { clearInterval(tfState.timer); location.hash = '#y'; showScreen('stats'); openModal('modal-legal'); }); await wait(page, 80);
    await page.evaluate(() => history.back()); await wait(page, 200);
    log = await during(page, () => page.evaluate(() => showScreen('puzzle')), 80);
    check('Précédent sur une modale (fermée sans closeModal) : la couche reprend', (await page.evaluate(() => !document.querySelector('.modal-overlay.show') && FX.stats().suspended === false)) && has(log, 'arrivee[puzzle]'), log);
    await wait(page, 400);
    /* Ordre d'empilement réel (test d'atteinte, sonde opaque dans #fx-stage) : tiroir, modales, toast et
       bandeau de combo au-dessus du calque ; en-tête et écrans en dessous. */
    const order = await page.evaluate(() => {
      const stage = document.getElementById('fx-stage'), rootEl = document.getElementById('fx-root'), out = {};
      const probe = document.createElement('div');
      probe.id = 'fx-sonde'; probe.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:auto';
      stage.appendChild(probe);
      const above = (el) => {
        const r = el.getBoundingClientRect(), l = document.elementsFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
        const i = l.indexOf(probe), k = l.findIndex((n) => n === el || el.contains(n));
        return i >= 0 && k >= 0 && k < i;
      };
      document.querySelectorAll('.modal-overlay').forEach((m) => {
        openModal(m.id);
        out[m.id] = above(m.querySelector('.modal-card, .drawer-panel'));
        closeModal(m.id);
      });
      const toast = document.getElementById('toast'), combo = document.getElementById('combo-display');
      toast.classList.add('show'); combo.classList.add('show');
      out.toast = getComputedStyle(toast).zIndex > getComputedStyle(document.getElementById('app')).zIndex && rootEl.parentNode.id === 'app';
      out.header = !above(document.querySelector('header'));
      out.screen = !above(document.getElementById('screen-puzzle'));
      toast.classList.remove('show'); combo.classList.remove('show');
      out.root = [rootEl.parentNode.id, getComputedStyle(rootEl).zIndex, getComputedStyle(rootEl).pointerEvents, rootEl === document.getElementById('app').lastElementChild].join('|');
      probe.remove();
      return out;
    });
    const modals = Object.keys(order).filter((k) => /^(modal-|drawer-)/.test(k));
    check('empilement : le tiroir et les ' + (modals.length - 1) + ' modales se peignent au-dessus du calque', modals.length === 11 && modals.every((k) => order[k] === true), order);
    check('empilement : calque au-dessus de l\'en-tête et des écrans, sous le toast ; dernier enfant de #app, z-index 500', order.header && order.screen && order.toast && order.root === 'app|500|none|true', order);
    check('aucune erreur (transitions, cas limites)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }
  async function scenarioNav(browser) {
    const [full, lite] = await Promise.all([
      navAll(browser, 'complet', { width: 1280, height: 800 }, 'dark'),
      navAll(browser, 'leger', { width: 360, height: 640 }, 'light'),
      navAll(browser, 'off', { width: 412, height: 800 }, 'light'),
      navEdge(browser)
    ]);
    check('transitions : complet = lame (300 / 240 / 340 ms), léger = fondu de 140 ms partout',
      full.tf === '300 translateX(100%)' && full.home === '240 translateX(-100%)' && full.result === '340 translateY(100%)' && full.game === '140 none' && full.auto === '-' &&
      Object.keys(lite).every((k) => lite[k] === (SOBRE.indexOf(k) >= 0 ? '-' : '140 none')), [full, lite]);
  }

  /* ── 3. Accueil ── */
  /* Durée de vie d'un effet : de son entrée au journal jusqu'au repos complet de la couche. */
  const lifetime = (page, name, max) => page.evaluate(([name, max]) => new Promise((res) => {
    const t0 = performance.now();
    let seenAt = 0, peak = 0;
    (function poll() {
      const e = FX.debug.log.find((x) => x.fx === name), s = FX.stats(), busy = s.particles + s.shapes + s.anims + s.nodes + s.timers + s.queue;
      if (e && !seenAt) seenAt = e.t;
      peak = Math.max(peak, s.particles);
      if (seenAt && !busy) return res({ ms: Math.round(performance.now() - seenAt), peak, loop: s.loop });
      if (performance.now() - t0 > max) return res({ ms: -1, peak, seen: !!seenAt, busy });
      setTimeout(poll, 25);
    })();
  }), [name, max]);
  async function homeBoot(browser) {
    /* Complet : ouverture une fois, ≤ 3 s, puis plus rien ne bouge. */
    let page = await open(browser, ANIME, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    let life = await lifetime(page, 'accueil', 6000), log = await logOf(page);
    check('ouverture (complet) : convergence, onde, éclat, scintillement du titre, trois vagues de lueurs',
      log[0] === 'accueil[ouverture]' && count(log, 'streaks') === 2 && count(log, 'ring') === 1 && count(log, 'trail') === 1 && count(log, 'burst[star]') === 3 && count(log, 'burst') === 4, log);
    check('ouverture (complet) : finie en 3 s au plus, lueurs peu nombreuses (≤ 50 particules), boucle arrêtée', life.ms > 1500 && life.ms <= 3000 && life.peak > 8 && life.peak <= 50, life);
    await wait(page, 300);
    const rest = await page.evaluate(() => ({ loop: FX.stats().loop, canvas: getComputedStyle(document.getElementById('fx-canvas')).display, kids: document.getElementById('fx-stage').children.length,
      game: document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).length }));
    check('accueil au repos : boucle arrêtée, canvas masqué, scène vide, aucune animation de la couche', rest.loop === false && rest.canvas === 'none' && rest.kids === 0 && rest.game === 0, rest);
    /* Une seule fois : ni une modale refermée ni un changement de niveau ne la rejouent. */
    log = await during(page, async () => { await page.evaluate(() => { openModal('modal-legal'); closeModal('modal-legal'); FX.setLevel('leger'); FX.setLevel('complet'); }); }, 700);
    check('ouverture : jouée une seule fois par chargement', !has(log, 'accueil'), log);
    /* Retour sur l'accueil : forme courte. */
    await page.evaluate(() => { FX.debug.log.length = 0; showScreen('tf'); }); await wait(page, 350);
    await page.evaluate(() => { FX.debug.log.length = 0; showHome(); });
    life = await lifetime(page, 'accueil', 3000); log = await logOf(page);
    check('retour sur l\'accueil : forme courte (onde, éclat, scintillement), finie en 0,6 s', has(log, 'accueil[retour]') && count(log, 'ring') === 1 && count(log, 'trail') === 1 && !has(log, 'streaks') && !has(log, 'burst[star]') && life.ms > 0 && life.ms <= 600, [life, log]);
    /* Page défilée : le héros n'est plus à l'écran, rien ne joue. */
    await page.evaluate(() => showScreen('tf')); await wait(page, 350);
    log = await during(page, () => page.evaluate(() => { showHome(); window.scrollTo(0, 900); }), 450);
    check('retour sur l\'accueil, page défilée : la transition seule', has(log, 'arrivee[home]') && !has(log, 'accueil') && !has(log, 'ring') && !has(log, 'trail'), log);
    check('aucune erreur (ouverture, complet)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();

    /* Léger : onde et scintillement, moins d'une demi-seconde. */
    page = await open(browser, ANIME, { viewport: { width: 360, height: 640 } });
    await page.evaluate(() => FX.setLevel('leger'));
    life = await lifetime(page, 'accueil', 6000); log = await logOf(page);
    check('ouverture (léger) : onde + scintillement réduit, sans convergence ni lueurs, tout au niveau léger',
      log[0] === 'accueil[ouverture]~' && count(log, 'ring') === 1 && count(log, 'trail') === 1 && !has(log, 'streaks') && !has(log, 'burst') && log.every((l) => /~$/.test(l)), log);
    check('ouverture (léger) : finie en 0,5 s, 8 particules au plus', life.ms > 0 && life.ms <= 500 && life.peak <= 8, life);
    check('aucune erreur (ouverture, léger)', page.errors.length === 0, page.errors);
    await page.context().close();

    /* Off : rien. Tutoriel de première visite : l'ouverture attend qu'il soit refermé. */
    page = await open(browser, ANIME);
    await page.evaluate(() => FX.setLevel('off')); await wait(page, 1300);
    check('ouverture (off) : rien', (await page.evaluate(() => FX.debug.log.length)) === 0 && (await waapi(page)).length === 0);
    await page.context().close();
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
    page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ANIME);
    await page.waitForFunction(() => document.getElementById('modal-tutorial').classList.contains('show'));
    await wait(page, 900);
    const blocked = await page.evaluate(() => ({ log: FX.debug.log.length, s: FX.stats() }));
    check('première visite : tutoriel ouvert, rien ne joue derrière lui', blocked.log === 0 && blocked.s.particles + blocked.s.anims + blocked.s.nodes === 0, [blocked.log, blocked.s.particles]);
    await page.evaluate(() => closeTutorial(false)); await wait(page, 500);
    log = await logOf(page);
    check('première visite : l\'ouverture joue quand le tutoriel est refermé', log[0] === 'accueil[ouverture]' && count(log, 'streaks') === 2, log);
    /* Le joueur fait défiler la page pendant l'ouverture : ce qu'il en reste est coupé net. */
    await wait(page, 500);
    const live = await page.evaluate(() => { const s = FX.stats(); return s.particles + s.timers; });
    await page.evaluate(() => window.scrollTo(0, 200)); await wait(page, 120);
    const cut = await leftovers(page);
    check('ouverture : coupée au premier défilement (lueurs et minuteries retirées)', live > 0 && isIdle(cut), [live, cut]);
    check('aucune erreur (première visite)', errors.length === 0, errors);
    await ctx.close();
  }
  /* Dans la page, sans aller-retour : clic sur « sel », deux frames, puis photographie de l'animation de la
     couche portée par « target » (durée, fill, propriétés animées) et du journal. */
  const clickAnim = (page, sel, target) => page.evaluate(([sel, target]) => new Promise((res) => {
    const layer = (e) => e.getAnimations().filter((x) => !(x instanceof CSSAnimation) && !(x instanceof CSSTransition));
    FX.debug.log.length = 0;
    document.querySelector(sel).click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const e = document.querySelector(target), a = e ? layer(e)[0] : null, p = FX.palette();
      res({
        found: !!e, ms: a ? a.effect.getTiming().duration : 0, fill: a ? a.effect.getTiming().fill : '',
        props: a ? Object.keys(a.effect.getKeyframes()[0]).filter((k) => !/^(offset|easing|composite|computedOffset)$/.test(k)).join() : '',
        parent: e ? layer(e.parentNode).length : -1, inline: e ? e.getAttribute('style') : null, fxKids: e ? e.querySelectorAll('[class*="fx-"]').length : -1,
        op: e ? Number(getComputedStyle(e).opacity) : -1, bg: e ? getComputedStyle(e).backgroundColor : null,
        char: state.char, pal: { char: p.char, theme: p.theme, bg: p.bg, v: document.getElementById('fx-root').style.getPropertyValue('--fx-bg'), page: getComputedStyle(document.body).backgroundColor, contrast: FX.color.contrast(p.u, p.bg) },
        log: FX.debug.log.map((x) => x.fx + (x.info ? '[' + x.info + ']' : '') + (x.level === 'leger' ? '~' : ''))
      });
    }));
  }), [sel, target]);
  async function homeMoments(browser) {
    const page = await open(browser, ANIME, { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    await page.evaluate(() => FX.seed(5));
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 430)); await wait(page, 60);          // grilles d'univers et de personnages à l'écran
    /* Univers : onde de couleur depuis la carte, voile, éclat, émoji, puis ondulation sur les 6 cartes. */
    let log = await during(page, () => page.click('.universe-card[data-universe="onepiece"]'), 150);
    let pal = await page.evaluate(() => { const p = FX.palette(), r = document.getElementById('fx-root'); return { u: p.universe, c: p.u, v: r.style.getPropertyValue('--fx-u'), raw: p.uRaw, want: UNIVERSES.onepiece.color }; });
    check('univers : voile, onde + anneau depuis la carte, éclat, émoji de l\'univers', log[0] === 'univers[onepiece]' && has(log, 'anim[fx-tint]') && count(log, 'ring') === 2 && count(log, 'burst') === 1 && count(log, 'sprite') === 1, log);
    check('univers : la palette suit dans la même frame (couleur du NOUVEL univers)', pal.u === 'onepiece' && pal.c === pal.v && pal.raw === pal.want, pal);
    const tint = await page.evaluate(() => FX.debug.tints.slice(-1)[0]);
    check('univers : voile par le limiteur du noyau (alpha ≤ .12)', !!tint && tint.alpha <= 0.12, tint);
    await wait(page, 550);
    log = await logOf(page);
    check('univers : ondulation sur les six nouvelles cartes de personnage', count(log, 'ring') === 8, log);
    await wait(page, 450);
    check('univers : fini en 1,15 s, rien ne reste', isIdle(await leftovers(page)), await leftovers(page));
    log = await during(page, () => page.click('.universe-card[data-universe="onepiece"]'), 400);
    check('univers déjà choisi : aucun effet', log.length === 0, log);
    /* Clics rapides : seul le dernier joue ; les minuteries de re-génération du jeu sont laissées tranquilles. */
    log = await during(page, async () => {
      await page.click('.universe-card[data-universe="pokemon"]'); await wait(page, 40);
      await page.click('.universe-card[data-universe="myhero"]'); await wait(page, 40);
      await page.click('.universe-card[data-universe="demonslayer"]');
    }, 900);
    const grid = await page.evaluate(() => ({ cls: document.getElementById('char-grid').className, n: document.querySelectorAll('#char-grid .char-card').length, first: document.querySelector('#char-grid .char-card').dataset.char, want: Object.keys(UNIVERSES.demonslayer.chars)[0], tints: FX.debug.tints.length }));
    check('trois univers en 100 ms : une seule ondulation (celle du dernier), au plus une teinte par seconde', count(log, 'univers[') === 3 && count(log, 'ring') <= 3 * 2 + 6 && count(log, 'ring') >= 2 + 6 && count(log, 'anim[fx-tint]') <= 1, log);
    check('trois univers en 100 ms : grille du jeu intacte (6 cartes du dernier univers)', grid.n === 6 && grid.first === grid.want && grid.cls === 'char-grid', grid);
    await wait(page, 400);
    check('univers rapides : rien ne reste', isIdle(await leftovers(page)), await leftovers(page));
    /* Personnage : anneau, éclat, l'émoji de la carte rebondit. */
    const emo = await clickAnim(page, '#char-grid .char-card:nth-child(3)', '#char-grid .char-card.selected .char-emoji');
    log = emo.log;
    check('personnage : anneau + éclat à sa couleur, rebond de l\'émoji (WAAPI finie, carte elle-même jamais animée)', has(log, 'perso[' + emo.char + ']') && count(log, 'ring') === 1 && has(log, 'burst[star]') && has(log, 'anim[perso]') &&
      emo.ms === 320 && emo.fill === 'backwards' && emo.props === 'transform' && emo.parent === 0 && emo.inline === null && emo.pal.char === emo.char, emo);
    await wait(page, 600);
    check('personnage : fini en 0,65 s, rien ne reste', isIdle(await leftovers(page)) && (await waapi(page)).length === 0, await leftovers(page));
    log = await during(page, () => page.click('#char-grid .char-card:nth-child(3)'), 200);
    check('personnage déjà choisi : aucun effet', log.length === 0, log);
    /* Carte remplacée par le jeu avant la frame : aucun effet, aucune erreur. */
    log = await during(page, () => page.evaluate(() => { const c = document.querySelector('#char-grid .char-card:nth-child(2)'); selectChar(c, c.dataset.char); renderCharGrid(); }), 200);
    check('personnage : carte re-générée avant la frame → rien, sans erreur', !has(log, 'ring') && (await leftovers(page)).errors.length === 0, log);
    /* Onglet de classe. */
    await center(page, '.mission-tabs'); await wait(page, 60);
    const chips = await clickAnim(page, '.mission-tab[data-classe="3e"]', '#mission-chips');
    log = chips.log;
    check('classe : trait sous l\'onglet, fondu d\'opacité des chapitres (200 ms), aucun nœud ajouté', log[0] === 'classe' && count(log, 'slash') === 1 && has(log, 'anim[classe]') && chips.ms === 200 && chips.props === 'opacity' && chips.fill === 'backwards' && chips.fxKids === 0 && chips.inline === null, chips);
    await wait(page, 450);
    check('classe : fini en 0,5 s', isIdle(await leftovers(page)), await leftovers(page));
    log = await during(page, () => page.click('.mission-tab[data-classe="3e"]'), 200);
    check('classe déjà choisie : aucun effet', log.length === 0, log);
    /* Thème : palette recalculée, fondu depuis l'ancien fond. */
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(page, 60);
    const veil = await clickAnim(page, '#theme-toggle-btn', '.fx-blade');
    log = veil.log; pal = veil.pal;
    check('thème : la palette suit (fond, variables, contraste ≥ 3:1)', pal.theme === 'light' && pal.bg === '#F5F5F7' && pal.v === pal.bg && pal.page === 'rgb(245, 245, 247)' && pal.contrast >= 3, pal);
    check('thème : voile de l\'ANCIEN fond qui s\'efface en 260 ms (jamais opaque, opacité seule)', log[0] === 'theme' && has(log, 'anim[theme]') && veil.found && veil.bg === 'rgb(13, 13, 26)' && veil.op > 0 && veil.op < 0.56 && veil.ms === 260 && veil.props === 'opacity', veil);
    await wait(page, 400);
    check('thème : fini en 0,45 s, panneau retiré', isIdle(await leftovers(page)) && (await blades(page)) === 0, await leftovers(page));
    log = await during(page, () => page.evaluate(() => { for (let i = 0; i < 6; i++) toggleTheme(); applyTheme('light'); }), 400);
    check('thème basculé 6 fois dans le même tick : un seul fondu', count(log, 'theme') === 1 && (await blades(page)) === 0, log);
    /* Envol : départ d'un mode depuis une carte (clic au point d'appui, clavier au centre de la carte). */
    await center(page, '.level-card[onclick="showAutoMenu()"]'); await wait(page, 60);
    const fly = await transit(page, 'auto-menu', '.level-card[onclick="showAutoMenu()"]');
    log = fly.all;
    check('envol : lame + anneau + éclat de traits, joués ensemble (particules vivantes au-dessus du panneau)', has(log, 'arrivee[auto-menu]') && has(log, 'envol[auto-menu]') && count(log, 'ring') === 1 && has(log, 'burst[streak]') && fly.n === 1 && fly.particles > 0 && fly.z === '-1', fly);
    await wait(page, 300);
    check('envol : fini en 0,65 s, rien ne reste', isIdle(await leftovers(page)), await leftovers(page));
    /* Depuis le menu, une carte vers une épreuve (profil sobre) : ni transition ni envol. */
    log = await during(page, () => page.click('.level-card[onclick="startAutoMode(\'auto_6e\')"]'), 120);
    check('carte vers une épreuve (profil sobre) : ni transition ni envol', !has(log, 'arrivee') && !has(log, 'envol') && (await blades(page)) === 0 && (await shown(page)) === 'auto', log);
    await page.evaluate(() => exitAutoMode()); await wait(page, 700);
    /* Vrai clic de souris (point d'appui) puis clavier (centre de la carte) : mêmes effets. */
    await center(page, '.level-card[onclick="startTrueFalse()"]'); await wait(page, 60);
    const box = await page.evaluate(() => { const r = document.querySelector('.level-card[onclick="startTrueFalse()"]').getBoundingClientRect(); return [r.left, r.top]; });
    log = await during(page, () => page.mouse.click(box[0] + 30, box[1] + 20), 100);
    check('envol (souris) : joué au point d\'appui', has(log, 'envol[tf]') && has(log, 'burst[streak]'), log);
    await page.evaluate(() => { clearInterval(tfState.timer); showHome(); }); await wait(page, 700);
    await page.focus('.level-card[onclick="startPuzzleMode()"]');
    log = await during(page, () => page.keyboard.press('Enter'), 100);
    check('envol (clavier) : joué depuis le centre de la carte', has(log, 'envol[puzzle]') && has(log, 'burst[streak]'), log);
    await page.evaluate(() => { clearInterval(puzzleState.timer); showHome(); }); await wait(page, 700);
    /* Un écran atteint sans carte (bouton de statistiques) : transition seule. */
    await page.evaluate(() => window.scrollTo(0, 0));
    log = await during(page, () => page.click('#stats-btn'), 80);
    check('statistiques (bouton, pas une carte) : transition sans envol', has(log, 'arrivee[stats]') && !has(log, 'envol'), log);
    check('aucune erreur (accueil)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }
  async function homeLevels(browser) {
    /* Léger : formes courtes, ni teinte, ni onde plein écran, ni émoji, ni ondulation, ni rebond. */
    let page = await open(browser, ANIME, { viewport: { width: 1280, height: 800 } });
    await page.evaluate(() => FX.setLevel('leger'));
    await settle(page);
    await page.evaluate(() => window.scrollTo(0, 430)); await wait(page, 60);
    let log = await during(page, () => page.click('.universe-card[data-universe="pokemon"]'), 500);
    const burst = await page.evaluate(() => FX.debug.log.filter((e) => e.fx === 'burst').map((e) => e.n));
    check('univers (léger) : anneau de la carte + éclat réduit (≤ 8), sans teinte, onde, émoji ni ondulation', has(log, 'univers[pokemon]~') && count(log, 'ring') === 1 && burst.length === 1 && burst[0] <= 8 && !has(log, 'anim[fx-tint]') && !has(log, 'sprite') && log.every((l) => /~$/.test(l)), [log, burst]);
    await wait(page, 250);
    check('univers (léger) : fini en 0,75 s', isIdle(await leftovers(page)), await leftovers(page));
    await wait(page, 300);
    const lite = await clickAnim(page, '#char-grid .char-card:nth-child(4)', '#char-grid .char-card.selected .char-emoji');
    check('personnage (léger) : anneau + éclat réduit, sans rebond', has(lite.log, 'perso[') && count(lite.log, 'ring') === 1 && !has(lite.log, 'anim[perso]') && lite.ms === 0, lite);
    await center(page, '.level-card[onclick="showAutoMenu()"]'); await wait(page, 60);
    const fade = await transit(page, 'auto-menu', '.level-card[onclick="showAutoMenu()"]');
    log = fade.all;
    check('envol (léger) : fondu de 140 ms (seule animation de la couche) + anneau, éclat réduit', has(log, 'arrivee[auto-menu]~') && has(log, 'envol[auto-menu]~') && count(log, 'ring') === 1 && fade.ms === 140 && fade.waapi.join() === '140' && fade.particles <= 8, fade);
    check('aucune erreur (accueil, léger)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
    /* Off : tout passe par le jeu seul ; la palette reste juste si on rallume. */
    page = await open(browser, ANIME, { viewport: { width: 1280, height: 800 } });
    await page.evaluate(() => FX.setLevel('off'));
    await page.click('.universe-card[data-universe="dragonball"]'); await wait(page, 300);
    await page.click('#char-grid .char-card:nth-child(2)');
    await page.click('.mission-tab[data-classe="5e"]');
    await page.click('#theme-toggle-btn');
    await page.click('.level-card[onclick="startPythMode()"]'); await wait(page, 200);
    const off = await page.evaluate(() => ({ log: FX.debug.log.length, kids: document.getElementById('fx-stage').children.length, root: getComputedStyle(document.getElementById('fx-root')).display, s: FX.stats() }));
    check('off : aucun effet, aucun nœud, calque masqué, écran suivi', off.log === 0 && off.kids === 0 && off.root === 'none' && off.s.screen === 'pythagore' && off.s.particles + off.s.anims + off.s.timers === 0 && (await waapi(page)).length === 0, [off.log, off.kids, off.root, off.s.screen]);
    const back = await page.evaluate(() => { FX.setLevel('complet'); const p = FX.palette(); return [p.universe, p.theme, p.uRaw === UNIVERSES.dragonball.color]; });
    check('off puis rallumé : palette à jour (univers et thème changés pendant le off)', back.join() === 'dragonball,dark,true', back);
    check('aucune erreur (accueil, off)', page.errors.length === 0, page.errors);
    await page.context().close();
    /* Téléphone : ce qui est hors champ ne joue pas ; rien ne déborde. */
    page = await open(browser, ANIME, { viewport: { width: 360, height: 640 }, colorScheme: 'dark' });
    await settle(page);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    await center(page, '.universe-card[data-universe="myhero"]'); await wait(page, 60);
    log = await during(page, () => page.click('.universe-card[data-universe="myhero"]'), 700);
    const rings = count(log, 'ring'), inView = await page.evaluate(() => Array.from(document.querySelectorAll('#char-grid .char-card')).filter((c) => { const r = c.getBoundingClientRect(), cy = r.top + r.height / 2; return cy > 62 && cy < innerHeight && r.bottom > 0; }).length);
    check('téléphone : ondulation seulement sur les cartes de personnage visibles', rings === 2 + inView, [rings, inView, log]);
    check('téléphone : aucun débordement horizontal ajouté', (await page.evaluate(() => document.documentElement.scrollWidth)) === sw, sw);
    check('aucune erreur (téléphone)', page.errors.length === 0 && (await leftovers(page)).errors.length === 0, [page.errors, await leftovers(page)]);
    await page.context().close();
  }
  /* Correctifs du noyau : l'évènement « screen » n'est jamais abandonné, les périmés libèrent la file. */
  async function kernelQueue(browser) {
    const page = await open(browser, ANIME);
    await settle(page);
    const r = await page.evaluate(async () => {
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const out = {};
      let got = 0, scr = 0;
      FX.on('t:plein', () => { got++; });
      FX.on('screen', (d) => { if (d.id === 'stats' || d.id === 'puzzle') scr++; });
      FX.debug.drops.length = 0;
      const ok = [];
      for (let i = 0; i < 40; i++) ok.push(FX.emit('t:plein', i, null));
      showScreen('stats');                                    // la file est pleine : l'évènement du noyau passe quand même
      out.accepted = ok.filter(Boolean).length;
      out.queue = FX.stats().queue;
      await frame();
      out.got = got; out.scr = scr;
      out.drops = FX.debug.drops.map((d) => d.type + ':' + d.why);
      out.log = FX.debug.log.filter((e) => e.fx === 'arrivee').map((e) => e.info);
      /* 32 évènements d'une portée périmée ne bloquent plus les suivants. */
      got = 0;
      for (let i = 0; i < 32; i++) FX.emit('t:plein', i, 'q');
      FX.bump('q');
      out.afterStale = FX.emit('t:plein', 99, 'q');
      showScreen('puzzle');
      await frame();
      out.got2 = got; out.scr2 = scr; out.screen = FX.stats().screen; out.err = FX.stats().errCount;
      return out;
    });
    check('noyau : file pleine (32) → les autres évènements sont abandonnés, « screen » jamais', r.accepted === 32 && r.queue === 33 && r.got === 32 && r.scr === 1 && r.log.indexOf('stats') >= 0 &&
      r.drops.filter((d) => d === 't:plein:file pleine').length === 8 && !r.drops.some((d) => /^screen:/.test(d)), r);
    check('noyau : les évènements périmés libèrent la file (le suivant est accepté, puis abandonné au changement d\'écran)', r.afterStale === true && r.got2 === 0 && r.scr2 === 2 && r.screen === 'puzzle' && r.err === 0, r);
    check('aucune erreur (file du noyau)', page.errors.length === 0, page.errors);
    await page.context().close();
  }
  async function scenarioHome(browser) {
    await Promise.all([homeBoot(browser), homeMoments(browser), homeLevels(browser), kernelQueue(browser)]);
  }

  return [
    ['shell-diff', 'coquille : différentiel classique / off / complet / chaos', scenarioDiff],
    ['shell-nav', 'coquille : transitions entre les 23 écrans, navigation rapide, modales, Précédent', scenarioNav],
    ['shell-accueil', 'coquille : accueil (ouverture, univers, personnage, classe, envol, thème) et file du noyau', scenarioHome]
  ];
};
