// Service Worker — Anime Math Academy
// Stratégie : cache-first pour les ressources statiques (HTML, icônes, OG image, polices Google).
// Aucune collecte de données, aucune analytics, full offline après 1re visite.
//
// Le placeholder __CACHE_VERSION__ ci-dessous est remplacé automatiquement
// au déploiement par le workflow GitHub Actions (pages.yml) avec le SHA du commit.
// En dev local (sans déploiement), la valeur reste 'dev' — c'est volontaire.
const CACHE_NAME = 'amat-__CACHE_VERSION__';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './og-image.png',
  './og-image.svg'
];
// Édition animée (anime.html) : ressources OPTIONNELLES, jamais dans le addAll atomique ci-dessous.
// Un joueur du jeu classique seul ne les télécharge pas : elles ne sont (re)mises en cache à
// l'installation que pour un joueur qui utilise l'édition animée (voir usesAnimatedEdition).
// Pour les autres, le gestionnaire fetch met anime.html en cache à sa première visite.
const OPTIONAL_ASSETS = [
  './anime.html',
  './manifest-anime.json'
];
// L'installation n'attend jamais ces ressources plus longtemps que ceci : un serveur lent sur
// anime.html ne retarde pas la détection d'une mise à jour du jeu classique (le jeu conclut
// « Vous êtes à jour » au bout de 5 s).
const OPTIONAL_WAIT_MS = 3000;

// Ce joueur utilise-t-il l'édition animée ? Oui si anime.html est déjà dans un cache (il l'a
// ouverte : le gestionnaire fetch, ou une installation précédente, l'y a mise), ou si une
// fenêtre l'affiche en ce moment (première visite du site directement par anime.html, avant
// qu'un Service Worker ne contrôle la page).
function usesAnimatedEdition() {
  const page = new URL(OPTIONAL_ASSETS[0], self.location.href);
  return caches.match(page.href, { ignoreSearch: true }).then((hit) => {
    if (hit) return true;
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => list.some((client) => new URL(client.url).pathname === page.pathname));
  });
}

// (Re)met les ressources optionnelles dans le nouveau cache, une par une, en les redemandant au
// réseau (cache: 'reload' : jamais la copie du cache HTTP, qui peut dater de la version
// précédente). Rien ici ne peut faire échouer l'installation : tout échec est toléré (404,
// serveur en panne, hors-ligne, navigateur qui refuse une option) et le jeu classique reste
// disponible hors-ligne. Au-delà de OPTIONAL_WAIT_MS l'installation n'attend plus ; le
// téléchargement se termine en arrière-plan s'il le peut.
function refreshOptionalAssets(cache) {
  try {
    const work = usesAnimatedEdition().then((yes) => {
      if (!yes) return null;
      return Promise.all(OPTIONAL_ASSETS.map((url) =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      ));
    }).catch(() => {});
    const limit = new Promise((resolve) => setTimeout(resolve, OPTIONAL_WAIT_MS));
    return Promise.race([work, limit]);
  } catch (e) {
    return Promise.resolve();
  }
}

// Installation : pré-cache les fichiers essentiels.
// NB : on n'appelle PAS self.skipWaiting() ici. Le nouveau SW reste en
// attente jusqu'à ce que l'utilisateur clique sur "METTRE À JOUR" dans
// la notification (ou ferme/rouvre l'onglet). Cela évite un reload
// abrupt en pleine session de jeu.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_ASSETS).then(() => refreshOptionalAssets(cache))
    )
  );
});

// Activation : supprime les vieux caches et prend le contrôle.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Message handler : permet à la page de déclencher l'activation immédiate
// du nouveau SW en attente (déclenché par le bouton "METTRE À JOUR").
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch : cache-first pour same-origin + polices Google ; network-first ignoré (offline-first).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Uniquement les GET
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Same-origin OU polices Google
  const isCacheable = url.origin === self.location.origin ||
                      url.hostname === 'fonts.googleapis.com' ||
                      url.hostname === 'fonts.gstatic.com';
  if (!isCacheable) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        // Ne cache que les réponses valides
        if (!response || response.status !== 200) return response;
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
        return response;
      }).catch(() => {
        // Hors-ligne et pas en cache : fallback sur index.html pour les navigations
        // (ou sur anime.html si c'est l'édition animée qui est demandée et qu'elle est en cache).
        if (req.mode === 'navigate') {
          if (url.pathname.endsWith('/anime.html')) {
            return caches.match('./anime.html').then((anime) => anime || caches.match('./index.html'));
          }
          return caches.match('./index.html');
        }
        return new Response('Hors-ligne', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
