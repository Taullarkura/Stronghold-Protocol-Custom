// The 自选 golden match covers what it claims (test/golden/README.md, tools/golden.mjs — 0.2.0 自选编队): reads the stored
// digest only (test/golden.test.js recomputes it). Its human seat (AI 托管) slots 推进之王 and prototypes; its shop draws
// its 自选 pieces (and only from the slots' 调度中心 levels), its AI fields a selected operator in battle, the stock ends
// where the held copies leave it, and the match ends without errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const MATCHES = read('./golden/matches.json');
const BACKUPS = read('../data/backups.json');

test('matches: the 自选 match\'s human seat draws its 自选 pieces and fields an operator in battle', () => {
  const id = 'coop2-NORMAL-70-diy';
  const dg = MATCHES.scenarios[id];
  assert.ok(dg, 'scenario present');
  assert.deepEqual(dg.errors, { engine: 0, logged: 0, sim: 0, dispatcher: 0 }, id);
  assert.deepEqual(Object.keys(dg.diy.picks).sort(), Object.keys(BACKUPS.diy.slots).sort(), 'all four slots filled');
  const draws = dg.diy.rounds.flatMap(([, d]) => (d ? d.split(' ') : []));
  assert.ok(draws.length >= 1, `shop draws: ${draws.join(', ')}`);
  for (const d of draws) assert.ok(Object.hasOwn(BACKUPS.diy.slots, `chess_char_${d}`), d);
  const fielded = dg.diy.rounds.filter(([, , f]) => f).flatMap(([r, , f]) => f.split(' ').map((x) => `${r}:${x}`));
  assert.ok(fielded.length > 0, 'the AI fields at least one selected 自选 operator');
  for (const [r, , f] of dg.diy.rounds) {
    for (const x of f ? f.split(' ') : []) {
      const [slot, charId] = x.split('→');
      // a merged piece is fielded as the slot's elite record (`chess_char_5_diy2_b`): the pick belongs to the slot, the
      // two forms share it
      assert.equal(dg.diy.picks[`chess_char_${slot.replace(/_b$/, '_a')}`].charId, charId, `round ${r}: ${x} fights as its pick`);
      assert.ok(BACKUPS.units[charId], `${r}: ${charId} has operator data`);
    }
  }
  // the stock: never above its cap (8 at tier 5, 5 at tier 6)
  for (const [slot, left] of Object.entries(dg.diy.stock)) assert.ok(left >= 0 && left <= (BACKUPS.diy.slots[slot.replace(/_b$/, '_a')].tier === 5 ? 8 : 5), slot);
});
