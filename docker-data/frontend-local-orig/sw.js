const CACHE_VERSION = 'v12';
const IMAGE_CACHE = `xnova-images-${CACHE_VERSION}`;
const STATIC_CACHE = `xnova-static-${CACHE_VERSION}`;

const MAX_IMAGE_CACHE_SIZE = 200;

const EXTERNAL_IMAGE_HOSTS = [
  'photos.pinksale.finance'
];

const CORS_ENABLED_HOSTS = [
  'images.unsplash.com',
  'images.pexels.com'
];

const STATIC_IMAGES = [
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768282568437-1efe38d7259277bcc7832e60db23b9fb.png',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768282588928-400051218330b859273c8f82547fb5ec.png',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768282606111-b265353ce4820b19254d28be1db502f3.png',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768282531612-400051218330b859273c8f82547fb5ec.png',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768324548966-961ae42b5ef543c7292fb4d8e1520901.png',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768281226806-7d493aae390e834e9654df6d97b11a99.jpg',
  'https://photos.pinksale.finance/file/pinksale-logo-upload/1768287934637-7d493aae390e834e9654df6d97b11a99.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(['/favicon.png', '/logo-512.png', '/loading-logo.png', '/manifest.json'])),
      caches.open(IMAGE_CACHE).then((cache) => {
        return Promise.allSettled(
          STATIC_IMAGES.map((url) => {
            return fetch(url, { mode: 'no-cors', credentials: 'omit' })
              .then((response) => {
                if (response.type === 'opaque' || response.ok) {
                  return cache.put(getCacheKey(url), response);
                }
              })
              .catch(() => {});
          })
        );
      })
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== IMAGE_CACHE && name !== STATIC_CACHE)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients to reload
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION }));
        });
      })
  );
});

function isExternalImageHost(url) {
  return EXTERNAL_IMAGE_HOSTS.some((host) => url.hostname.includes(host));
}

function isCorsEnabledHost(url) {
  return CORS_ENABLED_HOSTS.some((host) => url.hostname.includes(host));
}

function isImageUrl(url) {
  return isExternalImageHost(url) ||
         isCorsEnabledHost(url) ||
         url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i);
}

function getCacheKey(url) {
  const parsed = new URL(url);
  parsed.search = '';
  return parsed.href;
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map((key) => cache.delete(key)));
  }
}

async function fetchAndCache(request, cache, useNoCors = false) {
  const cacheKey = getCacheKey(request.url);

  try {
    if (useNoCors) {
      const noCorsResponse = await fetch(request.url, {
        mode: 'no-cors',
        credentials: 'omit'
      });
      if (noCorsResponse.type === 'opaque' || noCorsResponse.ok) {
        cache.put(cacheKey, noCorsResponse.clone());
        return noCorsResponse;
      }
      return null;
    }

    const response = await fetch(request.url, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache'
    });

    if (response.ok) {
      const clonedResponse = response.clone();
      cache.put(cacheKey, clonedResponse);
      return response;
    }

    return response;
  } catch (error) {
    return null;
  }
}

async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cacheKey = getCacheKey(request.url);
  const url = new URL(request.url);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const useNoCors = isExternalImageHost(url);
  const networkResponse = await fetchAndCache(request, cache, useNoCors);
  if (networkResponse) {
    trimCache(IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE);
    return networkResponse;
  }

  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="#1a1a2e" width="100" height="100"/><text fill="#666" font-size="10" x="50" y="50" text-anchor="middle">Loading...</text></svg>',
    { headers: { 'Content-Type': 'image/svg+xml' } }
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (isImageUrl(url)) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('message', (event) => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'PRECACHE_IMAGES':
      if (Array.isArray(event.data.urls)) {
        caches.open(IMAGE_CACHE).then((cache) => {
          event.data.urls.forEach((urlStr) => {
            if (!urlStr) return;
            try {
              const url = new URL(urlStr);
              const cacheKey = getCacheKey(urlStr);
              const useNoCors = isExternalImageHost(url);
              cache.match(cacheKey).then((existing) => {
                if (!existing) {
                  fetchAndCache({ url: urlStr }, cache, useNoCors);
                }
              });
            } catch (e) {}
          });
        });
      }
      break;

    case 'CLEAR_IMAGE_CACHE':
      caches.delete(IMAGE_CACHE)
        .then(() => caches.open(IMAGE_CACHE))
        .then(() => event.ports[0]?.postMessage({ success: true }));
      break;

    case 'FORCE_UPDATE':
    case 'CLEAR_ALL_CACHES':
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      }).then(() => {
        event.ports[0]?.postMessage({ success: true, cleared: true });
      });
      break;

    case 'GET_CACHE_STATUS':
      Promise.all([
        caches.open(IMAGE_CACHE).then((c) => c.keys()),
        caches.open(STATIC_CACHE).then((c) => c.keys())
      ]).then(([images, statics]) => {
        event.ports[0]?.postMessage({
          images: images.length,
          statics: statics.length,
          data: 0,
          version: CACHE_VERSION
        });
      });
      break;
  }
});
