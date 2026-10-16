import { test } from 'node:test';
import { makeMatch, checkInvariants } from './harness.js';
import { attachRehearsalHost } from './simClient.js';
import { PHASE } from '../../shared/constants.js';

const SOLO_SEATS = [
  { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true },
  { seat: 1, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true },
  { seat: 2, playerId: 'ai_1', name: 'AI1', isBot: true, connected: true },
  { seat: 3, playerId: 'ai_2', name: 'AI2', isBot: true, connected: true },
];
const TINY_SLICE = 1e-9;

function recordBuilds(h) {
  const built = [];
  const newBattle = h.m.newBattle.bind(h.m);
  h.m.newBattle = (input) => {
    if (input && String(input.fieldId).startsWith('r:')) built.push({ fieldId: String(input.fieldId), round: h.m.round, at: h.sched.executed });
    return newBattle(input);
  };
  return built;
}

test('DEBUG exact playSolo', () => {
  const o = { botRehearsalDelegate: true, hostId: 'p_0' };
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats: SOLO_SEATS, seed: 6, botRehearsal: 3, botSliceMs: TINY_SLICE, ...o });
  h.start();
  const built = recordBuilds(h);
  const host = attachRehearsalHost(h, {});
  const reached = h.drive(() => h.ended != null || (h.m.phase === PHASE.SETTLE && h.m.round === 3), { ready: true, maxSteps: 8e6 });
  console.log('reached', reached, 'phase', h.m.phase, 'R' + h.m.round, 'executed', h.sched.executed, 'pending', h.sched.pending(), 'tasks', host.tasks.length, 'answered', host.answered);
  console.log('errors', h.m.errorCount, h.m.errors?.slice(0, 2), 'schedErrors', h.sched.errors.length, h.sched.errors.slice(0, 2).map((e) => String(e && e.message)));
  for (const ps of h.m.order) {
    const r = ps._botPrep;
    console.log('  ', ps.playerId, 'ready', ps.ready, 'stage', r?.stage, 'pend', r?.job?.pending, 'done', r?.job?.done, 'reh', r?.rehearsed);
  }
  console.log('built', built.length);
  checkInvariants(h.m);
});
