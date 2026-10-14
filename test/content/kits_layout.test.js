// The operator kit layout (server/sim/content/kits/README.md): every file of kits/ops/ is listed once in kits/index.js
// KIT_FILES, STANDIN_KIT_FILES or OPERATOR_KIT_FILES and nothing else is; a file `<chessId>-<codename>.js` registers
// exactly the kit of `<chessId>_a`, whose data record has that charId code name; a 补位 file `standin-<codename>.js`
// registers exactly the kit of the stand-in character whose charId has that code name (data/backups.json `units`); a
// 自选 file `op-<codename>.js` registers exactly the kit of the owned-6★ pick with that code name (data/backups.json
// `diy.ownedPool`) and writes every skill of the operator under `skills`; the registry is the tier groups in order, then
// the stand-ins, then the 自选 operators, and content/index.js serves that object; KITTED_CHARS = the 预备干员 + every
// registered stand-in / operator charId; no kit file imports a Node-only or server-only module or reads the clock /
// Math.random (the sim is deterministic and also runs in the browser, /sim/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_FILES, TIER_KITS, KITS, STANDIN_KIT_FILES, STANDIN_KITS, OPERATOR_KIT_FILES, OPERATOR_KITS, PROMOTED_KITS, DEMOTED_KITS, GENERIC_KIT_CHARS, KITTED_CHARS } from '../../server/sim/content/kits/index.js';
import { KITS as CONTENT_KITS } from '../../server/sim/content/index.js';
import { DIY_ONLY_OPERATORS } from '../../shared/diyOnly.js';
import { PROMOTED_PIECES } from '../../shared/promoted.js';
import { diyRecord } from '../../shared/diy.js';
import { normalizeChess } from '../../server/sim/simdata.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const KIT_DIR = join(ROOT, 'server/sim/content/kits');
const CHESS = JSON.parse(readFileSync(join(ROOT, 'data/chess.json'), 'utf8'));
const BACKUPS = JSON.parse(readFileSync(join(ROOT, 'data/backups.json'), 'utf8'));
const jsIn = (dir) => readdirSync(join(KIT_DIR, dir)).filter((f) => f.endsWith('.js')).sort();
/** The operators the fork promoted out of the 自选 pool (shared/promoted.js): their kit files stay, fielded by their chess. */
const PROMOTED_CHARS = PROMOTED_PIECES.map((p) => p.charId);

test('kits/index.js lists every kit file of kits/ops/ exactly once, and only those', () => {
  const listed = [...KIT_FILES.flat(), ...STANDIN_KIT_FILES, ...OPERATOR_KIT_FILES];
  assert.equal(new Set(listed).size, listed.length, 'a file listed twice');
  assert.deepEqual([...listed].sort(), jsIn('ops'));
});

test('a stand-in kit file standin-<codename>.js registers the kit of that stand-in charId (data/backups.json units)', async () => {
  const units = Object.keys(BACKUPS.units);
  for (const file of STANDIN_KIT_FILES) {
    const m = /^standin-([a-z0-9]+)\.js$/.exec(file);
    assert.ok(m, `${file}: name`);
    const charId = units.find((id) => id.replace(/^char_\d+_/, '') === m[1]);
    assert.ok(charId, `${file}: no stand-in with the code name ${m[1]}`);
    const mod = await import(`../../server/sim/content/kits/ops/${file}`);
    assert.deepEqual(Object.keys(mod.default), [charId], `${file}: default export`);
    assert.equal(typeof mod.default[charId], 'function', `${file}: kit builder`);
    assert.equal(STANDIN_KITS[charId], mod.default[charId], `${file}: registered`);
    assert.equal(KITS[charId], mod.default[charId], `${file}: in the merged registry`);
  }
});

test('a 自选 kit file op-<codename>.js registers the kit of that owned-6★ pick (data/backups.json diy.ownedPool), every skill under `skills`', async () => {
  const pool = BACKUPS.diy.ownedPool;
  for (const file of OPERATOR_KIT_FILES) {
    const m = /^op-([a-z0-9]+)\.js$/.exec(file);
    assert.ok(m, `${file}: name`);
    // FORK PROMOTED PIECES (shared/promoted.js): a promoted operator left the 自选 pool - its kit is fielded by its own chess
    const charId = pool.find((id) => id.replace(/^char_\d+_/, '') === m[1])
      ?? PROMOTED_CHARS.find((id) => id.replace(/^char_\d+_/, '') === m[1]);
    // FORK PROMOTED PIECES (shared/promoted.js): a promoted operator is a 可用干员 now — its kit is fielded by its own
    // chess, it can no longer fill a 自选 slot, so the 自选 coverage below does not apply to it
    if (!pool.includes(charId)) continue;
    assert.ok(charId, `${file}: no owned-6★ pick with the code name ${m[1]}`);
    const mod = await import(`../../server/sim/content/kits/ops/${file}`);
    assert.deepEqual(Object.keys(mod.default), [charId], `${file}: default export`);
    assert.equal(typeof mod.default[charId], 'function', `${file}: kit builder`);
    assert.equal(OPERATOR_KITS[charId], mod.default[charId], `${file}: registered`);
    assert.equal(KITS[charId], mod.default[charId], `${file}: in the merged registry`);
    // every skill of every slot form is authored (a 自选 piece has no default skill: the pick chooses any), built from the
    // composed record and its def as the sim does (shared/diy.js diyRecord, simdata normalizeChess)
    for (const slot of ['chess_char_5_diy1_a', 'chess_char_6_diy1_a']) {
      for (const elite of [false, true]) {
        const rec = diyRecord(slot, { charId, skillIndex: 0 }, { elite, data: { chess: CHESS, backups: BACKUPS } });
        assert.ok(rec, `${file}: a legal pick of ${slot}`);
        const kit = mod.default[charId](rec.skill.bb, rec, normalizeChess(rec));
        assert.deepEqual(Object.keys(kit.skills || {}).sort(), rec.skills.map((s) => s.skillId).sort(), `${file}@${slot}${elite ? ' elite' : ''}: skills`);
      }
    }
  }
  assert.deepEqual([...KITTED_CHARS].sort(), [...new Set([...GENERIC_KIT_CHARS, ...Object.keys(STANDIN_KITS), ...Object.keys(OPERATOR_KITS), ...Object.keys(DEMOTED_KITS)])].sort());
});

test('a kit file <chessId>-<codename>.js registers the kit of <chessId>_a (codename: its charId without char_<n>_)', async () => {
  for (const file of KIT_FILES.flat()) {
    const m = /^(chess_char_\w+?)-([a-z0-9]+)\.js$/.exec(file);
    assert.ok(m, `${file}: name`);
    const key = `${m[1]}_a`;
    // FORK 自选-ONLY OPERATORS (shared/diyOnly.js): a demoted operator's shop chess left the roster. Its file keeps the
    // chess key it was written under and the registry aliases the kit under the operator's charId (DEMOTED_KITS) — the
    // key a 自选 piece resolves its kit by (content/index.js kitOf)
    const demoted = DIY_ONLY_OPERATORS.find((p) => p.kitChessId === key);
    const mod = await import(`../../server/sim/content/kits/ops/${file}`);
    if (demoted) {
      assert.equal(demoted.charId.replace(/^char_\d+_/, ''), m[2], `${file}: code name of ${demoted.charId}`);
      assert.deepEqual(Object.keys(mod.default), [key], `${file}: default export`);
      assert.equal(DEMOTED_KITS[demoted.charId], mod.default[key], `${file}: aliased under its charId`);
      assert.equal(KITS[demoted.charId], mod.default[key], `${file}: in the merged registry`);
      continue;
    }
    const rec = CHESS[key];
    assert.ok(rec, `${file}: no data record ${key}`);
    assert.equal(String(rec.charId).replace(/^char_\d+_/, ''), m[2], `${file}: code name of ${rec.charId}`);
    assert.deepEqual(Object.keys(mod.default), [key], `${file}: default export`);
    assert.equal(typeof mod.default[key], 'function', `${file}: kit builder`);
    assert.equal(KITS[key], mod.default[key], `${file}: registered`);
  }
});

test('the registry is the tier groups in KIT_FILES order, then the stand-ins, then the 自选 operators, one key per file; content/index.js serves the same object', () => {
  assert.deepEqual(Object.keys(KITS), [...TIER_KITS.flatMap((t) => Object.keys(t)), ...Object.keys(STANDIN_KITS), ...Object.keys(OPERATOR_KITS), ...Object.keys(PROMOTED_KITS), ...Object.keys(DEMOTED_KITS)]);
  assert.equal(Object.keys(KITS).length, KIT_FILES.flat().length + STANDIN_KIT_FILES.length + OPERATOR_KIT_FILES.length + Object.keys(PROMOTED_KITS).length + Object.keys(DEMOTED_KITS).length, 'one key per file, none twice');
  assert.equal(CONTENT_KITS, KITS);
});

test('kit files stay browser-safe and deterministic: no Node-only or server-only import, no clock, no Math.random', () => {
  for (const f of ['index.js', ...['shared', 'ops'].flatMap((d) => jsIn(d).map((x) => `${d}/${x}`))]) {
    const src = readFileSync(join(KIT_DIR, f), 'utf8');
    assert.ok(!/from\s+['"]node:|import\(\s*['"]node:|\brequire\(|nodeData\.js/.test(src), `${f}: Node-only import`);
    const specifiers = [...src.matchAll(/^(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm), ...src.matchAll(/\bimport\(\s*['"`]([^'"`]+)['"`]/g)];
    for (const [, p] of specifiers) {
      assert.ok(p.startsWith('.'), `${f}: bare import ${p}`);
      // never server / client code, never an index module (content/index.js, kits/index.js: an import cycle)
      assert.ok(!/(^|\/)(match|net|public)\/|(^|\/)index\.js$/.test(p), `${f}: imports ${p}`);
    }
    assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(src), `${f}: clock / Math.random (use battle.rng, battle.after / every)`);
  }
});
