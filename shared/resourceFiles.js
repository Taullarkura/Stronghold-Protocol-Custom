// What a resource file is — the one place the resource manifest (tools/resource-pack.mjs, the server's
// /resource-manifest.json) and its readers agree on.
//
// A resource file is a file under public/assets/ or public/fonts/ whose extension names a content type the local
// resource cache can hold (public/js/resources/store.js): art, audio, video, fonts. Scripts, documents and data are
// never resources — the site publishes them, the cache must not answer them.

/** Version of the manifest document: `{ format, version, files, totalBytes }`. */
export const RESOURCE_MANIFEST_FORMAT = 1;

/** Folders of public/ whose files are resources. */
export const RESOURCE_ROOTS = Object.freeze(['assets', 'fonts']);

/** The Workers Static Assets file limit; the import also holds one whole file in memory (public/js/resources/zip.js). */
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

/** Content-Type per resource file extension; other files under the roots are not resources. */
export const RESOURCE_TYPES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', css: 'text/css; charset=utf-8',
  atlas: 'text/plain; charset=utf-8', obj: 'text/plain; charset=utf-8', json: 'application/json', skel: 'application/octet-stream',
});

/** The Content-Type of a resource URL, or undefined when it names no resource file. */
export function resourceType(url) {
  return RESOURCE_TYPES[url.split('.').pop().toLowerCase()];
}

/** Whether a URL path is one a manifest may list (under a root; the extension decides the rest). */
export function isResourcePath(url) {
  return typeof url === 'string' && /^\/(assets|fonts)\//.test(url) && Boolean(resourceType(url));
}

/**
 * Throw unless `url` is a resource URL a manifest may list: under a root, no query, hash, backslash or control
 * character, no empty / dot segments, and an extension with a resource type.
 */
export function validateResourceUrl(url) {
  if (typeof url !== 'string' || !/^\/(assets|fonts)\//.test(url) || /[?#\\\x00-\x1f]/.test(url)) throw new Error(`Invalid resource path: ${url}`);
  let decoded;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    throw new Error(`Invalid resource path encoding: ${url}`);
  }
  const segments = decoded.split('/').slice(1);
  if (/[?#\\\x00-\x1f]/.test(decoded) || segments.some((part) => !part || part === '.' || part === '..') || !resourceType(decoded)) {
    throw new Error(`Invalid resource path or type: ${url}`);
  }
}
