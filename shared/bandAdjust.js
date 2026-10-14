// shared/bandAdjust.js — FORK EXTENSION: the owner's adjustments to OFFICIAL strategies (bands, data/bands.json), the
// 策略 counterpart of shared/chessAdjust.js (an official 可用干员) and shared/promoted.js (a 自选干员 promoted).
//
// An adjustment REPLACES a strategy's effect: tools/build-data.mjs re-authors its `buffs` and its text from those numbers
// (so text and blackboard cannot drift) and leaves everything else — the 效果 name, the icon, the starting LP, the sort
// order, the unlock condition — the official record's own. The buff keys are OFFICIAL ones, so the sim applies the new
// effect by `buff.key` (server/sim/content/bands/meta.js K) with no new effect code.
//
// An empty list restores upstream's data.

/** The official buff key of "<count> random operators (of `bond`, when the blackboard names one) every `coin_cnt` funds
 * spent, tier ≤ shop level" (绮良 通关奖励; the fork's 休露丝 雪域礼赠). */
export const SPEND_GAIN_CHAR_KEY = 'band_coin_cost_gain_random_char_by_shop_level';

/**
 * @typedef {{ bandId: string, label: string, bond: string, bondLabel: string, coinCnt: number, count: number,
 *   keepNote: boolean }} BandAdjustment
 */

/** Every strategy this fork adjusts. @type {readonly Readonly<BandAdjustment>[]} */
export const BAND_ADJUSTMENTS = Object.freeze([
  Object.freeze({
    bandId: 'band_sciurus',      // 休露丝
    label: '休露丝',              // i18n-ignore: the strategy's own data name
    bond: 'kjeragShip',
    bondLabel: '谢拉格',          // i18n-ignore: a 盟约's own name (data/bonds.json), spelled as the effect text does
    coinCnt: 23,                 // 每累计花费23资金
    count: 1,                    // 获得一名…
    // the official note the strategy's text carries while its effect needs that bond's operators: kept below the body
    keepNote: true,
  }),
]);

/**
 * The effect of an adjusted strategy: its text (composed from the numbers above) and its buffs.
 * @param {Readonly<BandAdjustment>} a
 * @param {string} effectName the official record's 效果 name (【雪域礼赠】)
 * @returns {{ desc: string, descRaw: string, buffs: Array<{key: string, bb: object, bbStr: object}>, params: object }}
 */
export function bandAdjustmentEffect(a, effectName) {
  const body = `每累计花费${a.coinCnt}资金，获得一名随机的<${a.bondLabel}>干员（等级不超过当前调度中心等级）`;   // i18n-ignore: 策略 text (data/bands.json)
  const note = `在<${a.bondLabel}>部分干员缺席时体验可能不完整`;   // i18n-ignore: as above
  const bbStr = { bond: a.bond };
  return {
    desc: `【${effectName}】${body}${a.keepNote ? `\n${note}` : ''}`,
    descRaw: `【${effectName}】${body}${a.keepNote ? `\n<@ba.vdown>${note}</>` : ''}`,
    buffs: [{ key: SPEND_GAIN_CHAR_KEY, bb: { coin_cnt: a.coinCnt, count: a.count }, bbStr }],
    params: { coin_cnt: a.coinCnt, count: a.count, ...bbStr },
  };
}

/**
 * The adjustment of a strategy, or null. @param {string} bandId @returns {Readonly<BandAdjustment>|null}
 */
export function bandAdjustmentOf(bandId) {
  return BAND_ADJUSTMENTS.find((a) => a.bandId === bandId) ?? null;
}
