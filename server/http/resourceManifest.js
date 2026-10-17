// server/http/resourceManifest.js — /resource-manifest.json on a server that hosts the site itself.
//
// Cloudflare's build publishes that file (tools/build-worker.mjs) and tools/resource-pack.mjs writes it for the
// resource ZIP. A Node install has no such step, and the local resource cache refuses to open without it
// (public/js/resources/store.js): every player then plays on demand and 资源管理 reports "不可用". So the server
// builds the document itself, from the same table (shared/resourceFiles.js) and in the same shape:
//
//   { format: 1, version: <sha256 of the files array>, files: [{ url, size, sha256, type }], totalBytes }
//
// The cost is the SHA-256 of every resource file — some 40 s of CPU for a full art folder. Each hash is remembered by
// path + size + mtime in a JSON cache (`.cache/resource-hashes.json`), so a boot after an art change hashes only the
// files that changed, and an unchanged boot costs a directory walk. The build runs in the background from start();
// a request that arrives before it finishes waits for it.

import fsp from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MAX_RESOURCE_BYTES, RESOURCE_MANIFEST_FORMAT, RESOURCE_ROOTS, resourceType } from '../../shared/resourceFiles.js';

/** The URL the page fetches (public/js/resources/store.js). */
export const RESOURCE_MANIFEST_URL = '/resource-manifest.json';
/** Version of the hash cache file, not of the manifest (`format` is that one). */
const HASH_CACHE_VERSION = 1;
/** How long after start() the walk begins: the first requests get the server's attention first (assetIndex.js). */
export const RESOURCE_MANIFEST_DELAY_MS = 1000;
/** Stats at once: cheap, and a deep art folder is thousands of files. */
const STAT_CONCURRENCY = 64;
/** Files hashed at once: hashing is CPU-bound and a whole file is read into memory. */
const HASH_CONCURRENCY = 4;

const noopLog = { info() {}, debug() {}, warn() {} };

/** Run `fn` over `items`, `limit` at a time, in order of completion. */
async function eachLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** The hash cache: `{ version, algo, files: { rel: [size, mtimeMs, sha256] } }`, never trusted for a changed file. */
function loadCache(cacheFile) {
  if (!cacheFile) return new Map();
  try {
    const doc = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (!doc || doc.version !== HASH_CACHE_VERSION || typeof doc.files !== 'object' || !doc.files) return new Map();
    const out = new Map();
    for (const [rel, v] of Object.entries(doc.files)) {
      if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) && typeof v[2] === 'string' && /^[a-f0-9]{64}$/.test(v[2])) {
        out.set(rel, { size: v[0], mtimeMs: v[1], sha256: v[2] });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Create the resource manifest builder.
 * @param {{ publicDir: string, roots?: readonly string[], cacheFile?: string | null, log?: object,
 *   delayMs?: number }} opts publicDir: the deployment's public/ folder; cacheFile: where the hashes are remembered
 *   (null: nowhere, a full build every time)
 */
export function createResourceManifest({ publicDir, roots = RESOURCE_ROOTS, cacheFile = null, log = noopLog, delayMs = RESOURCE_MANIFEST_DELAY_MS }) {
  const base = path.resolve(publicDir);
  let built = null; // { manifest, body, version }
  let error = null;
  let closed = false;
  let running = null;
  let timer = null;
  let last = null;

  /** Every file under the roots: [rel, abs] (dot names skipped, a linked folder followed once). */
  async function listFiles() {
    const out = [];
    const seen = new Set();
    const walk = async (abs, rel) => {
      let real;
      try { real = await fsp.realpath(abs); } catch { return; }
      if (seen.has(real)) return;
      seen.add(real);
      let entries;
      try { entries = await fsp.readdir(abs, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (closed) return;
        if (entry.name.startsWith('.')) continue;
        const childAbs = path.join(abs, entry.name);
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) await walk(childAbs, childRel);
        else if (entry.isFile()) out.push([childRel, childAbs]);
        else if (entry.isSymbolicLink()) {
          const st = await fsp.stat(childAbs).catch(() => null);
          if (st?.isDirectory()) await walk(childAbs, childRel);
          else if (st?.isFile()) out.push([childRel, childAbs]);
        }
      }
    };
    for (const root of roots) await walk(path.join(base, root), root);
    return out;
  }

  async function build() {
    const started = Date.now();
    const known = loadCache(cacheFile);
    const next = new Map();
    const files = [];
    const list = await listFiles();
    const statted = new Array(list.length);
    await eachLimit(list, STAT_CONCURRENCY, async ([rel, abs], i) => {
      const st = await fsp.stat(abs).catch(() => null);
      statted[i] = st?.isFile() ? { rel, abs, size: st.size, mtimeMs: st.mtimeMs } : null;
    });
    const toHash = [];
    let reused = 0;
    for (const file of statted) {
      if (!file) continue;
      const cached = known.get(file.rel);
      if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) {
        next.set(file.rel, cached);
        reused++;
      } else {
        toHash.push(file);
      }
    }
    let hashed = 0;
    let skipped = 0;
    await eachLimit(toHash, HASH_CONCURRENCY, async (file) => {
      if (closed) return;
      if (file.size > MAX_RESOURCE_BYTES) {
        // The manifest a client can hold never lists it; the file still loads from the network on demand.
        skipped++;
        log.warn?.(`[resources] ${file.rel}: ${file.size} bytes exceeds the resource limit, not listed`);
        return;
      }
      try {
        const buf = await fsp.readFile(file.abs);
        const after = await fsp.stat(file.abs);
        // Changed while it was read: the next build hashes it again.
        if (after.size !== file.size || after.mtimeMs !== file.mtimeMs || buf.length !== file.size) return;
        next.set(file.rel, { size: file.size, mtimeMs: file.mtimeMs, sha256: createHash('sha256').update(buf).digest('hex') });
        hashed++;
      } catch { /* vanished or unreadable: not listed */ }
    });
    if (closed) return null;
    for (const [rel, record] of next) {
      if (record.size > MAX_RESOURCE_BYTES) continue;
      const url = '/' + rel.split('/').map(encodeURIComponent).join('/');
      const type = resourceType(decodeURIComponent(url));
      if (!type) continue;
      files.push({ url, size: record.size, sha256: record.sha256, type });
    }
    files.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
    const manifest = {
      format: RESOURCE_MANIFEST_FORMAT,
      version: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
      files,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    };
    await saveCache(next);
    last = { ms: Date.now() - started, hashed, reused, skipped, files: files.length };
    log.info?.(`[resources] /resource-manifest.json: ${files.length} files, ${(manifest.totalBytes / 1048576).toFixed(1)} MiB, ${hashed} hashed, ${reused} reused, ${last.ms} ms`);
    return { manifest, body: JSON.stringify(manifest), version: manifest.version };
  }

  async function saveCache(map) {
    if (!cacheFile) return;
    const files = {};
    for (const [rel, r] of [...map].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) files[rel] = [r.size, r.mtimeMs, r.sha256];
    const tmp = `${cacheFile}.${process.pid}.tmp`;
    try {
      await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
      await fsp.writeFile(tmp, JSON.stringify({ version: HASH_CACHE_VERSION, algo: 'sha256/64', files }));
      await fsp.rename(tmp, cacheFile);
    } catch (e) {
      log.debug?.('[resources] hash cache not saved', e?.code || e?.message);
      fsp.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /** Build once; concurrent callers share the build. */
  function ensure() {
    if (built) return Promise.resolve(built);
    running ??= build().then((result) => {
      running = null;
      if (!result) throw new Error('resource manifest: builder closed');
      built = result;
      return result;
    }, (e) => {
      running = null;
      error = e;
      log.error?.('[resources] resource manifest build failed', e);
      throw e;
    });
    return running;
  }

  return {
    /** The manifest, building it on first use. */
    request: ensure,
    /** Start building in the background (a boot does not wait for it). */
    start() {
      if (timer || closed) return;
      timer = setTimeout(() => {
        timer = null;
        ensure().catch(() => {});
      }, Math.max(0, delayMs));
      timer.unref?.();
    },
    /** The built manifest, or null before the first build finishes. */
    get current() {
      return built?.manifest ?? null;
    },
    get body() {
      return built?.body ?? null;
    },
    /** The error of the last failed build, if any. */
    get error() {
      return error;
    },
    stats() {
      return { ready: Boolean(built), last };
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
