// Which golden scenarios moved (name-level) and which are new, after npm run golden:update.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const cwd = 'H:/StrongholdProtocol_Custom';
const files = ['roster.json', 'bonds.json', 'fields.json', 'diy.json', 'matches.json', 'standins.json'];
for (const f of files) {
  const rel = `test/golden/${f}`;
  const now = JSON.parse(fs.readFileSync(`${cwd}/${rel}`, 'utf8'));
  let old = null;
  try { old = JSON.parse(execFileSync('git', ['show', `HEAD:${rel}`], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })); } catch { /* new file */ }
  const shape = (o) => (Array.isArray(o) ? 'array' : typeof o);
  if (!old) { console.log(`${f}: new (${shape(now)})`); continue; }
  const keyOf = (o) => {
    if (o && typeof o === 'object' && !Array.isArray(o) && o.scenarios && typeof o.scenarios === 'object') return { map: o.scenarios, wrapper: o };
    if (o && typeof o === 'object' && !Array.isArray(o)) return { map: o, wrapper: null };
    return { map: null, wrapper: o };
  };
  const A = keyOf(old), B = keyOf(now);
  if (!A.map || !B.map) { console.log(`${f}: shape ${shape(old)} → ${shape(now)} (compared as a whole: ${JSON.stringify(old) === JSON.stringify(now) ? 'same' : 'differs'})`); continue; }
  const ka = Object.keys(A.map), kb = Object.keys(B.map);
  const added = kb.filter((k) => !A.map[k]);
  const removed = ka.filter((k) => !B.map[k]);
  const moved = kb.filter((k) => A.map[k] && JSON.stringify(A.map[k]) !== JSON.stringify(B.map[k]));
  console.log(`${f}: ${ka.length} → ${kb.length} scenarios · moved ${moved.length} · added ${added.length} · removed ${removed.length}`);
  for (const k of moved.slice(0, 12)) console.log(`   moved: ${k}`);
  if (moved.length > 12) console.log(`   … +${moved.length - 12} more moved`);
  for (const k of added.slice(0, 20)) console.log(`   added: ${k}`);
  for (const k of removed.slice(0, 20)) console.log(`   removed: ${k}`);
}
