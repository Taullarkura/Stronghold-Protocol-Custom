// The service worker of a browser install (scope '/', registered by public/js/assetCache.js and
// public/js/resources/index.js). It is the one worker that answers requests for art and fonts, from two caches:
//
//   * the imported asset pack (public/js/assetCache.js): the files of a ZIP a player imported, cached under
//     `sp-imported-assets-v1` at the URL the page asks for — the content-hash one, `/assets/~0123456789abcdef/x.png`.
//   * the local resource cache (public/js/resources/): the whole tree of /resource-manifest.json, cached under
//     `stronghold-resources-*` at the file list's plain URLs, `/assets/x.png`. A Cloudflare install serves that list as
//     a build artifact; a Node install builds it at request time (server/http/resourceManifest.js).
//
// A page only ever asks for the content-hash URL, the caches only ever know one of the two forms, so requestKeys
// answers a request from both forms (and the /media/ alias of shared/media.js): the imported pack first, then every
// resource cache. A miss goes to the network and is not written here — each cache grows only by its own importer.
//
// Classic, not a module: Firefox 108 and Safari 16.4 register a module worker too late in a page's life
// (public/js/assetCache.js documents the browser support). The constants it repeats from the modules are asserted
// against them by test/ui/asset-import.test.js and test/resources/resources.test.js.
const IMPORTED_ASSET_CACHE = 'sp-imported-assets-v1';
const IMPORTED_ASSET_CACHE_PREFIX = 'sp-imported-assets-';
// Keep in sync with shared/media.js (MEDIA_PREFIX, AUDIO_EXTS) and public/js/resources/common.js (CACHE_PREFIX).
const RESOURCE_CACHE_PREFIX = 'stronghold-resources';
const MEDIA_PREFIX = '/media/';
const AUDIO_EXTS = [".mp3",".m4a",".aac",".ogg",".oga",".opus",".wav"];
// A hashed resource path: `/assets/~0123456789abcdef/…` (shared/assetPaths.js, HASH_SEGMENT_RE).
const HASHED_PATH = /^\/(assets|fonts|media)\/~[0-9a-f]{16}\//;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Older imported packs are this worker's own; resource caches belong to public/js/resources/store.js (it
    // reconciles them), so they are left alone.
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(IMPORTED_ASSET_CACHE_PREFIX) && name !== IMPORTED_ASSET_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'claim') event.waitUntil(self.clients.claim());
});

/**
 * The cache keys that may answer a request, in order of preference: the URL as asked, then without its content-hash
 * segment, and for /media/ audio the /assets/audio/ files sharing its stem (shared/media.js extension order).
 * @param {string} pathname the request's URL path
 * @returns {string[]}
 */
function requestKeys(pathname) {
  const paths = [pathname];
  const plain = pathname.replace(HASHED_PATH, (match, root) => `/${root}/`);
  if (plain !== pathname) paths.push(plain);
  const keys = [];
  for (const path of paths) {
    if (path.startsWith(MEDIA_PREFIX)) {
      const stem = '/assets/audio/' + path.slice(MEDIA_PREFIX.length);
      for (const ext of AUDIO_EXTS) keys.push(stem + ext);
    } else if (/^\/(assets|fonts)\//.test(path)) {
      keys.push(path);
    }
  }
  return [...new Set(keys)];
}

/** The first cached response among the keys in one cache, or undefined. */
async function matchIn(cacheName, origin, keys) {
  const cache = await caches.open(cacheName);
  for (const key of keys) {
    const hit = await cache.match(origin + key);
    if (hit) return hit;
  }
  return undefined;
}

/** The first cached response among the keys, imported pack first, then every resource cache. */
async function cachedResponse(origin, keys) {
  const names = await caches.keys();
  if (names.includes(IMPORTED_ASSET_CACHE)) {
    const hit = await matchIn(IMPORTED_ASSET_CACHE, origin, keys);
    if (hit) return hit;
  }
  for (const name of names) {
    if (!name.startsWith(RESOURCE_CACHE_PREFIX)) continue;
    const hit = await matchIn(name, origin, keys);
    if (hit) return hit;
  }
  return undefined;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // A cached body answers a whole-file request only (the browser re-requests partial content itself).
  if (request.headers.has('range')) return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  const keys = requestKeys(url.pathname);
  if (!keys.length) return;
  event.respondWith((async () => {
    const hit = await cachedResponse(url.origin, keys);
    if (hit) return hit;
    // Do not cache the network response: the caches grow only through their own importer (and the browser's own HTTP
    // cache still applies to this fetch).
    return fetch(request);
  })());
});
