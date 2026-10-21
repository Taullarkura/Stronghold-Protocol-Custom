// server/sim/content/ego.js — FORK: E.G.O 饰品 (trinkets) and 苦难 (hardships) inside a battle.
//
// A pick writes one EffectRef per item into the picking player's `ps.effects` (server/match/match/egoPick.js), and
// `ps.battleInput()` copies it into `playerEffects` (player/round.js), exactly like a 机变 card (content/choices.js):
//
//   trinket  { id: 'ego:<trinketId>#<n>',    key: 'ego:<trinketId>',    params: { effects: [...] } }
//   hardship { id: 'ego:hs:<hardshipId>#<n>', key: 'ego:hs:<hardshipId>', params: { effects: [...], scope } }
//
// `params.effects` is the record's own `effects` array, already scaled by the match side (the boss rounds 14 / 15 apply
// every player's hardship at 1/3, floored — shared/ego.js EGO_BOSS_DIVISOR). Keeping the resolved values in the ref means
// this module never has to know which round it is: `install()` just reads what it is given.
//
// Split by target (shared/ego.js EFFECT_KINDS):
//   own   — battle side: opMods / healOnKill / the 烧伤 school (burnOnSpawn, burnSpan, burnAmp, burnHaste, burnChance,
//                        burnVuln, burnEndBurst, burnDetonate, burnPulse)
//           prep side:  income / shopDiscount / sellBonus / freeRefresh / bondLayers
//   enemy — battle side: enemyMods / enemyShield / enemyRegen / enemyDodge / enemyRefraction / enemyTrueDrain /
//                        enemyUndying / enemyLastStandHeal
//           prep side:  shopInflation
//           before the battle (the spawn list): extraEnemies / fasterSpawns — server/match/match/combat.js
//
// Two rules decide the shape of this file:
//   * 烧伤 is ONE status whose layer count is its clock (shared/ego.js BURN): a layer buys BURN.perStack seconds and is
//     then spent, the damage per second is a flat amount that the layer count never multiplies.
//   * Enemy stat bonuses share ONE additive bucket (「苦难对于敌方属性的加成共用一个乘区」): every `enemyMods` of one player
//     is folded into a single buff, so 锐利 I + 锐利 II is +45 % 攻击力 and never 1.15 × 1.30.

import { BURN, EFFECT_KINDS } from '../../../shared/ego.js';
import { directMods, gameData, passiveBuff } from './support/index.js';

const isOwnOp = (u, pid) => !!u && u.kind === 'op' && u.side === 'ally' && u.ownerId === pid;
const isAllyOp = (u) => !!u && u.kind === 'op' && u.side === 'ally';
const isFoe = (u) => !!u && u.side === 'enemy';
const pct = (v) => (Number.isFinite(+v) ? +v / 100 : 0);

/** Own-side operator bonus of an `opMods` effect → an addBuff mods object. */
export function opModsOf(p = {}) {
  // directMods speaks ratios (0.1 = +10 %), not percentage points — the E.G.O params are written in percent
  const mods = directMods({ atk: pct(p.atk), def: pct(p.def), hp: pct(p.hp) });
  if (Number.isFinite(+p.aspd) && +p.aspd) mods.aspd = +p.aspd;
  if (Number.isFinite(+p.res) && +p.res) mods.resFlat = +p.res;
  if (Number.isFinite(+p.dmgDealt) && +p.dmgDealt) mods.dmgDealtMul = 1 + pct(p.dmgDealt);
  if (Number.isFinite(+p.dmgTaken) && +p.dmgTaken) mods.dmgTakenMul = 1 - pct(p.dmgTaken);
  return mods;
}

/**
 * Enemy-side bonus of `enemyMods` effects → an addBuff mods object.
 * The percentages arrive already summed by the caller (foldEnemyMods), so every stat is added once here: 攻击力 / 防御力 /
 * 生命上限 ride the additive `*Pct` keys, 攻速 / 法抗 are additive mods of their own, and the multiplicative-looking keys
 * (造成伤害 / 受到伤害 / 移动速度) are rebuilt from the summed percentage — 顽强 I + 顽强 II = 造成伤害 +55 %, not 1.20 × 1.35.
 * @param {{atk:number,def:number,hp:number,aspd:number,res:number,moveSpeed:number,dmgDealt:number,physTaken:number,artsTaken:number}} p
 */
export function enemyModsOf(p = {}) {
  const mods = {};
  if (p.atk) mods.atkPct = pct(p.atk);
  if (p.def) mods.defPct = pct(p.def);
  // 生命上限: units.js _recalc scales the current HP with the new maximum, so a freshly spawned full-HP enemy stays full
  if (p.hp) mods.hpPct = pct(p.hp);
  if (p.aspd) mods.aspd = p.aspd;
  if (p.res) mods.resFlat = p.res;
  if (p.moveSpeed) mods.moveMul = 1 + pct(p.moveSpeed);
  if (p.dmgDealt) mods.dmgDealtMul = 1 + pct(p.dmgDealt);
  if (p.physTaken) mods.physTakenMul = Math.max(0, 1 - pct(p.physTaken));
  if (p.artsTaken) mods.artsTakenMul = Math.max(0, 1 - pct(p.artsTaken));
  return mods;
}

/**
 * Read one EffectRef into a plan: which side it belongs to and its effects.
 * `scope` decides which enemies a hardship reaches (see installEnemy).
 * @returns {{pid:number, key:string, hardship:boolean, id:string, effects:object[], scope:string} | null}
 */
export function egoPlanOf(ref, pid) {
  const key = ref && typeof ref.key === 'string' ? ref.key : '';
  if (!key.startsWith('ego:')) return null;
  const hardship = key.startsWith('ego:hs:');
  const id = hardship ? key.slice('ego:hs:'.length) : key.slice('ego:'.length);
  const params = (ref && ref.params) || {};
  const effects = Array.isArray(params.effects) ? params.effects : [];
  if (!effects.length) return null;
  const scope = typeof params.scope === 'string' ? params.scope : 'own';
  // one buff key per pick: a second pick of the same trinket is a separate ref with its own id
  return { pid, key: ref.id || key, hardship, id, effects, scope };
}

/** Everything a battle needs from every player's picks (a ref that several inputs carry counts once). */
export function egoPlans(battle) {
  const plans = [];
  const seen = new Set();
  for (const ps of battle.players || []) {
    for (const ref of ps.playerEffects || []) {
      if (ref && ref.id && seen.has(ref.id)) continue;
      const plan = egoPlanOf(ref, ps.playerId);
      if (!plan) continue;
      if (ref && ref.id) seen.add(ref.id);
      plans.push(plan);
    }
  }
  return plans;
}

/** Σ of one numeric param over every effect of `kind` (0 when absent). */
export function sumParam(effects, kind, name) {
  let total = 0;
  for (const e of effects || []) {
    if (!e || e.kind !== kind) continue;
    const v = e.params && e.params[name];
    if (Number.isFinite(+v) && +v) total += +v;
  }
  return total;
}

/** Every `{kind: params}` of a plan, filtered by kind. */
const paramsOf = (plan, kind) => (plan.effects || []).filter((e) => e && e.kind === kind).map((e) => e.params || {});

/** The player's 已激活盟约总层数 (total layers of every active bond) — 炎鳞's two money formulas read it. */
function activeBondLayers(battle, pid) {
  const ps = (battle.players || []).find((p) => p.playerId === pid);
  if (!ps || !ps.bonds) return 0;
  let total = 0;
  for (const b of Object.values(ps.bonds)) if (b && b.active && Number.isFinite(+b.layers)) total += Math.max(0, Math.trunc(+b.layers));
  return total;
}

// =====================================================================================================
// 烧伤 (BURN): one status, the layer count is the clock

/**
 * Battle-wide 烧伤 bookkeeping, built once from the plans and shared by every burn it applies:
 * - `span[pid]`      — extra seconds per layer (burnSpan: flat + per active 盟约, capped), keyed by the applying player;
 * - `amp[pid]`       — damage multiplier of the burn (burnAmp: 「烧伤造成的伤害与灼燃损伤 +50%」);
 * - `vuln[pid]`      — extra damage a burning enemy takes per layer (burnVuln: 层数 × perStack %);
 * - `detonate[pid]`  — burnDetonate: when an application would leave more than `threshold` layers, eat `consume` and hit;
 * - `endBurst[pid]`  — burnEndBurst: the parting hit of the layers the CLOCK consumed (元素伤害 while the target is in
 *                      its 灼燃 损伤爆发, 法术伤害 otherwise — see burstDamage).
 * A trinket belongs to the player who picked it, and its trinket-side effects reach that player's own half of the field
 * (the same `scope` rule as a hardship: 'own' = `e.ownerId`, 'all' = every enemy — boss rounds).
 */
function burnRules(battle, own) {
  const rules = { span: new Map(), amp: new Map(), vuln: new Map(), detonate: new Map(), endBurst: new Map(), chance: new Map(), haste: new Map() };
  const add = (map, pid, v) => { if (v) map.set(pid, (map.get(pid) ?? 0) + v); };
  const push = (map, pid, v) => { const l = map.get(pid); if (l) l.push(v); else map.set(pid, [v]); };
  for (const p of own) {
    for (const s of paramsOf(p, 'burnSpan')) {
      const flat = Number.isFinite(+s.seconds) ? Math.max(0, +s.seconds) : 0;
      const per = Number.isFinite(+s.perActiveBond) ? Math.max(0, +s.perActiveBond) : 0;
      const cap = Number.isFinite(+s.max) ? Math.max(0, +s.max) : 0;
      const bonus = per > 0 ? Math.min(cap, per * activeBondLayers(battle, p.pid)) : 0;
      if (flat + bonus > 0) add(rules.span, p.pid, flat + bonus);
    }
    for (const a of paramsOf(p, 'burnAmp')) add(rules.amp, p.pid, Number.isFinite(+a.pct) ? +a.pct : 0);
    for (const v of paramsOf(p, 'burnVuln')) add(rules.vuln, p.pid, Number.isFinite(+v.perStack) ? +v.perStack : 0);
    for (const d of paramsOf(p, 'burnDetonate')) {
      const threshold = Number.isFinite(+d.threshold) && +d.threshold > 0 ? Math.trunc(+d.threshold) : 10;
      const consume = Number.isFinite(+d.consume) && +d.consume > 0 ? Math.trunc(+d.consume) : 10;
      const perLayer = Number.isFinite(+d.perLayer) ? +d.perLayer : 0;
      push(rules.detonate, p.pid, { threshold, consume, perLayer });
    }
    for (const b of paramsOf(p, 'burnEndBurst')) {
      const perLayer = Number.isFinite(+b.perLayer) ? +b.perLayer : 0;
      const floor = Number.isFinite(+b.floor) ? +b.floor : 0;
      if (perLayer > 0 || floor > 0) push(rules.endBurst, p.pid, { perLayer, floor });
    }
    for (const c of paramsOf(p, 'burnChance')) {
      push(rules.chance, p.pid, {
        pct: Number.isFinite(+c.pct) ? Math.max(0, +c.pct) : 0,
        burningPct: Number.isFinite(+c.burningPct) ? Math.max(0, +c.burningPct) : 0,
      });
    }
    for (const h of paramsOf(p, 'burnHaste')) {
      const aspd = Number.isFinite(+h.aspd) ? +h.aspd : 0;
      if (!aspd) continue;
      push(rules.haste, p.pid, {
        aspd,
        duration: Number.isFinite(+h.duration) && +h.duration > 0 ? +h.duration : 10,
        maxStacks: Number.isFinite(+h.maxStacks) && +h.maxStacks > 0 ? Math.trunc(+h.maxStacks) : 1,
      });
    }
  }
  return rules;
}

/** An enemy of `pid`'s half (a one-player battle owns every spawn) — the scope rule every pick-side effect obeys. */
function hitsEnemy(battle, e, pid, scope) {
  if (scope === 'all') return true;
  if (pid == null) return false;
  return e && e.ownerId === pid;
}

/** The burn status on `unit`, or null. */
const burnOf = (unit) => (unit && unit.buffs ? unit.buffs.find((b) => b.key === BURN.key) || null : null);

/**
 * 炎鳞's burst damage type: a target in its 灼燃 损伤爆发 (`burnBurst`, the engine's burst lock) takes 元素伤害 instead of
 * 法术伤害 (owner's design, 2026-10-21). 元素伤害 is the DamageInfo type 'elemental' — 元素抗性 instead of DEF/RES.
 */
function burstDamage(unit) {
  const bursting = unit && typeof unit.findBuff === 'function' && !!unit.findBuff('burnBurst');
  return bursting ? { type: 'elemental', element: 'burn' } : { type: 'arts' };
}

/**
 * The burn burned out: pay 炎鳞's parting 法术伤害 — (盟约总层数 × 层数 × perLayer), at least `floor`, over the layers the
 * CLOCK spent — and drop the status. Called from onTick (the last layer just went) and from onExpire (a battle teardown),
 * and guarded by `data.paid` so the two can never both pay.
 */
function endBurn(battle, unit, buff) {
  if (!buff || buff.data.paid) return;
  buff.data.paid = true;
  const rule = buff.data.endBurst;
  try {
    if (rule && rule.length && unit && unit.alive && buff.data.consumed > 0) {
      const layers = activeBondLayers(battle, buff.data.pid);
      let amount = 0;
      for (const r of rule) amount += Math.max(r.floor, layers * buff.data.consumed * r.perLayer);
      if (amount > 0) battle.dealDamage(buff.data.source || null, unit, { amount, ...burstDamage(unit), canDodge: false, sourceless: !buff.data.source, tags: ['ego:burn'] });
    }
  } finally {
    if (unit && unit.buffs && unit.buffs.includes(buff)) battle.removeBuff(unit, buff);
  }
}

/**
 * Apply `stacks` layers of 烧伤 to `target`.
 * One layer = BURN.perStack seconds (+ the picker's burnSpan). The status carries no duration of its own: its onTick
 * spends one layer every `perStack` seconds and removes the status when the last one is gone, so N layers last
 * N × perStack seconds no matter when they arrived. `data.consumed` counts the layers the CLOCK spent — 炎鳞's parting
 * damage reads it, and the layers 炎鳞 itself eats are deliberately not counted there (owner's decision: 「使用正常通过
 * 时间消耗的烧伤层数（不计算炎鳞消耗的）」).
 * @param {{pid?:number, source?:object, perStack?:number, amp?:number, detonate?:object[], endBurst?:object[]}} opts
 */
export function applyBurn(battle, target, stacks, opts = {}) {
  if (!target || !target.alive || target.removed || !isFoe(target)) return null;
  const n = Math.max(1, Math.trunc(Number(stacks) || 0));
  const perStack = opts.perStack > 0 ? opts.perStack : BURN.perStack;
  const amp = opts.amp > 0 ? opts.amp : 1;
  const existing = burnOf(target);
  if (existing) {
    existing.stacks = Math.min(existing.maxStacks, existing.stacks + n);
    target.markDirty();
  } else {
    battle.addBuff(target, {
      key: BURN.key,
      source: opts.source || null,
      duration: Infinity,
      stacks: n,
      maxStacks: BURN.maxStacks,
      refresh: 'replace',
      interval: 1,
      visible: true,
      tags: ['ego:burn'],
      data: {
        perStack,
        amp,
        acc: 0,
        consumed: 0,
        pid: opts.pid ?? null,
        source: opts.source || null,
        amp0: amp,
      },
      onTick: ({ battle: b, unit, buff }) => {
        if (!unit || !unit.alive || unit.removed || !unit.deployed) return;
        const src = buff.data.source && buff.data.source.alive ? buff.data.source : null;
        // the flat hit: BURN.dmg 法术伤害 + BURN.chip 灼燃损伤 every second, never multiplied by the layer count
        const dmg = BURN.dmg * buff.data.amp;
        const chip = BURN.chip * buff.data.amp;
        if (dmg > 0) b.dealDamage(src, unit, { amount: dmg, type: 'arts', canDodge: false, sourceless: !src, tags: ['ego:burn'] });
        if (chip > 0) b.dealDamage(src, unit, { type: 'element', element: 'burn', amount: chip, canDodge: false, sourceless: !src, tags: ['ego:burn'] });
        if (!unit.alive) return;
        // the clock: one layer per perStack seconds, the last one ends the status
        buff.data.acc += 1;
        while (buff.data.acc >= buff.data.perStack - 1e-9 && buff.stacks > 0) {
          buff.data.acc -= buff.data.perStack;
          buff.stacks -= 1;
          buff.data.consumed += 1;
        }
        if (buff.stacks <= 0) { endBurn(b, unit, buff); return; }
        unit.markDirty();
      },
      onExpire: ({ battle: b, unit, buff }) => endBurn(b, unit, buff),
    });
  }
  const buff = burnOf(target);
  if (buff) {
    buff.data.perStack = perStack;
    buff.data.amp = amp;
    if (!buff.data.detonate) buff.data.detonate = opts.detonate || [];
    if (!buff.data.endBurst) buff.data.endBurst = opts.endBurst || [];
    if (buff.data.pid == null) buff.data.pid = opts.pid ?? null;
    if (!buff.data.source) buff.data.source = opts.source || null;
    // 炎鳞: 「被施加烧伤时若层数高于 40 层，消耗 10 层并立刻受到（盟约总层数 × 100）点法术伤害」
    for (const r of buff.data.detonate || []) {
      if (buff.stacks <= r.threshold) continue;
      buff.stacks -= r.consume;
      const amount = activeBondLayers(battle, buff.data.pid) * r.perLayer;
      if (amount > 0) battle.dealDamage(buff.data.source || null, target, { amount, ...burstDamage(target), canDodge: false, sourceless: !buff.data.source, tags: ['ego:burn'] });
    }
    if (buff.stacks <= 0) battle.removeBuff(target, buff);
  }
  return buff;
}

export function install(battle) {
  const plans = egoPlans(battle);
  if (!plans.length) return;
  const own = plans.filter((p) => !p.hardship);
  installOwn(battle, own);
  installEnemy(battle, plans.filter((p) => p.hardship));
}

/** Own side: operator mods, heal on kill, and the 烧伤 school. */
function installOwn(battle, own) {
  if (!own.length) return;
  const opBuffs = [];            // { pid, key, mods }
  const healOnKill = new Map();  // pid → HP per kill
  for (const p of own) {
    for (const e of p.effects) {
      const params = (e && e.params) || {};
      switch (e && e.kind) {
        case 'opMods': {
          const mods = opModsOf(params);
          if (Object.keys(mods).length) opBuffs.push({ pid: p.pid, key: p.key, mods });
          break;
        }
        case 'healOnKill': {
          const n = Number.isFinite(+params.amount) ? Math.max(0, +params.amount) : 0;
          if (n > 0) healOnKill.set(p.pid, (healOnKill.get(p.pid) ?? 0) + n);
          break;
        }
        default: break;
      }
    }
  }

  if (opBuffs.length) {
    battle.on('battleStart', () => {
      for (const b of opBuffs) for (const u of battle.allyUnits) if (isOwnOp(u, b.pid)) passiveBuff(battle, u, b.key, { ...b.mods });
    }, { priority: -10 });
  }

  if (healOnKill.size) {
    battle.on('kill', (ctx) => {
      const killer = ctx && ctx.killer;
      if (!isAllyOp(killer)) return;
      const amount = healOnKill.get(killer.ownerId);
      if (!(amount > 0) || !killer.alive || killer.hp <= 0 || killer.s.flags.noHeal) return;
      battle.heal(null, killer, amount, { self: true });
    });
  }

  installBurn(battle, own);
}

/**
 * The 烧伤 school of the owner's 2026-10-20 design:
 *   尘归尘 / 土归土 / 镇魂  — burnOnSpawn: every enemy of the picker's half walks in burning;
 *   郁火                   — burnHaste: an own operator that damages a burning enemy gains 攻速 (独立计时, at most N);
 *   炽热的羽毛             — burnChance: a chance to add a layer on damage, higher against an already burning target;
 *   地狱蝶之梦             — burnPulse: a timed pulse that burns `targets` random enemies, more of them per 盟约 层;
 *   炎鳞                   — burnVuln (a burning enemy takes more damage) + burnDetonate + burnEndBurst;
 *   镇魂                   — burnAmp (both the 法术伤害 and the 灼燃损伤);
 *   土归土                 — burnSpan (extra seconds per layer, per active 盟约).
 * Where a burn effect applies to an enemy it obeys the same `scope` rule as a hardship (own half, or 'all' on boss rounds).
 */
function installBurn(battle, own) {
  const rules = burnRules(battle, own);
  const spawners = [];   // { pid, stacks, scope, key }
  const pulses = [];     // { pid, scope, seconds, stacks, targets, per }
  for (const p of own) {
    for (const s of paramsOf(p, 'burnOnSpawn')) {
      const stacks = Number.isFinite(+s.stacks) ? Math.max(0, Math.trunc(+s.stacks)) : 0;
      if (stacks > 0) spawners.push({ pid: p.pid, stacks, scope: p.scope, key: p.key });
    }
    for (const q of paramsOf(p, 'burnPulse')) {
      const seconds = Number.isFinite(+q.seconds) && +q.seconds > 0 ? +q.seconds : 3;
      const stacks = Number.isFinite(+q.stacks) && +q.stacks > 0 ? Math.trunc(+q.stacks) : 1;
      const targets = Number.isFinite(+q.targets) && +q.targets > 0 ? Math.trunc(+q.targets) : 1;
      const per = Number.isFinite(+q.perBondLayers) && +q.perBondLayers > 0 ? Math.trunc(+q.perBondLayers) : 0;
      pulses.push({ pid: p.pid, scope: p.scope, seconds, stacks, targets, per });
    }
  }
  const active = rules.span.size || rules.amp.size || rules.vuln.size || spawners.length || pulses.length
    || rules.detonate.size || rules.endBurst.size || rules.chance.size || rules.haste.size;
  if (!active) return;

  /** The burn of `pid`'s picks on `target`, as the shared applyBurn wants it. */
  const burnOn = (target, pid, stacks, source) => applyBurn(battle, target, stacks, {
    pid,
    source,
    perStack: BURN.perStack + (rules.span.get(pid) ?? 0),
    amp: 1 + (rules.amp.get(pid) ?? 0) / 100,
    detonate: rules.detonate.get(pid) || [],
    endBurst: rules.endBurst.get(pid) || [],
  });

  if (spawners.length) {
    battle.on('enemySpawn', (ctx) => {
      const e = ctx && ctx.enemy;
      if (!e || !e.alive) return;
      for (const s of spawners) if (hitsEnemy(battle, e, s.pid, s.scope)) burnOn(e, s.pid, s.stacks, null);
    });
  }

  // 地狱蝶之梦: a pulse every `seconds` seconds — `targets` random enemies of the picker's half walk away burning, plus one
  // more target for every `per` layers among that player's active 盟约 (no cap in the design). The draw reads the battle
  // rng, so it is deterministic for a given seed, and it removes each pick from the pool, so one pulse never repeats one.
  for (const q of pulses) {
    battle.every(q.seconds, () => {
      const extra = q.per > 0 ? Math.floor(activeBondLayers(battle, q.pid) / q.per) : 0;
      const pool = battle.units.filter((u) => u && u.side === 'enemy' && u.alive && !u.removed && u.deployed
        && hitsEnemy(battle, u, q.pid, q.scope));
      const want = q.targets + extra;
      for (let i = 0; i < want && pool.length; i++) {
        const k = Math.min(pool.length - 1, Math.floor(battle.rng() * pool.length));
        const [target] = pool.splice(k, 1);
        burnOn(target, q.pid, q.stacks, null);
      }
    });
  }

  // 炎鳞: a burning enemy takes more damage — 层数 × burnVuln % — before the shields and the HP loss (damage.js hit hook)
  if (rules.vuln.size) {
    battle.on('hit', (ctx) => {
      const dmg = ctx && ctx.dmg;
      const target = ctx && ctx.target;
      if (!dmg || !target || dmg.cancel || !isFoe(target)) return;
      const buff = burnOf(target);
      if (!buff) return;
      let per = 0;
      for (const [pid, v] of rules.vuln) if (hitsEnemy(battle, target, pid, 'own')) per += v;
      if (!per) return;
      dmg.mul = (Number.isFinite(dmg.mul) ? dmg.mul : 1) * (1 + (buff.stacks * per) / 100);
    });
  }

  // 炽热的羽毛 / 郁火: on damage dealt to an enemy by an own operator
  if (rules.chance.size || rules.haste.size) {
    battle.on('damaged', (ctx) => {
      const source = ctx && ctx.source;
      const target = ctx && ctx.target;
      if (!isAllyOp(source) || !isFoe(target) || !target.alive) return;
      if (ctx.type === 'element') return;   // 元素损伤 is not "造成伤害" (it only fills the gauge)
      const burning = !!burnOf(target);
      const pid = source.ownerId;
      const chances = rules.chance.get(pid);
      if (chances) {
        for (const c of chances) {
          const p = (burning ? c.burningPct : c.pct) / 100;
          if (p > 0 && battle.rng() < p) burnOn(target, pid, 1, source);
        }
      }
      if (burning) for (const h of rules.haste.get(pid) || []) {
        battle.addBuff(source, {
          key: `ego:haste:${pid}:${h.aspd}`,
          source: 'ego:burnHaste',
          duration: h.duration,
          maxStacks: h.maxStacks,
          refresh: 'independent',
          mods: { aspd: h.aspd },
          visible: true,
        });
      }
    });
  }
}

/** Fold every `enemyMods` param of one pick group into a single summed percentage object (the shared additive bucket). */
function foldEnemyMods(list) {
  const out = { atk: 0, def: 0, hp: 0, aspd: 0, res: 0, moveSpeed: 0, dmgDealt: 0, physTaken: 0, artsTaken: 0 };
  for (const p of list) {
    for (const k of Object.keys(out)) if (Number.isFinite(+p[k]) && +p[k]) out[k] += +p[k];
  }
  return out;
}

/**
 * Enemy side: stat bonuses (one additive bucket per player), shields / regen at spawn, then the status hardships.
 * Which enemies: `scope: 'own'` (the default) reaches the enemies of the picking player's half only — `e.ownerId`, or
 * every spawn in a one-player battle; `scope: 'all'` reaches every enemy of the field (the hardship of the boss rounds
 * 14 / 15: 所有玩家苦难 applies to that shared fight, already scaled to one third by the match side).
 * A max-HP bonus rides the buff (units.js _recalc scales the current HP with the new maximum), so a spawn stays at full.
 */
function installEnemy(battle, foe) {
  if (!foe.length) return;
  const modsByGroup = new Map(); // `${pid}|${scope}` → { pid, scope, keys:Set, list:[] }
  const shields = [];            // { key, pct, pid, scope }
  const regen = [];              // { key, amount, pid, scope }
  const dodges = [];             // { key, phys, arts, pid, scope }
  const refractions = [];        // { key, res, duration, pid, scope }
  const drains = [];             // { key, pct, cap, pid, scope }
  const undying = [];            // { key, seconds, pid, scope }
  const lastStand = [];          // { key, belowPct, healPct, pid, scope }
  for (const p of foe) {
    for (const e of p.effects) {
      const params = (e && e.params) || {};
      switch (e && e.kind) {
        case 'enemyMods': {
          const g = `${p.pid}|${p.scope}`;
          let group = modsByGroup.get(g);
          if (!group) { group = { pid: p.pid, scope: p.scope, keys: new Set(), list: [] }; modsByGroup.set(g, group); }
          group.keys.add(p.key);
          group.list.push(params);
          break;
        }
        case 'enemyShield':
          if (Number.isFinite(+params.pct) && +params.pct > 0) shields.push({ key: p.key, pct: +params.pct, pid: p.pid, scope: p.scope });
          break;
        case 'enemyRegen':
          if (Number.isFinite(+params.amount) && +params.amount > 0) regen.push({ key: p.key, amount: +params.amount, pid: p.pid, scope: p.scope });
          break;
        case 'enemyDodge':
          if (+params.phys > 0 || +params.arts > 0) dodges.push({ key: p.key, phys: +params.phys || 0, arts: +params.arts || 0, pid: p.pid, scope: p.scope });
          break;
        case 'enemyRefraction':
          refractions.push({ key: p.key, res: Number.isFinite(+params.res) ? +params.res : 70, duration: Number.isFinite(+params.duration) ? +params.duration : 0, pid: p.pid, scope: p.scope });
          break;
        case 'enemyTrueDrain':
          if (Number.isFinite(+params.pct) && +params.pct > 0) drains.push({ key: p.key, pct: +params.pct, cap: Number.isFinite(+params.cap) ? +params.cap : 0, pid: p.pid, scope: p.scope });
          break;
        case 'enemyUndying':
          undying.push({ key: p.key, seconds: Number.isFinite(+params.seconds) && +params.seconds > 0 ? +params.seconds : 5, pid: p.pid, scope: p.scope });
          break;
        case 'enemyLastStandHeal':
          if (+params.belowPct > 0 && +params.healPct > 0) lastStand.push({ key: p.key, belowPct: +params.belowPct, healPct: +params.healPct, pid: p.pid, scope: p.scope });
          break;
        default: break;
      }
    }
  }
  const buffs = [];
  for (const g of modsByGroup.values()) {
    const mods = enemyModsOf(foldEnemyMods(g.list));
    if (Object.keys(mods).length) buffs.push({ key: `ego:hs:mods:${g.pid}:${g.scope}`, mods, pid: g.pid, scope: g.scope });
  }
  if (!buffs.length && !shields.length && !regen.length && !dodges.length && !refractions.length
    && !drains.length && !undying.length && !lastStand.length) return;

  /** The hardship entries `pid`'s half carries (an effect of `pid` on this spawn). */
  const carries = (pid, scope, e) => hitsEnemy(battle, e, pid, scope);

  battle.on('enemySpawn', (ctx) => {
    const e = ctx && ctx.enemy;
    if (!e || !e.alive) return;
    for (const b of buffs) if (carries(b.pid, b.scope, e)) battle.addBuff(e, { key: b.key, mods: { ...b.mods }, persist: true });
    for (const r of regen) if (carries(r.pid, r.scope, e)) battle.addBuff(e, { key: r.key, mods: { hpRegen: r.amount }, persist: true });
    for (const d of dodges) {
      if (!carries(d.pid, d.scope, e)) continue;
      battle.addBuff(e, { key: d.key, mods: { dodgePhys: pct(d.phys), dodgeArts: pct(d.arts) }, persist: true });
    }
    for (const s of shields) {
      if (!carries(s.pid, s.scope, e)) continue;
      const amount = Math.max(0, Math.round(e.s.maxHp * pct(s.pct)));
      if (amount > 0) battle.addBuff(e, { key: s.key, shield: amount, persist: true });
    }
    for (const r of refractions) {
      if (!carries(r.pid, r.scope, e)) continue;
      // 折射: an enemy that already refracts (its own 折射 ability, or a 折射 buff) gets 免疫沉默 instead (折射 I / II)
      const native = e.buffs.some((b) => b.key === 'ab:refraction') || !!e.mem?.ab?.list?.some((a) => a && a.refraction);
      if (native) {
        battle.addBuff(e, { key: `${r.key}:silence`, persist: true, visible: true });
      } else {
        battle.addBuff(e, { key: r.key, mods: { resFlat: r.res }, duration: r.duration > 0 ? r.duration : Infinity, persist: r.duration <= 0, visible: true });
      }
    }
    for (const d of drains) {
      if (!carries(d.pid, d.scope, e)) continue;
      battle.addBuff(e, {
        key: d.key, persist: true, visible: true, interval: 1,
        onTick: ({ battle: b, unit }) => {
          if (!unit || !unit.alive || unit.removed || !unit.deployed) return;
          const raw = Math.max(0.01, (unit.s.maxHp * d.pct) / 100);
          const amount = d.cap > 0 ? Math.min(raw, d.cap) : raw;
          if (amount > 0) b.dealDamage(null, unit, { amount, type: 'true', canDodge: false, sourceless: true, silent: true, tags: ['ego:overload'] });
        },
      });
    }
  });

  // 超负荷: 免疫眩晕 / 恐惧 / 束缚; 折射 I / II: 免疫沉默 when the target already refracts
  if (drains.length || refractions.length) {
    battle.on('beforeStatus', (ctx) => {
      const e = ctx && ctx.target;
      if (!e || !isFoe(e)) return;
      for (const d of drains) {
        if (carries(d.pid, d.scope, e) && (ctx.status === 'stun' || ctx.status === 'fear' || ctx.status === 'bind')) { ctx.cancel = true; return; }
      }
      for (const r of refractions) {
        if (ctx.status !== 'silence') continue;
        if (carries(r.pid, r.scope, e) && e.buffs.some((b) => b.key === `${r.key}:silence`)) { ctx.cancel = true; return; }
      }
    });
  }

  // 过人的毅力: a lethal hit leaves 1 HP, then the enemy dies for real after `seconds`
  if (undying.length) {
    battle.on('fatal', (ctx) => {
      const e = ctx && ctx.unit;
      if (!e || !isFoe(e) || e._egoUndying) return;
      for (const u of undying) {
        if (!carries(u.pid, u.scope, e)) continue;
        ctx.prevented = true;
        e._egoUndying = true;
        battle.after(u.seconds, () => { if (e.alive && !e.removed) battle.kill(e, null); });
        return;
      }
    });
  }

  // 过度生长: below `belowPct` % HP it heals `healPct` % of its max HP, once
  if (lastStand.length) {
    battle.on('damaged', (ctx) => {
      const e = ctx && ctx.target;
      if (!e || !isFoe(e) || !e.alive || e._egoLastStand) return;
      if (e.hp <= 0) return;
      for (const s of lastStand) {
        if (!carries(s.pid, s.scope, e)) continue;
        if (e.hp / e.s.maxHp > pct(s.belowPct)) continue;
        e._egoLastStand = true;
        battle.heal(null, e, e.s.maxHp * pct(s.healPct), { self: true });
        return;
      }
    });
  }
}

// =====================================================================================================
// prep side (整备期)

/**
 * One handler per trinket / hardship id, registered as `ego:<id>` / `ego:hs:<id>` — effectsMeta.js runs it for every
 * EffectRef whose key matches, so two picks of the same item run it twice (the effects stack, as the todoList asks).
 * `income` / `shopDiscount` / `sellBonus` / `freeRefresh` / `bondLayers` are the trinket side; `shopInflation` is the one
 * hardship that acts on the shop instead of the field.
 */
export function registerMeta(registry) {
  const ego = egoData();
  const trinkets = (ego && ego.trinkets) || {};
  for (const id of Object.keys(trinkets)) {
    const rec = trinkets[id];
    if (!rec || !Array.isArray(rec.effects)) continue;
    const handler = trinketHandler(rec.effects);
    if (handler) registry.trinket(id, handler);
  }
  const hardships = (ego && ego.hardships) || {};
  for (const id of Object.keys(hardships)) {
    const rec = hardships[id];
    if (!rec || !Array.isArray(rec.effects)) continue;
    const handler = hardshipHandler(rec.effects);
    if (handler && typeof registry.hardship === 'function') registry.hardship(id, handler);
  }
}

/** The `ego-trinkets` file of the process data set (never throws). */
function egoData() {
  try {
    const d = gameData();
    const rec = d && d['ego-trinkets'];
    return rec && typeof rec === 'object' ? rec : null;
  } catch { return null; }
}

/** One handler for a trinket's prep-side effects; null when it has none (its battle side is all there is). */
export function trinketHandler(effects) {
  const income = sumParam(effects, 'income', 'amount');
  const discount = sumParam(effects, 'shopDiscount', 'pct');
  const sell = sumParam(effects, 'sellBonus', 'pct');
  const refresh = sumParam(effects, 'freeRefresh', 'count');
  const layers = effects.filter((e) => e && e.kind === 'bondLayers' && e.params && typeof e.params.bond === 'string');
  if (!income && !discount && !sell && !refresh && !layers.length) return null;
  const h = {};
  if (income || refresh || layers.length) {
    h.onRoundStart = (ctx) => {
      if (income) ctx.addFunds(income, 'ego');
      if (refresh) ctx.grantFreeRefresh(refresh);
      for (const e of layers) {
        const n = Math.max(0, Math.trunc(+e.params.count || 0));
        if (n) ctx.addLayers(e.params.bond, n, { requireActive: false, reason: 'ego' });
      }
    };
  }
  if (discount) {
    h.onPrice = (ctx, ev) => {
      const price = ev && Number.isFinite(+ev.price) ? +ev.price : 0;
      const off = Math.round((price * discount) / 100);
      if (off > 0) ctx.modifyPrice(-off);
    };
  }
  if (sell) {
    h.onSold = (ctx, ev) => {
      if (!ev || !Number.isFinite(+ev.gain)) return;
      ev.gain = Math.max(0, Math.trunc(+ev.gain * (1 + sell / 100)));
    };
  }
  return h;
}

/**
 * 通货膨胀: `pct` % of the shop's 干员 / 装备 cost 1 more fund.
 * `priceOf` runs on every read, so the roll cannot live in the handler: the decision is a pure hash of the slot
 * (kind + id + the player's seat), stashed non-enumerably on the slot the first time it is priced — one slot either
 * inflates for good or never does, and no rng stream moves. [ASSUMED] the slot's identity is its kind + id, so two copies
 * of the same 干员 in one shop share the roll.
 */
export function hardshipHandler(effects) {
  const inflation = sumParam(effects, 'shopInflation', 'pct');
  if (!inflation) return null;
  return {
    onPrice: (ctx, ev) => {
      const slot = ev && ev.slot;
      if (!slot || (slot.kind !== 'chess' && slot.kind !== 'item')) return;
      let roll = slot._egoInflate;
      if (roll == null) {
        roll = hash32(`ego:${ctx.playerId}:${slot.kind}:${slot.id}`) % 100 < inflation;
        try { Object.defineProperty(slot, '_egoInflate', { value: roll, enumerable: false, configurable: true }); } catch { /* a frozen slot keeps the roll local */ }
      }
      if (roll) ctx.modifyPrice(1);
    },
  };
}

/** FNV-1a over UTF-16 code units — integer arithmetic only, so the result is the same in Node and every browser. */
function hash32(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Every kind catalogue entry this module reads (a build-time cross-check: test/content/ego-kinds.test.js). */
export const HANDLED_KINDS = Object.freeze([
  'opMods', 'income', 'shopDiscount', 'sellBonus', 'freeRefresh', 'bondLayers', 'healOnKill',
  'burnOnSpawn', 'burnSpan', 'burnAmp', 'burnHaste', 'burnChance', 'burnVuln', 'burnEndBurst', 'burnDetonate', 'burnPulse',
  'enemyMods', 'enemyShield', 'extraEnemies', 'enemyRegen', 'fasterSpawns', 'enemyDodge', 'enemyRefraction',
  'enemyTrueDrain', 'enemyUndying', 'enemyLastStandHeal', 'shopInflation',
]);

/** Kinds owned by another module (the spawn list, server/match/match/combat.js) — the rest must be in HANDLED_KINDS. */
export const EXTERNAL_KINDS = Object.freeze(['extraEnemies', 'fasterSpawns']);

/** The catalogue cross-check: every kind in EFFECT_KINDS is read somewhere. */
export function unhandledKinds() {
  return Object.keys(EFFECT_KINDS).filter((k) => !EXTERNAL_KINDS.includes(k) && !HANDLED_KINDS.includes(k));
}
