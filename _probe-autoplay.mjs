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
console.log('sched.virtual', match.sched.virtual, 'botSliceMs', match.botSliceMs, 'workSlice', JSON.stringify(match.workSlice));
match.start();
match.handle('h1', { t: 'g.autoplay', on: true });
let n = 0;
for (let i = 0; i < 200 && match.phase !== PHASE.PREP; i++) { clock.now = Math.max(clock.now, match.sched.nextAt()); match.pump(clock.now, 1, { remaining: 1 }); n++; }
console.log('phase', match.phase, 'after', n, 'callbacks');
const h1 = match.players.get('h1');
console.log('h1', h1.playerId, 'botControlled', h1.botControlled, 'ready', h1.ready, 'deploy', h1.deployCount);
// count callbacks until h1 readies
let c = 0;
while (!h1.ready && c < 1000) {
  clock.now = Math.max(clock.now, match.sched.nextAt());
  const budget = { remaining: 1 };
  let any = false;
  while (!h1.ready && match.pump(clock.now, 1, budget)) { any = true; c++; }
  if (!any && !match.sched.pending()) break;
}
console.log('callbacks until ready', c, 'ready', h1.ready, 'phase', match.phase);
match.dispose();
