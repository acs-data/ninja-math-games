/* Scénarios du réglage « Animations » (anime-src/03-settings.js) et de la couche COUPÉE.
   Chargé par tools/test_anime.js (voir HELPERS). Le scénario « reglages » du fichier principal couvre
   les boutons vivants ; ici, ce qui se passe quand la couche est coupée et ce que vaut un choix.

   · reglages-coupee  : couche coupée = le jeu de classique.html. Même session scriptée (QCM, pause, tabulation
                        dans les deux modales de pause, Automatismes) sur classique.html, sur index.html coupée
                        par le disjoncteur (FX.kill) et sur index.html NÉE coupée (Element.prototype.animate
                        retiré avant le chargement) : état, focus, annonces, DOM, mise en page, parcours de
                        Tab / Maj+Tab identiques ; boucles décoratives du jeu en marche ; aucun bouton de
                        la couche dans les modales de pause ; les crochets « always » survivent (écran
                        suivi, clé de réglage effacée quand la sauvegarde est coupée).
   · reglages-systeme : prefers-reduced-motion contre un choix du joueur. Le système l'emporte sur un
                        choix fait AVANT qu'il ne demande moins d'animations (en direct, dans les deux
                        sens, et au chargement avec une clé enregistrée) ; un choix fait PENDANT engage.
   · reglages-cle     : la clé amat_fx_v1 est validée (types, version), une valeur invalide est effacée
                        et ne coupe jamais la couche ; le bouton de l'accueil ne porte pas la classe
                        « active » du jeu (contraste du libellé ≥ 4,5:1 dans les deux thèmes). */
'use strict';

module.exports = function (h) {
  const { check, open, settle, gameShown, snap, firstDiff, domChecks, logOf, CLASSIC, ANIME } = h;
  const KEY = 'amat_fx_v1';

  /* Navigateur sans Web Animations (Safari < 13.1) : la couche naît coupée. Le jeu n'appelle jamais animate(). */
  function noWaapi() { delete Element.prototype.animate; }
  /* Sauvegarde activée et clé posée AVANT les scripts de la page, au premier chargement seulement. */
  function seedStorage(arg) {
    try {
      if (sessionStorage.getItem('__seme')) return;
      sessionStorage.setItem('__seme', '1');
      if (arg.save) localStorage.setItem('save_enabled', '1');
      if (arg.value !== null) localStorage.setItem(arg.key, arg.value);
    } catch (e) { /* stockage indisponible */ }
  }
  const fx = (page) => page.evaluate(() => {
    const b = (id) => { const e = document.getElementById(id); return e ? [e.disabled, e.getAttribute('aria-pressed'), e.textContent.replace(/\s+/g, ' ').trim()] : null; };
    const s = FX.stats();
    return { level: FX.level(), attr: document.documentElement.getAttribute('data-fx'), dead: s.dead, deadAttr: document.documentElement.getAttribute('data-fx-dead'),
      explicit: s.explicit, reduced: s.reduced, key: localStorage.getItem('amat_fx_v1'), errors: s.errors, modules: Object.keys(s.modules).length, screen: s.screen,
      home: b('fx-set-home'), drawer: b('fx-set-drawer'), lite: b('fx-lite-drawer'), pause: b('fx-set-pause'), autoPause: b('fx-set-auto-pause'),
      arena: !!document.getElementById('fx-arena'), log: FX.debug.log.length };
  });
  const loops = (page) => page.evaluate(() => ['.chakra-dot', '.hero-ninja'].map((q) => getComputedStyle(document.querySelector(q)).animationPlayState).join());

  /* ── reglages-coupee ── */
  /* Qui a le focus : « modale › bouton », ou « HORS MODALE › … » si le focus a quitté la modale ouverte. */
  const who = (page) => page.evaluate(() => {
    const a = document.activeElement, m = a && a.closest ? a.closest('.modal-overlay') : null;
    return (m ? m.id : 'HORS MODALE') + ' › ' + (a ? (a.id || a.textContent.replace(/\s+/g, ' ').trim().slice(0, 24) || a.tagName) : '—');
  });
  const walk = async (page, key, n) => { const seq = []; for (let i = 0; i < n; i++) { await page.keyboard.press(key); seq.push(await who(page)); } return seq; };
  /* Mise en page : en-tête, enfants de l'écran affiché (hors nœuds de la couche), réponses, boutons de la modale. */
  const rects = (page) => page.evaluate(() => {
    const out = {};
    document.getAnimations().forEach((a) => {
      try { if (a.effect && a.effect.getComputedTiming().endTime === Infinity) { a.pause(); a.currentTime = 0; } else a.finish(); } catch (e) { /* animation déjà retirée */ }
    });
    const add = (key, el) => { const r = el.getBoundingClientRect(); if (r.width || r.height) out[key] = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10).join(','); };
    add('header', document.querySelector('header'));
    document.querySelectorAll('[id^="screen-"]').forEach((scr) => {
      if (getComputedStyle(scr).display === 'none') return;
      add(scr.id, scr);
      Array.from(scr.children).filter((c) => !/^fx-/.test(c.id)).forEach((c, i) => add(scr.id + '>' + i + ':' + (c.id || c.className), c));
    });
    document.querySelectorAll('#answers-grid .answer-btn, .modal-overlay.show .modal, .modal-overlay.show button').forEach((el, i) => add('el' + i + ':' + (el.id || el.className), el));
    out.scroll = document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight;
    return out;
  });
  /* Même session pour toutes les pages : QCM, pause (Tab ×7, Maj+Tab ×5), réponse, Automatismes, pause (idem). */
  async function session(page) {
    const shots = [], tabs = {}, layout = {};
    const shot = async (label) => { shots.push(await snap(page, label)); };
    await shot('accueil');
    await page.evaluate(() => startGame('6e_facile')); await gameShown(page);
    await shot('q1'); layout.q1 = await rects(page);
    await page.keyboard.press('Escape'); await shot('pause'); layout.pause = await rects(page);
    tabs.first = await who(page);
    tabs.pauseTab = await walk(page, 'Tab', 7);
    /* Reprise par la fonction du jeu (Échap DANS la modale la ferme puis la rouvre : comportement d'origine),
       puis pause au clavier : le focus repart du premier bouton. */
    await page.evaluate(() => resumeGame()); await settle(page);
    await page.keyboard.press('Escape'); await settle(page);
    tabs.pauseShift = await walk(page, 'Shift+Tab', 5);
    await page.evaluate(() => resumeGame()); await shot('reprise');
    await page.keyboard.press(String((await page.evaluate(() => state.questions[state.qIndex].correct)) + 1)); await shot('q1 juste');
    await page.evaluate(() => { pauseGame(); quitFromPause(); startAutoMode('auto_6e'); }); await settle(page);
    await page.focus('#auto-input'); await page.keyboard.press('Escape'); await shot('pause automatismes'); layout.autoPause = await rects(page);
    tabs.autoFirst = await who(page);
    tabs.autoTab = await walk(page, 'Tab', 7);
    await page.evaluate(() => resumeAutoMode()); await settle(page);
    await page.focus('#auto-input'); await page.keyboard.press('Escape'); await settle(page);
    tabs.autoShift = await walk(page, 'Shift+Tab', 5);
    await page.evaluate(() => { resumeAutoMode(); exitAutoMode(); showHome(); }); await shot('retour accueil');
    return { page, shots, tabs, layout, loops: await loops(page) };
  }
  async function scenarioDead(browser) {
    const killed = async () => { const p = await open(browser, ANIME); await p.evaluate(() => { FX.kill('essai'); }); return p; };
    const [classic, cut, born] = await Promise.all([
      open(browser, CLASSIC, { init: [[noWaapi]] }).then(session),
      killed().then(session),
      open(browser, ANIME, { init: [[noWaapi]] }).then(session)
    ]);
    const inside = (seq, modal) => seq.every((s) => s.indexOf(modal + ' › ') === 0);
    check('couche coupée : la session classique reste dans les modales de pause (Tab et Maj+Tab font le tour des 3 boutons)',
      inside(classic.tabs.pauseTab.concat(classic.tabs.pauseShift), 'modal-pause') && inside(classic.tabs.autoTab.concat(classic.tabs.autoShift), 'modal-auto-pause') &&
      new Set(classic.tabs.pauseTab).size === 3 && new Set(classic.tabs.pauseShift).size === 3, classic.tabs);
    for (const [name, r] of [['disjoncteur', cut], ['née coupée', born]]) {
      const f = await fx(r.page);
      check('couche coupée (' + name + ') : coupée, niveau off, boutons de l\'accueil et du tiroir inactifs « indisponibles »',
        f.dead && f.level === 'off' && f.attr === 'off' && [f.home, f.drawer, f.lite].every((b) => b && b[0] === true && /indisponibles/.test(b[2])), f);
      check('couche coupée (' + name + ') : aucun bouton de la couche dans les deux modales de pause', f.pause === null && f.autoPause === null, [f.pause, f.autoPause]);
      check('couche coupée (' + name + ') : Tab ×7 et Maj+Tab ×5 dans la pause du QCM, comme classique.html (le focus ne sort pas de la modale)',
        JSON.stringify([r.tabs.first, r.tabs.pauseTab, r.tabs.pauseShift]) === JSON.stringify([classic.tabs.first, classic.tabs.pauseTab, classic.tabs.pauseShift]), [r.tabs.pauseTab, r.tabs.pauseShift, classic.tabs.pauseTab, classic.tabs.pauseShift]);
      check('couche coupée (' + name + ') : Tab ×7 et Maj+Tab ×5 dans la pause des Automatismes, comme classique.html',
        JSON.stringify([r.tabs.autoFirst, r.tabs.autoTab, r.tabs.autoShift]) === JSON.stringify([classic.tabs.autoFirst, classic.tabs.autoTab, classic.tabs.autoShift]), [r.tabs.autoTab, r.tabs.autoShift, classic.tabs.autoTab, classic.tabs.autoShift]);
      check('couche coupée (' + name + ') : état du jeu, focus, annonces et toasts identiques à classique.html', !firstDiff(classic.shots, r.shots), firstDiff(classic.shots, r.shots));
      for (const key of Object.keys(classic.layout)) {
        const diff = Object.keys(Object.assign({}, classic.layout[key], r.layout[key])).filter((k) => classic.layout[key][k] !== r.layout[key][k]);
        check('couche coupée (' + name + ') : mise en page identique (' + key + ')', diff.length === 0, diff.slice(0, 4).map((k) => k + ' ' + classic.layout[key][k] + ' ≠ ' + r.layout[key][k]));
      }
      check('couche coupée (' + name + ') : boucles décoratives du jeu en marche, comme dans classique.html', r.loops === 'running,running' && classic.loops === r.loops, [classic.loops, r.loops]);
      check('couche coupée (' + name + ') : rien de joué, aucune erreur console / page', f.log === 0 && r.page.errors.length === 0, [f.log, r.page.errors]);
    }
    const b = await fx(born.page);
    check('née coupée : raison « incompatible », aucun module démarré, pas d\'arène', b.deadAttr === 'incompatible' && b.modules === 0 && !b.arena && b.errors.length === 0, b);
    check('aucune erreur console / page (classique sans Web Animations)', classic.page.errors.length === 0, classic.page.errors);
    await domChecks('couche coupée', [['classique', classic], ['disjoncteur', cut], ['née coupée', born]]);

    /* Coupée PENDANT que le bouton de la couche a le focus dans la modale : il reste en place, inerte, tant que
       le focus est sur lui (le retirer ferait tomber le focus hors de la modale), puis disparaît. */
    for (const [key, modal, own, start] of [['Tab', 'modal-pause', 'fx-set-pause', 'qcm'], ['Shift+Tab', 'modal-auto-pause', 'fx-set-auto-pause', 'auto']]) {
      const page = await open(browser, ANIME);
      if (start === 'qcm') { await page.evaluate(() => startGame('6e_facile')); await gameShown(page); }
      else { await page.evaluate(() => startAutoMode('auto_6e')); await settle(page); await page.focus('#auto-input'); }
      await page.keyboard.press('Escape'); await settle(page);
      await page.keyboard.press('Shift+Tab');
      const before = await who(page);
      await page.evaluate(() => { FX.kill('essai'); });
      const held = await page.evaluate((id) => { const e = document.getElementById(id); return e ? [document.activeElement === e, e.disabled, e.getAttribute('aria-disabled')] : null; }, own);
      await page.keyboard.press('Enter');
      const inert = await page.evaluate((m) => [FX.level(), document.getElementById(m).classList.contains('show')], modal);
      check('coupée avec le focus sur le bouton de la couche (' + modal + ') : il garde le focus, inerte (aria-disabled), la modale reste ouverte',
        before === modal + ' › ' + own && !!held && held[0] === true && held[1] === false && held[2] === 'true' && inert[0] === 'off' && inert[1] === true, [before, held, inert]);
      const seq = await walk(page, key, 4);
      const gone = await page.evaluate((id) => !document.getElementById(id), own);
      check('coupée avec le focus sur le bouton de la couche (' + modal + ') : ' + key + ' rend le focus à un bouton du jeu, le bouton est retiré, le tour continue dans la modale',
        gone && seq.every((s) => s.indexOf(modal + ' › ') === 0 && s.indexOf('fx-') < 0) && new Set(seq.slice(0, 3)).size === 3, [gone, seq]);
      check('aucune erreur console / page (coupée, focus sur le bouton, ' + modal + ')', page.errors.length === 0, page.errors);
      await page.context().close();
    }

    /* Crochets « always » après la coupure : l'écran reste suivi, et couper la sauvegarde efface la clé de réglage. */
    const page = await open(browser, ANIME);
    await page.evaluate(() => { toggleSave(); FX.setLevel('leger'); });
    const stored = await page.evaluate(() => localStorage.getItem('amat_fx_v1'));
    await page.evaluate(() => { FX.kill('essai'); showScreen('stats'); });
    const tracked = (await fx(page)).screen;
    await page.evaluate(() => showScreen('home'));
    await page.click('#save-toggle-btn');
    const after = await page.evaluate(() => ({ key: localStorage.getItem('amat_fx_v1'), save: localStorage.getItem('save_enabled') }));
    check('couche coupée : l\'écran courant reste suivi (crochet « always » de showScreen)', tracked === 'stats', tracked);
    check('couche coupée : couper la sauvegarde efface amat_fx_v1 dans le même tick (crochet « always » de toggleSave)',
      !!stored && after.key === null && after.save === null, [stored, after]);
    await page.context().close();
    /* Née coupée : même nettoyage (le crochet de toggleSave est posé par le réglage, pas par les crochets du noyau). */
    const p2 = await open(browser, ANIME, { init: [[noWaapi], [seedStorage, { key: KEY, value: '{"v":1,"n":"leger","d":"leger","r":0}', save: true }]] });
    const b0 = await fx(p2);
    await p2.evaluate(() => toggleSave());
    const b1 = await fx(p2);
    check('née coupée : la clé enregistrée est gardée tant que la sauvegarde est active, effacée quand elle est coupée', b0.dead && !!b0.key && b1.key === null, [b0.key, b1.key]);
    await p2.context().close();
  }

  /* ── reglages-systeme ── */
  async function scenarioSystem(browser) {
    const reduce = async (page, on) => { await page.emulateMedia({ reducedMotion: on ? 'reduce' : 'no-preference' }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
    const lv = async (page) => { const f = await fx(page); return f.level + '/' + f.attr + '/' + (f.explicit ? 'choix' : 'système') + '/' + (f.reduced ? 'réduit' : 'normal'); };
    /* 1. Choix fait AVANT (deux clics sans changement net : OFF puis ON), puis le système demande moins d'animations. */
    let page = await open(browser, ANIME);
    await page.click('#fx-set-home'); await page.click('#fx-set-home');
    const s0 = await lv(page);
    await reduce(page, true);
    const s1 = await lv(page), home1 = (await fx(page)).home;
    await page.evaluate(() => { FX.debug.log.length = 0; startGame('6e_facile'); });
    await gameShown(page);
    await page.evaluate(() => answer(state.questions[state.qIndex].correct)); await page.waitForTimeout(200);
    const played = await logOf(page);
    check('système : un choix fait avant ne survit pas à « moins d\'animations » (complet → off, en direct)',
      s0 === 'complet/complet/choix/normal' && s1 === 'off/off/système/réduit' && home1[1] === 'false' && /OFF/.test(home1[2]), [s0, s1, home1]);
    check('système : plus rien ne joue (chargement, question, bonne réponse)', played.length === 0 && (await loops(page)) === 'paused,paused', played);
    await page.evaluate(() => showHome());
    /* 2. Le système cesse de le demander : le choix d'avant revient. */
    await reduce(page, false);
    const s2 = await lv(page);
    check('système : le choix d\'avant revient quand le système ne demande plus rien', s2 === 'complet/complet/choix/normal', s2);
    /* 3. Choix fait PENDANT : rallumer démarre à léger, et ce choix engage dans les deux sens. */
    await reduce(page, true);
    await page.click('#fx-set-home');
    const s3 = await lv(page);
    await reduce(page, false); const s4 = await lv(page);
    await reduce(page, true); const s5 = await lv(page);
    check('système : rallumer sous « moins d\'animations » donne léger, et ce choix tient ensuite (système coupé puis remis)',
      s3 === 'leger/leger/choix/réduit' && s4 === 'leger/leger/choix/normal' && s5 === 'leger/leger/choix/réduit', [s3, s4, s5]);
    /* 4. Sans aucun choix : le niveau suit le système en direct (comportement d'origine). */
    await page.context().close();
    page = await open(browser, ANIME);
    const f0 = await lv(page); await reduce(page, true); const f1 = await lv(page); await reduce(page, false); const f2 = await lv(page);
    check('système : sans choix, le niveau suit le système en direct', f0 === 'complet/complet/système/normal' && f1 === 'off/off/système/réduit' && f2 === f0, [f0, f1, f2]);
    check('aucune erreur console / page (système)', page.errors.length === 0, page.errors);
    await page.context().close();
    /* 5. Au chargement, avec une clé enregistrée (sauvegarde activée). */
    const load = async (value, reducedMotion) => {
      const p = await open(browser, ANIME, { reducedMotion, init: [[seedStorage, { key: KEY, value, save: true }]] });
      await p.waitForTimeout(900);                                           // l'ouverture de l'accueil aurait joué
      const out = { lv: await lv(p), key: await p.evaluate(() => localStorage.getItem('amat_fx_v1')), log: await logOf(p), errors: p.errors };
      await p.click('#fx-set-home');
      out.clic = await lv(p); out.keyClic = await p.evaluate(() => localStorage.getItem('amat_fx_v1'));
      await p.context().close();
      return out;
    };
    const [avant, ancien, pendant, normal] = await Promise.all([
      load('{"v":1,"n":"complet","d":"complet","r":0}', 'reduce'),
      load('{"v":1,"n":"complet","d":"complet"}', 'reduce'),                 // clé écrite par une version sans « r »
      load('{"v":1,"n":"leger","d":"leger","r":1}', 'reduce'),
      load('{"v":1,"n":"leger","d":"leger","r":1}', 'no-preference')
    ]);
    check('système : clé « complet » d\'avant + système réduit au chargement → off, rien ne joue, la clé est gardée',
      avant.lv === 'off/off/système/réduit' && avant.log.length === 0 && /"n":"complet"/.test(avant.key), avant);
    check('système : une clé sans « r » (ancienne version) est traitée comme un choix d\'avant', ancien.lv === 'off/off/système/réduit' && ancien.log.length === 0, ancien);
    check('système : rallumer depuis cet état écrit un choix « léger » marqué r = 1', avant.clic === 'leger/leger/choix/réduit' && /"n":"leger"/.test(avant.keyClic) && /"r":1/.test(avant.keyClic), [avant.clic, avant.keyClic]);
    check('système : clé « léger » choisie pendant (r = 1) + système réduit → léger', pendant.lv === 'leger/leger/choix/réduit' && pendant.log.length > 0 && pendant.log.every((l) => /~$/.test(l)), pendant);
    check('système : la même clé sans demande du système → léger aussi (un choix reste un choix)', normal.lv === 'leger/leger/choix/normal', normal);
    check('aucune erreur console / page (système, chargements)', avant.errors.length + ancien.errors.length + pendant.errors.length + normal.errors.length === 0, [avant.errors, ancien.errors, pendant.errors, normal.errors]);
  }

  /* ── reglages-cle ── */
  async function scenarioKey(browser) {
    /* Valeurs invalides : aucune ne donne un niveau, aucune ne coupe la couche, toutes sont effacées. */
    const BAD = ['{"v":1,"n":["off"],"d":"complet"}', '{"n":{"toString":1}}', '{"v":1,"n":{"toString":1}}', '{"v":2,"n":"off","d":"leger"}', '{"n":"off"}',
      'pas du json', '{"v":1,"n":"__proto__"}', '{"v":1,"n":"constructor"}', 'null', '[]', '"off"', '{"v":1}', '{"v":1,"n":0}'];
    const res = await Promise.all(BAD.map(async (value) => {
      const p = await open(browser, ANIME, { init: [[seedStorage, { key: KEY, value, save: true }]] });
      const f = await fx(p);
      await p.click('#fx-set-home'); const off = await fx(p);
      await p.click('#fx-set-home'); const on = await fx(p);
      const errors = p.errors;
      await p.context().close();
      return { value, f, off, on, errors };
    }));
    const wrong = res.filter((r) => !(r.f.dead === false && r.f.level === 'complet' && r.f.attr === 'complet' && r.f.explicit === false && r.f.key === null &&
      r.f.home[0] === false && r.f.home[1] === 'true' && /Animations : ON/.test(r.f.home[2]) && r.f.pause !== null && r.f.errors.length === 0 && r.errors.length === 0));
    check('clé invalide (' + BAD.length + ' valeurs : mauvais type, autre version, texte illisible) : niveau par défaut, bouton cohérent, couche vivante, clé effacée',
      wrong.length === 0, wrong.map((r) => [r.value, r.f.level, r.f.dead, r.f.key, r.f.home, r.f.errors, r.errors]));
    const stuck = res.filter((r) => !(r.off.level === 'off' && /OFF/.test(r.off.home[2]) && r.on.level === 'complet' && /ON/.test(r.on.home[2]) && /^\{"v":1,"n":"complet","d":"complet","r":0\}$/.test(r.on.key)));
    check('clé invalide : le bouton coupe puis rallume normalement, et la clé réécrite est saine', stuck.length === 0, stuck.map((r) => [r.value, r.off.level, r.on.level, r.on.key]));
    /* Valeurs valides : relues telles quelles. */
    const good = await Promise.all([['{"v":1,"n":"off","d":"leger","r":0}', 'off', 'leger'], ['{"v":1,"n":"leger","d":"leger","r":0}', 'leger', 'off'], ['{"v":1,"n":"off","d":"<b>x</b>","r":0}', 'off', 'complet']].map(async ([value, want, next]) => {
      const p = await open(browser, ANIME, { init: [[seedStorage, { key: KEY, value, save: true }]] });
      const f = await fx(p);
      await p.click('#fx-set-home');
      const g = await fx(p);
      await p.context().close();
      return [value, f.level === want && f.explicit && f.key === value && g.level === next, f.level, g.level, f.key];
    }));
    check('clé valide : niveau et dernier niveau actif relus (un « d » inconnu retombe sur le défaut)', good.every((g) => g[1]), good);
    /* Sauvegarde inactive : la clé n'est ni lue ni gardée (comportement d'origine). */
    const p0 = await open(browser, ANIME, { init: [[seedStorage, { key: KEY, value: '{"v":1,"n":"off","d":"leger","r":0}', save: false }]] });
    const f0 = await fx(p0);
    check('sauvegarde inactive : clé ni lue ni gardée', f0.level === 'complet' && f0.key === null, f0);
    await p0.context().close();

    /* Bouton de l'accueil : jamais la classe « active » du jeu ; libellé lisible dans les deux thèmes, ON comme OFF. */
    const contrast = () => {
      const parse = (c) => { const p = String(c).match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const over = (t, b) => [t[0] * t[3] + b[0] * (1 - t[3]), t[1] * t[3] + b[1] * (1 - t[3]), t[2] * t[3] + b[2] * (1 - t[3]), 1];
      const b = document.getElementById('fx-set-home'), lb = b.querySelector('span:not([aria-hidden])');
      b.getAnimations().concat(lb.getAnimations()).forEach((a) => { try { a.finish(); } catch (e) { /* transition déjà finie */ } });
      const stack = [];
      for (let e = b; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) stack.push(c); if (c[3] >= 1) break; }
      let bg = [255, 255, 255, 1];
      for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
      const x = lum(parse(getComputedStyle(lb).color)), y = lum(bg);
      return { ratio: Math.round((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) * 100) / 100, active: b.classList.contains('active'), pressed: b.getAttribute('aria-pressed'), text: lb.textContent,
        opaque: stack.length > 0 && stack[stack.length - 1][3] >= 1 };
    };
    const seen = [];
    for (const theme of ['light', 'dark']) {
      const p = await open(browser, ANIME, { colorScheme: theme });
      await p.evaluate((t) => { if ((document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark') !== t) toggleTheme(); }, theme);
      await settle(p);
      seen.push([theme, 'ON', await p.evaluate(contrast)]);
      await p.click('#fx-set-home'); await settle(p);
      seen.push([theme, 'OFF', await p.evaluate(contrast)]);
      await p.context().close();
    }
    check('bouton de l\'accueil : jamais la classe « active » du jeu, état porté par le texte et aria-pressed',
      seen.every(([, st, c]) => !c.active && c.pressed === String(st === 'ON') && c.text === 'Animations : ' + st), seen);
    check('bouton de l\'accueil : libellé ≥ 4,5:1 sur son fond, thèmes clair et sombre, ON et OFF', seen.every(([, , c]) => c.opaque && c.ratio >= 4.5), seen.map(([t, s, c]) => t + ' ' + s + ' ' + c.ratio));
  }

  return [
    ['reglages-coupee', 'réglages : couche coupée (disjoncteur, navigateur incompatible) = le jeu de classique.html', scenarioDead],
    ['reglages-systeme', 'réglages : prefers-reduced-motion contre un choix du joueur (en direct et au chargement)', scenarioSystem],
    ['reglages-cle', 'réglages : clé amat_fx_v1 validée, bouton de l\'accueil lisible', scenarioKey]
  ];
};
