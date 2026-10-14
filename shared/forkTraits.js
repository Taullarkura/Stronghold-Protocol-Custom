// shared/forkTraits.js — FORK EXTENSION: the 特质 (garrison) record shapes this fork authors itself, because the official
// tables have no record with those numbers (docs/DATA.md §4, docs/design/fork.md §F8).
//
// Consumers include the owner's 2026-10-12/13 plans: 特质 records re-authored by shared/chessAdjust.js or granted by a
// chess, and promoted pieces (shared/promoted.js).
// A record produced here is shaped exactly like the official one it mirrors, so `tools/build-data.mjs` can drop it into
// data/garrisons.json and `server/sim/content/garrisons/meta.js` applies it by `effectKey` like any other.
//
// The effect key is an OFFICIAL one: `<休整期结束时>本回合每刷新过1次，使已激活的【X】层数+N（每回合至多M层）` is
// SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER (阿罗玛's garrison_122 叙拉古+奥术, 安洁莉娜's garrison_147 叙拉古), and the
// handler reads one value per listed bond — `bb.multiplier` / `bb.max_layer` hold a comma list when a record states
// several (the SERVER_ADD_MULTIPLE_BOND convention, garrison_156's `bbStr.count` "6,3"), a single number otherwise.

/** The official effect key of a "每刷新过1次" layer gain (server/sim/content/garrisons/meta.js). */
export const REFRESH_LAYER_EFFECT = 'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER';

export const FREEZE_TRAIT_ADJUSTMENTS = Object.freeze([
  Object.freeze({
    traitId: 'gnosis',
    normalId: 'garrison_fork_gnosis_freeze_a',
    eliteId: 'garrison_fork_gnosis_freeze_b',
    ownerNormal: 'chess_char_4_13_a',
    ownerElite: 'chess_char_4_13_b',
    bonds: Object.freeze(['skillfulShip']),
    addNormal: 1,
    addElite: 2,
    prob: 0.5,
    replacements: Object.freeze([
      Object.freeze({ chessId: 'chess_char_4_13_a', from: 'garrison_111_a', to: 'garrison_fork_gnosis_freeze_a' }),
      Object.freeze({ chessId: 'chess_char_4_13_b', from: 'garrison_111_b', to: 'garrison_fork_gnosis_freeze_b' }),
    ]),
  }),
  Object.freeze({
    traitId: 'silverash',
    normalId: 'garrison_fork_silverash_freeze_a',
    eliteId: 'garrison_fork_silverash_freeze_b',
    ownerNormal: 'chess_char_4_22_a',
    ownerElite: 'chess_char_4_22_b',
    bonds: Object.freeze(['kjeragShip']),
    addNormal: 1,
    addElite: 2,
    prob: 0.6,
    replacements: Object.freeze([
      Object.freeze({ chessId: 'chess_char_4_22_a', from: 'garrison_28_a', to: 'garrison_fork_silverash_freeze_a' }),
      Object.freeze({ chessId: 'chess_char_4_22_b', from: 'garrison_28_b', to: 'garrison_fork_silverash_freeze_b' }),
    ]),
  }),
  Object.freeze({
    traitId: 'silverash2',
    normalId: 'garrison_fork_silverash2_freeze_a',
    eliteId: 'garrison_fork_silverash2_freeze_b',
    ownerNormal: null,
    ownerElite: null,
    bonds: Object.freeze(['kjeragShip', 'swiftShip']),
    addNormal: 1,
    addElite: 2,
    prob: 0.5,
    replacements: Object.freeze([]),
  }),
]);

export function freezeBondTrait({ garrisonId, owner, bonds, bondNames, add, prob }) {
  const bondTags = bondNames.map((name) => `【${name}】`).join('');
  const probability = `${Math.round(prob * 100)}%`;
  const text = `<战斗中>每当范围内1名敌人进入冻结时，有${probability}概率使已激活的${bondTags}层数+${add}`;   // i18n-ignore: 特质 text (data/garrisons.json)
  return {
    garrisonId,
    desc: text,
    descRaw: text.replace(/\+\d+/, '<@ba.vup>$&</>'),
    eventType: 'IN_BATTLE',
    eventTypeDesc: '持续叠加',   // i18n-ignore: the official 事件类型 text
    eventTypeIcon: 'icon_bond',
    effectType: 'ADD_BOND',
    effectKey: 'act1autochess_gar_event_enemy_abflag_inrange',
    battleRuneKey: 'char_dynamic_ability_new',
    charLevel: 0,
    bb: { check_ab_flag: 16, bond_add_count: add, prob },
    bbStr: {
      key: 'act1autochess_gar_event_enemy_abflag_inrange',
      bond_type: 'bond_by_id',
      bond_id: bonds.join(','),
      bond_add_type: 'by_count',
    },
    owners: owner ? [owner] : [],
  };
}

export function applyFreezeTraitReplacements(chess) {
  for (const trait of FREEZE_TRAIT_ADJUSTMENTS) {
    for (const { chessId, from, to } of trait.replacements) {
      const record = chess[chessId];
      if (!record) throw new Error(`freeze trait ${trait.traitId}: missing chess ${chessId}`);
      const index = record.garrisonIds.indexOf(from);
      if (index < 0) throw new Error(`freeze trait ${trait.traitId}: ${chessId} does not carry ${from}`);
      record.garrisonIds[index] = to;
    }
  }
}

/**
 * One 特质 record of `<休整期结束时>本回合每刷新过1次，使已激活的【X】层数+N（每回合至多M层）`, `per` / `cap` one value per
 * bond (a single bond gives the official scalar blackboard).
 * @param {{ garrisonId: string, owner: string, bonds: string[], bondNames: string[], per: number[], cap: number[] }} p
 *   `bonds` the 盟约 ids (data), `bondNames` their names as the desc spells them (`叙拉古`), `per` / `cap` aligned with them
 * @returns {object} the data/garrisons.json record
 */
export function refreshLayerTrait({ garrisonId, owner, bonds, bondNames, per, cap }) {
  const n = bondNames.length;
  const at = (list, i) => Number(list[i] ?? list[list.length - 1] ?? 0);
  const gain = bondNames.map((name, i) => `【${name}】层数+${at(per, i)}`).join('、');   // i18n-ignore: 特质 text (data/garrisons.json)
  const capText = n > 1 ? `每回合至多${cap.map((_, i) => at(cap, i)).join('层/')}层` : `每回合至多${at(cap, 0)}层`;   // i18n-ignore: as above
  const desc = `<休整期结束时>本回合每刷新过1次，使已激活的${gain}（${capText}）`;   // i18n-ignore: as above
  const first = /(【[^】]+】层数\+)(\d+)/.exec(desc);
  const descRaw = first ? desc.replace(first[0], `${first[1]}<@ba.vup>${first[2]}</>`) : desc;
  return {
    garrisonId,
    desc, descRaw,
    eventType: 'SERVER_PREP_FIN', eventTypeDesc: '持续叠加', eventTypeIcon: 'icon_bond',   // i18n-ignore: the official 事件类型 text
    effectType: REFRESH_LAYER_EFFECT, effectKey: REFRESH_LAYER_EFFECT,
    battleRuneKey: null, charLevel: 0,
    bb: n > 1
      ? { multiplier: per.map((_, i) => at(per, i)).join(','), max_layer: cap.map((_, i) => at(cap, i)).join(',') }
      : { multiplier: at(per, 0), max_layer: at(cap, 0) },
    // "此干员在整备区时也有效" is NOT stated: like 安洁莉娜's official record, the trait only fires while the operator is on
    // the board (server/match/effectsMeta.js skips hand pieces for this conditionkey)
    bbStr: { bond: bonds.join(','), conditionkey: 'character_target_inboard' },
    owners: [owner],
  };
}
