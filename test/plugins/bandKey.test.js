// A script plugin can bind a band buff key to its own battle installer (docs/PLUGINS.md §13). These tests pin the
// contract: the plugin sees `(battle, ps, params, bandId, api)`, adds layers only through the rule api (so caps and
// 禁增 hold), and can never shadow an official key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { fixture, bondPatch } from '../helpers/contentFixtures.js';
import { buildContentSet } from '../../server/plugins/contentSet.js';
import { DataSource } from '../../server/sim/simdata.js';
import { setGameData } from '../../server/sim/content/support/index.js';
import { registerBuffKey, resetExtensions } from '../../server/sim/content/extensions.js';
import { buffKeyInstallerKeys } from '../../server/sim/content/buffKeys.js';

const KEY = 'band_x_demo_keeper_buff';
const BAND = 'band_x_band_key_demo_keeper';
const bondOn = (count, layers = 0, tier = null, thresholds = [3, 6, 9]) => ({
  count, active: count >= thresholds[0], tier: tier ?? thresholds.filter((t) => count >= t).length, layers,
});

/** A one-band content set: 坎诺�?s base record with our plugin buff key as its only buff. */
function setFor(t, buff = { key: KEY, bb: { count: 7 }, bbStr: { key: KEY } }) {
  const f = fixture(t);
  f.put('band-key-demo', { permissions: ['data.patch', 'data.add'], data: ['r.json'] },
    { 'p.json': bondPatch(), 'r.json': { records: 1, entries: [{ file: 'bands', id: BAND, base: 'band_amiya', set: { buffs: [buff] } }] } });
  const set = buildContentSet({ registry: f.registry, ids: ['band-key-demo'] });
  assert.deepEqual(set.problems, []);
  setGameData(set.data);
  t.after(() => { setGameData(null); resetExtensions(); });
  return set;
}
const layersOf = (h, bondId) => h.b.getPlayer('p1').bonds[bondId].layers;
const plugin = () => ({ id: 'band-key-demo', permissions: ['sim.code'], budget: 1e6 });

test('a plugin band key installs and its layers go through the rule api', (t) => {
  const set = setFor(t);
  let api = null, seen = null;
  registerBuffKey(plugin(), KEY, (battle, ps, params, bandId, a) => {
    api = a; seen = { bandId, count: params.count };
    a.gain({ playerId: ps.playerId, bonds: a.topActive(ps.playerId), n: 2, requireActive: true, reason: 'band:demo' });
  });
  assert.deepEqual(buffKeyInstallerKeys(), [KEY]);
  const h = makeBattle({ data: new DataSource(set.data), bandId: BAND, bonds: { deputShip: bondOn(3, 0) } });
  h.step();
  assert.equal(seen.bandId, BAND);
  assert.equal(seen.count, 7);
  assert.equal(layersOf(h, 'deputShip'), 2);
  assert.equal(api.topActive('p1'), 'deputShip');
  assert.deepEqual(api.bonds('p1'), ['deputShip']);
  assert.equal(api.active('p1', 'deputShip'), true);
  assert.equal(api.bandId('p1'), BAND);
});

test('the rule api keeps the per-bond cap and the 禁增 flag authoritative', (t) => {
  const set = setFor(t);
  registerBuffKey(plugin(), KEY, (battle, ps, p, bandId, api) => {
    const add = (capKey) => api.gain({ playerId: ps.playerId, bonds: ['deputShip'], n: 1, requireActive: true, cap: 1, capKey, reason: 'band:demo' });
    add('demo'); add('demo');
    battle.flags.layerGainsEnabled = false;
    assert.equal(add('demo'), 0);
    battle.flags.layerGainsEnabled = true;
    assert.equal(add('demo'), 0);
  });
  const h = makeBattle({ data: new DataSource(set.data), bandId: BAND, bonds: { deputShip: bondOn(3, 0) } });
  h.step();
  assert.equal(layersOf(h, 'deputShip'), 1);
});

test('an official buff key still wins over a plugin registration', (t) => {
  const set = setFor(t);
  let called = 0;
  registerBuffKey(plugin(), 'act1autochess_band13_buff', () => { called++; });
  const h = makeBattle({ data: new DataSource(set.data), bandId: 'band_orchid', bonds: { sargon: bondOn(3, 0) } });
  h.step();
  assert.equal(called, 0);
});

test('a plugin band key that nothing installs is inert (unknown key, no error)', (t) => {
  const set = setFor(t);
  const h = makeBattle({ data: new DataSource(set.data), bandId: BAND, bonds: { deputShip: bondOn(3, 0) }, spawns: [{ id: enemyRec({ key: 'e_demo_x', hp: 100, speed: 0 }), at: 0, row: 5, col: 5 }] });
  h.step();
  assert.equal(layersOf(h, 'deputShip'), 0);
});
