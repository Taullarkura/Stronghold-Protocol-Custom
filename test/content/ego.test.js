// FORK: the E.G.O 饰品 / 苦难 battle side — server/sim/content/ego.js.
//
// Two rules the owner fixed on 2026-10-20 shape every test here:
//   * 烧伤 is ONE status whose layer count is its clock: every second it deals a FLAT 300 法术伤害 + 100 灼燃损伤 (the layer
//     count never multiplies that), and every 3 seconds it spends one layer, so N layers last N × 3 seconds;
//   * the 苦难 stat bonuses share ONE additive bucket: 锐利 I + 锐利 II is +45 % 攻击力, never 1.15 × 1.30.
//
// Ref shapes are the ones the match writes (server/match/match/egoPick.js addEgoRef) — the same object the client's
// m.private.ego shows and round.js/ battleInput hands to the battle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { applyBurn, egoPlanOf, egoPlans, enemyModsOf, opModsOf, registerMeta, trinketHandler, hardshipHandler, unhandledKinds, EXTERNAL_KINDS } from '../../server/sim/content/ego.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { BURN, EFFECT_KINDS, HARDSHIPS, TRINKETS } from '../../shared/ego.js';

const QUIET = { warn() {}, error() {}, info() {} };
const TRINKET = Object.fromEntries(TRINKETS.map((r) => [r.id, r]));
const HARDSHIP = Object.fromEntries(HARDSHIPS.map((r) => [r.id, r]));
const effects = (rec) => rec.effects.map((e) => ({ kind: e.kind, params: { ...e.params } }));

/** A trinket ref as the match writes it (added to the picking player's `playerEffects`). */
const trinketRef = (id, n = 1) => ({
  id: `ego:${id}#${n}`, key: `ego:${id}`, source: 'ego',
  params: { effects: effects(TRINKET[id]), tier: TRINKET[id].tier, egoKind: 'trinket' },
  data: { egoId: id },
});

/** A hardship ref: full strength on the picker's own half (round.js widens + scales it on the boss rounds). */
const hardshipRef = (id, n = 1, scope = 'own') => ({
  id: `ego:hs:${id}#${n}`, key: `ego:hs:${id}`, source: 'ego',
  params: { effects: effects(HARDSHIP[id]), scope, tier: HARDSHIP[id].tier, egoKind: 'hardship' },
  data: { egoId: id },
});

const guard = (o = {}) => chessRec({ id: 't_guard', stats: { atk: 0, maxHp: 99999, def: 0, aspd: 100, ...(o.stats || {}) }, ...o });
/** A punching bag: 200 ATK / 200 DEF / half speed and a pile of HP, so 强韧 / 顽强 / 极速 have something to scale. */
const dummy = (o = {}) => enemyRec({ key: 't_dummy', hp: 2_000_000, atk: 200, def: 200, speed: 0.5, bat: 1, ...o });

/**
 * One operator on the low lane and one enemy standing next to it (a spawn placed on the board, so the operator is in
 * range from t = 0 — the 烧伤 / 攻速 trinkets only fire on damage dealt). `trinkets` / `hardships` are the player's picks.
 * `foes` lets a test field a kit-carrying enemy (a 折射 native, a boss) instead of the punching bag.
 */
function fight({ trinkets = [], hardships = [], foes = null, bonds = {}, op = null, seed = 3, timeLimit = 120, flags = {}, spawn = [10, 5] } = {}) {
  const chess = op || guard();
  const enemy = foes || dummy();
  const h = makeBattle({
    defs: { chess: { t_guard: chess }, enemies: { [enemy.key]: enemy } },
    units: [{ uid: 1, kind: 'chess', chessId: 't_guard', row: 10, col: 4 }],
    players: [{
      playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds,
      units: [{ uid: 1, kind: 'chess', chessId: 't_guard', row: 10, col: 4 }],
      playerEffects: [...trinkets.map((id) => trinketRef(id)), ...hardships.map((id) => hardshipRef(id))],
    }],
    enemies: [{ key: enemy.key, pos: spawn }],
    autoFinish: false, timeLimit, seed, flags,
  });
  h.run(0.05);   // the t = 0 spawn lands on the first step
  return h;
}

const burnOn = (e) => (e.buffs || []).find((b) => b.key === BURN.key) || null;

/** Run to `t` seconds of battle time, then read state afterwards. */
const at = (h, t) => { h.run(Math.max(0, t - (h.b.time ?? 0))); return h; };

// =====================================================================================================
// 烧伤 (burn)

test('烧伤: N layers = N × 3 s, a flat 300 法术 + 100 灼燃 every second, one layer spent every 3 s', () => {
  const h = fight({ trinkets: ['dust-to-dust'] }); // 尘归尘: 3 layers on spawn
  const e = h.enemies()[0];
  const burn = burnOn(e);
  assert.ok(burn, 'the enemy walks in burning');
  assert.equal(burn.stacks, 3);
  assert.equal(burn.data.perStack, 3, 'one layer = 3 s');
  const hp0 = e.hp;
  // the first tick lands 1 s after the spawn, then every second; the clock spends a layer every 3 s
  at(h, 1.5);
  assert.equal(Math.round(hp0 - e.hp), 300, 'one second of 300 (the 灼燃损伤 goes to the gauge, not the HP)');
  assert.equal(e.elem.burn, 100, 'and 100 灼燃损伤');
  at(h, 3.5);
  assert.equal(Math.round(hp0 - e.hp), 900, 'three seconds, still 300 each: the layer count never multiplies the damage');
  assert.equal(burnOn(e).stacks, 2, 'one layer spent at 3 s');
  assert.equal(burnOn(e).data.consumed, 1);
  at(h, 9.5);
  assert.equal(burnOn(e), null, '3 layers × 3 s = 9 s, then the status is gone');
  assert.equal(Math.round(hp0 - e.hp), 2700, '9 ticks × 300');
  h.b.forceEnd?.();
});

test('烧伤: a second application adds layers to the same status (they extend its life, not its damage)', () => {
  const h = fight({ trinkets: ['dust-to-dust'] });
  const b = h.b;
  at(h, 1.5);
  const e = h.enemies()[0];
  assert.equal(burnOn(e).stacks, 3);
  applyBurn(b, e, 2, { perStack: 3 });
  assert.equal(burnOn(e).stacks, 5, 'one status, five layers');
  assert.equal(e.buffs.filter((x) => x.key === BURN.key).length, 1, 'never one buff per layer');
  const hp = e.hp;
  at(h, 2.5);
  assert.equal(Math.round(hp - e.hp), 300, 'still a flat 300 a second with five layers');
});

test('烧伤: 土归土 adds a second per layer, plus one per active 盟约 (capped at 3)', () => {
  // 土归土 = burnOnSpawn 2 + burnSpan {seconds 1, perActiveBond 1, max 3}
  const none = fight({ trinkets: ['ashes-to-ashes'] });
  at(none, 5.5);
  assert.equal(burnOn(none.enemies()[0]).stacks, 1, '2 layers × (3 + 1) s: one spent at 4 s, one at 8 s');
  const bonded = fight({
    trinkets: ['ashes-to-ashes'],
    bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 2 }, victoriaShip: { count: 3, active: true, tier: 1, layers: 1 } },
  });
  at(bonded, 5.5);
  // 2 layers × (3 + 1 flat + 3 active-bond layers, capped at max 3) = 2 × 7 s: nothing spent yet at 5.5 s
  assert.equal(burnOn(bonded.enemies()[0]).stacks, 2);
  at(bonded, 8.5);
  assert.equal(burnOn(bonded.enemies()[0]).stacks, 1, 'the first layer goes at 7 s');
});

test('烧伤: 镇魂 hits 50 % harder and every layer lasts 3 s longer', () => {
  const h = fight({ trinkets: ['soul-repose'] }); // burnOnSpawn 5 + burnAmp 50 + burnSpan 3
  const e = h.enemies()[0];
  assert.equal(burnOn(e).stacks, 5);
  assert.equal(burnOn(e).data.perStack, 6, '3 + 3');
  const hp0 = e.hp;
  at(h, 1.5);
  assert.equal(Math.round(hp0 - e.hp), 450, '300 × 1.5');
  assert.equal(e.elem.burn, 150, 'the 灼燃损伤 too');
});

test('炎鳞: a burning enemy takes extra damage per layer (burnVuln)', () => {
  // the operator stands out of range (a 1-tile spawn behind the lane) so only the hand-made hit below lands
  const hitter = guard({ stats: { atk: 0, aspd: 100 } });
  const hitOnce = (h) => {
    const e = h.enemies()[0];
    const before = e.hp;
    h.b.dealDamage(h.unit('t_guard'), e, { amount: 1000, type: 'phys', canDodge: false });
    return Math.round(before - e.hp);
  };
  const plain = fight({ op: hitter, foes: dummy({ def: 0 }) });
  assert.equal(hitOnce(plain), 1000, 'no layers, no bonus');
  // 炎鳞 has no burn source of its own: spawn three layers by hand, then the same hit is × 1.30
  const flaming = fight({ op: hitter, foes: dummy({ def: 0 }), trinkets: ['flame-scales'] });
  applyBurn(flaming.b, flaming.enemies()[0], 3, { perStack: 3 });
  assert.equal(hitOnce(flaming), 1300, '3 layers × 10 %');
});

test('炎鳞: the parting burst reads the layers the CLOCK spent, not the ones 炎鳞 ate', () => {
  const b = fight({ trinkets: ['flame-scales'], bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 2 } } });
  const h = b;
  at(h, 0.2);
  const e = h.enemies()[0];
  // 3 layers, 3 s each: at 3 s one is spent (consumed 1), at 6 s a second — the last one ends the status
  applyBurn(h.b, e, 3, { perStack: 3, pid: 'p1', endBurst: [{ perLayer: 10, floor: 2500 }] });
  const hp = e.hp;
  at(h, 1.5);
  const tick1 = hp - e.hp;
  at(h, 3.5);
  // the status expired at 9 s: max(floor 2500, 盟约总层数 2 × consumed 3 × 10 = 60) = 2500
  at(h, 9.5);
  assert.equal(burnOn(e), null);
  const total = hp - e.hp;
  assert.ok(total >= 2500 + 9 * 100, `flat ticks plus the 2500 floor (got ${Math.round(total)})`);
  assert.ok(total > tick1);
});

test('炎鳞: applying more than 10 layers eats 10 and hits at once (burnDetonate)', () => {
  const b = fight({ trinkets: ['flame-scales'], bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 5 } } });
  const h = b;
  at(h, 0.2);
  const e = h.enemies()[0];
  const hp = e.hp;
  const buff = applyBurn(h.b, e, 12, {
    perStack: 3, pid: 'p1', detonate: [{ threshold: 10, consume: 10, perLayer: 100 }],
  });
  assert.equal(buff.stacks, 2, '12 → eat 10 → 2');
  // 盟约总层数 5 × 100 = 500, and the enemy is still burning (2 layers) when the hit lands, so 炎鳞's burnVuln adds 20 %
  assert.equal(Math.round(hp - e.hp), 600, '500 × 1.20');
});

test('炽热的羽毛: a chance to add a layer on damage, higher against a burning target', () => {
  // pin the rng at one value: 0.15 sits between the cold chance (10 %) and the 对手已烧伤 one (20 %)
  const pin = (h) => { const r = h.b.rng; h.b.rng = Object.assign(() => 0.15, r); };
  const hit = (h) => h.b.dealDamage(h.unit('t_guard'), h.enemies()[0], { amount: 1, type: 'phys', canDodge: false });
  const op = guard({ stats: { atk: 10, aspd: 400 } });
  const cold = fight({ op, foes: dummy({ def: 0 }), trinkets: ['searing-feather'] });
  pin(cold);
  hit(cold);
  assert.equal(burnOn(cold.enemies()[0]), null, '0.15 misses the 10 % roll');
  const warm = fight({ op, foes: dummy({ def: 0 }), trinkets: ['searing-feather'] });
  applyBurn(warm.b, warm.enemies()[0], 3, { perStack: 3 });
  pin(warm);
  hit(warm);
  // 炎鳞 is not picked here, so the layer is the only thing that changed
  assert.equal(burnOn(warm.enemies()[0]).stacks, 4, '0.15 hits the 20 % roll on an already-burning target');
});

test('郁火: damaging a burning enemy grants 攻速, capped at 5 independent layers', () => {
  const hitter = guard({ stats: { atk: 10, aspd: 100 } });
  const h = fight({ op: hitter, foes: dummy({ hp: 2_000_000, def: 0 }), trinkets: ['smothered-flame'] });
  const e = h.enemies()[0];
  const op = h.unit('t_guard');
  applyBurn(h.b, e, 50, { perStack: 3 });
  at(h, 1.2);
  const haste = (op.buffs || []).filter((b) => b.key.startsWith('ego:haste:'));
  assert.ok(haste.length >= 1, 'the first damaging hit grants it');
  assert.ok(haste.length <= 5, 'at most five layers');
  assert.ok(op.s.aspd > 100, `the 攻速 shows on the unit (${op.s.aspd})`);
});

// =====================================================================================================
// 苦难: one additive bucket, then the statuses

test('苦难: the stat bonuses are additive — 锐利 I + II is +45 %, not 1.15 × 1.30', () => {
  const one = fight({ hardships: ['sharpness-1'] });
  const two = fight({ hardships: ['sharpness-1', 'sharpness-2'] });
  at(one, 0.3);
  at(two, 0.3);
  const atkOf = (h) => h.enemies()[0].s.atk;
  const baseAtk = dummy().stats.atk;
  assert.ok(Math.abs(atkOf(one) - baseAtk * 1.15) < 0.5, `+15 % (${atkOf(one)})`);
  assert.ok(Math.abs(atkOf(two) - baseAtk * 1.45) < 0.5, `+15 % then +30 % on the same bucket, not 1.15 × 1.30 (${atkOf(two)})`);
});

test('苦难: 强韧 / 顽强 ride the same additive bucket, per stat family', () => {
  const h = fight({ hardships: ['toughness-2', 'tenacity-2'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  // 强韧 II: hp +30, def +25; 顽强 II: dmgDealt +35, phys/arts taken -30
  assert.equal(Math.round(e.s.maxHp), Math.round(2_000_000 * 1.3));
  assert.equal(Math.round(e.s.def), Math.round(200 * 1.25));
  assert.equal(Math.round(e.s.dmgDealtMul * 100), 135);
  assert.equal(Math.round(e.s.physTakenMul * 100), 70);
  assert.equal(Math.round(e.s.artsTakenMul * 100), 70);
});

test('苦难: 等级强化 moves ATK / DEF / HP and 移速; 极速 adds 攻速', () => {
  const h = fight({ hardships: ['level-boost-1', 'velocity-2'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  assert.equal(Math.round(e.s.atk), Math.round(dummy().stats.atk * 1.1));
  assert.equal(Math.round(e.s.aspd), 125, '极速 II: +25 攻速 on top of the base 100');
  assert.ok(e.s.moveSpeed > dummy().stats.moveSpeed, 'and 移速 +35 %');
});

test('苦难: 怎么，打不中吗 — 20 % 物理与法术闪避', () => {
  const hitter = guard({ stats: { atk: 100, aspd: 400 } });
  const h = fight({ op: hitter, foes: dummy({ hp: 2_000_000, def: 0 }), hardships: ['cant-hit-me-1'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  assert.equal(Math.round(e.s.dodgePhys * 100), 20);
  assert.equal(Math.round(e.s.dodgeArts * 100), 20);
});

test('苦难: 超负荷 drains 1 % of max HP a second as true damage, capped, and refuses stun / fear / bind', () => {
  const h = fight({ hardships: ['overload-2'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  const hp = e.hp;
  at(h, 1.5);
  const drained = hp - e.hp;
  assert.ok(drained > 0, 'the clock drains');
  assert.ok(drained <= 100.001, `capped at 100 (got ${drained})`);
  assert.equal(e.s.flags.stun, false);
  assert.equal(h.b.applyStatus(e, 'stun', { duration: 3 }), false, 'the stun is cancelled');
  assert.equal(h.b.applyStatus(e, 'fear', { duration: 3 }), false);
  assert.equal(h.b.applyStatus(e, 'bind', { duration: 3 }), false);
});

test('苦难: 折射 gives RES for 20 s; on an enemy that already refracts it is 免疫沉默 instead', () => {
  const h = fight({ hardships: ['refraction-1'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  const buff = e.buffs.find((b) => b.key.startsWith('ego:hs:refraction-1'));
  assert.ok(buff, 'the 折射 buff is on');
  assert.equal(buff.mods.resFlat, 70);
  assert.ok(buff.timeLeft > 19 && buff.timeLeft <= 20, '20 s');
  assert.equal(h.b.applyStatus(e, 'silence', { duration: 3 }), true, 'a plain enemy is still silenceable');
  // 深池侦察犬 carries its own 折射 ability: the pick turns into 免疫沉默 instead of a second RES buff
  const nativeFoe = { ...enemyRec({ key: 'enemy_1165_duhond', hp: 2_000_000 }), abilities: [{ refraction: true }] };
  const native = fight({ hardships: ['refraction-1'], foes: nativeFoe });
  at(native, 0.3);
  const ne = native.enemies()[0];
  assert.ok(ne.buffs.some((b) => b.key.endsWith('refraction-1#1:silence')), '免疫沉默 is up');
  assert.ok(!ne.buffs.some((b) => b.key.startsWith('ego:hs:refraction-1#1') && b.mods), 'and no second RES buff');
  assert.equal(native.b.applyStatus(ne, 'silence', { duration: 3 }), false, 'silence is refused');
});

test('苦难: 过人的毅力 leaves 1 HP, then the enemy dies for real five seconds later', () => {
  const h = fight({ hardships: ['perseverance-2'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  h.b.dealDamage(h.unit('t_guard'), e, { amount: 10_000_000, type: 'true', canDodge: false });
  assert.equal(e.alive, true, 'not dead yet');
  assert.equal(Math.round(e.hp), 1, 'left at 1 HP');
  at(h, 5.6);
  at(h, 0.5);
  assert.equal(e.alive, false, 'and then it dies');
});

test('苦难: 过度生长 heals 20 % of max HP once, below 30 %', () => {
  const h = fight({ hardships: ['overgrowth-3'] });
  at(h, 0.3);
  const e = h.enemies()[0];
  assert.equal(Math.round(e.s.maxHp), Math.round(2_000_000 * 1.7), '血量上限 +70 %');
  h.b.dealDamage(h.unit('t_guard'), e, { amount: e.hp * 0.75, type: 'true', canDodge: false });
  const after = e.hp;
  assert.ok(after > e.s.maxHp * 0.3, `healed back above 30 % (${Math.round(after)} / ${Math.round(e.s.maxHp)})`);
  assert.ok(after <= e.s.maxHp * 0.3 + e.s.maxHp * 0.2 + 1, 'by the 20 % heal');
});

test('苦难: the prep side — 通货膨胀 marks a share of the shop slots +1 fund, deterministically', () => {
  const handler = hardshipHandler(effects(HARDSHIP['inflation-1']));
  assert.ok(handler && typeof handler.onPrice === 'function');
  const priceOf = (playerId, kind, id) => {
    const ev = { kind, id, slot: { kind, id, basePrice: 3 }, price: 3 };
    handler.onPrice({ playerId, modifyPrice: (d) => { ev.price += d; } }, ev);
    return ev.price;
  };
  // the same slot always answers the same way (a hash, never rng: priceOf runs on every read)
  for (const pid of ['p_0', 'p_1']) {
    assert.equal(priceOf(pid, 'chess', 'chess_char_1_01_a'), priceOf(pid, 'chess', 'chess_char_1_01_a'));
    assert.equal(priceOf(pid, 'item', 'item_x'), priceOf(pid, 'item', 'item_x'));
  }
  // across many slots roughly 18 % inflate — never all, never none
  let hit = 0;
  for (let i = 0; i < 400; i++) if (priceOf('p_0', 'chess', `chess_x${i}`) === 4) hit++;
  assert.ok(hit > 40 && hit < 120, `about 18 % of 400 (got ${hit})`);
  // an unknown / absent slot kind is left alone
  assert.equal(priceOf('p_0', 'bond', 'x'), 3);
  assert.equal(trinketHandler(effects(TRINKET['dust-to-dust'])), null, 'a battle-only trinket has no prep handler');
});

test('the prep side: income / shopDiscount / sellBonus / freeRefresh / bondLayers of these records', () => {
  // none of today's six trinkets touches the prep economy any more: the whole school is battle-side
  for (const r of TRINKETS) assert.equal(trinketHandler(effects(r)), null, `${r.id}: no prep handler`);
  // …but the kinds remain supported (later records): build one by hand
  const h = trinketHandler([
    { kind: 'income', params: { amount: 2 } },
    { kind: 'freeRefresh', params: { count: 1 } },
    { kind: 'shopDiscount', params: { pct: 10 } },
    { kind: 'sellBonus', params: { pct: 50 } },
    { kind: 'bondLayers', params: { bond: 'yanShip', count: 2 } },
  ]);
  const calls = [];
  const ev = { price: 50 };
  const ctx = {
    addFunds: (n) => calls.push(['funds', n]), grantFreeRefresh: (n) => calls.push(['refresh', n]),
    addLayers: (...a) => calls.push(['layers', ...a]), modifyPrice: (d) => { calls.push(['price', d]); ev.price += d; },
  };
  h.onRoundStart(ctx);
  assert.deepEqual(calls, [['funds', 2], ['refresh', 1], ['layers', 'yanShip', 2, { requireActive: false, reason: 'ego' }]]);
  h.onPrice(ctx, ev);
  assert.equal(ev.price, 45);
  const sold = { gain: 10 };
  h.onSold(ctx, sold);
  assert.equal(sold.gain, 15);
});

test('registerMeta gives every record a handler where it needs one, and every kind has a reader', () => {
  const reg = createRegistry({ log: QUIET });
  const keys = [];
  registerMeta({
    trinket: (id, h) => { keys.push(`ego:${id}`); return reg.trinket(id, h); },
    hardship: (id, h) => { keys.push(`ego:hs:${id}`); return reg.hardship(id, h); },
  });
  // only the records with a prep-side kind get a handler: of today's records that is 通货膨胀 alone
  const prep = [...TRINKETS, ...HARDSHIPS].filter((r) => trinketHandler(effects(r)) || hardshipHandler(effects(r))).map((r) => r.id);
  assert.deepEqual(keys.sort(), prep.map((id) => (HARDSHIP[id] ? `ego:hs:${id}` : `ego:${id}`)).sort(),
    'every record with a prep-side kind is offered, and nothing else');
  assert.deepEqual(prep, ['inflation-1'], 'and today that is 通货膨胀');
  assert.ok(reg.has('ego:hs:inflation-1'), '通货膨胀 registers on the hardship side');
  assert.ok(!reg.has('ego:dust-to-dust'), 'a battle-only trinket registers nothing');
  assert.deepEqual(unhandledKinds(), []);
  assert.deepEqual(EXTERNAL_KINDS, ['extraEnemies', 'fasterSpawns']);
  assert.ok(EXTERNAL_KINDS.every((k) => Object.hasOwn(EFFECT_KINDS, k)));
});

test('the plan reader: only ego refs, the scope defaults to own, and a ref without effects is skipped', () => {
  assert.equal(egoPlanOf({ key: 'choice:x', params: { effects: [{ kind: 'opMods', params: {} }] } }, 0), null);
  const p = egoPlanOf(hardshipRef('sharpness-1'), 2);
  assert.equal(p.hardship, true);
  assert.equal(p.id, 'sharpness-1');
  assert.equal(p.scope, 'own');
  assert.equal(p.pid, 2);
  assert.equal(egoPlanOf({ key: 'ego:x', params: { effects: [] } }, 0), null);
  // a ref carried by two player inputs counts once (its id is the key)
  const battle = { players: [{ playerId: 0, playerEffects: [trinketRef('dust-to-dust')] }, { playerId: 1, playerEffects: [trinketRef('dust-to-dust')] }] };
  assert.equal(egoPlans(battle).length, 1, 'the same pick id is one plan');
  // the mod converters
  assert.deepEqual(enemyModsOf({ atk: 15 }), { atkPct: 0.15 });
  assert.deepEqual(opModsOf({ atk: 10, def: 5 }), { atkPct: 0.1, defPct: 0.05 });
});
