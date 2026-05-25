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

// Installation : pré-cache les fichiers essentiels.
// NB : on n'appelle PAS self.skipWaiting() ici. Le nouveau SW reste en
// attente jusqu'à ce que l'utilisateur clique sur "METTRE À JOUR" dans
// la notification (ou ferme/rouvre l'onglet). Cela évite un reload
// abrupt en pleine session de jeu.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
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
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('Hors-ligne', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
