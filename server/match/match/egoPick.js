// server/match/match/egoPick.js — FORK: the E.G.O 饰品 / 苦难 pick (PHASE.EGO_PICK).
// Every player opens their own three-way offer at once (unlike the 机变 draft, which is one shared pool taken in turn —
// todoList: 各玩家独立界面). Each option pairs one E.G.O 饰品 (a global effect for the player who picked it) with one
// 苦难 (a buff for that player's enemies). A refresh costs the picker's own funds and re-rolls the three options, at most
// EGO_REFRESH_MAX times per pick.
// Installed on Match.prototype by server/match/Match.js (a method container: never instantiated; `this` is the match).

import { PHASE, ERR } from '../../../shared/constants.js';
import { rollEgoOffer, scaleEgoEffects, EGO_BOSS_DIVISOR } from '../../../shared/ego.js';
import { createRng, deriveSeed } from '../../sim/rng.js';
import { OK, fail, DELAYS } from './common.js';

/** Options of one pick (todoList: 三选一). */
export const EGO_OFFER_SIZE = 3;
/** Refreshes of one pick (todoList: 每次选择最多 2 次刷新). */
export const EGO_REFRESH_MAX = 2;
/** Funds a refresh costs (todoList: 可消耗 1 资金刷新). */
export const EGO_REFRESH_COST = 1;

export class MatchEgoPick {
  /**
   * Opens the pick for this round: phase EGO_PICK, one offer per alive player, one shared deadline.
   * Nothing is drawn when the data file is missing or empty — the phase is skipped, never left empty.
   */
  enterEgoPick() {
    // the room option is the only gate (Match.egoEnabled): off ⇒ the round never reaches here, and a stray call skips it
    if (!this.egoEnabled) { this.afterEgoPick(); return; }
    const ego = this.gd.ego;
    const alive = this.alivePlayers();
    if (!ego || !alive.length) { this.afterEgoPick(); return; }
    const seats = new Map();
    for (const ps of alive) seats.set(ps.playerId, this._egoSeat(ps, 'initial'));
    if (![...seats.values()].some((s) => s.options.length)) { this.afterEgoPick(); return; }
    this.phase = PHASE.EGO_PICK;
    this.ego = { round: this.round, seats, untimed: this.soloUntimed, deadline: 0, closed: false };
    this.startEgoTurn();
  }

  /**
   * One seat's offer, drawn from that seat's own stream (`ego:<round>:<seat>:<salt>`) so the result does not depend on the
   * order players act in — a refresh re-draws the same way, and the other seats' options never move.
   * @param {import('../PlayerState.js').PlayerState} ps @param {string} salt
   */
  _egoSeat(ps, salt) {
    const ego = this.gd.ego;
    const rng = createRng(deriveSeed(this.seed, `ego:${this.round}:${ps.seat}:${salt}`));
    const options = rollEgoOffer(rng, {
      trinkets: ego.trinkets, hardships: ego.hardships, tiers: ego.tiers, count: EGO_OFFER_SIZE,
    });
    return {
      id: `ego.${this.round}.${ps.seat}`,
      refreshes: 0,
      options: options.map((o) => ({ trinketId: o.trinket.id, hardshipId: o.hardship.id, tier: o.tier })),
      picked: null,
    };
  }

  /** The seat's pick record, or null. */
  egoSeat(ps) {
    return this.ego && ps ? this.ego.seats.get(ps.playerId) ?? null : null;
  }

  /**
   * The own pick as the client draws it (m.private.ego): the three options with their records, the refresh state and the
   * cost. Null outside the phase, so an m.private without a pick stays byte-identical to a normal one.
   * The trinket / hardship records come from the local data file — the client only needs what it shows.
   */
  egoViewFor(ps) {
    const e = this.ego;
    const seat = this.egoSeat(ps);
    if (!e || !seat || this.phase !== PHASE.EGO_PICK) return null;
    return {
      id: seat.id,
      round: e.round,
      refreshes: seat.refreshes,
      refreshMax: EGO_REFRESH_MAX,
      refreshCost: EGO_REFRESH_COST,
      funds: ps.funds,
      untimed: !!e.untimed,
      deadline: e.deadline || 0,
      turnSeconds: e.untimed ? 0 : this.egoTurnSeconds(),
      picked: seat.picked ? seat.picked.idx : null,
      options: seat.options.map((o, idx) => ({
        idx,
        tier: o.tier,
        trinket: this.egoRecordView(this.gd.trinket(o.trinketId)),
        hardship: this.egoRecordView(this.gd.hardship(o.hardshipId)),
      })),
    };
  }

  /**
   * The fields of a 饰品 / 苦难 record the interface shows. `short` is the card's one-line summary (the pick overlay
   * shows that, not `desc` — a long description overflowed the card), and the full `desc` is what the in-match effect
   * list (public/js/ui/effectsList.js) reads from the player's `effects` entry.
   */
  egoRecordView(rec) {
    if (!rec) return null;
    return { id: rec.id, name: rec.name, short: rec.short, desc: rec.desc, tier: rec.tier, icon: rec.icon || rec.id };
  }

  /** Players still undecided (the deadline resolves them). */
  egoWaiting() {
    if (!this.ego) return [];
    const out = [];
    for (const ps of this.alivePlayers()) {
      const seat = this.ego.seats.get(ps.playerId);
      if (seat && seat.picked == null) out.push(ps);
    }
    return out;
  }

  /** Starts (or restarts) the phase clock; a bot takes its option when its turn would idle. */
  startEgoTurn() {
    const e = this.ego;
    if (!e) return;
    this.cancel(this._egoTimer);
    this._egoTimer = null;
    if (!this.egoWaiting().length) { this.setDeadline(0); this.finishEgoPick(); return; }
    if (e.untimed) this.setDeadline(0);
    else {
      const secs = this.egoTurnSeconds();
      const token = ++this._turnToken;
      this.setDeadline(secs, () => {
        if (this.phase !== PHASE.EGO_PICK || !this.ego || token !== this._turnToken) return;
        this._egoDeadline();
      });
      e.deadline = this.deadline;
    }
    // the offer itself is private (m.private.ego): every undecided player is told, not only the ones that act
    for (const ps of this.egoWaiting()) {
      this.markPrivate(ps);
      if (ps.botControlled) this.scheduleEgoBot(ps);
    }
    this.markPublic();
  }

  /** Pick window length: timers.egoPick (solo and lone-human matches are untimed — Match.soloUntimed). */
  egoTurnSeconds() {
    const secs = Number(this.gd.timer('egoPick'));
    return Number.isFinite(secs) && secs > 0 ? secs : 25;
  }

  scheduleEgoBot(ps) {
    const token = this._turnToken;
    this.later(this.scaled(DELAYS.BOT_ACTION), () => {
      if (this.phase !== PHASE.EGO_PICK || !this.ego || token !== this._turnToken) return;
      const seat = this.egoSeat(ps);
      if (!seat || seat.picked != null || !ps.botControlled) return;
      this._egoApply(ps, this.botPickEgoIndex(seat));
    });
  }

  /** A bot takes the first option (the offer is already random); no refresh — its funds are the economy's business. */
  botPickEgoIndex(seat) {
    return seat && seat.options.length ? 0 : -1;
  }

  /**
   * `g.trinket { idx, pickId }` — the caller's own option.
   * `pickId` is the seat id the client was shown, so a stale overlay (a refresh in another tab) cannot pick the wrong card.
   */
  pickEgo(ps, idx, pickId) {
    if (this.phase !== PHASE.EGO_PICK || !this.ego) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    const seat = this.egoSeat(ps);
    if (!seat) return fail(ERR.WRONG_PHASE);
    if (seat.picked != null) return fail(ERR.ALREADY);
    if (pickId !== undefined && pickId !== null && pickId !== seat.id) return fail(ERR.BAD_TARGET, 'offer changed');
    if (!Number.isInteger(idx) || idx < 0 || idx >= seat.options.length) return fail(ERR.BAD_TARGET);
    this._egoApply(ps, idx);
    return OK;
  }

  /**
   * `g.trinketRefresh { pickId }` — re-rolls the caller's three options against their own funds.
   * Refused (nothing charged, nothing drawn) on a closed offer, the refresh cap, or funds below the cost.
   */
  refreshEgo(ps, pickId) {
    if (this.phase !== PHASE.EGO_PICK || !this.ego) return fail(ERR.WRONG_PHASE);
    if (!ps.alive) return fail(ERR.ELIMINATED);
    const seat = this.egoSeat(ps);
    if (!seat) return fail(ERR.WRONG_PHASE);
    if (seat.picked != null) return fail(ERR.ALREADY);
    if (pickId !== undefined && pickId !== null && pickId !== seat.id) return fail(ERR.BAD_TARGET, 'offer changed');
    if (seat.refreshes >= EGO_REFRESH_MAX) return fail(ERR.RATE);
    if (ps.funds < EGO_REFRESH_COST) return fail(ERR.NO_FUNDS);
    const next = this._egoSeat(ps, `refresh:${seat.refreshes + 1}`);
    if (!next.options.length) return fail(ERR.BAD_TARGET);
    if (!ps.spend(EGO_REFRESH_COST)) return fail(ERR.NO_FUNDS);
    seat.refreshes++;
    seat.options = next.options;
    this.markPrivate(ps);
    this.markPublic();
    return OK;
  }

  /** Applies one option of the seat: the trinket effects on the player, the hardship on that player's enemies. */
  _egoApply(ps, idx) {
    const e = this.ego;
    const seat = this.egoSeat(ps);
    if (!e || !seat || seat.picked != null) return;
    const opt = seat.options[idx];
    if (!opt) return;
    const trinket = this.gd.trinket(opt.trinketId);
    const hardship = this.gd.hardship(opt.hardshipId);
    if (trinket) this.addEgoRef(ps, trinket, { hardship: false });
    if (hardship) this.addEgoRef(ps, hardship, { hardship: true });
    seat.picked = { idx, trinketId: opt.trinketId, hardshipId: opt.hardshipId, tier: opt.tier };
    this.markPrivate(ps);
    this.markPublic();
    if (!this.egoWaiting().length) this.finishEgoPick();
  }

  /**
   * Writes one record into `ps.effects`, the list both the meta dispatcher (effectsMeta.js step 6, key `ego:<id>`) and
   * the battle (round.js battleInput → playerEffects → server/sim/content/ego.js) read.
   * A hardship's stored params are the full-strength effects with `scope: 'own'`; battleInput scales them at the boss
   * rounds (1/3, floored) and widens the scope, so the record itself never depends on the round.
   */
  addEgoRef(ps, rec, { hardship = false } = {}) {
    if (!rec || !Array.isArray(rec.effects) || !rec.effects.length) return null;
    const key = `${hardship ? 'ego:hs:' : 'ego:'}${rec.id}`;
    const ref = {
      id: `${key}#${this.nextUid()}`,
      key,
      name: rec.name,
      desc: rec.desc,
      // 'ego' is the client's icon family (public/js/ui/assetUrls.js effectIconUrl → the local `ego` art group, whose
      // entries are keyed by record id: server/http/localEgoArt.js); iconId is the display name the effect list shows
      iconKind: 'ego',
      iconId: rec.icon || rec.id,
      battle: true,
      params: {
        effects: rec.effects.map((x) => ({ kind: x.kind, params: { ...(x.params || {}) } })),
        scope: hardship ? 'own' : undefined,
        tier: rec.tier,
        egoKind: hardship ? 'hardship' : 'trinket',
      },
      data: { egoId: rec.id, hardship },
    };
    ps.effects.push(ref);
    ps.dirty();
    return ref;
  }

  /** The deadline: everyone still undecided takes their first option, then the phase closes. */
  _egoDeadline() {
    for (const ps of this.egoWaiting()) {
      const seat = this.egoSeat(ps);
      if (seat && seat.options.length) this._egoApply(ps, this.botPickEgoIndex(seat));
    }
    this.finishEgoPick();
  }

  finishEgoPick() {
    if (this.phase !== PHASE.EGO_PICK) return;
    this.cancel(this._egoTimer);
    this._egoTimer = null;
    this.setDeadline(0);
    this.ego = null;
    this.markPublic();
    this.afterEgoPick();
  }

  /** Continuation: the round's 机变 draft when this round has one, else the prep (as afterRoundStart did before). */
  afterEgoPick() {
    if (this.gd.spRounds().includes(this.round)) this.enterSpDraft();
    else this.beforePrepOffers();
  }

  /** A hardship's spawn-level effects (extra enemies / faster waves) at `round`, scaled at the boss rounds. */
  egoSpawnMods(ps, round = this.round) {
    if (!this.egoEnabled) return { extra: 0, fasterPct: 0 };
    const boss = this.gd.egoBossRounds.includes(round);
    let extra = 0;
    let fasterPct = 0;
    for (const ref of ps.effects || []) {
      if (!ref || typeof ref.key !== 'string' || !ref.key.startsWith('ego:hs:')) continue;
      const effects = boss && ref.params ? scaleEgoEffects(ref.params.effects || [], EGO_BOSS_DIVISOR) : (ref.params && ref.params.effects) || [];
      for (const eff of effects) {
        const p = eff && eff.params;
        if (!p) continue;
        if (eff.kind === 'extraEnemies') extra += Math.max(0, Number(p.count) || 0);
        else if (eff.kind === 'fasterSpawns') fasterPct += Math.max(0, Number(p.pct) || 0);
      }
    }
    return { extra, fasterPct: Math.min(90, fasterPct) };
  }
}
