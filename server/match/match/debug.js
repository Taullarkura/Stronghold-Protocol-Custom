// server/match/match/debug.js — Match method: the 开发控制台 (debug console). `g.debug { op, id?, n? }` from a seat whose
// nickname is DEBUG_NAME (shared/constants.js) grants that seat 干员 / 装备 or funds, so in-game behaviour (a kit, a
// 召唤物, a merge, an economy rule) can be tested in a real match without playing up to it.
//
// The gate is by nickname, and it is the *server* that enforces it: a seat with any other name is answered exactly like
// an unknown intent (BAD_MSG), so nothing tells it a console exists. This is a testing convenience, never a permission
// system — anyone may type the nickname (shared/constants.js DEBUG_NAME says so). Nothing here can touch another
// player: every op reads and writes `ps` only, and the seats of one match share nothing but the pools, which the grants
// take from like any other gain (buy / reward).
//
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { DEBUG_FUNDS_STEP, DEBUG_NAME, ERR, PHASE } from '../../../shared/constants.js';
import { OK, fail } from './common.js';

/**
 * Phases a 干员 / 装备 grant may land in: the hand and the board only exist around prep (the same set g.unitStats
 * answers in). Funds are a plain number the shop spends later, so they are granted in any phase.
 */
const GRANT_PHASES = [PHASE.ROUND_START, PHASE.SP_DRAFT, PHASE.PREP];

export class MatchDebug {
  /** Is this seat the debug console's? (The nickname of the seat, never a bot's — bots have generated names.) */
  isDebugSeat(ps) {
    return !!ps && !ps.isBot && ps.name === DEBUG_NAME;
  }

  /**
   * g.debug { op, id?, n? } — the sender grants itself something (see the header). Ops:
   *   funds { n = DEBUG_FUNDS_STEP }   add n funds (negative spends; the balance stops at 0)
   *   chess { id }                     acquire one 干员 (a base or an 精锐 id) into the hand / overflow temp
   *   item  { id }                     acquire one 装备 (a base or a golden id), like a purchase
   * @param {import('../PlayerState.js').PlayerState} ps
   * @param {{ op: string, id?: string, n?: number }} msg
   * @returns {{ ok: true } | { error: string, detail?: string }}
   */
  debugConsole(ps, msg) {
    if (!this.isDebugSeat(ps)) return fail(ERR.BAD_MSG);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    switch (msg.op) {
      case 'funds': return this._debugFunds(ps, msg.n);
      case 'chess': return this._debugChess(ps, msg.id);
      case 'item': return this._debugItem(ps, msg.id);
      default: return fail(ERR.BAD_MSG);
    }
  }

  _debugFunds(ps, n) {
    const amount = Number.isFinite(n) ? Math.trunc(n) : DEBUG_FUNDS_STEP;
    ps.addFunds(amount, { reason: 'debug' });
    return OK;
  }

  _debugChess(ps, id) {
    if (!GRANT_PHASES.includes(this.phase)) return fail(ERR.WRONG_PHASE);
    if (typeof id !== 'string' || !id) return fail(ERR.BAD_MSG, 'id required');
    const rec = ps.gd.chess(id);
    // an unfilled 自选 slot has no body to gain (the same rule as a purchase / a reward)
    if (!rec || (rec.isDiy && !rec.diyFor)) return fail(ERR.BAD_TARGET, 'unknown chess');
    // a full hand refuses the gain (acquireChess toasts 整备区已满 and returns null)
    return ps.acquireChess(id, { source: 'debug' }) ? OK : fail(ERR.HAND_FULL);
  }

  _debugItem(ps, id) {
    if (!GRANT_PHASES.includes(this.phase)) return fail(ERR.WRONG_PHASE);
    if (typeof id !== 'string' || !id) return fail(ERR.BAD_MSG, 'id required');
    if (!ps.gd.item(id)) return fail(ERR.BAD_TARGET, 'unknown item');
    // the stock check a purchase makes (buy / pickReward): a golden item out of stock is refused, not merged
    if (!this.itemPool.canGain(id)) return fail(ERR.SOLD_OUT);
    return ps.acquireItem(id, { source: 'debug' }) ? OK : fail(ERR.HAND_FULL);
  }
}
