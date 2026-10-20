// FORK: the E.G.O 饰品 / 苦难 pick (PHASE.EGO_PICK, server/match/match/egoPick.js; todoList/边狱巴士饰品系统（长期）.md).
// The pick is opt-in (the room option 「E.G.O 饰品与苦难」, Match.egoEnabled; config.ego.enabled is only the build default):
// with the option off the round reaches the normal flow and nothing of this file happens, which is why the golden results
// do not move. Covered here: the gate, the rounds, the per-seat offer (independent of the order players act in), the
// refresh economy, the errors, the deadline, the wire views (m.private.ego / m.public.ego) and the effects both sides get.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { EGO_BOSS_DIVISOR } from '../../shared/ego.js';
import { makeMatch, DATA } from './harness.js';

/** The option list of a seat as `[tier, trinketId, hardshipId]`, for stable comparisons. */
const offerOf = (h, pid) => {
  const v = h.m.egoViewFor(h.ps(pid));
  return v ? v.options.map((o) => [o.tier, o.trinket.id, o.hardship.id]) : null;
};
const trinketIds = (h, pid) => (h.m.egoViewFor(h.ps(pid))?.options || []).map((o) => o.trinket.id);

/** Drive human decisions until EGO_PICK opens (or the round asked for arrives). */
function toEgoPick(o = {}, round = 1) {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 0, seed: 5, ego: true, fake: true, ...o }).start();
  const at = () => (h.m.phase === PHASE.EGO_PICK && h.m.round === round) || h.ended != null;
  h.drive(at);
  assert.equal(h.m.phase, PHASE.EGO_PICK, `did not reach EGO_PICK R${round} (phase ${h.m.phase} R${h.m.round})`);
  assert.equal(h.m.round, round);
  return h;
}

/**
 * Everyone still undecided takes the option under `pick`, called with (h, playerId, view); an AI seat is left to its own
 * timer (scheduleEgoBot), which the virtual clock runs.
 */
function decideAll(h, pick = () => 0) {
  for (let guard = 0; guard < 20; guard++) {
    const waiting = h.m.egoWaiting();
    if (!waiting.length) return;
    let bot = false;
    for (const ps of waiting) {
      const v = h.m.egoViewFor(ps);
      if (!v) continue;
      if (ps.botControlled) { bot = true; continue; }
      h.m.handle(ps.playerId, { t: 'g.trinket', idx: pick(h, ps.playerId, v), pickId: v.id });
    }
    if (!bot) return;
    h.sched.advance(2_000);
  }
}

/**
 * Drive a whole match, answering the E.G.O pick on the way; returns the rounds the phase opened on.
 * `before` runs at every pick before the answers (to observe it).
 */
function runMatch(o, before = null) {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 3, fake: true, ...o }).start();
  const m = h.m;
  const rounds = [];
  const atPick = () => h.ended != null || (m.phase === PHASE.EGO_PICK && m.ego);
  for (let i = 0; i < 1e5 && !h.ended; i++) {
    h.drive(atPick, { ready: true });
    if (h.ended) break;
    if (!(m.phase === PHASE.EGO_PICK && m.ego)) break; // the drive ran the match to its end without a pick
    if (!rounds.includes(m.round)) rounds.push(m.round);
    if (before) before(h, rounds.length);
    decideAll(h);
  }
  assert.ok(h.ended, `match did not end (phase ${m.phase} R${m.round})`);
  return { h, rounds };
}

test('the option: off unless the build or the room says so, and only a real boolean turns it on', () => {
  const mk = (o) => { const h = makeMatch(o); const v = h.m.egoEnabled; h.m.dispose(); return v; };
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1 }), false, 'the shipped default is off (config.ego.enabled)');
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, ego: true }), true);
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, ego: 'yes' }), false, 'only a real boolean');
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, ego: 1 }), false);
  // the build default is data-driven: a build with config.ego.enabled passes it on, and the room option still overrides
  const on = { ...DATA, config: { ...DATA.config, ego: { enabled: true } } };
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, data: on }), true, 'config.ego.enabled is the default');
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, data: on, ego: false }), false, 'the room option wins');
  // data without the file: nothing to pick, and the option cannot conjure it
  const noData = { ...DATA, 'ego-trinkets': null };
  assert.equal(mk({ mode: 'coop', humans: 1, bots: 1, data: noData, ego: true }), true, 'the option is the room fact');
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, data: noData, ego: true }).start();
  assert.equal(h.m.gd.ego, null);
  assert.deepEqual(h.m.gd.egoRounds, []);
  h.drive(() => h.ended != null);
  assert.ok(h.ended, 'a match without the data file still runs');
  h.m.dispose();
});

test('the pick opens on rounds 1 / 4 / 7 / 11 only, and the option off never opens it', () => {
  const off = runMatch({ ego: false });
  assert.deepEqual(off.rounds, [], 'no pick with the option off');
  const on = runMatch({ ego: true });
  assert.deepEqual(on.rounds, [1, 4, 7, 11], 'the data rounds on a whole match');
  for (const r of on.rounds) assert.ok(DATA['ego-trinkets'].rounds.includes(r));
});

test('the rounds are data-driven (data.ego-trinkets.rounds) and the pick hands over to the round\'s own 机变 draft', () => {
  const data = { ...DATA, 'ego-trinkets': { ...DATA['ego-trinkets'], rounds: [3] } };
  const h = toEgoPick({ data, humans: 1, bots: 1 }, 3);
  assert.deepEqual(h.m.gd.spRounds().slice(0, 1), [3], 'round 3 also has a 机变 draft');
  h.sched.advance(2000); // the AI seat takes its option
  assert.deepEqual(h.m.egoWaiting().map((p) => p.playerId), ['p_0']);
  h.m.handle('p_0', { t: 'g.trinket', idx: 0 });
  assert.equal(h.m.phase, PHASE.SP_DRAFT, 'EGO_PICK → SP_DRAFT on a 机变 round, not PREP');
  h.m.dispose();
});

test('the offer: three options, one 饰品 + one 苦难 each, and it does not depend on the order players act in', () => {
  const a = toEgoPick();
  const b = toEgoPick();
  const v = a.m.egoViewFor(a.ps('p_0'));
  assert.equal(v.options.length, 3, '三选一');
  for (const o of v.options) {
    assert.ok([1, 2, 3].includes(o.trinket.tier), `tier ${o.trinket.tier}`);
    assert.equal(o.tier, o.trinket.tier);
    assert.equal(typeof o.trinket.name, 'string');
    assert.equal(typeof o.trinket.desc, 'string');
    assert.equal(typeof o.trinket.icon, 'string', 'the record icon (its display name)');
    assert.equal(typeof o.hardship.name, 'string');
    assert.ok(DATA['ego-trinkets'].trinkets[o.trinket.id], 'a record of the data file');
    assert.ok(DATA['ego-trinkets'].hardships[o.hardship.id]);
  }
  assert.equal(v.round, 1);
  assert.equal(v.refreshMax, 2);
  assert.equal(v.refreshCost, 1);
  assert.equal(v.picked, null);
  assert.equal(a.m.egoWaiting().length, 2);
  // a refresh moves only the refresher's own offer: b never acts, and its seat is byte-identical
  assert.deepEqual(offerOf(a, 'p_1'), offerOf(b, 'p_1'), 'the other seat is untouched by a refresh');
  a.m.handle('p_0', { t: 'g.trinketRefresh' });
  assert.deepEqual(offerOf(a, 'p_1'), offerOf(b, 'p_1'), 'still untouched after the refresh');
  assert.notDeepEqual(offerOf(a, 'p_0'), offerOf(b, 'p_0'), 'the refresher\'s own offer changed');
  a.m.dispose();
  b.m.dispose();
});

test('picking: the 饰品 and the 苦难 both land in the player\'s effects, and the option set is spent', () => {
  const h = toEgoPick();
  const p0 = h.ps('p_0');
  const v = h.m.egoViewFor(p0);
  const chosen = v.options[1];
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 1, pickId: v.id }), { ok: true });
  const keys = p0.effects.map((e) => e.key);
  assert.ok(keys.includes(`ego:${chosen.trinket.id}`), `trinket ref (${keys.join(', ')})`);
  assert.ok(keys.includes(`ego:hs:${chosen.hardship.id}`), 'hardship ref');
  const trinket = p0.effects.find((e) => e.key === `ego:${chosen.trinket.id}`);
  const hardship = p0.effects.find((e) => e.key === `ego:hs:${chosen.hardship.id}`);
  assert.equal(trinket.iconKind, 'ego');
  assert.equal(trinket.battle, true);
  assert.equal(trinket.params.egoKind, 'trinket');
  assert.equal(trinket.params.tier, chosen.tier);
  assert.equal(trinket.params.scope, undefined, 'a 饰品 applies to the picker alone (no scope override)');
  assert.equal(hardship.params.egoKind, 'hardship');
  assert.equal(hardship.params.scope, 'own', 'the hardship is stored at full strength, owned');
  assert.ok(Array.isArray(hardship.params.effects) && hardship.params.effects.length);
  assert.equal(h.m.egoViewFor(p0).picked, 1);
  assert.deepEqual(h.m.egoWaiting().map((p) => p.playerId), ['p_1']);
  // the last pick closes the phase
  decideAll(h);
  assert.equal(h.m.phase, PHASE.PREP);
  assert.equal(h.m.ego, null);
  h.m.dispose();
});

test('the refresh: costs the picker\'s own funds, twice at most, and never charges a refused one', () => {
  const h = toEgoPick({ humans: 2, bots: 0 });
  const p0 = h.ps('p_0');
  const before = offerOf(h, 'p_0');
  assert.equal(p0.funds, 4);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh' }), { ok: true });
  assert.equal(p0.funds, 3, '1 资金');
  assert.notDeepEqual(offerOf(h, 'p_0'), before, 'the three options are re-rolled');
  assert.equal(h.m.egoSeat(p0).refreshes, 1);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh', pickId: h.m.egoViewFor(p0).id }), { ok: true });
  assert.equal(p0.funds, 2);
  const third = offerOf(h, 'p_0');
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh' }), { error: 'RATE' }, 'twice at most');
  assert.equal(p0.funds, 2, 'a refused refresh charges nothing');
  assert.deepEqual(offerOf(h, 'p_0'), third, 'and draws nothing');
  // no funds
  p0.funds = 0;
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh' }), { error: 'RATE' }, 'the cap comes first');
  p0.funds = 5;
  assert.equal(h.ps('p_0').funds, 5);
  // a picked seat can no longer refresh
  h.m.handle('p_0', { t: 'g.trinket', idx: 0 });
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh' }), { error: 'ALREADY' });
  assert.equal(p0.funds, 5);
  h.m.dispose();
  // funds below the cost: refused, nothing charged
  const poor = toEgoPick({ humans: 2, bots: 0 });
  const q = poor.ps('p_0');
  q.funds = 0;
  assert.deepEqual(poor.m.handle('p_0', { t: 'g.trinketRefresh' }), { error: 'NO_FUNDS' });
  assert.equal(q.funds, 0);
  assert.equal(poor.m.egoSeat(q).refreshes, 0, 'a refused refresh does not spend the cap');
  poor.m.dispose();
});

test('the errors: wrong phase, an already picked seat, a stale offer id, an out of range option', () => {
  const h = toEgoPick();
  const v = h.m.egoViewFor(h.ps('p_0'));
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 0, pickId: 'ego.9.9' }), { error: 'BAD_TARGET', detail: 'offer changed' }, 'a stale overlay cannot pick');
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 9 }), { error: 'BAD_TARGET' });
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: -1 }), { error: 'BAD_TARGET' });
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 0, pickId: v.id }), { ok: true });
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 0 }), { error: 'ALREADY' }, 'one pick per seat');
  assert.equal(h.ps('p_0').effects.length, 2, 'one option only');
  h.m.dispose();
});

test('a pick while the phase is not open is refused', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 0, seed: 5, ego: true, fake: true }).start();
  assert.equal(h.m.phase, PHASE.INFO_CHECK);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinket', idx: 0 }), { error: 'WRONG_PHASE' });
  assert.deepEqual(h.m.handle('p_0', { t: 'g.trinketRefresh' }), { error: 'WRONG_PHASE' });
  assert.equal(h.ps('p_0').effects.length, 0, 'nothing applied');
  h.m.dispose();
});

test('the wire: the offer travels in m.private.ego, the shared board in m.public.ego', () => {
  const h = toEgoPick();
  const priv = h.allTo('p_0', 'm.private').at(-1);
  assert.ok(priv.ego, 'the picker is told about its own offer');
  assert.equal(priv.ego.id, 'ego.1.0');
  assert.equal(priv.ego.options.length, 3);
  const pub = h.lastBc('m.public');
  assert.ok(pub.ego, 'the table sees who is still deciding');
  assert.equal(pub.ego.round, 1);
  assert.deepEqual(pub.ego.waiting.slice().sort(), ['p_0', 'p_1']);
  assert.deepEqual(pub.ego.taken, {});
  h.m.handle('p_0', { t: 'g.trinket', idx: 0 });
  h.flushAll(); // m.public is throttled (DELAYS.PUBLIC_THROTTLE)
  const pub2 = h.lastBc('m.public');
  assert.equal(pub2.ego.waiting.length, 1);
  assert.deepEqual(Object.keys(pub2.ego.taken), ['p_0']);
  assert.deepEqual(pub2.ego.picks, ['p_0'], 'the table sees who has picked');
  assert.equal(pub2.players.find((s) => s.playerId === 'p_0').status, 'ready');
  // outside the phase nothing of it is on the wire (an ordinary m.private stays byte-identical)
  decideAll(h);
  assert.equal(h.m.phase, PHASE.PREP);
  const after = h.allTo('p_0', 'm.private').at(-1);
  assert.equal(after.ego, undefined, 'no ego key outside EGO_PICK');
  h.m.dispose();
});

test('the deadline: everyone still undecided takes their first option', () => {
  const h = toEgoPick({ humans: 2, bots: 0 });
  const first = { p_0: trinketIds(h, 'p_0')[0], p_1: trinketIds(h, 'p_1')[0] };
  const now = h.sched.now();
  assert.equal(h.m.deadline - now, 25_000, 'timers.egoPick (25 s)');
  h.sched.advance(26_000);
  assert.equal(h.m.phase, PHASE.PREP, 'the pick closes on the clock');
  for (const id of ['p_0', 'p_1']) {
    const keys = h.ps(id).effects.filter((e) => e.key.startsWith('ego:')).map((e) => e.key);
    assert.ok(keys.includes(`ego:${first[id]}`), `${id} took its first option (${keys.join(', ')})`);
    assert.equal(keys.filter((k) => k.startsWith('ego:hs:')).length, 1, 'and its 苦难');
  }
  h.m.dispose();
});

test('an AI seat takes its own option; a solo match is untimed', () => {
  const h = toEgoPick({ humans: 1, bots: 1 });
  assert.deepEqual(h.m.egoWaiting().map((p) => p.playerId).sort(), ['ai_0', 'p_0']);
  h.sched.advance(100);
  assert.ok(h.m.egoWaiting().some((p) => p.isBot), 'not instantly');
  h.sched.advance(5_000);
  assert.deepEqual(h.m.egoWaiting().map((p) => p.playerId), ['p_0'], 'the AI seat picked');
  h.m.dispose();
  const s = makeMatch({ mode: 'solo', humans: 1, seed: 5, ego: true, fake: true }).start();
  s.drive(() => s.m.phase === PHASE.EGO_PICK || s.ended != null);
  assert.equal(s.m.phase, PHASE.EGO_PICK);
  assert.equal(s.m.ego.untimed, true, 'a solo match waits for its player');
  assert.equal(s.m.deadline, 0);
  assert.equal(s.m.egoViewFor(s.ps('p_0')).turnSeconds, 0);
  s.m.dispose();
});

test('a hardship scales at the boss rounds (1/3, floored) and widens to the whole team', () => {
  const h = toEgoPick();
  const p0 = h.ps('p_0');
  const rec = h.m.gd.hardship('sharpness-1'); // 锐利 I: 攻击力 +15%
  const ref = h.m.addEgoRef(p0, rec, { hardship: true });
  assert.equal(ref.params.scope, 'own');
  const own = p0._effectRef(ref);
  assert.equal(own.params.scope, 'own');
  assert.deepEqual(own.params.effects.map((e) => [e.kind, e.params]), [['enemyMods', { atk: 15 }]]);
  h.m.round = 14; // a boss round (data.ego-trinkets.bossRounds)
  const boss = p0._effectRef(ref);
  assert.equal(boss.params.scope, 'all', 'the boss round applies every player\'s hardship');
  assert.deepEqual(boss.params.effects.map((e) => [e.kind, e.params]), [['enemyMods', { atk: Math.floor(15 / EGO_BOSS_DIVISOR) }]], '15 → 5');
  // the record itself never moves: the copy is what the battle gets
  assert.deepEqual(ref.params.effects, [{ kind: 'enemyMods', params: { atk: 15 } }]);
  assert.equal(h.m.egoSpawnMods(p0, 1).extra, 0, 'and no record adds spawns today');
  h.m.dispose();
});

test('the spawn-level kinds (extraEnemies / fasterSpawns) still scale — kept for later records, used by none', () => {
  const h = toEgoPick();
  const p0 = h.ps('p_0');
  const synthetic = {
    id: 'test-swarm', name: 'x', tier: 2, icon: 'x', desc: 'x',
    effects: [{ kind: 'extraEnemies', params: { count: 1, tier: 1 } }, { kind: 'fasterSpawns', params: { pct: 10 } }],
  };
  h.m.addEgoRef(p0, synthetic, { hardship: true });
  assert.deepEqual(h.m.egoSpawnMods(p0, 1), { extra: 1, fasterPct: 10 });
  assert.deepEqual(h.m.egoSpawnMods(p0, 14), { extra: 0, fasterPct: 3 }, 'count 1 → 0 is dropped, 10 → 3');
  const used = new Set();
  for (const map of ['trinkets', 'hardships']) for (const r of Object.values(DATA['ego-trinkets'][map])) for (const e of r.effects) used.add(e.kind);
  assert.ok(!used.has('extraEnemies') && !used.has('fasterSpawns'), 'the 2026-10-20 catalogue has no spawn kind');
  h.m.dispose();
});

test('the option off changes nothing: same seed, same whole match, no effects', () => {
  const off = { ego: false };
  const omitted = {};
  const a = runMatch(off);
  const b = runMatch(omitted);
  assert.deepEqual(a.rounds, []);
  assert.deepEqual(b.rounds, []);
  const snap = (h) => ({
    end: h.ended,
    draws: [h.m.rngShop(), h.m.rngBots(), h.m.rngMeta(), h.m.rngWaves()],
    effects: [...h.m.players.values()].map((ps) => ps.effects.map((e) => e.key)),
  });
  assert.deepEqual(snap(a.h), snap(b.h), 'ego:false is byte-identical to no ego option at all');
  assert.ok(a.h.ps('p_0').effects.every((e) => !e.key.startsWith('ego:')), 'no E.G.O effect without the option');
  a.h.m.dispose();
  b.h.m.dispose();
});

test('the prototype: g.trinket / g.trinketRefresh validate as wire messages', () => {
  assert.equal(validateC2S({ t: 'g.trinket', idx: 0 }), null);
  assert.equal(validateC2S({ t: 'g.trinket', idx: 2, pickId: 'ego.1.0' }), null);
  assert.equal(validateC2S({ t: 'g.trinketRefresh' }), null);
  assert.equal(validateC2S({ t: 'g.trinketRefresh', pickId: 'ego.1.0' }), null);
  assert.equal(validateC2S({ t: 'g.trinket' }), 'bad field idx');
  assert.equal(validateC2S({ t: 'g.trinket', idx: 3 }), 'bad field idx', 'EGO_OFFER_SIZE = 3');
  assert.equal(validateC2S({ t: 'g.trinket', idx: -1 }), 'bad field idx');
  assert.equal(validateC2S({ t: 'g.trinketRefresh', pickId: 7 }), 'bad field pickId');
});
