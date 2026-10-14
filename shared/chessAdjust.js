// shared/chessAdjust.js — FORK EXTENSION: the owner's adjustments to OFFICIAL 可用干员 (the plans of 2026-10-12 and
// 2026-10-13, docs/design/fork.md §F8 / §F9). Unlike shared/promoted.js (a 自选干员 becomes a 可用干员 of its own) and
// shared/diyOnly.js (a 可用干员 becomes a 自选干员), this table changes numbers of a chess the season already ships — its
// 等级 (tier, and with it the shop row's price and the shop pool it sits in) and, when stated, the 特质 records it carries.
//
// A trait adjustment names the OFFICIAL garrison ids it replaces and the numbers to replace them with; `tools/build-data.mjs`
// re-authors those records through shared/forkTraits.js and FORK_GARRISON_OVERRIDES' shape, so the sim still dispatches
// them by their official effectKey. An empty list restores upstream's data.

/**
 * @typedef {{ charId: string, label: string, chessId: string, tier?: number,
 *   trait?: { overrides: readonly string[], refresh: { bonds: readonly string[], perA: readonly number[],
 *     capA: readonly number[], perB: readonly number[], capB: readonly number[] } } }} ChessAdjustment
 */

/** Every official 可用干员 this fork adjusts (an empty list restores upstream's data).
 * @type {readonly Readonly<ChessAdjustment>[]} */
export const CHESS_ADJUSTMENTS = Object.freeze([
  Object.freeze({
    charId: 'char_291_aglina',                                        // 安洁莉娜, the season's 6★ SUPPORT slower
    label: '安洁莉娜',                                                 // i18n-ignore: the operator's own data name
    chessId: 'chess_char_5_20_a',                                     // her shop chess (tier 5 upstream)
    tier: 4,                                                          // 等级 5 → 4 (the tier's price row: 4 → 3 资金)
    trait: Object.freeze({
      overrides: Object.freeze(['garrison_147_a', 'garrison_147_b']), // the official 叙拉古-only refresh trait
      // <休整期结束时>本回合每刷新过1次，使已激活的【叙拉古】层数+2、【奇迹】层数+1（每回合至多8层/4层）
      // 精锐: 【叙拉古】+4、【奇迹】+2（每回合至多16层/8层）
      refresh: Object.freeze({
        bonds: Object.freeze(['siracusaShip', 'miraShip']),
        perA: Object.freeze([2, 1]), capA: Object.freeze([8, 4]),
        perB: Object.freeze([4, 2]), capB: Object.freeze([16, 8]),
      }),
    }),
  }),
  Object.freeze({
    charId: 'char_4058_pepe',                                         // 佩佩, the season's 6★ 近卫·撼地者 (a NORMAL row: its
    label: '佩佩',                                                     // i18n-ignore: the operator's own data name
    chessId: 'chess_char_6_06_a',                                     // 补位 stand-in is Sharp, char_609_acguad)
    tier: 5,                                                          // 等级 6 → 5 (the owner's plan of 2026-10-13; the
                                                                      // tier-5 price row is the same 4 资金)
  }),
]);

/** The 等级 this fork gives `baseId`, or null to keep the official one. @param {string} baseId @returns {number|null} */
export function adjustedTierOf(baseId) {
  const hit = CHESS_ADJUSTMENTS.find((a) => a.chessId === baseId);
  return hit && Number.isFinite(hit.tier) ? hit.tier : null;
}

/** Every 特质 override this fork states: `[{ garrisonId, refresh, charId, elite }]` (`_a` normal, `_b` elite). */
export function traitOverrides() {
  const out = [];
  for (const a of CHESS_ADJUSTMENTS) {
    const trait = a.trait;
    if (!trait) continue;
    for (const garrisonId of trait.overrides) {
      out.push({ garrisonId, charId: a.charId, refresh: trait.refresh, elite: /_b$/.test(garrisonId) });
    }
  }
  return out;
}
