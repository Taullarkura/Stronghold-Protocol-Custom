import { PHASE } from './shared/constants.js';
import { makeMatch } from './test/match/harness.js';

const REHEARSAL_LEAKS = [2, 1, 0];
const rehearsalScript = () => {
  const seen = new Map();
  return (b) => {
    if (!String(b.fieldId).startsWith('r:')) return null;
    const key = `${b.fieldId}:${b.round}`;
    const i = seen.get(key) ?? 0;
    seen.set(key, i + 1);
    return { leaks: { [b.fieldId.slice(2)]: REHEARSAL_LEAKS[i % REHEARSAL_LEAKS.length] } };
  };
};

const workSlice = { prepSteps: 4, simulationTicks: 512, prepSimulationTicks: 4 };
const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 12, fake: true, botRehearsal: 3, script: rehearsalScript(), workSlice }).start();
const m = h.m;
try {
  console.log('botSliceMs', m.botSliceMs, 'prepSimulationTicks', workSlice.prepSimulationTicks);
  h.toPrep(3);
  const bot = h.ps('ai_0');
  const ticks = new Map();
  const newBattle = m.newBattle.bind(m);
  m.newBattle = (opts) => {
    const b = newBattle(opts);
    if (String(opts.fieldId).startsWith('r:')) {
      const step = b.step.bind(b);
      b.step = () => { ticks.set(h.sched.executed, (ticks.get(h.sched.executed) || 0) + 1); return step(); };
    }
    return b;
  };
  h.run(() => bot.ready);
  console.log('per-callback ticks', [...ticks.entries()].sort((a, b) => a[0] - b[0]));
  console.log('max', Math.max(...ticks.values()), 'limit', workSlice.prepSimulationTicks);
  console.log('errors', m.errorCount);
} finally { m.dispose(); }
