// The resource manifest a Node install publishes (server/http/resourceManifest.js): /resource-manifest.json, the file
// list the local resource cache cannot open without (public/js/resources/store.js). The Cloudflare build writes that
// file with tools/resource-pack.mjs; this server builds the same document from shared/resourceFiles.js, remembering
// each file's SHA-256 by path + size + mtime so a boot after an art change hashes only what changed.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createResourceManifest } from '../server/http/resourceManifest.js';
import { validateManifest } from '../tools/resource-pack.mjs';
import { startServer } from '../server/index.js';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-res-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

function get(port, p, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, headers, method, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the resource manifest builder', () => {
  test('lists every resource file with its size, SHA-256 and Content-Type; skips dot names, programs and other files', async () => {
    const png = randomBytes(1200);
    const font = Buffer.from('font-bytes');
    const dir = tree({
      'public/assets/char/a.png': png, 'public/fonts/f.woff2': font, 'public/assets/spine/x/x.atlas': 'x.png\n',
      'public/assets/local/ui/a.png': randomBytes(64), 'public/assets/.hidden.png': 'h', 'public/assets/.git/obj.png': 'o',
      'public/js/app.js': 'not a resource', 'public/assets/notes.txt': 'no type', 'public/assets/x.skel': 'bin',
    });
    try {
      const builder = createResourceManifest({ publicDir: path.join(dir, 'public'), delayMs: 0 });
      const { manifest, body } = await builder.request();
      validateManifest(manifest);
      assert.equal(manifest.format, 1);
      assert.match(manifest.version, /^[a-f0-9]{64}$/);
      assert.deepEqual(manifest.files.map((f) => f.url), [
        '/assets/char/a.png', '/assets/local/ui/a.png', '/assets/spine/x/x.atlas', '/assets/x.skel', '/fonts/f.woff2',
      ]);
      const pngEntry = manifest.files.find((f) => f.url === '/assets/char/a.png');
      assert.deepEqual(pngEntry, { url: '/assets/char/a.png', size: png.length, sha256: sha256(png), type: 'image/png' });
      assert.equal(manifest.files.find((f) => f.url === '/fonts/f.woff2').type, 'font/woff2');
      assert.equal(manifest.files.find((f) => f.url === '/assets/x.skel').type, 'application/octet-stream');
      assert.equal(manifest.totalBytes, png.length + 64 + Buffer.byteLength('bin') + Buffer.byteLength('x.png\n') + font.length);
      assert.equal(body, JSON.stringify(manifest));
      builder.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('remembers hashes by path + size + mtime: a second build hashes nothing, a changed file alone is hashed again', async () => {
    const dir = tree({ 'public/assets/a.png': 'one', 'public/assets/b.png': 'two' });
    const cacheFile = path.join(dir, '.cache/resource-hashes.json');
    try {
      const first = createResourceManifest({ publicDir: path.join(dir, 'public'), cacheFile, delayMs: 0 });
      const a = await first.request();
      assert.deepEqual(first.stats().last, { ms: first.stats().last.ms, hashed: 2, reused: 0, skipped: 0, files: 2 });
      assert.ok(fs.existsSync(cacheFile));
      first.close();

      const second = createResourceManifest({ publicDir: path.join(dir, 'public'), cacheFile, delayMs: 0 });
      const b = await second.request();
      assert.equal(second.stats().last.hashed, 0);
      assert.equal(second.stats().last.reused, 2);
      assert.deepEqual(b.manifest, a.manifest, 'an unchanged tree gives the same manifest, byte for byte');
      second.close();

      // a rewrite that keeps size and mtime is not noticed (that is what the cache is), a new mtime is
      fs.writeFileSync(path.join(dir, 'public/assets/a.png'), 'ONE');
      const third = createResourceManifest({ publicDir: path.join(dir, 'public'), cacheFile, delayMs: 0 });
      const c = await third.request();
      assert.equal(third.stats().last.hashed, 1, 'only the changed file');
      assert.equal(c.manifest.files.find((f) => f.url === '/assets/a.png').sha256, sha256(Buffer.from('ONE')));
      assert.notEqual(c.manifest.version, a.manifest.version);
      third.close();

      // a removed file leaves the manifest, a new one joins it
      fs.unlinkSync(path.join(dir, 'public/assets/b.png'));
      fs.writeFileSync(path.join(dir, 'public/assets/c.png'), 'three');
      const fourth = createResourceManifest({ publicDir: path.join(dir, 'public'), cacheFile, delayMs: 0 });
      const d = await fourth.request();
      assert.deepEqual(d.manifest.files.map((f) => f.url), ['/assets/a.png', '/assets/c.png']);
      fourth.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a file larger than the import limit is not listed (it still loads from the network on demand)', async () => {
    const dir = tree({ 'public/assets/small.png': 'ok' });
    const big = path.join(dir, 'public/assets/big.png');
    fs.writeFileSync(big, '');
    fs.truncateSync(big, 25 * 1024 * 1024 + 1);
    try {
      const builder = createResourceManifest({ publicDir: path.join(dir, 'public'), delayMs: 0 });
      const { manifest } = await builder.request();
      assert.deepEqual(manifest.files.map((f) => f.url), ['/assets/small.png']);
      assert.equal(builder.stats().last.skipped, 1);
      builder.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('/resource-manifest.json from a running server', () => {
  let dir, srv;
  const png = randomBytes(700);
  before(async () => {
    dir = tree({
      'public/index.html': '<p>hi</p>', 'public/assets/char/a.png': png, 'public/assets/audio/bgm/l.ogg': 'ogg',
      'public/assets/local/ui/common/banner.png': randomBytes(32), 'public/fonts/f.woff2': 'font',
      'public/js/main.js': 'no', 'data/config.json': '{}',
    });
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, publicDir: path.join(dir, 'public'),
      dataDir: path.join(dir, 'data'), sharedDir: path.join(dir, 'shared'), assetIndex: false, resources: { delayMs: 0 } });
    await srv.resources.request();
  });
  after(async () => {
    await srv?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('it is served with no-cache, its own ETag, gzip and HEAD; the listed files are the ones on disk', async () => {
    const r = await get(srv.port, '/resource-manifest.json');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.match(r.headers.etag, /^"res-[0-9a-f]{16}"/);
    const manifest = JSON.parse(r.body);
    validateManifest(manifest);
    assert.deepEqual(manifest.files.map((f) => f.url), [
      '/assets/audio/bgm/l.ogg', '/assets/char/a.png', '/assets/local/ui/common/banner.png', '/fonts/f.woff2',
    ]);
    assert.equal(manifest.files.find((f) => f.url === '/assets/char/a.png').sha256, sha256(png));
    assert.equal((await get(srv.port, '/resource-manifest.json', { 'if-none-match': r.headers.etag })).status, 304);
    const gz = await get(srv.port, '/resource-manifest.json', { 'accept-encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.deepEqual(JSON.parse(gunzipSync(gz.body)), manifest, 'the same document, compressed');
    const head = await get(srv.port, '/resource-manifest.json', {}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(fs.existsSync(path.join(dir, 'public/resource-manifest.json')), false, 'never written into the deployment');
  });

  test('a server with the resource layer switched off answers 404 (a Cloudflare build publishes the file itself)', async () => {
    const other = await startServer({ port: 0, host: '127.0.0.1', quiet: true, publicDir: path.join(dir, 'public'),
      dataDir: path.join(dir, 'data'), sharedDir: path.join(dir, 'shared'), assetIndex: false, resources: false });
    try {
      assert.equal((await get(other.port, '/resource-manifest.json')).status, 404);
    } finally {
      await other.close();
    }
  });
});
