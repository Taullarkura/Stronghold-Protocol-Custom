// shared/promoted.js — FORK EXTENSION, the owner's 自选干员 → 可用干员 promotions (decisions of 2026-10-11, 2026-10-12 and
// 2026-10-13).
//
// A promoted operator gets a PRESET chess of its own — part of the global roster every player has — and leaves the 自选
// pool (`diy.ownedPool`): it can no longer be picked, which `shared/diy.js checkDiyPick` / `validateDiyPicks` enforce on
// their own. Unlike a 自选 piece — whose bonds are derived from its operator and which carries no 特质 at all
// (shared/standIn.js composeUnitRecord) — a promoted piece carries BOTH from here, so every promotion states them.
//
// Naming (the owner's rule of 2026-10-11; use it for every later promotion too):
//   chess     chess_char_<charId without its `char_` prefix>_<a|b>   char_4231_clemnt → chess_char_4231_clemnt_a / _b
//   garrison  garrison_fork_<name part of the charId>_<a|b>          …clemnt → garrison_fork_clemnt_a / _b
//             …and `<name>_<part>_<a|b>` for a 特质 of several effects — the official data gives one operator several
//             特质 records the same way (圣约送葬人 拉特兰 + 远见, 耀骑士临光 four): 结城理 → garrison_fork_makoto_swap_a / _b
// `garrison_fork_*` is outside the official `garrison_<number>_<a|b>` range, so a later gamedata update cannot collide
// with it (the reason the owner chose the prefix over an unused number).
//
// Consumed by tools/build-data.mjs (the chess records + their 特质 records + the 自选 pool) and
// server/sim/content/kits/index.js (a promoted piece fights with the operator's own kit, under its new base id).

/**
 * The stats a promotion's 作战能力 特质 scales: the entry key (`<key>A` / `<key>B` = the normal / elite percentage), the
 * blackboard key the record carries and the Chinese name its desc lists. In desc order ("攻击力和生命值+1%").
 */
export const PROMOTED_STATS = Object.freeze([
  Object.freeze({ key: 'atk', bb: 'atk', label: '攻击力' }),     // i18n-ignore: a 特质's own text (data/garrisons.json)
  Object.freeze({ key: 'maxHp', bb: 'max_hp', label: '生命值' }), // i18n-ignore: as above
  Object.freeze({ key: 'def', bb: 'def', label: '防御力' }),      // i18n-ignore: as above
]);

/**
 * The stats one quality of a promotion's 作战能力 特质 states: `[{ key, bb, label, v }]`, `v` the fraction per step
 * (0.01 = +1 %). Empty when the promotion states none of them.
 * @param {PromotedPiece} piece @param {boolean} isGolden
 * @returns {{ key: string, bb: string, label: string, v: number }[]}
 */
export function promotedGarrisonStats(piece, isGolden) {
  const g = piece.garrison;
  const out = [];
  for (const s of PROMOTED_STATS) {
    const v = Number(g[`${s.key}${isGolden ? 'B' : 'A'}`] ?? 0);
    if (v > 0) out.push({ ...s, v });
  }
  return out;
}

/**
 * Every 特质 record of a promotion, each `{ a, b }` (the chess names the `a` ids, the elite the `b` ones): the
 * 作战能力 one first, then the 持续叠加 ones a promotion states — `swap` (a <替身> switch), `cast` (a skill activation)
 * and `ammo` (bullets the piece spends) get a pair each; a promotion whose ONLY 特质 is one of them (真言's `cast`,
 * 维伊's `ammo`) names its pair without a suffix.
 * @param {PromotedPiece} piece
 * @returns {{ bond: { a: string, b: string }, swap: { a: string, b: string }|null, cast: { a: string, b: string }|null,
 *   ammo: { a: string, b: string }|null }}
 */
export function promotedGarrisonIdsOf(piece) {
  return {
    bond: promotedGarrisonIds(piece.charId),
    swap: piece.swap ? promotedGarrisonIds(piece.charId, '_swap') : null,
    cast: piece.cast ? promotedGarrisonIds(piece.charId, piece.garrison ? '_cast' : '') : null,
    ammo: piece.ammo ? promotedGarrisonIds(piece.charId, piece.garrison ? '_ammo' : '') : null,
  };
}

/**
 * @typedef {object} RefreshTrait
 * @property {readonly string[]} bonds the 盟约 whose layers the trait lifts
 * @property {readonly number[]} perA @property {readonly number[]} capA the normal record's layers per refresh / per round
 * @property {readonly number[]} perB @property {readonly number[]} capB the elite record's
 */

/**
 * @typedef {object} PromotedPiece
 * @property {string} charId the operator's charId (the one its 自选 pick carried before the promotion)
 * @property {string} label its own data name — a 特质's text is game data, not UI copy
 * @property {number} tier the tier of both its chess records (the 自选 slot whose 练度 and price it keeps)
 * @property {readonly string[]} bonds its 盟约 — a 自选 piece derives these from its operator, a chess states them
 * @property {number} skillIndex its default skill (a promoted piece has no official chess default to inherit)
 * @property {string|null} moduleId the module its records carry by default (its elite at the tier's module level);
 *   null when the operator has no module at all (克莱门莎, 予愿安洁莉娜)
 * @property {{ divide: number, perText?: string, atkA?: number, atkB?: number, maxHpA?: number, maxHpB?: number,
 *   defA?: number, defB?: number }} [garrison] its 作战能力 特质 — "本干员<stats>+X %" per `divide` layers of `bonds`
 *   (`perText` the verb, default 每叠加), the `<key>A` / `<key>B` percentages of the stats it states; [garrisonLabel] the
 *   盟约 names its 特质 texts lead with
 * @property {{ addA: number, addB: number, capA: number, capB: number }} [swap] a second 特质 record — a 持续叠加
 *   one: `addA` / `addB` layers to every active listed bond per <替身> switch, at most `capA` / `capB` per bond per
 *   battle (the official `max_add_count_per_battle`), handled by the fork key `fork_gar_event_dollswap`
 *   (server/sim/content/garrisons/battle.js)
 * @property {{ addA: number, addB: number, capA: number, capB: number }} [cast] a 持续叠加 特质 like `swap`, on every
 *   SKILL activation of an operator carrying one of the promotion's `bonds` (the piece included): `addA` / `addB` layers
 *   to every active listed bond, at most `capA` / `capB` per bond per battle — 真言's "场上所有【萨尔贡】【迅捷】干员开启技能时
 *   使已激活的【萨尔贡】【迅捷】层数+1（至多+24层），精锐 +2（至多+48层）", the OWNER's plan of 2026-10-13, handled by
 *   the fork key `fork_gar_event_bondskill` (no official 特质 listens to another operator's casts)
 * @property {{ bonds: readonly string[], consume: number, addA: number, addB: number, capA: number, capB: number }}
 *   [ammo] a 持续叠加 特质 of the official ammo-consume family (`act1autochess_gar_event_consume_ammo`): every `consume`
 *   bullets the PIECE ITSELF spends (the self-only `range_id: '0-1'` scope — 莫斯提马's garrison_22 covers her 4 tiles
 *   instead) add `addA` / `addB` layers to the active bonds in `bonds`, at most `capA` / `capB` per bond per battle. The
 *   official records read that cap as a trigger count (`cap = add × triggers`, 圣约送葬人's garrison_23: 7 × 7 = 49) —
 *   维伊's "自身每消耗6发弹药，使已激活的【拉特兰】层数+3（每场战斗至多触发6次）", the OWNER's plan of 2026-10-13, where
 *   6 triggers × 3 layers = `capA` 18 (elite +6 × 6 = 36)
 * @property {RefreshTrait} [refresh] instead of `garrison`: a 持续叠加 特质 "<休整期结束时>本回合每刷新过1次，使已激活的
 *   【X】层数+N（每回合至多M层）" — the official `SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER` shape, authored through
 *   shared/forkTraits.js (予愿安洁莉娜's, the same shape 安洁莉娜's adjusted one has)
 */

/** Every 自选干员 promoted into the global roster (an empty list restores upstream's data). */
export const PROMOTED_PIECES = Object.freeze([
  Object.freeze({
    charId: 'char_4231_clemnt',                                      // 克莱门莎, the fork's 6★ WARRIOR primguard
    label: '克莱门莎',                                                // i18n-ignore: the operator's own data name, the same
                                                                    // as character_table / data/backups.json carries
    tier: 6,                                                        // 等级 6 — the tier of both its forms, and the 自选 slot
    bonds: Object.freeze(['egirShip', 'indomShip', 'raidShip']),     // 盟约: 阿戈尔 / 不屈 / 突袭
    skillIndex: 1,                                                  // its default skill (S2, the owner's decision of 2026-10-11)
    moduleId: null,                                                 // she carries no module (character_table names none)
    garrison: Object.freeze({ divide: 3, atkA: 0.02, atkB: 0.04 }),  // 特质: 每叠加3层, 攻击力 +2% (elite +4%)
    garrisonLabel: '【阿戈尔】【不屈】【突袭】',                       // i18n-ignore: a 特质's own text (data/garrisons.json), a
                                                                    // game-data string like the official ones, not UI copy
  }),
  Object.freeze({
    charId: 'char_4217_makoto',                                      // 结城理, the fork's 6★ SPECIAL dollkeeper
    label: '结城理',                                                  // i18n-ignore: as above
    tier: 5,                                                        // 等级 5 (金币 4 — the tier-5 shop row)
    bonds: Object.freeze(['lateranoShip', 'steadShip']),             // 盟约: 拉特兰 / 坚守
    skillIndex: 2,                                                  // its default skill (S3, the owner's decision of 2026-10-12)
    moduleId: 'uniequip_002_makoto',                                // 彼此的声音 (PUM-Y), the owner's decision of 2026-10-12:
                                                                    // the piece's default module like an official chess's
    garrison: Object.freeze({ divide: 2, perText: '每有', atkA: 0.01, atkB: 0.02, maxHpA: 0.01, maxHpB: 0.02 }),  // i18n-ignore: 特质 text
    garrisonLabel: '【拉特兰】【坚守】',                               // i18n-ignore: a 特质's own text (data/garrisons.json), a
                                                                    // game-data string like the official ones, not UI copy
    swap: Object.freeze({ addA: 4, addB: 8, capA: 12, capB: 24 }),   // 特质 2: <战斗中>每次切换替身, 已激活的【拉特兰】【坚守】
                                                                    // 层数 +4 (elite +8), 每场战斗每个盟约至多 12 / 24 层
  }),
  Object.freeze({
    charId: 'char_1015_aglna2',                                      // 予愿安洁莉娜, the fork's 6★ SPECIAL skywalker
    label: '予愿安洁莉娜',                                             // i18n-ignore: as above
    tier: 5,                                                        // 等级 5, 费用 4 (the tier-5 shop row, the owner's plan
                                                                    // of 2026-10-12)
    bonds: Object.freeze(['siracusaShip']),                          // 盟约: 叙拉古 (one, unlike 安洁莉娜's 叙拉古 + 奇迹)
    skillIndex: 2,                                                  // its default skill (S3 酸橙的心事, the owner's plan)
    moduleId: null,                                                 // she carries no module (character_table names none)
    // 特质: <休整期结束时>本回合每刷新过1次，使已激活的【叙拉古】层数+4（每回合至多12层）, 精锐 +8 / 至多 24
    refresh: Object.freeze({
      bonds: Object.freeze(['siracusaShip']),
      perA: Object.freeze([4]), capA: Object.freeze([12]),
      perB: Object.freeze([8]), capB: Object.freeze([24]),
    }),
  }),
  Object.freeze({
    charId: 'char_4204_mantra',                                      // 真言, the fork's 6★ CASTER primcaster
    label: '真言',                                                    // i18n-ignore: as above
    tier: 5,                                                        // 等级 5, 费用 4 (the tier-5 shop row, the owner's plan
                                                                    // of 2026-10-13)
    bonds: Object.freeze(['sargonShip', 'swiftShip']),               // 盟约: 萨尔贡 / 迅捷
    skillIndex: 2,                                                  // its default skill (S3, the owner's plan)
    moduleId: 'uniequip_002_mantra',                                // 中枢神经探测模块 (PRI-X) — 默认携带模组 (the owner's plan)
    // 特质: 场上所有【萨尔贡】【迅捷】干员开启技能时，使已激活的【萨尔贡】【迅捷】层数+1（至多+24层）, 精锐 +2 / 至多 48
    // (只要带有萨尔贡和迅捷两个盟约中的一个就可生效 — the owner's answer of 2026-10-13, both qualities alike: the CASTER
    // must carry one of the two bonds, so a teammate's 协防干员 does not feed it)
    cast: Object.freeze({ addA: 1, addB: 2, capA: 24, capB: 48 }),
  }),
  Object.freeze({
    charId: 'char_4226_veen',                                       // 维伊, the fork's 6★ CASTER mystic (a 自选 pick until the
                                                                    // owner's plan of 2026-10-13)
    label: '维伊',                                                   // i18n-ignore: as above
    tier: 4,                                                        // 等级 4, 费用 3 — the tier-4 shop row 莫斯提马 leaves
                                                                    // behind, with the 练度 of its row (the owner's plan)
    bonds: Object.freeze(['lateranoShip', 'arcaneShip']),            // 盟约: 拉特兰 / 奥术
    skillIndex: 2,                                                  // its default skill (S3 用赤铁铭记, the owner's plan)
    moduleId: 'uniequip_002_veen',                                  // 默认携带模组 (the operator's only module)
    // 特质: <战斗中>自身每消耗6发弹药，使已激活的【拉特兰】层数+3（每场战斗至多触发6次），精锐 +6 / 至多 6 次 — her own
    // bullets (the self-only scope), 拉特兰 alone (the second of her two 盟约 is untouched), the cap 6 × 3 = 18 / 6 × 6 = 36
    ammo: Object.freeze({ bonds: Object.freeze(['lateranoShip']), consume: 6, addA: 3, addB: 6, capA: 18, capB: 36 }),
  }),
]);

/** The name part of a charId (`char_4231_clemnt` → `clemnt`). @param {string} charId @returns {string} */
export function promotedName(charId) {
  const m = /^char_(?:\d+_)?(.+)$/.exec(String(charId));
  return m ? m[1] : String(charId);
}

/** The two chess ids of a promoted operator (`a` normal, `b` elite). @param {string} charId */
export function promotedChessIds(charId) {
  const base = `chess_${String(charId)}`;   // char_4231_clemnt → chess_char_4231_clemnt
  return { a: `${base}_a`, b: `${base}_b` };
}

/** The two 特质 ids of a promoted operator (the owner's `garrison_fork_*` rule); `suffix` names a second effect's pair. */
export function promotedGarrisonIds(charId, suffix = '') {
  const base = `garrison_fork_${promotedName(charId)}${suffix}`;
  return { a: `${base}_a`, b: `${base}_b` };
}

/** `[{ charId, a, b }]` — the base chess ids a kit must be aliased for (server/sim/content/kits/index.js). */
export function promotedKitAliases() {
  return PROMOTED_PIECES.map((p) => ({ charId: p.charId, ...promotedChessIds(p.charId) }));
}
