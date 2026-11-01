/* Keep this version in sync with the static release. Updates wait for user action. */
'use strict';

const RELEASE = '20261102-v1';
const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `nextstep-pwa-${encodeURIComponent(APP_SCOPE.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${RELEASE}`;
const INDEX_URL = new URL('./index.html', APP_SCOPE).href;
const SHELL_FILES = [
  './index.html',
  './styles.css',
  './storage.js',
  './app.js',
  './pwa.js',
  './vendor/alpine.min.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];
const SHELL_URLS = new Set(SHELL_FILES.map(path => new URL(path, APP_SCOPE).href));

// Only exact, query-free application files are cache candidates. API/auth routes,
// external origins and non-GET requests are deliberately left to the browser.
function isShellRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === APP_SCOPE.origin && !url.search && SHELL_URLS.has(url.href);
}

function isAppNavigation(request) {
  if (request.method !== 'GET' || request.mode !== 'navigate') return false;
  const url = new URL(request.url);
  return url.origin === APP_SCOPE.origin && !url.search &&
    (url.href === APP_SCOPE.href || url.href === INDEX_URL);
}

async function isCacheableResponse(response, requestedUrl) {
  if (!response || !response.ok || response.status !== 200 || response.redirected ||
      response.type === 'opaque' || response.type === 'opaqueredirect') return false;
  const expectedUrl = new URL(requestedUrl);
  const actualUrl = new URL(response.url || requestedUrl);
  if (actualUrl.href !== expectedUrl.href) return false;
  if (/\bno-store\b/i.test(response.headers.get('cache-control') || '')) return false;

  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const path = expectedUrl.pathname;
  if (path === new URL(INDEX_URL).pathname || expectedUrl.href === APP_SCOPE.href) {
    if (type !== 'text/html') return false;
    const html = await response.clone().text();
    // A stable app marker excludes a successful login/error HTML response.
    return /<meta\b(?=[^>]*\bname\s*=\s*["']nextstep-shell["'])(?=[^>]*\bcontent\s*=\s*["']1["'])[^>]*>/i.test(html);
  }
  if (path.endsWith('.js')) return /^(?:text|application)\/(?:java|ecma)script$/.test(type);
  if (path.endsWith('.css')) return type === 'text/css';
  if (path.endsWith('.webmanifest')) return type === 'application/manifest+json' || type === 'application/json';
  if (path.endsWith('.svg')) return type === 'image/svg+xml';
  if (path.endsWith('.png')) return type === 'image/png';
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await Promise.all([...SHELL_URLS].map(async url => {
        const response = await fetch(new Request(url, {
          cache: 'reload',
          credentials: 'same-origin',
          redirect: 'error'
        }));
        if (!await isCacheableResponse(response, url)) {
          throw new Error('The application shell was incomplete or redirected.');
        }
        await cache.put(url, response);
      }));
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // No skipWaiting here: a new release must not interrupt an open editor.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function navigate(request) {
  try {
    const response = await fetch(request);
    if (await isCacheableResponse(response, request.url)) {
      const cache = await caches.open(CACHE_NAME);
      // Storage pressure must not hide a successful network response.
      try { await cache.put(INDEX_URL, response.clone()); } catch (error) { /* Keep the usable response. */ }
    }
    return response;
  } catch (error) {
    const cached = await caches.match(INDEX_URL, { cacheName: CACHE_NAME });
    return cached || new Response('暂时无法连接。请联网后重新打开下一程。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staticFile(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const response = await fetch(request);
  if (await isCacheableResponse(response, request.url)) {
    try { await cache.put(request.url, response.clone()); } catch (error) { /* Keep the usable response. */ }
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (isAppNavigation(event.request)) {
    event.respondWith(navigate(event.request));
  } else if (isShellRequest(event.request)) {
    event.respondWith(staticFile(event.request));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'SKIP_WAITING' || !event.source?.url) return;
  const sourceUrl = new URL(event.source.url);
  if (sourceUrl.origin !== APP_SCOPE.origin || !sourceUrl.pathname.startsWith(APP_SCOPE.pathname)) return;
  event.waitUntil(self.skipWaiting());
});
