// shared/ego.js — FORK: E.G.O 饰品 (trinkets) and 苦难 (hardships) — the hand-written source of data/ego-trinkets.json
// (tools/build-data.mjs buildEgoTrinkets). A trinket is a global effect for the player who picked it; a hardship is a buff
// for that player's enemies. Both come in three tiers (I / II / III, rolled 60 / 30 / 10 % before the item, then uniformly
// inside the tier — todoList/边狱巴士饰品系统（长期）.md).
//
// Effect shape: `{ kind, params }`. The kinds are a closed set here (EFFECT_KINDS) and the sim side reads them
// (server/sim/content/ego.js install): a trinket kind that appears in this file with no reader there does nothing, which is
// the point of keeping both lists in one place — the server refuses to start with an unknown kind (validateEgo() runs from
// tools/build-data.mjs and test/data.test.js).
//
// The catalogue below is the owner's design (2026-10-20, the 烧伤 school plus the 苦难 list). Values he wrote are used
// as-is; a value no source settles is marked [ASSUMED] in place.

/**
 * Every effect kind the sim knows how to read, with what `params` it takes. `target` says who it acts on:
 * 'own' — the picking player's operators / board, 'enemy' — that player's half of the field (the hardship side).
 */
export const EFFECT_KINDS = Object.freeze({
  // ---- trinket kinds (target: own) ------------------------------------------------------------------------------
  /** Operator buff: params { atk, def, hp, aspd, dmgDealt, dmgTaken, res } — percentages, applied to every own operator. */
  opMods: { target: 'own', params: ['atk', 'def', 'hp', 'aspd', 'dmgDealt', 'dmgTaken', 'res'] },
  /** Funds every round: params { amount }. */
  income: { target: 'own', params: ['amount'] },
  /** Shop price discount: params { pct }. */
  shopDiscount: { target: 'own', params: ['pct'] },
  /** Refunds a share of a sale: params { pct }. */
  sellBonus: { target: 'own', params: ['pct'] },
  /** Free shop refreshes every round: params { count }. */
  freeRefresh: { target: 'own', params: ['count'] },
  /** Layers on chosen bonds every round: params { bond, count }. */
  bondLayers: { target: 'own', params: ['bond', 'count'] },
  /** Heal on kill: params { amount }. */
  healOnKill: { target: 'own', params: ['amount'] },
  /** 烧伤 when an enemy walks in: params { stacks } — one layer is BURN.perStack seconds of ticking (尘归尘 / 土归土 / 镇魂). */
  burnOnSpawn: { target: 'own', params: ['stacks'] },
  /**
   * 烧伤 lasts longer per layer: params { seconds, perActiveBond, max } — `seconds` flat, plus `perActiveBond` for every
   * active 盟约 of the picking player, the extra capped at `max` (土归土: 1 / 1 / 3; 镇魂: 3 / 0 / 0).
   */
  burnSpan: { target: 'own', params: ['seconds', 'perActiveBond', 'max'] },
  /** 烧伤 hits harder: params { pct } — both the 法术伤害 and the 灼燃损伤 of every layer (镇魂: 50). */
  burnAmp: { target: 'own', params: ['pct'] },
  /**
   * 郁火: an own operator that damages a burning enemy gains params { aspd } 攻速 for { duration } seconds, at most
   * { maxStacks } times (independent layers, one timer each).
   */
  burnHaste: { target: 'own', params: ['aspd', 'duration', 'maxStacks'] },
  /** 炽热的羽毛: params { pct, burningPct } — chance to add a layer on damage, the higher one when the target already burns. */
  burnChance: { target: 'own', params: ['pct', 'burningPct'] },
  /** 炎鳞: a burning enemy takes params { perStack } % more damage per layer. */
  burnVuln: { target: 'own', params: ['perStack'] },
  /**
   * 炎鳞: when the 烧伤 runs out, the enemy takes (已激活盟约总层数 × 层数 × params.perLayer) 法术伤害, at least
   * params.floor. The 层数 counted are the ones the clock consumed — the layers 炎鳞 itself ate are not counted.
   */
  burnEndBurst: { target: 'own', params: ['perLayer', 'floor'] },
  /**
   * 炎鳞: applying 烧伤 that would leave more than params.threshold layers eats params.consume of them (and their time)
   * and immediately deals (已激活盟约总层数 × params.perLayer) 法术伤害 — 元素伤害 instead when the target is in its 灼燃
   * 损伤爆发 (see burnBurst below).
   */
  burnDetonate: { target: 'own', params: ['threshold', 'consume', 'perLayer'] },
  /**
   * 地狱蝶之梦: every params.seconds seconds, params.targets random enemies of the picker's half gain params.stacks
   * layers of 烧伤; every params.perBondLayers layers among the picker's active 盟约 add one more target.
   */
  burnPulse: { target: 'own', params: ['seconds', 'stacks', 'targets', 'perBondLayers'] },

  // ---- hardship kinds (target: enemy) ---------------------------------------------------------------------------
  /**
   * Enemy stats: params { atk, def, hp, aspd, res, moveSpeed, dmgDealt, physTaken, artsTaken } — every percentage is
   * ADDITIVE across hardships (锐利 I + 锐利 II = 攻撃力 +45 %, never 1.15 × 1.30), see enemyModsOf.
   */
  enemyMods: { target: 'enemy', params: ['atk', 'def', 'hp', 'aspd', 'res', 'moveSpeed', 'dmgDealt', 'physTaken', 'artsTaken'] },
  /** Enemy shields: params { pct } of max HP at spawn. */
  enemyShield: { target: 'enemy', params: ['pct'] },
  /** Extra enemies: params { count, tier }. */
  extraEnemies: { target: 'enemy', params: ['count', 'tier'] },
  /** Enemy regen: params { amount } HP per second. */
  enemyRegen: { target: 'enemy', params: ['amount'] },
  /** Faster waves: params { pct } — spawn interval × (1 - pct). */
  fasterSpawns: { target: 'enemy', params: ['pct'] },
  /** 怎么,打不中吗?: params { phys, arts } — % chance to dodge that damage type (20 / 20). */
  enemyDodge: { target: 'enemy', params: ['phys', 'arts'] },
  /**
   * 折射: the spawn starts with +params.res 法抗 for params.duration seconds (0 = for the battle) — and, if it already
   * refracts (the enemy's own 折射), it is immune to 沉默 instead. [ASSUMED] res 70 / 20 s: the owner gave no number.
   */
  enemyRefraction: { target: 'enemy', params: ['res', 'duration'] },
  /**
   * 超负荷: the enemy loses params.pct % of its max HP per second as 真实伤害, at most params.cap per second, and is
   * immune to 眩晕 / 恐惧 / 束缚 (its own 攻速 comes from enemyMods).
   */
  enemyTrueDrain: { target: 'enemy', params: ['pct', 'cap'] },
  /** 过人的毅力: a lethal hit leaves 1 HP; params.seconds later it dies for real (5 s). */
  enemyUndying: { target: 'enemy', params: ['seconds'] },
  /** 过度生长: below params.belowPct % HP it heals params.healPct % of its max HP, once (30 / 20). */
  enemyLastStandHeal: { target: 'enemy', params: ['belowPct', 'healPct'] },
  /**
   * 通货膨胀: params.pct % of the shop's 干员 / 装备 cost 1 more fund (18). The one hardship that acts on the picking
   * player's shop instead of the field — read by the prep side (trinketHandler / hardshipHandler), not by the battle.
   */
  shopInflation: { target: 'enemy', params: ['pct'] },
});

/** The tier ladder and its roll weights (todoList: I 60 %, II 30 %, III 10 % — the tier is rolled first). */
export const EGO_TIERS = Object.freeze([
  Object.freeze({ tier: 1, name: 'I', weight: 60 }),
  Object.freeze({ tier: 2, name: 'II', weight: 30 }),
  Object.freeze({ tier: 3, name: 'III', weight: 10 }),
]);

/**
 * 烧伤: one status, `stacks` layers. One layer = `perStack` seconds of ticking and then it is spent — so N layers last
 * N × perStack seconds, the clock eats one layer every `perStack` seconds, and the last one expires the status.
 * Every second the burning unit takes `dmg` 法术伤害 and `chip` 灼燃损伤 — a FIXED amount, never multiplied by the layer
 * count (the owner's rule of 2026-10-20; layers only buy time).
 */
export const BURN = Object.freeze({
  key: 'ego:burn',
  perStack: 3,   // seconds one layer lasts
  dmg: 300,      // 法术伤害 per second, whatever the layer count
  chip: 100,     // 灼燃损伤 per second, whatever the layer count
  maxStacks: 999,
});

/** Rounds the E.G.O pick opens on (todoList: 1 / 4 / 7 / 11 — fixed, not the mode's 机变 rounds). */
export const EGO_ROUNDS = Object.freeze([1, 4, 7, 11]);

/** The boss rounds that apply EVERY player's hardship at one third (todoList: 14 / 15, floored). */
export const EGO_BOSS_ROUNDS = Object.freeze([14, 15]);

/** Divisor of a hardship at the boss rounds (todoList: 1/3). */
export const EGO_BOSS_DIVISOR = 3;

/** Options of one pick (todoList: 三选一) — `g.trinket` idx is below this. */
export const EGO_OFFER_SIZE = 3;

/**
 * A hardship's effects at one third (todoList: 14/15 回合 boss 适用所有玩家苦难，效果削弱为 1/3，向下取整).
 * Only the numeric params are divided, and every division floors; a param that would fall to 0 is dropped (a 10 % buff
 * becomes 3 %, a 1-point regen becomes 0 and is skipped rather than silently kept at full strength).
 * @param {ReadonlyArray<{kind: string, params?: object}>} effects
 * @param {number} divisor
 * @returns {Array<{kind: string, params: object}>}
 */
export function scaleEgoEffects(effects, divisor) {
  const d = Number.isFinite(+divisor) && +divisor > 1 ? +divisor : 1;
  if (d === 1) return (effects || []).map((e) => ({ kind: e.kind, params: { ...(e.params || {}) } }));
  const out = [];
  for (const e of effects || []) {
    const params = {};
    for (const [k, v] of Object.entries(e.params || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const scaled = Math.floor(v / d);
        if (scaled === 0) continue;
        params[k] = scaled;
      } else {
        params[k] = v;
      }
    }
    if (Object.keys(params).length) out.push({ kind: e.kind, params });
  }
  return out;
}

/**
 * Trinkets. `id` names the art (public/assets/local/ego/<id>.png, server/http/localEgoArt.js; `icon` is the display
 * name shown when this machine has no picture for it — the owner keeps the source art outside the repository).
 * `tier` picks the roll bucket. The 烧伤 school of the owner's 2026-10-20 design.
 */
export const TRINKETS = Object.freeze([
  Object.freeze({
    id: 'dust-to-dust', name: '尘归尘', tier: 1, icon: '尘归尘',
    desc: '敌方单位出场时，获得 3 层「烧伤」。',
    effects: [{ kind: 'burnOnSpawn', params: { stacks: 3 } }],
  }),
  Object.freeze({
    id: 'smothered-flame', name: '郁火', tier: 1, icon: '郁火',
    desc: '我方干员对带有「烧伤」的敌方单位造成伤害后，攻速 +10，持续 10 秒（至多叠加 5 次）。',
    effects: [{ kind: 'burnHaste', params: { aspd: 10, duration: 10, maxStacks: 5 } }],
  }),
  Object.freeze({
    id: 'ashes-to-ashes', name: '土归土', tier: 2, icon: '土归土',
    desc: '敌方单位出场时，获得 2 层「烧伤」；「烧伤」每层的持续时间 +1 秒（每个已激活盟约额外 +1 秒，至多 +3 秒）。',
    effects: [
      { kind: 'burnOnSpawn', params: { stacks: 2 } },
      { kind: 'burnSpan', params: { seconds: 1, perActiveBond: 1, max: 3 } },
    ],
  }),
  Object.freeze({
    id: 'searing-feather', name: '炽热的羽毛', tier: 2, icon: '炽热的羽毛',
    desc: '对敌方单位造成伤害时，有 10% 概率使其额外获得 1 层「烧伤」；若其已带有「烧伤」，概率提高至 20%。',
    effects: [{ kind: 'burnChance', params: { pct: 10, burningPct: 20 } }],
  }),
  Object.freeze({
    id: 'hell-butterfly', name: '地狱蝶之梦', tier: 2, icon: '地狱蝶之梦',
    desc: '每 3 秒使场上的随机 2 名敌方单位获得 2 层「烧伤」；所有盟约每叠加 60 层，本效果的作用目标数 +1。',
    effects: [{ kind: 'burnPulse', params: { seconds: 3, stacks: 2, targets: 2, perBondLayers: 60 } }],
  }),
  Object.freeze({
    id: 'flame-scales', name: '炎鳞', tier: 3, icon: '炎鳞',
    short: '带有烧伤的敌人根据层数受到的伤害增加，烧伤效果结束时或烧伤层数过高时受到一次高额引爆伤害',
    desc: '带有「烧伤」的敌方单位受到的伤害 +（烧伤层数 × 10%）。「烧伤」结束时，额外受到一次（已激活盟约总层数 × 烧伤层数 × 10）点法术伤害，至少 2500 点；若目标处于灼燃损伤爆发期间，该伤害改为元素伤害。被施加「烧伤」时若层数高于 40 层，消耗 10 层并立刻受到（已激活盟约总层数 × 100）点法术伤害；若目标处于灼燃损伤爆发期间，该伤害改为元素伤害。',
    effects: [
      { kind: 'burnVuln', params: { perStack: 10 } },
      { kind: 'burnEndBurst', params: { perLayer: 10, floor: 2500 } },
      { kind: 'burnDetonate', params: { threshold: 40, consume: 10, perLayer: 100 } },
    ],
  }),
  Object.freeze({
    id: 'soul-repose', name: '镇魂', tier: 3, icon: '镇魂',
    desc: '敌方单位出场时，对其施加 5 层「烧伤」；「烧伤」造成的伤害与灼燃损伤 +50%，每层的持续时间 +3 秒。',
    effects: [
      { kind: 'burnOnSpawn', params: { stacks: 5 } },
      { kind: 'burnAmp', params: { pct: 50 } },
      { kind: 'burnSpan', params: { seconds: 3 } },
    ],
  }),
]);

/**
 * Hardships: the same shape and tier ladder; `effects` read by the enemy side.
 * Every stat bonus shares one additive bucket (「苦难对于敌方属性的加成共用一个乘区」), and the records are independent
 * of each other (不选 锐利 I 也能选 锐利 II: they are separate rows, and both can be held at once).
 */
export const HARDSHIPS = Object.freeze([
  Object.freeze({
    id: 'sharpness-1', name: '锐利 I', tier: 1, icon: '锐利',
    desc: '敌人攻击力 +15%。',
    effects: [{ kind: 'enemyMods', params: { atk: 15 } }],
  }),
  Object.freeze({
    id: 'sharpness-2', name: '锐利 II', tier: 2, icon: '锐利',
    desc: '敌人攻击力 +30%。',
    effects: [{ kind: 'enemyMods', params: { atk: 30 } }],
  }),
  Object.freeze({
    id: 'sharpness-3', name: '锐利 III', tier: 3, icon: '锐利',
    desc: '敌人攻击力 +50%。',
    effects: [{ kind: 'enemyMods', params: { atk: 50 } }],
  }),
  Object.freeze({
    id: 'refraction-1', name: '折射 I', tier: 2, icon: '折射',
    desc: '敌人出场时获得「折射」，持续 20 秒；若已带有「折射」，改为免疫「沉默」。',
    effects: [{ kind: 'enemyRefraction', params: { res: 70, duration: 20 } }],
  }),
  Object.freeze({
    id: 'refraction-2', name: '折射 II', tier: 3, icon: '折射',
    desc: '敌人出场时获得「折射」；若已带有「折射」，改为免疫「沉默」。',
    effects: [{ kind: 'enemyRefraction', params: { res: 70, duration: 0 } }],
  }),
  Object.freeze({
    id: 'toughness-1', name: '强韧 I', tier: 1, icon: '强韧',
    desc: '敌人生命上限 +15%，防御力 +15%。',
    effects: [{ kind: 'enemyMods', params: { hp: 15, def: 15 } }],
  }),
  Object.freeze({
    id: 'toughness-2', name: '强韧 II', tier: 2, icon: '强韧',
    desc: '敌人生命上限 +30%，防御力 +25%。',
    effects: [{ kind: 'enemyMods', params: { hp: 30, def: 25 } }],
  }),
  Object.freeze({
    id: 'toughness-3', name: '强韧 III', tier: 3, icon: '强韧',
    desc: '敌人生命上限 +40%，防御力 +35%。',
    effects: [{ kind: 'enemyMods', params: { hp: 40, def: 35 } }],
  }),
  Object.freeze({
    id: 'tenacity-1', name: '顽强 I', tier: 1, icon: '顽强',
    desc: '敌人造成的伤害 +20%，受到的物理及法术伤害 -15%。',
    effects: [{ kind: 'enemyMods', params: { dmgDealt: 20, physTaken: 15, artsTaken: 15 } }],
  }),
  Object.freeze({
    id: 'tenacity-2', name: '顽强 II', tier: 2, icon: '顽强',
    desc: '敌人造成的伤害 +35%，受到的物理及法术伤害 -30%。',
    effects: [{ kind: 'enemyMods', params: { dmgDealt: 35, physTaken: 30, artsTaken: 30 } }],
  }),
  Object.freeze({
    id: 'tenacity-3', name: '顽强 III', tier: 3, icon: '顽强',
    desc: '敌人造成的伤害 +50%，受到的物理及法术伤害 -40%。',
    effects: [{ kind: 'enemyMods', params: { dmgDealt: 50, physTaken: 40, artsTaken: 40 } }],
  }),
  Object.freeze({
    id: 'level-boost-1', name: '等级强化 I', tier: 1, icon: '等级强化',
    desc: '敌人攻击力、防御力、生命上限、移动速度 +10%。',
    effects: [{ kind: 'enemyMods', params: { atk: 10, def: 10, hp: 10, moveSpeed: 10 } }],
  }),
  Object.freeze({
    id: 'inflation-1', name: '通货膨胀 I', tier: 1, icon: '通货膨胀',
    desc: '商店出售的干员与装备有 18% 概率价格 +1。',
    effects: [{ kind: 'shopInflation', params: { pct: 18 } }],
  }),
  Object.freeze({
    id: 'cant-hit-me-1', name: '怎么，打不中吗？', tier: 1, icon: '怎么，打不中吗？',
    desc: '敌人获得 20% 的物理与法术闪避。',
    effects: [{ kind: 'enemyDodge', params: { phys: 20, arts: 20 } }],
  }),
  Object.freeze({
    id: 'velocity-2', name: '极速 II', tier: 2, icon: '极速',
    desc: '敌人移动速度 +35%，攻击速度 +25。',
    effects: [{ kind: 'enemyMods', params: { moveSpeed: 35, aspd: 25 } }],
  }),
  Object.freeze({
    id: 'overload-2', name: '超负荷 II', tier: 2, icon: '超负荷',
    desc: '敌人每秒受到 1% 生命上限的真实伤害（不高于 100），免疫眩晕、恐惧、束缚，攻击速度 +50。',
    effects: [
      { kind: 'enemyTrueDrain', params: { pct: 1, cap: 100 } },
      { kind: 'enemyMods', params: { aspd: 50 } },
    ],
  }),
  Object.freeze({
    id: 'perseverance-2', name: '过人的毅力 II', tier: 2, icon: '过人的毅力',
    desc: '敌人受到致命伤害时，生命值持续不低于 1，5 秒后强制死亡。',
    effects: [{ kind: 'enemyUndying', params: { seconds: 5 } }],
  }),
  Object.freeze({
    id: 'overgrowth-3', name: '过度生长 III', tier: 3, icon: '过度生长',
    desc: '敌人生命上限 +70%；生命值低于 30% 时立刻恢复最大生命值 20% 的生命。',
    effects: [
      { kind: 'enemyMods', params: { hp: 70 } },
      { kind: 'enemyLastStandHeal', params: { belowPct: 30, healPct: 20 } },
    ],
  }),
]);

/**
 * One draw of the pick window: `count` options, each `{ trinket, hardship, tier }`.
 * The todoList's rule is 「先抽阶、再在同阶里等概率抽饰品」, so the tier is rolled on `tiers` (60/30/10) and the item is
 * picked uniformly among the records of that tier; no trinket repeats inside one draw, and neither does a hardship.
 * A deal pairs a 饰品 with a 苦难 **of the same tier** (the pair is the deal): only a tier that still holds a fresh
 * record on BOTH sides is drawable, so a tier that has run dry on either side is skipped, never widened across tiers —
 * a tier III 饰品 can never come with a tier I 苦难. When the ladder holds no fresh pair at all (a tiny catalogue), a
 * repeat inside one tier is allowed rather than breaking the pair, so a draw never comes back short.
 * @param {() => number} rng seeded rng (server/sim/rng.js) — the caller owns the stream
 * @param {{trinkets?: object, hardships?: object, tiers?: ReadonlyArray<{tier:number,weight:number}>, count?: number}} opts
 * @returns {Array<{trinket: object, hardship: object, tier: number}>}
 */
export function rollEgoOffer(rng, { trinkets, hardships, tiers = EGO_TIERS, count = 3 } = {}) {
  const table = Array.isArray(tiers) && tiers.length ? tiers : EGO_TIERS;
  const byTier = (map, tier) => Object.values(map || {}).filter((r) => r && r.tier === tier);
  const allTrinkets = Object.values(trinkets || {}).filter(Boolean);
  const allHardships = Object.values(hardships || {}).filter(Boolean);
  if (!allTrinkets.length || !allHardships.length) return [];
  const usedT = new Set();
  const usedH = new Set();
  const out = [];
  /** The tiers that can still pair one 饰品 with one 苦难 (`allowUsed`: ignore what this draw already spent). */
  const drawable = (allowUsed) => table.filter((t) => {
    const ts = byTier(trinkets, t.tier).filter((r) => allowUsed || !usedT.has(r.id));
    const hs = byTier(hardships, t.tier).filter((r) => allowUsed || !usedH.has(r.id));
    return ts.length && hs.length;
  });
  for (let i = 0; i < count; i++) {
    const fresh = drawable(false);
    const repeat = !fresh.length;
    const bucket = repeat ? drawable(true) : fresh;
    if (!bucket.length) break;
    const tier = rollTier(rng, bucket);
    const trinket = pickOne(rng, byTier(trinkets, tier).filter((r) => repeat || !usedT.has(r.id)));
    const hardship = pickOne(rng, byTier(hardships, tier).filter((r) => repeat || !usedH.has(r.id)));
    if (!trinket || !hardship) break;
    usedT.add(trinket.id);
    usedH.add(hardship.id);
    out.push({ trinket, hardship, tier });
  }
  return out;
}

/** One weighted tier of the ladder (`weight` 60 / 30 / 10; the last bucket catches rounding). */
function rollTier(rng, table) {
  let total = 0;
  for (const t of table) total += Math.max(0, Number(t.weight) || 0);
  if (total <= 0) return table[0].tier;
  let r = rng() * total;
  for (const t of table) {
    r -= Math.max(0, Number(t.weight) || 0);
    if (r < 0) return t.tier;
  }
  return table[table.length - 1].tier;
}

/** Uniform pick from `pool`; null when it is empty (the caller already decided what is drawable). */
function pickOne(rng, pool) {
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * Integrity check of the two lists above: unique ids, a known tier, effects of a known kind whose params are all declared
 * (and `target` matching the list — a trinket never carries an `enemy` kind, a hardship never an `own` one).
 * @returns {string[]} errors, empty when the data is sound
 */
export function validateEgo(trinkets = TRINKETS, hardships = HARDSHIPS) {
  const errors = [];
  const tiers = new Set(EGO_TIERS.map((t) => t.tier));
  const check = (list, label, want) => {
    const seen = new Set();
    for (const rec of list) {
      if (!rec || typeof rec !== 'object') { errors.push(`${label}: not an object`); continue; }
      if (typeof rec.id !== 'string' || !rec.id) errors.push(`${label}: missing id`);
      else if (seen.has(rec.id)) errors.push(`${label}: duplicate id ${rec.id}`);
      else seen.add(rec.id);
      if (!tiers.has(rec.tier)) errors.push(`${label} ${rec.id}: unknown tier ${rec.tier}`);
      if (typeof rec.name !== 'string' || !rec.name) errors.push(`${label} ${rec.id}: missing name`);
      // `short` is optional and belongs only to a record whose `desc` is too long for the card (design/ego.md, "The
      // screen"): the card falls back to `desc` when it is absent, and the full text always lives in the effect list
      if (rec.short !== undefined && (typeof rec.short !== 'string' || !rec.short)) {
        errors.push(`${label} ${rec.id}: short must be a non-empty string`);
      } else if (typeof rec.short === 'string' && rec.short.length > 60) {
        errors.push(`${label} ${rec.id}: short is ${rec.short.length} chars (the card fits 60)`);
      }
      if (typeof rec.icon !== 'string' || !rec.icon) errors.push(`${label} ${rec.id}: missing icon (the display name)`);
      if (!Array.isArray(rec.effects) || !rec.effects.length) { errors.push(`${label} ${rec.id}: no effects`); continue; }
      for (const eff of rec.effects) {
        const spec = eff && EFFECT_KINDS[eff.kind];
        if (!spec) { errors.push(`${label} ${rec.id}: unknown effect kind ${eff && eff.kind}`); continue; }
        if (spec.target !== want) errors.push(`${label} ${rec.id}: effect ${eff.kind} is a ${spec.target} kind`);
        for (const k of Object.keys(eff.params || {})) {
          if (!spec.params.includes(k)) errors.push(`${label} ${rec.id}: effect ${eff.kind} has no param ${k}`);
        }
      }
    }
  };
  check(trinkets, 'trinket', 'own');
  check(hardships, 'hardship', 'enemy');
  return errors;
}
