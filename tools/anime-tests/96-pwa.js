/* Scénario « pwa » : le VRAI service worker (sw.js du dépôt) servi en http par un petit serveur local, un
   serveur (donc une origine) par parcours, sur un port libre (aucun fragment ne porte ce numéro).
   Chargé par tools/test_anime.js (voir HELPERS). Les pages sont servies sous /ninja-math-games/, comme en
   production, avec « Cache-Control: max-age=600 » (ce que fait GitHub Pages ; « no-cache » dans les parcours
   qui mesurent un délai, pour que le cache HTTP ne masque pas le serveur lent) ; chaque page HTML porte un
   marqueur de version, pour savoir QUELLE copie le service worker a mise en cache.

   index.html (la page principale, l'édition animée) est ESSENTIELLE ; classique.html (le jeu classique) est
   OPTIONNELLE ; anime.html (ancienne adresse de l'édition animée) n'est qu'une page de redirection vers ./.
   · page principale seule : un joueur qui n'a jamais ouvert classique.html ne la télécharge ni à l'installation
                        ni à une mise à jour (même si le serveur la sert lentement) ; hors-ligne, la page
                        principale marche, et classique.html (jamais en cache) comme anime.html retombent
                        proprement sur la page principale.
   · déjà venu        : un joueur qui a ouvert classique.html la retrouve après un changement de version — copie
                        FRAÎCHE (requête « cache: reload », pas la copie du cache HTTP) — et l'ouvre hors-ligne.
   · arrivée directe  : première visite du site par classique.html → la page est en cache dès l'installation.
   · serveur lent     : classique.html servie en 8 s ne retarde pas la détection de mise à jour au-delà de ~3 s
                        (le jeu conclut « à jour » au bout de 5 s : ce faux message ne doit plus apparaître).
   · pannes           : classique.html en 404 ou connexion coupée pendant l'installation → le service worker
                        s'installe quand même, la page principale reste disponible hors-ligne.
   · ancienne adresse : anime.html redirige vers ./ en gardant la requête et l'ancre (avec ou sans JavaScript,
                        en ligne, hors-ligne, depuis le cache ou non) ; page statique minimale (aucun manifest,
                        aucune ressource, aucun service worker, aucun nom d'œuvre).
   · manifest         : une seule application (manifest.json), déclarée à l'identique par index.html et
                        classique.html, page de départ et identité DANS le chemin du projet ; manifest-anime.json
                        a disparu et l'ancienne page de départ (./anime.html) reste dans la portée. */
'use strict';
const fs = require('fs');
const http = require('http');
const path = require('path');
const { fileURLToPath } = require('url');

module.exports = function (h) {
  const { check, ROOT, ANIME } = h;
  const PREFIX = '/ninja-math-games/';
  const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/manifest+json', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const FILES = {};
  ['classique.html', 'anime.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'og-image.png', 'og-image.svg'].forEach((f) => { FILES[f] = path.join(ROOT, f); });
  FILES['index.html'] = fileURLToPath(ANIME);
  const OPTIONAL = { 'classique.html': 1 };
  const CLASSIC_TITLE = (fs.readFileSync(FILES['classique.html'], 'utf8').match(/<title>([^<]*)<\/title>/) || [])[1];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Un site : serveur local + réglages modifiables en cours de parcours (version déployée, marqueur du
     contenu, sort de la ressource optionnelle classique.html, délai de classique.html, serveur coupé). */
  async function site() {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const st = { version: 'v1', mark: 'M1', classic: 'ok', delay: 0, maxAge: 600, down: false, log: [] };
    const server = http.createServer((req, res) => {
      if (st.down) { req.socket.destroy(); return; }
      const u = new URL(req.url, 'http://x');
      const f = u.pathname.indexOf(PREFIX) === 0 ? (u.pathname.slice(PREFIX.length) || 'index.html') : '';
      st.log.push({ f: f, cache: req.headers['cache-control'] || '' });
      const head = (type) => ({ 'Content-Type': type, 'Cache-Control': st.maxAge ? 'max-age=' + st.maxAge : 'no-cache' });
      if (f === 'sw.js') { res.writeHead(200, head(MIME['.js'])); res.end(sw.replace(/__CACHE_VERSION__/g, st.version)); return; }
      if (!FILES[f]) { res.writeHead(404); res.end('absent'); return; }
      if (OPTIONAL[f] && st.classic === 'drop') { req.socket.destroy(); return; }
      if (OPTIONAL[f] && st.classic !== 'ok') { res.writeHead(Number(st.classic)); res.end('absent'); return; }
      let body = fs.readFileSync(FILES[f]);
      if (/\.html$/.test(f)) body = Buffer.from(body.toString('utf8').replace('</body>', '<!-- VERSION-' + st.mark + ' --></body>'));
      const send = () => { try { res.writeHead(200, head(MIME[path.extname(f)] || 'application/octet-stream')); res.end(body); } catch (e) { /* client parti */ } };
      if (f === 'classique.html' && st.delay) setTimeout(send, st.delay); else send();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    st.base = 'http://127.0.0.1:' + server.address().port + PREFIX;
    st.asked = (f) => st.log.filter((e) => e.f === f);
    st.close = () => new Promise((r) => { if (server.closeAllConnections) server.closeAllConnections(); server.close(() => r()); });
    return st;
  }
  async function player(browser) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('tutorial_seen', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    return { ctx, page };
  }
  const controlled = (page) => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  /* Contenu des caches : { nom: { './fichier': marqueur de version pour les pages } }. */
  const cachesOf = (page) => page.evaluate(async (prefix) => {
    const out = {};
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      out[k] = {};
      for (const r of await c.keys()) {
        const html = /\.html$|\/$/.test(new URL(r.url).pathname);
        const t = html ? await (await c.match(r)).text() : '';
        out[k]['./' + r.url.split(prefix)[1]] = (t.match(/VERSION-(\w+)/) || ['', ''])[1];
      }
    }
    return out;
  }, PREFIX);
  /* Attend (8 s au plus) qu'un fichier soit dans un cache. La boucle tourne DANS la page : waitForFunction
     n'attend pas une fonction asynchrone (la promesse renvoyée lui suffit), il répondrait « vrai » tout de suite. */
  const cached = (page, name, file) => page.evaluate(async ([name, file, prefix]) => {
    for (let i = 0; i < 160; i++) {
      if (await caches.has(name)) {
        const c = await caches.open(name);
        if ((await c.keys()).some((r) => r.url.split(prefix)[1] === file)) return true;
      }
      await new Promise((res) => setTimeout(res, 50));
    }
    return false;
  }, [name, file, PREFIX]);
  const updateToast = (page, ms) => page.waitForFunction(() => {
    const t = document.getElementById('toast');
    return !!t && t.classList.contains('show') && /Nouvelle version/.test(t.textContent) && !!t.querySelector('button');
  }, null, { timeout: ms || 15000 }).then(() => true, () => false);
  const waiting = (page) => page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return !!(reg && reg.waiting); });
  async function applyUpdate(page, name) {
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#toast button')]);
    await controlled(page);
    return page.evaluate(async (name) => {              // l'activation supprime les anciens caches : 8 s au plus
      let k = [];
      for (let i = 0; i < 160; i++) {
        k = await caches.keys();
        if (k.length === 1 && k[0] === name) break;
        await new Promise((res) => setTimeout(res, 50));
      }
      return k;
    }, name);
  }
  async function offline(st, who, on) { await who.ctx.setOffline(on); st.down = on; }
  async function nav(st, page, file) {
    try {
      const r = await page.goto(st.base + file, { waitUntil: 'load', timeout: 8000 });
      return await page.evaluate((status) => ({ status: status, fx: typeof FX !== 'undefined', home: !!document.getElementById('screen-home'),
        title: document.title, mark: (document.documentElement.outerHTML.match(/VERSION-(\w+)/) || ['', ''])[1] }), r ? r.status() : 0);
    } catch (e) { return { error: String(e).split('\n')[0].slice(0, 160) }; }
  }
  /* Navigation qui passe par la page de redirection : on attend l'adresse d'arrivée (le goto de la page
     remplacée peut être interrompu par la redirection), puis on décrit la page d'arrivée. */
  async function follow(page, url, target) {
    try { await page.goto(url, { waitUntil: 'commit', timeout: 8000 }); } catch (e) { /* navigation remplacée par la redirection */ }
    try {
      await page.waitForURL(target, { waitUntil: 'load', timeout: 8000 });
      await page.waitForFunction(() => !!document.getElementById('screen-home'), null, { timeout: 8000 });
      return await page.evaluate(() => ({ url: location.href, fx: typeof FX !== 'undefined', home: !!document.getElementById('screen-home'),
        title: document.title, mark: (document.documentElement.outerHTML.match(/VERSION-(\w+)/) || ['', ''])[1] }));
    } catch (e) { return { url: page.url(), error: String(e).split('\n')[0].slice(0, 160) }; }
  }
  const core = (c) => !!c && ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'].every((f) => f in c);

  /* A. Joueur de la page principale seule (jamais venu sur classique.html). */
  async function flowMain(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'a1', mark: 'A1', maxAge: 0 });
      await page.goto(st.base); await controlled(page);
      let c = await cachesOf(page);
      check('pwa, page principale seule : le service worker s\'installe et met la page principale (édition animée) en cache', core(c['amat-a1']), c);
      check('pwa, page principale seule : l\'installation ne demande NI classique.html NI anime.html au serveur',
        st.asked('classique.html').length + st.asked('anime.html').length === 0 && !('./classique.html' in (c['amat-a1'] || {})) && !('./anime.html' in (c['amat-a1'] || {})),
        [st.asked('classique.html').length, st.asked('anime.html').length]);
      /* Nouvelle version, alors que le serveur servirait classique.html en 8 s : rien à attendre, rien à télécharger. */
      Object.assign(st, { version: 'a2', mark: 'A2', delay: 8000, log: [] });
      const t0 = Date.now();
      await page.reload();
      const seen = await updateToast(page, 6000);
      check('pwa, page principale seule : toast « Nouvelle version » + bouton après un déploiement, sans attendre classique.html (< 6 s)', seen && await waiting(page), { seen: seen, ms: Date.now() - t0 });
      check('pwa, page principale seule : la mise à jour ne demande pas classique.html non plus', st.asked('classique.html').length === 0, st.asked('classique.html').length);
      const keys = seen ? await applyUpdate(page, 'amat-a2') : [];
      check('pwa, page principale seule : « METTRE À JOUR » → un seul cache (nouvelle version), page principale (édition animée) rechargée',
        keys.join() === 'amat-a2' && await page.evaluate(() => typeof FX !== 'undefined' && !!document.getElementById('screen-home')), keys);
      await offline(st, who, true);
      let r = await nav(st, page, 'index.html');
      check('pwa, page principale seule : index.html hors-ligne (édition animée, nouvelle version)', r.home === true && r.fx === true && r.mark === 'A2', r);
      r = await nav(st, page, '');
      check('pwa, page principale seule : ./ hors-ligne (édition animée)', r.home === true && r.fx === true, r);
      r = await nav(st, page, 'classique.html');
      check('pwa, page principale seule : classique.html hors-ligne, jamais mise en cache → repli propre sur la page principale', r.home === true && r.fx === true && r.status === 200, r);
      r = await nav(st, page, 'anime.html');
      check('pwa, page principale seule : anime.html (ancienne adresse) hors-ligne, jamais visitée → repli sur la page principale, le jeu s\'affiche',
        r.home === true && r.fx === true && r.status === 200 && r.mark === 'A2', r);
      await offline(st, who, false);
      check('pwa, page principale seule : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* B. Joueur qui a déjà ouvert le jeu classique (classique.html). */
  async function flowVisited(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'b1', mark: 'B1' });
      await page.goto(st.base); await controlled(page);
      await page.goto(st.base + 'classique.html');
      const first = await cached(page, 'amat-b1', 'classique.html');
      check('pwa, déjà venu : la première visite de classique.html la met en cache (gestionnaire fetch)', first, await cachesOf(page));
      Object.assign(st, { version: 'b2', mark: 'B2', log: [] });
      await page.goto(st.base + 'index.html');
      const seen = await updateToast(page);
      const c = await cachesOf(page), neuf = c['amat-b2'] || {};
      check('pwa, déjà venu : nouvelle version → toast de mise à jour sur la page principale', seen && await waiting(page), c);
      check('pwa, déjà venu : le nouveau cache contient la page principale et classique.html', core(neuf) && './classique.html' in neuf, Object.keys(neuf));
      /* La page principale a été demandée il y a moins de 10 min (max-age=600) : sans « cache: reload », l'installation
         rangerait dans le NOUVEAU cache la copie du cache HTTP, donc l'ancienne version, jusqu'au déploiement suivant. */
      check('pwa, déjà venu : la page principale mise en cache est la NOUVELLE (cache: reload, jamais la copie du cache HTTP)',
        neuf['./'] === 'B2' && neuf['./index.html'] === 'B2' && st.asked('index.html').length > 0 && st.asked('index.html').every((e) => /no-cache/.test(e.cache)),
        { racine: neuf['./'], index: neuf['./index.html'], asked: st.asked('index.html') });
      const asked = st.asked('classique.html');
      check('pwa, déjà venu : classique.html est redemandée au réseau sans passer par le cache HTTP (cache: reload) et la copie mise en cache est la NOUVELLE',
        asked.length === 1 && /no-cache/.test(asked[0].cache) && neuf['./classique.html'] === 'B2', { asked: asked, enCache: neuf['./classique.html'] });
      const keys = seen ? await applyUpdate(page, 'amat-b2') : [];
      check('pwa, déjà venu : « METTRE À JOUR » → un seul cache', keys.join() === 'amat-b2', keys);
      await offline(st, who, true);
      let r = await nav(st, page, 'classique.html');
      check('pwa, déjà venu : classique.html s\'ouvre hors-ligne après la mise à jour (jeu classique, sans la couche, nouvelle version)',
        r.fx === false && r.home === true && r.title === CLASSIC_TITLE && r.mark === 'B2', r);
      const play = r.home && !r.fx ? await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        startGame('6e_facile');
        for (let i = 0; i < 100 && getComputedStyle(document.getElementById('screen-game')).display === 'none'; i++) await wait(50);
        await wait(200);
        answer(state.questions[state.qIndex].correct); await wait(400);
        return { score: state.score, fx: typeof FX !== 'undefined' };
      }) : null;
      check('pwa, déjà venu : hors-ligne, une question du jeu classique se joue (sans couche)', !!play && play.score > 0 && play.fx === false, play);
      r = await nav(st, page, 'classique.html?source=pwa');
      check('pwa, déjà venu : classique.html?source=pwa hors-ligne → le jeu classique (repli du service worker)', r.fx === false && r.home === true, r);
      r = await nav(st, page, 'index.html');
      check('pwa, déjà venu : index.html hors-ligne → la page principale (édition animée), nouvelle version', r.fx === true && r.home === true && r.mark === 'B2', r);
      const animated = r.fx ? await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        startGame('6e_facile');
        for (let i = 0; i < 100 && getComputedStyle(document.getElementById('screen-game')).display === 'none'; i++) await wait(50);
        await wait(200);
        answer(state.questions[state.qIndex].correct); await wait(400);
        const s = FX.stats();
        return { score: state.score, played: FX.debug.log.length, err: s.errCount, dead: s.dead };
      }) : null;
      check('pwa, déjà venu : hors-ligne, une question se joue sur la page principale et la couche anime', !!animated && animated.score > 0 && animated.played > 0 && animated.err === 0 && !animated.dead, animated);
      await offline(st, who, false);
      check('pwa, déjà venu : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* C. Première visite du site directement par classique.html. */
  async function flowDirect(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'c1', mark: 'C1', maxAge: 0 });      // « no-cache » : le cache HTTP ne peut pas servir la page hors-ligne
      await page.goto(st.base + 'classique.html'); await controlled(page);
      const c = await cachesOf(page);                   // dès que le service worker contrôle la page : l'installation est finie
      check('pwa, arrivée directe : classique.html (ouverte pendant l\'installation) est mise en cache avec la page principale',
        core(c['amat-c1']) && './classique.html' in c['amat-c1'], c);
      await offline(st, who, true);
      let r = await nav(st, page, 'classique.html');
      check('pwa, arrivée directe : classique.html s\'ouvre hors-ligne dès la visite suivante (jeu classique)', r.fx === false && r.home === true && r.mark === 'C1', r);
      r = await nav(st, page, '');                     // la page animée reste ouverte : l'audit de la couche la relève
      check('pwa, arrivée directe : ./ hors-ligne → la page principale (édition animée)', r.fx === true && r.home === true, r);
      await offline(st, who, false);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* D. classique.html servie très lentement pendant une mise à jour, pour un joueur qui l'a déjà. */
  async function flowSlow(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'd1', mark: 'D1', maxAge: 0 });
      await page.goto(st.base); await controlled(page);
      await page.goto(st.base + 'classique.html');
      const primed = await cached(page, 'amat-d1', 'classique.html');
      await page.goto(st.base + 'index.html');
      await sleep(600);                                  // la vérification faite au chargement est passée
      Object.assign(st, { version: 'd2', mark: 'D2', delay: 8000, log: [] });
      /* « Vérifier les mises à jour » du jeu : toasts horodatés sur l'horloge de la page (garde-fou du jeu : 5 s). */
      const seq = await page.evaluate(async () => {
        const t0 = performance.now(), out = [], t = document.getElementById('toast');
        let last = '';
        const obs = new MutationObserver(() => {
          const s = t.textContent.trim().slice(0, 30);
          if (s !== last && t.classList.contains('show')) { last = s; out.push({ ms: Math.round(performance.now() - t0), text: s }); }
        });
        obs.observe(t, { childList: true, subtree: true, characterData: true, attributes: true });
        checkForUpdates();
        await new Promise((res) => setTimeout(res, 6500));
        obs.disconnect();
        return out;
      });
      const found = seq.filter((e) => /Nouvelle version/.test(e.text))[0];
      check('pwa, serveur lent : le joueur a bien classique.html en cache et le serveur la sert en 8 s', primed && st.asked('classique.html').length === 1, [primed, st.asked('classique.html').length]);
      check('pwa, serveur lent : la mise à jour est détectée sans attendre classique.html (toast « Nouvelle version » en moins de 4,5 s)', !!found && found.ms < 4500, seq);
      check('pwa, serveur lent : jamais de faux « Vous êtes à jour »', !seq.some((e) => /à jour/.test(e.text)), seq);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* E. Le jeu classique (ressource optionnelle) est en panne pendant l'installation d'une nouvelle version. */
  async function flowBroken(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'e0', mark: 'E0' });
      await page.goto(st.base); await controlled(page);
      let current = 'amat-e0';
      for (const mode of ['404', 'drop']) {
        st.classic = 'ok';
        await page.goto(st.base + 'classique.html');
        const primed = await cached(page, current, 'classique.html');
        Object.assign(st, { version: 'e-' + mode, mark: 'E' + mode, classic: mode, log: [] });
        await page.goto(st.base + 'index.html');
        const seen = await updateToast(page);
        const c = await cachesOf(page), neuf = c['amat-e-' + mode] || {};
        check('pwa, panne (' + mode + ') : classique.html redemandée mais en échec → le service worker s\'installe quand même (toast), sans elle',
          primed && seen && st.asked('classique.html').length >= 1 && core(neuf) && !('./classique.html' in neuf), { primed: primed, seen: seen, asked: st.asked('classique.html').length, cache: Object.keys(neuf) });
        current = 'amat-e-' + mode;
        if (seen) await applyUpdate(page, current);
      }
      await offline(st, who, true);
      let r = await nav(st, page, 'classique.html');
      check('pwa, panne : classique.html hors-ligne, absente du cache → repli propre sur la page principale', r.home === true && r.fx === true, r);
      r = await nav(st, page, 'index.html');
      check('pwa, panne : index.html hors-ligne (édition animée)', r.home === true && r.fx === true, r);
      await offline(st, who, false);
      check('pwa, panne : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* F. Ancienne adresse de l'édition animée (anime.html) : liens, favoris, applications installées depuis elle. */
  async function flowRedirect(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'f1', mark: 'F1', maxAge: 0 });
      /* Première visite du site par l'ancienne adresse, avec une requête et une ancre. */
      let r = await follow(page, st.base + 'anime.html?source=pwa#accueil', st.base + '?source=pwa#accueil');
      check('redirection : anime.html?source=pwa#accueil → ./?source=pwa#accueil (requête et ancre gardées), page principale (édition animée)',
        r.url === st.base + '?source=pwa#accueil' && r.home === true && r.fx === true && r.mark === 'F1', r);
      await controlled(page);
      check('redirection : le service worker ne pré-cache pas la page de redirection', !('./anime.html' in ((await cachesOf(page))['amat-f1'] || {})), await cachesOf(page));
      /* Visite contrôlée par le service worker : la page de redirection passe par le cache (gestionnaire fetch). */
      r = await follow(page, st.base + 'anime.html', st.base);
      const kept = await cached(page, 'amat-f1', 'anime.html');
      check('redirection : sous le service worker, anime.html → ./ (page principale)', r.url === st.base && r.fx === true && r.home === true, r);
      await offline(st, who, true);
      r = await follow(page, st.base + 'anime.html#suite', st.base + '#suite');
      check('redirection : hors-ligne, anime.html (copie en cache) redirige encore vers ./#suite et le jeu s\'affiche', kept && r.url === st.base + '#suite' && r.fx === true && r.home === true, [kept, r]);
      r = await nav(st, page, 'anime.html?source=pwa');
      check('redirection : hors-ligne, anime.html?source=pwa (pas en cache sous cette adresse) → le jeu s\'affiche (repli du service worker ou redirection)',
        r.home === true && r.fx === true, r);
      await offline(st, who, false);
      check('redirection : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
    /* Sans JavaScript : la balise meta refresh suffit. */
    const st2 = await site(), ctx = await browser.newContext({ viewport: { width: 412, height: 800 }, javaScriptEnabled: false });
    try {
      Object.assign(st2, { version: 'f2', mark: 'F2', maxAge: 0 });
      const p = await ctx.newPage();
      try { await p.goto(st2.base + 'anime.html', { waitUntil: 'commit', timeout: 8000 }); } catch (e) { /* remplacée */ }
      let url = '';
      try { await p.waitForURL(st2.base, { waitUntil: 'load', timeout: 8000 }); url = p.url(); } catch (e) { url = p.url() + ' (' + String(e).split('\n')[0].slice(0, 100) + ')'; }
      check('redirection : sans JavaScript, anime.html → ./ par la balise meta refresh', url === st2.base, url);
    } finally { await ctx.close(); await st2.close(); }
  }

  /* La page de redirection elle-même : statique, minimale, en français. */
  function redirectPage() {
    const html = fs.readFileSync(path.join(ROOT, 'anime.html'), 'utf8');
    const body = html.slice(html.indexOf('<body'));
    const links = (html.match(/\b(href|src)\s*=\s*"[^"]*"/g) || []);
    /* Le texte de la page sans ses commentaires HTML, retirés par balayage (indexOf) et non par une expression
       régulière : CodeQL signale un « replace » de « <!-- … --> » comme un nettoyage incomplet (CLAUDE.md § 7.4).
       Un commentaire non refermé est gardé tel quel : le contrôle qui suit le lit alors en entier. */
    const sansCommentaires = (texte) => {
      let reste = '', i = 0;
      for (;;) {
        const debut = texte.indexOf('<!--', i);
        const fin = debut < 0 ? -1 : texte.indexOf('-->', debut + 4);
        if (fin < 0) return reste + texte.slice(i);
        reste += texte.slice(i, debut);
        i = fin + 3;
      }
    };
    check('anime.html : HTML5 en français et UTF-8 (<!DOCTYPE html>, lang="fr", meta charset)',
      html.indexOf('<!DOCTYPE html>') === 0 && /<html lang="fr">/.test(html) && /<meta charset="UTF-8">/.test(html) && !/\r/.test(html), html.slice(0, 120));
    check('anime.html : titre en français, non indexée (robots noindex), meta refresh immédiat vers ./',
      /<title>[^<]*Redirection[^<]*<\/title>/.test(html) && /<meta name="robots" content="noindex">/.test(html) && /<meta http-equiv="refresh" content="0; url=\.\/">/.test(html), html.match(/<title>[^<]*<\/title>/));
    check('anime.html : script de redirection qui garde la requête et l\'ancre', html.indexOf("location.replace('./' + location.search + location.hash)") >= 0);
    check('anime.html : lien de secours visible vers ./, avec un texte explicite en français',
      /<a href="\.\/">[^<]*jeu[^<]*<\/a>/.test(body), (body.match(/<a [^>]*>[^<]*<\/a>/) || [])[0]);
    check('anime.html : un titre de niveau 1 qui dit que l\'adresse a changé, puis l\'explication (page principale)',
      /<h1>[^<]*adresse[^<]*<\/h1>\s*<p>[^<]*page principale[^<]*<\/p>/.test(body), (body.match(/<h1>[^]*?<\/p>/) || [])[0]);
    check('anime.html : aucun manifest, aucune ressource (seul lien : ./), aucun service worker, aucune adresse externe',
      !/rel="manifest"|manifest-anime|serviceWorker|sw\.js|https?:|\/\/|<img|<link|<iframe|url\(/i.test(sansCommentaires(html)) && links.join() === 'href="./"', links);
    check('anime.html : aucun nom d\'œuvre (univers du jeu)', !/naruto|one piece|dragon ball|my hero|demon slayer|pok[ée]mon/i.test(html), null);
    check('anime.html : petite page statique, pas une copie du jeu (ni couche, ni script du jeu)', html.length < 3000 && !/fx-script|fx-style|screen-home/.test(html), html.length);
  }

  /* Identité de l'application installée (norme Web App Manifest) : « id » résolu contre l'ORIGINE de
     start_url s'il est présent, sinon start_url elle-même. Une seule application désormais. */
  function manifests() {
    const page = 'https://acs-data.github.io' + PREFIX;
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const start = new URL(m.start_url, page + 'manifest.json'), scope = new URL(m.scope, page + 'manifest.json').href;
    const id = (m.id !== undefined ? new URL(m.id, start.origin) : start).href;
    check('manifest : une seule application, page de départ = page principale (./), identité dans le chemin du projet, portée qui contient la page de départ',
      start.href === page && id.indexOf(page) === 0 && start.href.indexOf(scope) === 0, [start.href, id, scope]);
    check('manifest : manifest-anime.json a disparu, et l\'ancienne page de départ (./anime.html) reste dans la portée (elle redirige)',
      !fs.existsSync(path.join(ROOT, 'manifest-anime.json')) && fs.existsSync(path.join(ROOT, 'anime.html')) && new URL('./anime.html', page).href.indexOf(scope) === 0, scope);
    const decl = (f) => (fs.readFileSync(f, 'utf8').match(/<link rel="manifest"[^>]*>/g) || []).join();
    check('manifest : index.html et classique.html déclarent le même manifest (manifest.json), une seule fois',
      decl(fileURLToPath(ANIME)) === '<link rel="manifest" href="manifest.json">' && decl(path.join(ROOT, 'classique.html')) === '<link rel="manifest" href="manifest.json">',
      [decl(fileURLToPath(ANIME)), decl(path.join(ROOT, 'classique.html'))]);
  }

  async function scenarioPwa(browser) {
    manifests();
    redirectPage();
    /* Une origine par parcours : ils ne partagent rien et tournent ensemble. Le parcours chronométré
       (serveur lent) tourne ensuite, seul : sa mesure ne doit pas dépendre de la charge des autres. */
    const run = (f) => f(browser).then(() => null, (e) => f.name + ' : ' + String(e && e.stack || e).slice(0, 500));
    const done = await Promise.all([flowMain, flowVisited, flowDirect, flowBroken, flowRedirect].map(run));
    done.push(await run(flowSlow));
    done.forEach((e) => { if (e) check('pwa : exception du test', false, e); });
  }

  return [['pwa', 'service worker réel en http (installation, hors-ligne, mise à jour, classique.html optionnelle, redirection d\'anime.html) et manifest', scenarioPwa]];
};
