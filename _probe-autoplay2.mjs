import { RecordedMatch } from './server/match/checkpoint.js';
import { PHASE } from './shared/constants.js';
import { DATA } from './test/match/harness.js';

const clock = { now: 1000 };
const options = {
  data: DATA, roomCode: 'ATOM', mode: 'coop', difficulty: 'NORMAL', seed: 17, matchNo: 1, clientCombat: true,
  verify: 'off',
  seats: [{ seat: 0, playerId: 'h0', name: 'H0', isBot: false, connected: true },
    { seat: 1, playerId: 'h1', name: 'H1', isBot: false, connected: true }],
  now: () => clock.now, send: () => true, broadcast() {}, onEnd() {},
};
const match = new RecordedMatch(options);
match.start();
match.handle('h1', { t: 'g.autoplay', on: true });
const pump = (limit) => {
  let n = 0;
  while (match.phase !== PHASE.PREP && n < limit) { clock.now = Math.max(clock.now, match.sched.nextAt()); match.pump(clock.now, 1, { remaining: 1 }); n++; }
  return n;
};
pump(200);
const h1 = match.players.get('h1');
// count pump() calls (each = one scheduler callback)
let callbacks = 0;
const budget = { remaining: 1 };
while (!h1.ready && match.phase === PHASE.PREP && callbacks < 2000) {
  clock.now = Math.max(clock.now, match.sched.nextAt());
  match.pump(clock.now, 1, budget);
  callbacks++;
}
console.log('pump callbacks until ready:', callbacks, 'ready', h1.ready);
console.log('sched.pending', match.sched.pending());
match.dispose();
