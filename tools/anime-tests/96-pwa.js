/* Scénario « pwa » : le VRAI service worker (sw.js du dépôt) servi en http par un petit serveur local, un
   serveur (donc une origine) par parcours, sur un port libre (aucun fragment ne porte ce numéro).
   Chargé par tools/test_anime.js (voir HELPERS). Les pages sont servies sous /ninja-math-games/, comme en
   production, avec « Cache-Control: max-age=600 » (ce que fait GitHub Pages ; « no-cache » dans les parcours
   qui mesurent un délai, pour que le cache HTTP ne masque pas le serveur lent) ; chaque page HTML porte un
   marqueur de version, pour savoir QUELLE copie le service worker a mise en cache.

   · classique seul   : un joueur qui n'a jamais ouvert anime.html ne la télécharge ni à l'installation ni à
                        une mise à jour (même si le serveur la sert lentement) ; hors-ligne, le jeu classique
                        marche, et anime.html (jamais en cache) retombe proprement sur le jeu classique.
   · déjà venu        : un joueur qui a ouvert anime.html la retrouve après un changement de version — copie
                        FRAÎCHE (requête « cache: reload », pas la copie du cache HTTP) — et l'ouvre hors-ligne.
   · arrivée directe  : première visite du site par anime.html → la page est en cache dès l'installation.
   · serveur lent     : anime.html servie en 8 s ne retarde pas la détection de mise à jour au-delà de ~3 s
                        (le jeu conclut « à jour » au bout de 5 s : ce faux message ne doit plus apparaître).
   · pannes           : anime.html en 404 ou connexion coupée pendant l'installation → le service worker
                        s'installe quand même, le jeu classique reste disponible hors-ligne.
   · manifests        : les deux applications ont des identités distinctes, toutes deux DANS le chemin du projet. */
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
  ['index.html', 'manifest.json', 'manifest-anime.json', 'icon-192.png', 'icon-512.png', 'og-image.png', 'og-image.svg'].forEach((f) => { FILES[f] = path.join(ROOT, f); });
  FILES['anime.html'] = fileURLToPath(ANIME);
  const OPTIONAL = { 'anime.html': 1, 'manifest-anime.json': 1 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Un site : serveur local + réglages modifiables en cours de parcours (version déployée, marqueur du
     contenu, sort des ressources de l'édition animée, délai d'anime.html, serveur coupé). */
  async function site() {
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const st = { version: 'v1', mark: 'M1', anime: 'ok', delay: 0, maxAge: 600, down: false, log: [] };
    const server = http.createServer((req, res) => {
      if (st.down) { req.socket.destroy(); return; }
      const u = new URL(req.url, 'http://x');
      const f = u.pathname.indexOf(PREFIX) === 0 ? (u.pathname.slice(PREFIX.length) || 'index.html') : '';
      st.log.push({ f: f, cache: req.headers['cache-control'] || '' });
      const head = (type) => ({ 'Content-Type': type, 'Cache-Control': st.maxAge ? 'max-age=' + st.maxAge : 'no-cache' });
      if (f === 'sw.js') { res.writeHead(200, head(MIME['.js'])); res.end(sw.replace(/__CACHE_VERSION__/g, st.version)); return; }
      if (!FILES[f]) { res.writeHead(404); res.end('absent'); return; }
      if (OPTIONAL[f] && st.anime === 'drop') { req.socket.destroy(); return; }
      if (OPTIONAL[f] && st.anime !== 'ok') { res.writeHead(Number(st.anime)); res.end('absent'); return; }
      let body = fs.readFileSync(FILES[f]);
      if (/\.html$/.test(f)) body = Buffer.from(body.toString('utf8').replace('</body>', '<!-- VERSION-' + st.mark + ' --></body>'));
      const send = () => { try { res.writeHead(200, head(MIME[path.extname(f)] || 'application/octet-stream')); res.end(body); } catch (e) { /* client parti */ } };
      if (f === 'anime.html' && st.delay) setTimeout(send, st.delay); else send();
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
  const core = (c) => !!c && ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'].every((f) => f in c);

  /* A. Joueur du jeu classique seul. */
  async function flowClassic(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'a1', mark: 'A1', maxAge: 0 });
      await page.goto(st.base); await controlled(page);
      let c = await cachesOf(page);
      check('pwa, classique seul : le service worker s\'installe et met le jeu classique en cache', core(c['amat-a1']), c);
      check('pwa, classique seul : l\'installation ne demande NI anime.html NI manifest-anime.json au serveur',
        st.asked('anime.html').length + st.asked('manifest-anime.json').length === 0 && !('./anime.html' in (c['amat-a1'] || {})), [st.asked('anime.html').length, st.asked('manifest-anime.json').length]);
      /* Nouvelle version, alors que le serveur servirait anime.html en 8 s : rien à attendre, rien à télécharger. */
      Object.assign(st, { version: 'a2', mark: 'A2', delay: 8000, log: [] });
      const t0 = Date.now();
      await page.reload();
      const seen = await updateToast(page, 6000);
      check('pwa, classique seul : toast « Nouvelle version » + bouton après un déploiement, sans attendre anime.html (< 6 s)', seen && await waiting(page), { seen: seen, ms: Date.now() - t0 });
      check('pwa, classique seul : la mise à jour ne demande pas anime.html non plus', st.asked('anime.html').length === 0, st.asked('anime.html').length);
      const keys = seen ? await applyUpdate(page, 'amat-a2') : [];
      check('pwa, classique seul : « METTRE À JOUR » → un seul cache (nouvelle version), jeu classique rechargé',
        keys.join() === 'amat-a2' && await page.evaluate(() => typeof FX === 'undefined' && !!document.getElementById('screen-home')), keys);
      await offline(st, who, true);
      let r = await nav(st, page, 'index.html');
      check('pwa, classique seul : index.html hors-ligne', r.home === true && r.fx === false, r);
      r = await nav(st, page, '');
      check('pwa, classique seul : ./ hors-ligne', r.home === true && r.fx === false, r);
      r = await nav(st, page, 'anime.html');
      check('pwa, classique seul : anime.html hors-ligne, jamais mise en cache → repli propre sur le jeu classique', r.home === true && r.fx === false && r.status === 200, r);
      await offline(st, who, false);
      check('pwa, classique seul : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* B. Joueur qui a déjà ouvert l'édition animée. */
  async function flowVisited(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'b1', mark: 'B1' });
      await page.goto(st.base); await controlled(page);
      await page.goto(st.base + 'anime.html');
      const first = await cached(page, 'amat-b1', 'anime.html');
      check('pwa, déjà venu : la première visite d\'anime.html la met en cache (gestionnaire fetch)', first, await cachesOf(page));
      Object.assign(st, { version: 'b2', mark: 'B2', log: [] });
      await page.goto(st.base + 'index.html');
      const seen = await updateToast(page);
      const c = await cachesOf(page), neuf = c['amat-b2'] || {};
      check('pwa, déjà venu : nouvelle version → toast de mise à jour sur le jeu classique', seen && await waiting(page), c);
      check('pwa, déjà venu : le nouveau cache contient le jeu classique, anime.html et son manifest', core(neuf) && './anime.html' in neuf && './manifest-anime.json' in neuf, Object.keys(neuf));
      const asked = st.asked('anime.html');
      check('pwa, déjà venu : anime.html est redemandée au réseau sans passer par le cache HTTP (cache: reload) et la copie mise en cache est la NOUVELLE',
        asked.length === 1 && /no-cache/.test(asked[0].cache) && neuf['./anime.html'] === 'B2', { asked: asked, enCache: neuf['./anime.html'] });
      const keys = seen ? await applyUpdate(page, 'amat-b2') : [];
      check('pwa, déjà venu : « METTRE À JOUR » → un seul cache', keys.join() === 'amat-b2', keys);
      await offline(st, who, true);
      let r = await nav(st, page, 'anime.html');
      check('pwa, déjà venu : anime.html s\'ouvre hors-ligne après la mise à jour (édition animée, nouvelle version)', r.fx === true && r.home === true && /Édition animée/.test(r.title || '') && r.mark === 'B2', r);
      const play = r.fx ? await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        startGame('6e_facile');
        for (let i = 0; i < 100 && getComputedStyle(document.getElementById('screen-game')).display === 'none'; i++) await wait(50);
        await wait(200);
        answer(state.questions[state.qIndex].correct); await wait(400);
        const s = FX.stats();
        return { score: state.score, played: FX.debug.log.length, err: s.errCount, dead: s.dead };
      }) : null;
      check('pwa, déjà venu : hors-ligne, une question se joue et la couche anime', !!play && play.score > 0 && play.played > 0 && play.err === 0 && !play.dead, play);
      r = await nav(st, page, 'anime.html?source=pwa');
      check('pwa, déjà venu : anime.html?source=pwa hors-ligne → l\'édition animée (repli du service worker)', r.fx === true && r.home === true, r);
      r = await nav(st, page, 'index.html');
      check('pwa, déjà venu : index.html hors-ligne → le jeu classique', r.fx === false && r.home === true, r);
      r = await nav(st, page, 'anime.html');           // la page animée reste ouverte : l'audit de la couche la relève
      await offline(st, who, false);
      check('pwa, déjà venu : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* C. Première visite du site directement par anime.html. */
  async function flowDirect(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'c1', mark: 'C1', maxAge: 0 });      // « no-cache » : le cache HTTP ne peut pas servir la page hors-ligne
      await page.goto(st.base + 'anime.html'); await controlled(page);
      const c = await cachesOf(page);                   // dès que le service worker contrôle la page : l'installation est finie
      check('pwa, arrivée directe : anime.html (ouverte pendant l\'installation) est mise en cache avec le jeu classique',
        core(c['amat-c1']) && './anime.html' in c['amat-c1'] && './manifest-anime.json' in c['amat-c1'], c);
      await offline(st, who, true);
      const r = await nav(st, page, 'anime.html');
      check('pwa, arrivée directe : anime.html s\'ouvre hors-ligne dès la visite suivante', r.fx === true && r.home === true, r);
      await offline(st, who, false);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* D. anime.html servie très lentement pendant une mise à jour, pour un joueur qui l'a déjà. */
  async function flowSlow(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'd1', mark: 'D1', maxAge: 0 });
      await page.goto(st.base); await controlled(page);
      await page.goto(st.base + 'anime.html');
      const primed = await cached(page, 'amat-d1', 'anime.html');
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
      check('pwa, serveur lent : le joueur a bien anime.html en cache et le serveur la sert en 8 s', primed && st.asked('anime.html').length === 1, [primed, st.asked('anime.html').length]);
      check('pwa, serveur lent : la mise à jour est détectée sans attendre anime.html (toast « Nouvelle version » en moins de 4,5 s)', !!found && found.ms < 4500, seq);
      check('pwa, serveur lent : jamais de faux « Vous êtes à jour »', !seq.some((e) => /à jour/.test(e.text)), seq);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* E. Les ressources de l'édition animée sont en panne pendant l'installation d'une nouvelle version. */
  async function flowBroken(browser) {
    const st = await site(), who = await player(browser), page = who.page;
    try {
      Object.assign(st, { version: 'e0', mark: 'E0' });
      await page.goto(st.base); await controlled(page);
      let current = 'amat-e0';
      for (const mode of ['404', 'drop']) {
        st.anime = 'ok';
        await page.goto(st.base + 'anime.html');
        const primed = await cached(page, current, 'anime.html');
        Object.assign(st, { version: 'e-' + mode, mark: 'E' + mode, anime: mode, log: [] });
        await page.goto(st.base + 'index.html');
        const seen = await updateToast(page);
        const c = await cachesOf(page), neuf = c['amat-e-' + mode] || {};
        check('pwa, panne (' + mode + ') : anime.html redemandée mais en échec → le service worker s\'installe quand même (toast), sans elle',
          primed && seen && st.asked('anime.html').length >= 1 && core(neuf) && !('./anime.html' in neuf), { primed: primed, seen: seen, asked: st.asked('anime.html').length, cache: Object.keys(neuf) });
        current = 'amat-e-' + mode;
        if (seen) await applyUpdate(page, current);
      }
      await offline(st, who, true);
      let r = await nav(st, page, 'index.html');
      check('pwa, panne : index.html hors-ligne', r.home === true && r.fx === false, r);
      r = await nav(st, page, 'anime.html');
      check('pwa, panne : anime.html hors-ligne, absente du cache → repli propre sur le jeu classique', r.home === true && r.fx === false, r);
      await offline(st, who, false);
      check('pwa, panne : aucune erreur de page', page.errors.length === 0, page.errors);
    } finally { await who.ctx.close(); await st.close(); }
  }

  /* Identité d'une application installée (norme Web App Manifest) : « id » résolu contre l'ORIGINE de
     start_url s'il est présent, sinon start_url elle-même. */
  function manifests() {
    const page = 'https://acs-data.github.io' + PREFIX;
    const read = (f) => {
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      const start = new URL(m.start_url, page + f);
      return { start: start.href, scope: new URL(m.scope, page + f).href, id: (m.id !== undefined ? new URL(m.id, start.origin) : start).href, short: m.short_name };
    };
    const a = read('manifest.json'), b = read('manifest-anime.json');
    check('manifests : deux identités distinctes, toutes deux dans le chemin du projet (aucun « id » résolu hors de /ninja-math-games/)',
      a.id !== b.id && a.id.indexOf(page) === 0 && b.id.indexOf(page) === 0, [a.id, b.id]);
    check('manifests : même portée (le service worker et la progression sont communs), pages de départ distinctes et dans la portée',
      a.scope === b.scope && a.start !== b.start && a.start.indexOf(a.scope) === 0 && b.start.indexOf(b.scope) === 0, [a, b]);
  }

  async function scenarioPwa(browser) {
    manifests();
    /* Une origine par parcours : ils ne partagent rien et tournent ensemble. Le parcours chronométré
       (serveur lent) tourne ensuite, seul : sa mesure ne doit pas dépendre de la charge des autres. */
    const run = (f) => f(browser).then(() => null, (e) => f.name + ' : ' + String(e && e.stack || e).slice(0, 500));
    const done = await Promise.all([flowClassic, flowVisited, flowDirect, flowBroken].map(run));
    done.push(await run(flowSlow));
    done.forEach((e) => { if (e) check('pwa : exception du test', false, e); });
  }

  return [['pwa', 'service worker réel en http (installation, hors-ligne, mise à jour, ressources optionnelles) et manifests', scenarioPwa]];
};
