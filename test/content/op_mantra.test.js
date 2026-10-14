// test/content/op_mantra.test.js — the operator kit of 真言 (char_4204_mantra, 6★ 本源术师; kit
// server/sim/content/kits/ops/op-mantra.js), fielded the production way: her promoted piece `chess_char_4204_mantra_a` /
// `_b` (a tier-5 PRESET 可用干员, shared/promoted.js, the owner's plan of 2026-10-13) in both forms — normal (E2 Lv1,
// skill rank 4, no module) and elite (E2 Lv60, rank 7, PRI-X “中枢神经探测模块” at stage 1, the tier-5 练度) — with her
// 盟约 萨尔贡 + 迅捷 and her 特质 (a skill-cast layer gain, `cast` in shared/promoted.js, the fork key
// `fork_gar_event_bondskill`; test/content/garrisons_battle.test.js asserts the layers). Every number is read back from
// data/backups.json (the form of that slot status); the fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_mantra.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS, PROMOTED_KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const MANTRA = 'char_4204_mantra';
/** The promoted piece (a tier-5 PRESET 可用干员: shared/promoted.js, the owner's plan of 2026-10-13). */
const PIECE = { a: `chess_${MANTRA}_a`, b: `chess_${MANTRA}_b` };
const FORMS = BACKUPS.units[MANTRA].forms;
const PRIX = 'uniequip_002_mantra';
const S1 = 'skchr_mantra_1', S2 = 'skchr_mantra_2', S3 = 'skchr_mantra_3';
/** The piece's two forms: its 自选 slot statuses at tier 5 (`tier` is kept in every call for the label). */
const formOf = (tier, elite) => FORMS[elite ? '2/60/7/1' : '2/1/4/0'];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const talentOf = (tier, elite, mod, i) => {
  const m = elite ? modOf(tier, mod) : null;
  return m?.talentChanges.find((t) => t.talentIndex === i)?.bb ?? formOf(tier, elite).talents.find((t) => t.index === i).bb;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_shooter: dummy('enemy_shooter', { atk: 1, bat: 1, range: 4 }),
  enemy_walker: enemyRec({ key: 'enemy_walker', hp: 1e9, speed: 0.3, mass: 0 }),
  enemy_immune: dummy('enemy_immune', { otherImmunities: ['palsy'] }),
};
/** The piece has no tier choice: the normal form is module-less, the elite carries its default PRI-X (`moduleId`). */
const FORMS_ALL = [[5, false, null], [5, true, PRIX]];
const FORMS_T2 = [[5, false], [5, true]];
const tag = (tier, elite) => `T${tier} ${elite ? 'elite' : 'normal'}`;
const label = ([tier, elite, mod]) => `${tag(tier, elite)} ${mod ?? 'none'}`;

/** 真言's piece as uid 1 at (row, col) facing RIGHT, plus `others`. `skill` is the loadout's skillIndex. */
function field({ tier = 5, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], seed = 5, setup, stage } = {}) {
  void tier; void mod;   // her piece has one form per (tier, module) pair: shared/promoted.js states them
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed, setup, ...(stage ? { flat: stage } : null),
    flags: { dpPerSec: 0 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'attack', 'elementBurst'], captureNoisy: true,
    units: [{ uid: 1, chessId: elite ? PIECE.b : PIECE.a, skillIndex: skill, row, col }, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const tagged = (h, u, tag, src = u) => h.hooksOf('damaged').filter((c) => (c.source === src || c.credit === src) && (c.dmg?.tags || []).includes(tag));
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
function cast(u) { u.skill.gainSp(999); assert.ok(u.skill.activate('test')); }
const palsy = (e) => e.findBuff('palsy')?.stacks ?? 0;

test('真言 as her promoted piece, both forms: her operator kit (all three skills authored), stats + PRI-X attributes, 3-1 range, ranged arts that hits air units, targetable by ground enemies, 盟约 萨尔贡 + 迅捷, her own skill-cast 特质', () => {
  assert.equal(OPERATOR_KITS[MANTRA], KITS[MANTRA]);
  assert.equal(KITS[PIECE.a], OPERATOR_KITS[MANTRA], 'the piece runs her kit (kits/index.js PROMOTED_KITS, its base id)');
  assert.equal(CHESS[PIECE.b].baseId, PIECE.a, 'the elite resolves through the base id');
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.baseId, u.skill.id, !!u.kit.generic, u.kit.skillSource], [MANTRA, PIECE.a, form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 1.6], `${label(f)}: 本源术师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-1`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['sargonShip', 'swiftShip'], [elite ? 'garrison_fork_mantra_b' : 'garrison_fork_mantra_a']], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1071, 614, 1308, 688]);
  assert.deepEqual(modOf(5, PRIX).attr, { maxHp: 90, atk: 43 });
});

test('the promotion: 真言 left the 自选 pool for a tier-5 PRESET piece (等级 5, 费用 4, 默认 S3, 默认模组 PRI-X), and a roster that picks her is refused', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(!BACKUPS.diy.ownedPool.includes(MANTRA), 'no pick any more');
  for (const t of [5, 6]) assert.ok(!diyPool(t, { data, kitted: KITTED_CHARS }).includes(MANTRA), `tier ${t}`);
  const refused = validateDiyPicks({ chess_char_5_diy1_a: { charId: MANTRA, skillIndex: 2 } }, { data, kitted: KITTED_CHARS });
  assert.equal(refused.error, 'BAD_TARGET', 'a 自选 slot may not field her');
  assert.match(refused.detail, /not a tier-5 自选 pick/);
  const a = CHESS[PIECE.a], b = CHESS[PIECE.b];
  assert.deepEqual([a.chessType, a.tier, a.price, a.bonds, a.skill.skillId, a.module.id, KITTED_CHARS.includes(MANTRA)],
    ['PRESET', 5, 4, ['sargonShip', 'swiftShip'], S3, PRIX, true], 'the piece (module in its data, its 自选 kit still registered)');
  assert.deepEqual([b.isGolden, b.module.level, b.module.active], [true, 1, true], 'the elite carries PRI-X stage 1');
});

test('S1 共鸣溃缩 (AUTO, attack SP 3, data DEFAULT): every 4th attack deals 230 % / 275 % ATK arts, then 15 % / 20 % of it as 神经 损伤, then — on a target in its 神经 burst — 150 % / 160 % ATK 元素伤害', () => {
  for (const [tier, elite] of FORMS_T2) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0 });
    assert.deepEqual([u.skill.rule, u.skill.kind, u.skill.spType, u.skill.spCost, sk.bb.atk_scale, sk.bb.ep_damage_ratio, sk.bb.element_atk_scale],
      ['DEFAULT', 'instant', 'attack', 3, elite ? 2.75 : 2.3, elite ? 0.2 : 0.15, elite ? 1.6 : 1.5], `${tag(tier, elite)}`);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(16 * 1.6 + 0.5);
    const hits = atkHits(h, u).filter((c) => c.target === e);
    const skillHits = hits.filter((c) => c.dmg.isSkill);
    assert.ok(hits.length >= 15, `${tag(tier, elite)}: ${hits.length} attacks`);
    hits.forEach((c, i) => assert.equal(c.dmg.isSkill, i % 4 === 3, `${tag(tier, elite)}: attack ${i + 1}`));
    const fills = h.hooksOf('damaged').filter((c) => c.source === u && c.type === 'element');
    for (const c of skillHits) {
      const fill = fills.find((x) => Math.abs(x.t - c.t) < 1e-9);
      if (fill) approx(fill.amount, c.amount * sk.bb.ep_damage_ratio, `${tag(tier, elite)}: 神经 = ${sk.bb.ep_damage_ratio * 100} % of the damage`);
    }
    approx(skillHits[0].amount, u.s.atk * sk.bb.atk_scale, `${tag(tier, elite)}: ${sk.bb.atk_scale * 100} % ATK`);
    assert.ok(fills.length >= 1 && fills.every((x) => x.dmg.element === 'neural'));
    // in its 神经 burst: + element_atk_scale × ATK 元素伤害 after the 神经 fill (a fresh target one point short of it)
    h.b.kill(e, null);
    const e2 = h.spawn('enemy_dummy', { pos: [10, 7] });
    e2.elem.neural = e2.gaugeMax - 1;
    const n0 = h.hooksOf('damaged').length;
    h.runUntil(() => h.hooksOf('damaged').slice(n0).some((c) => c.source === u && c.dmg?.isSkill && c.dmg?.isAttack), 8);
    h.step();
    const after = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.type === 'elemental' && (c.dmg.tags || []).includes('mantra'));
    assert.ok(h.hooksOf('elementBurst').some((c) => c.target === e2 && c.element === 'neural'), `${tag(tier, elite)}: her 神经 burst it`);
    assert.equal(after.length, 1, `${tag(tier, elite)}: the burst made by its own 神经 counts`);
    // the target is IN a burst: her elite's default PRI-X adds its ×1.1 (damage_scale, the last test)
    approx(after[0].amount, u.s.atk * sk.bb.element_atk_scale * (elite ? 1.1 : 1), `${tag(tier, elite)}: ${sk.bb.element_atk_scale * 100} % ATK 元素伤害`);
    done(h);
  }
});

test('S2 意识联协 (MANUAL, data DEFAULT): 25 s, attack interval 1.6 − 0.6 / 0.7 s; 170 % / 210 % ATK on the target, then 2 / 3 jumps at 3.2 tiles/s to the nearest new enemy within 2.0 tiles for 100 % / 110 %; 神经 riders on every hit', () => {
  for (const [tier, elite] of FORMS_T2) {
    const sk = skillOf(tier, elite, S2);
    const b = sk.bb;
    const { h, u } = field({ tier, elite, skill: 1 });
    assert.deepEqual([u.skill.rule, sk.duration, b.base_attack_time, b['attack@atk_scale'], b['attack@chain.atk_scale'], b.chain_times, b['attack@ep_damage_ratio'], b['attack@element_atk_scale']],
      ['DEFAULT', 25, elite ? -0.7 : -0.6, elite ? 2.1 : 1.7, elite ? 1.1 : 1, elite ? 3 : 2, elite ? 0.15 : 0.13, elite ? 0.2 : 0.18], `${tag(tier, elite)}`);
    // a line of enemies 1.5 tiles apart (the 4th is 2.1 from the 3rd: out of the jump radius at tier 6)
    const main = h.spawn('enemy_dummy', { pos: [10, 7] });
    const j1 = h.spawn('enemy_dummy', { pos: [10, 8.5] });
    const j2 = h.spawn('enemy_fly', { pos: [10, 10] });
    const j3 = h.spawn('enemy_dummy', { pos: [11.5, 10] });
    const out = h.spawn('enemy_dummy', { pos: [11.5, 12.1] });
    cast(u);
    approx(u.s.interval, 1.6 + b.base_attack_time, `${tag(tier, elite)}: interval`);
    const a0 = h.hooksOf('attack').filter((c) => c.attacker === u).length;
    h.runUntil(() => h.hooksOf('attack').filter((c) => c.attacker === u).length > a0, 2);
    const at = h.hooksOf('attack').filter((c) => c.attacker === u).slice(-1)[0];
    assert.equal(at.targets[0], main, `${tag(tier, elite)}: the first target`);
    h.run(3);
    const id = atkHits(h, u).find((c) => c.target === main && c.t >= at.t).dmg.attackId;
    const chainHits = atkHits(h, u).filter((c) => c.dmg.attackId === id);
    const order = chainHits.map((c) => c.target);
    assert.deepEqual(order, [main, j1, j2, j3].slice(0, 1 + b.chain_times), `${tag(tier, elite)}: the nearest new enemy each time`);
    assert.ok(!order.includes(out), `${tag(tier, elite)}: 2.1 tiles: out of reach`);
    approx(chainHits[0].amount, u.s.atk * b['attack@atk_scale'], `${tag(tier, elite)}: main`);
    for (const c of chainHits.slice(1)) {
      approx(c.amount, u.s.atk * b['attack@chain.atk_scale'], `${tag(tier, elite)}: jump`);
      assert.ok(c.dmg.tags.includes('chain') && c.dmg.isSkill);
    }
    approx(chainHits[2].t - chainHits[1].t, 1.5 / 3.2, `${tag(tier, elite)}: 3.2 tiles/s`, 0.1);
    for (const [i, c] of chainHits.entries()) {
      const fill = h.hooksOf('damaged').find((x) => x.source === u && x.type === 'element' && x.target === c.target && Math.abs(x.t - c.t) < 1e-9);
      assert.ok(fill, `${tag(tier, elite)}: a 神经 fill with hit ${i}`);
      approx(fill.amount, c.amount * b['attack@ep_damage_ratio'], `${tag(tier, elite)}: 神经 ${i}`);
    }
    h.runUntil(() => !u.skill.active, 30);
    approx(u.s.interval, 1.6, `${tag(tier, elite)}: interval back`);
    done(h);
  }
});

test('S3 无言为真 (MANUAL, data ACTIVE_RANGE on its 3-17): cast for an enemy outside her own range, 40 s, ATK +170 % / +210 %, 2 targets, the 3-17 while on; 隐匿 enemies on it are revealed', () => {
  for (const [tier, elite] of FORMS_T2) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2 });
    assert.deepEqual([u.skill.rule, sk.rangeId, sk.duration, sk.bb.atk, sk.bb['attack@max_target'], sk.bb.max_trigger_cnt, sk.bb.per_active, sk.bb.interval_projectile_trigger, sk.bb.atk_scale],
      ['ACTIVE_RANGE', '3-17', 40, elite ? 2.1 : 1.7, 2, 3, 2, 1.5, elite ? 1.45 : 1.1], `${tag(tier, elite)}`);
    u.skill.gainSp(999);
    h.run(1);
    assert.equal(u.skill.activations, 0);
    const far = h.spawn('enemy_dummy', { pos: [12, 6] });   // dRow +2: the 3-17 only
    assert.ok(h.runUntil(() => u.skill.active, 1), `${tag(tier, elite)}: cast`);
    assert.ok(!formOf(tier, elite).rangeGrid.some(([r, c]) => r === far.y - 10 && c === far.x - 5), `${tag(tier, elite)}: the enemy is not on her own 3-1`);
    assert.deepEqual(u.liveRangeGrid, sk.rangeGrid, `${tag(tier, elite)}: 3-17`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${tag(tier, elite)}: ATK`);
    const sneak = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.b.addBuff(sneak, { key: 'test:stealth', flags: { stealth: true } });
    h.step();
    assert.ok(sneak.s.flags.reveal, `${tag(tier, elite)}: revealed on her range`);
    const a0 = h.hooksOf('attack').filter((c) => c.attacker === u).length;
    h.run(4);
    const atks = h.hooksOf('attack').filter((c) => c.attacker === u).slice(a0);
    assert.ok(atks.length >= 2 && atks.every((c) => c.targets.length === 2), `${tag(tier, elite)}: 2 targets`);
    h.runUntil(() => !u.skill.active, 45);
    h.run(0.3);
    assert.ok(!sneak.s.flags.reveal, `${tag(tier, elite)}: hidden again once it ends`);
    assert.deepEqual(u.liveRangeGrid, formOf(tier, elite).rangeGrid, `${tag(tier, elite)}: back to 3-1`);
    done(h);
  }
});

test('S3 无言为真 麻痹付与 and the cap 2: 0.1 s after the cast every enemy on her range gets 2 麻痹; another operator on her range starting a skill grants again (3 times per cast, a grant kept while nobody is there); stacks over 2 become 溢出麻痹 — each an 元素伤害 bounce of 110 % / 145 % ATK on the holder and the nearest other enemy within 2.0 tiles, one at once and one per 1.5 s', () => {
  for (const [tier, elite] of FORMS_T2) {
    const sk = skillOf(tier, elite, S3);
    const others = [{ uid: 2, chessId: 'chess_char_1_08_a', row: 11, col: 6 }, { uid: 3, chessId: 'chess_char_1_08_a', row: 9, col: 2 }];
    const { h, u } = field({ tier, elite, skill: 2, others });
    const inside = h.unit(2), outside = h.unit(3);
    for (const a of [inside, outside]) { a.skill.sp = 0; a.skill.charges = 0; }
    cast(u);
    h.run(0.05);
    // nobody on her range yet: the grant at 0.1 s is kept
    h.run(0.1);
    assert.equal(u.mem.mantraS3.grants, 3, `${tag(tier, elite)}: kept`);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    const near = h.spawn('enemy_dummy', { pos: [10, 8] });
    h.step();
    // an operator outside her range starting a skill: nothing
    outside.skill.gainSp(999); outside.skill.activate('test');
    h.step();
    assert.equal(palsy(e), 0, `${tag(tier, elite)}: an operator off her range`);
    // the one on her range: the first grant (2 stacks, at the cap)
    inside.skill.gainSp(999); inside.skill.activate('test');
    h.step();
    assert.deepEqual([palsy(e), palsy(near), u.mem.mantraS3.grants], [2, 2, 2], `${tag(tier, elite)}: 2 麻痹 each`);
    assert.equal(tagged(h, u, 'mantraOverflow').length, 0, `${tag(tier, elite)}: no overflow yet`);
    // the second: 2 over the cap each ⇒ 溢出麻痹 2 each, one bounce at once each
    const n0 = h.hooksOf('damaged').length;
    inside.skill.gainSp(999); inside.skill.activate('test');
    h.step();
    assert.deepEqual([palsy(e), palsy(near)], [2, 2], `${tag(tier, elite)}: capped at 2`);
    let bounces = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && (c.dmg.tags || []).includes('mantraOverflow'));
    assert.deepEqual(bounces.map((c) => c.target.id).sort(), [e.id, near.id].sort(), `${tag(tier, elite)}: each holder hit at once`);
    for (const c of bounces) {
      approx(c.amount, u.s.atk * sk.bb.atk_scale, `${tag(tier, elite)}: ${sk.bb.atk_scale * 100} % ATK`);
      assert.deepEqual([c.type, c.dmg.element], ['elemental', 'neural']);
    }
    h.run(0.5);   // the jumps land (1 tile at 3.2 tiles/s)
    bounces = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && (c.dmg.tags || []).includes('mantraOverflow'));
    assert.equal(bounces.length, 4, `${tag(tier, elite)}: holder + the nearest other, twice`);
    h.run(1.1);   // 1.5 s after: the second 溢出麻痹 of each
    bounces = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && (c.dmg.tags || []).includes('mantraOverflow'));
    assert.ok(bounces.length >= 6, `${tag(tier, elite)}: the next one 1.5 s later (${bounces.length})`);
    // the third grant, then no more
    inside.skill.gainSp(999); inside.skill.activate('test');
    h.step();
    assert.equal(u.mem.mantraS3.grants, 0, `${tag(tier, elite)}: 3 grants used`);
    const g = h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'palsy').length;
    inside.skill.gainSp(999); inside.skill.activate('test');
    h.step();
    assert.equal(h.hooksOf('statusApplied').filter((c) => c.source === u && c.status === 'palsy').length, g, `${tag(tier, elite)}: no 4th grant`);
    done(h);
  }
});

test('S3 无言为真: an enemy holding 3 麻痹 entering her range keeps 2 and bounces the third; 溢出麻痹 left when it leaves the range or the skill ends all bounce at once; a 麻痹免疫 enemy counts the stacks she gives it', () => {
  const { h, u } = field({ tier: 5, elite: true, skill: 2 });
  cast(u);
  h.run(0.2);   // the grant of 0.1 s finds nobody (kept, never fired again here)
  const e = h.spawn('enemy_dummy', { pos: [10, 12] });   // off her range
  h.b.applyStatus(e, 'palsy', { value: 3 });
  h.step();
  assert.equal(palsy(e), 3, 'off her range: cap 3');
  e.x = 7; h.step();
  assert.equal(palsy(e), 2, 'on her range: 2');
  assert.equal(tagged(h, u, 'mantraOverflow').filter((c) => c.target === e).length, 1, 'the third bounced');
  // a neural burst's 3 麻痹 on a holder at the cap: 3 溢出麻痹 — one at once, two left; it leaves ⇒ both at once
  const n0 = tagged(h, u, 'mantraOverflow').length;
  h.b.applyStatus(e, 'palsy', { value: 3 });
  assert.equal(tagged(h, u, 'mantraOverflow').length - n0, 1, 'one at once');
  e.x = 13; h.step();
  assert.equal(tagged(h, u, 'mantraOverflow').length - n0, 3, 'the two left at once when it leaves');
  assert.equal(palsy(e), 2, 'its stacks stay (cap 3 again)');
  // the skill ends with 溢出麻痹 held: all of it bounces
  const f = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.step();
  h.b.applyStatus(f, 'palsy', { value: 3 });
  h.b.applyStatus(f, 'palsy', { value: 3 });
  const n1 = tagged(h, u, 'mantraOverflow').filter((c) => c.target === f).length;
  u.skill.end('test');
  assert.equal(tagged(h, u, 'mantraOverflow').filter((c) => c.target === f).length - n1, 2, 'the rest at the end');
  // 麻痹免疫: her grants count (ineffective stacks), so the second grant overflows
  const { h: h2, u: u2 } = field({ tier: 5, elite: true, skill: 2, others: [{ uid: 2, chessId: 'chess_char_1_08_a', row: 11, col: 6 }] });
  const imm = h2.spawn('enemy_immune', { pos: [10, 7] });
  cast(u2);
  h2.run(0.2);
  assert.equal(palsy(imm), 0, 'no 麻痹 buff (immune)');
  assert.equal(imm.mem.mantraPalsy, 2, 'counted');
  const ally = h2.unit(2);
  ally.skill.gainSp(999); ally.skill.activate('test');
  h2.step();
  assert.equal(tagged(h2, u2, 'mantraOverflow').filter((c) => c.target === imm).length, 1, 'its 溢出麻痹 bounces');
  done(h);
  done(h2);
});

test('T1 噤声限域: an enemy whose attack a 麻痹 stack interrupts takes 145 % of her ATK as 元素伤害 (tagged 持续伤害); 13 % of the interrupts keep the stack; not for an enemy she cannot select (隐匿)', () => {
  for (const f of [[5, false, null], [5, true, PRIX]]) {
    const [tier, elite, mod] = f;
    const t = talentOf(tier, elite, mod, 0);
    assert.deepEqual(t, { atk_scale: 1.45, prob: 0.13 }, label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 13 });
    const e = h.spawn('enemy_shooter', { pos: [10, 8] });
    h.b.applyStatus(u, 'disarm', { duration: 999, source: null });   // her attacks would kill nothing, but keep it clean
    h.run(0.6);   // the aura's 0.5 s check has marked it
    let interrupts = 0, kept = 0;
    h.b.on('palsyTrigger', (c) => { if (c.enemy === e) { interrupts++; } });
    for (let i = 0; i < 400; i++) {
      h.b.applyStatus(e, 'palsy', { value: 1 });
      const before = interrupts;
      h.runUntil(() => interrupts > before, 3);
      h.step();
      if (palsy(e) > 0) { kept++; h.b.removeBuff(e, 'palsy'); }
    }
    const hush = tagged(h, u, 'mantraHush');
    assert.equal(hush.length, interrupts, `${label(f)}: one hit per interrupt`);
    for (const c of hush.slice(0, 5)) {
      approx(c.amount, u.s.atk * t.atk_scale, `${label(f)}: ${t.atk_scale * 100} % ATK`);
      assert.deepEqual([c.type, c.dmg.element, c.dmg.tags.includes('dot')], ['elemental', 'neural', true]);
    }
    assert.ok(Math.abs(kept / interrupts - t.prob) < 0.05, `${label(f)}: kept ${kept} / ${interrupts} ≈ ${t.prob}`);
    done(h);
  }
  // 隐匿: no mark, no hit; during S3 the check ignores 隐匿
  const { h, u } = field({ tier: 5, elite: true, skill: 2, seed: 1 });
  const e = h.spawn('enemy_shooter', { pos: [10, 2] });   // behind her: it shoots her, she cannot see it (and S3 does not reveal it)
  h.b.addBuff(e, { key: 'test:stealth', flags: { stealth: true } });
  let interrupts = 0;
  h.b.on('palsyTrigger', (c) => { if (c.enemy === e) interrupts++; });
  h.run(0.6);
  h.b.applyStatus(e, 'palsy', { value: 2 });
  h.run(2.2);
  assert.equal(interrupts, 2, 'its attacks were interrupted');
  assert.equal(tagged(h, u, 'mantraHush').length, 0, 'a 隐匿 enemy: no effect');
  cast(u);
  h.run(0.6);
  assert.ok(!e.s.flags.reveal, 'not revealed (off her range)');
  h.b.applyStatus(e, 'palsy', { value: 2 });
  h.run(2.2);
  assert.equal(tagged(h, u, 'mantraHush').length, 2, 'S3: the check ignores 隐匿');
  done(h);
});

test('T2 全局洞悉: the 侵入点 nearest to her (Manhattan) — every enemy that comes out of it gets 1 麻痹 0.1 s later (隐匿 too); the other gate\'s do not', () => {
  for (const [row, gate, other] of [[10, 0, 1], [11, 1, 0]]) {   // flat stage gates: route 0 starts at (9,10), route 1 at (12,10)
    const { h, u } = field({ tier: 5, skill: 0, row, seed: 2 });
    assert.deepEqual(u.mem.mantraGate, gate === 0 ? [9, 10] : [12, 10], `row ${row}: the nearest gate`);
    const a = h.spawn('enemy_walker', { routeIndex: gate });
    const b = h.spawn('enemy_walker', { routeIndex: other });
    h.b.addBuff(a, { key: 'test:stealth', flags: { stealth: true } });
    h.step();
    assert.equal(palsy(a), 0, 'not at once');
    h.run(0.1);
    assert.deepEqual([palsy(a), palsy(b)], [1, 0], `row ${row}`);
    done(h);
  }
  // a tie (two gates at the same distance) is drawn at random
  const picks = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const { h, u } = field({ tier: 5, skill: 0, row: 10, col: 10, seed, stage: { rows: { 11: '##hrrrrrrrSrrrrrrrf##' } } });
    picks.add(String(u.mem.mantraGate));
    done(h);
  }
  assert.deepEqual([...picks].sort(), ['11,10', '9,10'], 'both gates one tile away get drawn');
});

test('PRI-X “中枢神经探测模块” (stage 1, the piece\'s elite form): damage to an enemy in an element burst ×1.1; none without it', () => {
  for (const f of [[5, true, PRIX], [5, false, null]]) {
    const [tier, elite, mod] = f;
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 8 });
    const plain = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.run(1.7);
    const n0 = atkHits(h, u).length;
    h.b.addBuff(plain, { key: 'burnBurst', duration: 99, flags: { burstLock: true } });
    h.run(1.7);
    const a = atkHits(h, u)[0].amount, b = atkHits(h, u).slice(n0)[0].amount;
    approx(b / a, elite && mod === PRIX ? 1.1 : 1, label(f));
    if (elite && mod === PRIX) assert.equal(modOf(tier, PRIX).traitOverride.bb.damage_scale, 1.1);
    done(h);
  }
});
