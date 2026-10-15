// 开发控制台 (the in-match debug console, shared/constants.js DEBUG_NAME): the server gate (only a seat with that
// nickname is answered — anyone else gets BAD_MSG like an unknown intent) and the three ops (funds / chess / item) on a
// real match, including the refusals a plain gain has (a full hand, an unfilled 自选 slot, an unknown id, stock, phase).
// docs/design/network.md g.debug.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInvariants, makeMatch } from './harness.js';
import { DEBUG_FUNDS_STEP, DEBUG_NAME, ERR, PHASE } from '../../shared/constants.js';

const seats = (names = [DEBUG_NAME, 'Bystander']) => names.map((name, i) => ({ seat: i, playerId: `p_${i}`, name, isBot: false, connected: true }));

/** A match whose first seat (p_0) carries the debug nickname, driven to PREP of round 1. */
function toPrep(names) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: seats(names), seed: 11 }).start();
  h.toPrep(1);
  return h;
}

const dbg = (h, fields, playerId = 'p_0') => h.m.handle(playerId, { t: 'g.debug', ...fields });

/** A visible base chess id whose 精锐 exists (gd.visibleChess is the id list). */
function anyChess(h) {
  const id = h.m.gd.visibleChess.find((c) => h.m.gd.goldenIdOf(c));
  assert.ok(id, 'no base chess with a 精锐');
  return id;
}

/** A shop item id the item pool can still hand out. */
function anyItem(h) {
  const id = Object.keys(h.m.data.items).find((i) => h.m.itemPool.canGain(i));
  assert.ok(id, 'no item with stock');
  return id;
}

test('the console: funds / chess / item are granted to the debug seat, and its view is pushed', () => {
  const h = toPrep();
  const ps = h.ps('p_0');

  const funds0 = ps.funds;
  assert.deepEqual(dbg(h, { op: 'funds' }), { ok: true });
  assert.equal(ps.funds, funds0 + DEBUG_FUNDS_STEP, 'no `n` → the default step');
  assert.deepEqual(dbg(h, { op: 'funds', n: -25 }), { ok: true });
  assert.equal(ps.funds, funds0 + DEBUG_FUNDS_STEP - 25, 'a negative n spends');
  h.m.flush(true);
  assert.equal(h.lastTo('p_0', 'm.private').funds, ps.funds, 'm.private carries the new balance');

  const chessId = anyChess(h);
  assert.deepEqual(dbg(h, { op: 'chess', id: chessId }), { ok: true });
  assert.ok(ps.allChess().some((c) => c.id === chessId), 'the operator is in the hand (or the overflow temp)');

  const itemId = anyItem(h);
  assert.deepEqual(dbg(h, { op: 'item', id: itemId }), { ok: true });
  h.m.flush(true);
  const priv = h.lastTo('p_0', 'm.private');
  assert.ok([...priv.hand, ...priv.temp].some((p) => p && p.kind === 'item' && p.id === itemId), 'the item is in the hand');

  h.invariants();
});

test('the console: three copies of one operator merge into the 精锐 (the same rule as a purchase)', () => {
  const h = toPrep();
  const ps = h.ps('p_0');
  const base = anyChess(h);
  const golden = h.m.gd.goldenIdOf(base);
  for (let i = 0; i < 3; i++) assert.deepEqual(dbg(h, { op: 'chess', id: base }), { ok: true }, `copy ${i + 1}`);
  assert.ok(ps.allChess().some((c) => c.id === golden), `three copies → ${golden}`);
  h.invariants();
});

test('the console: a seat with any other nickname gets BAD_MSG — the same answer as an unknown intent', () => {
  const h = toPrep();
  const bystander = h.ps('p_1');
  const funds0 = bystander.funds;
  const chessId = anyChess(h);
  for (const fields of [{ op: 'funds', n: 500 }, { op: 'chess', id: chessId }, { op: 'item', id: anyItem(h) }]) {
    assert.deepEqual(dbg(h, fields, 'p_1'), { error: ERR.BAD_MSG }, `${fields.op} refused`);
  }
  assert.equal(bystander.funds, funds0, 'nothing changed for it');
  assert.ok(!bystander.allChess().some((c) => c.id === chessId), 'no operator granted');
  // an unknown intent of the same socket answers identically: the console is not distinguishable
  assert.deepEqual(h.m.handle('p_1', { t: 'g.nope' }), { error: ERR.BAD_MSG });
  // and the debug seat keeps its console
  assert.deepEqual(dbg(h, { op: 'funds', n: 1 }), { ok: true });
});

test('the console: refusals — unknown ids, an unfilled 自选 slot, a wrong phase, an eliminated seat', () => {
  const h = toPrep();
  assert.equal(dbg(h, { op: 'chess', id: 'chess_nope' }).error, ERR.BAD_TARGET);
  assert.equal(dbg(h, { op: 'chess' }).error, ERR.BAD_MSG, 'no id');
  assert.equal(dbg(h, { op: 'item', id: 'chess_item_nope' }).error, ERR.BAD_TARGET);
  const diySlot = Object.keys(h.m.gd._chess).find((id) => h.m.gd.chess(id).isDiy);
  if (diySlot) assert.equal(dbg(h, { op: 'chess', id: diySlot }).error, ERR.BAD_TARGET, 'an unfilled 自选 slot has no body');

  // funds land in any phase; a grant needs a prep phase
  h.runToPhase(PHASE.COMBAT);
  assert.deepEqual(dbg(h, { op: 'funds', n: 5 }), { ok: true }, 'funds are phase-less');
  assert.equal(dbg(h, { op: 'chess', id: anyChess(h) }).error, ERR.WRONG_PHASE);
  assert.equal(dbg(h, { op: 'item', id: anyItem(h) }).error, ERR.WRONG_PHASE);

  // an eliminated seat is refused like every other intent
  const other = toPrep();
  const p0 = other.ps('p_0');
  p0.lp = 0;
  p0.eliminate(other.m.round);
  assert.equal(dbg(other, { op: 'funds', n: 5 }).error, ERR.ELIMINATED);
});

test('the console: many random grants keep the pool accounting and the invariants (a 40-copy soak)', () => {
  const h = toPrep();
  const ps = h.ps('p_0');
  const ids = [...h.m.gd.visibleChess];
  const itemIds = Object.keys(h.m.data.items);
  // deterministic pseudo-random order: this is a soak, not a fuzzer
  const pick = (i) => (i * 7919) % ids.length;
  let granted = 0;
  for (let i = 0; i < 40; i++) {
    const res = i % 3 === 2 ? dbg(h, { op: 'item', id: itemIds[(i * 31) % itemIds.length] }) : dbg(h, { op: 'chess', id: ids[pick(i)] });
    if (res.ok) granted++;
    checkInvariants(h.m);
  }
  assert.ok(granted > 0, 'grants landed');
  assert.ok(ps.allChess().length + ps.temp.filter(Boolean).length > 0, 'pieces are held');
  assert.ok(ps.funds >= 0 && Number.isInteger(ps.funds));
});

test('the console: the funds balance stops at 0 and a full hand refuses a grant', () => {
  const h = toPrep();
  const ps = h.ps('p_0');
  ps.funds = 10;
  assert.deepEqual(dbg(h, { op: 'funds', n: -999 }), { ok: true });
  assert.equal(ps.funds, 0, 'never negative');
  h.invariants();

  // fill the hand (and the overflow temp) with single copies of distinct operators
  const ids = [...h.m.gd.visibleChess];
  const free = ps.hand.filter((p) => !p).length + ps.temp.filter((p) => !p).length;
  for (const id of ids.slice(0, free + 2)) dbg(h, { op: 'chess', id });
  assert.ok(ps.hand.every(Boolean) || ps.temp.every(Boolean), 'the 整备区 is full');
  const res = dbg(h, { op: 'chess', id: ids[ids.length - 1] });
  assert.ok(res.error, `a full 整备区 refuses the gain (${JSON.stringify(res)})`);
  h.invariants();
});
