// Player report F2 after 0.1.0 (2026-10-03): the "购买" counters must not be spent by a free acquisition. The report's
// case was 休露丝 【雪域礼赠】 (band_sciurus first_buy_in_round_char_price_change {price 1, bond kjeragShip}), whose
// effect the fork replaced on 2026-10-14 (shared/bandAdjust.js), so only 玛恩纳 【业务指标】's counter is left to pin the
// rule: "每购买一名<卡西米尔>干员" counts a shop purchase (g.buy → onBuy) alone, so a free acquisition — the promotion
// reward, 寻呼模块's / an item's pick-one offer, a grant — leaves the round's state for the next one bought.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';

const OK = { ok: true };
const slot = (id) => ({ kind: 'chess', id, basePrice: DATA.chess[id].tier === 1 ? 2 : DATA.chess[id].tier <= 4 ? 3 : 4, frozen: false, sold: false });
const NOT_BOND_T1 = Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && c.tier === 1 && !c.bonds.includes('kjeragShip') && !c.bonds.includes('kazimierzShip')).chessId;

/** Solo match at R1 prep with an empty board, 50 funds, shop level 3 and `band`; the shop = `shop` chess ids. */
function setup(band, shop) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 3 }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.offers.length = 0;
  ps.funds = 50; ps.counters = {}; ps.pendingFunds = 0; ps.shop.level = 3; ps.bandId = band;
  ps.shop.slots = shop.map(slot);
  ps.recompute();
  return { h, m, ps };
}

test('F2 玛恩纳 业务指标: only a shop purchase of a <卡西米尔> pays the next round\'s +1 (a free reward pick does not)', () => {
  const kz = Object.values(DATA.chess).filter((c) => c.visible && !c.isGolden && c.tier <= 3 && c.bonds.includes('kazimierzShip')).map((c) => c.chessId);
  const s = setup('band_mlynar', [kz[0], kz[1], NOT_BOND_T1]);
  s.ps.pushRewardOffer('merge', { ids: [kz[2] ?? kz[0]] });
  assert.deepEqual(s.m.handle('p_0', { t: 'g.reward', idx: 0 }), OK);
  assert.equal(s.ps.pendingFunds, 0, 'a free <卡西米尔> pays nothing');
  assert.deepEqual(s.m.handle('p_0', { t: 'g.buy', slot: 0 }), OK);
  assert.equal(s.ps.pendingFunds, 1, 'a bought <卡西米尔>: +1 next round');
});
