import { createRehearsalJob } from './server/match/bot.js';

// A stand-in match: candidate battles that step a fixed number of ticks.
class FakeBattle {
  constructor(ticks) { this.ticks = ticks; this.n = 0; this.finished = false; }
  step() { this.n++; if (this.n >= this.ticks) this.finished = true; }
  forceEnd() { this.finished = true; }
  result() { return { perPlayer: { p: { leaked: [], killed: 1 } } }; }
}
const m = {
  wave: { timeLimit: 60 },
  newBattle: () => new FakeBattle(1000),
};
const choices = { playerId: 'p' };
const inputs = [0, 1, 2].map((i) => ({ i }));
let calls = 0;
const job = createRehearsalJob(m, { playerId: 'p' }, [], [new Map(), new Map(), new Map()], inputs,
  inputs.map(() => { calls++; return new FakeBattle(1000); }));
for (const budget of [127, 3, 10]) {
  const job2 = createRehearsalJob(m, { playerId: 'p' }, [], [new Map(), new Map(), new Map()], inputs,
    inputs.map(() => new FakeBattle(1000)));
  let per = [];
  for (let k = 0; k < 5; k++) {
    const before = job2.ticks;
    job2.runTicks(budget);
    per.push(job2.ticks - before);
  }
  console.log('budget', budget, 'ticks per call', per, 'total', job2.ticks, 'done', job2.done);
}
