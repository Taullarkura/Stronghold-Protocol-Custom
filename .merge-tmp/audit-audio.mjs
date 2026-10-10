// 合并辅助：统计全仓库对 audio.* 的调用面，并检查上游版 audio.js 是否提供这些成员。用完即删。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', 'public/js'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const used = new Map();
for (const f of files) {
  if (f.endsWith('/audio.js')) continue;
  let t;
  try { t = readFileSync(f, 'utf8'); } catch { continue; }
  for (const m of t.matchAll(/\baudio\.([A-Za-z_]\w*)/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(f);
  }
}

const theirs = execFileSync('git', ['show', ':3:public/js/audio.js'], { encoding: 'utf8' });
const ours = execFileSync('git', ['show', ':2:public/js/audio.js'], { encoding: 'utf8' });
const has = (src, name) => new RegExp(`(^|[^\\w.])${name}\\s*[(:]`, 'm').test(src) || new RegExp(`this\\.${name}\\b`).test(src);

const rows = [...used.keys()].sort();
console.log('member                  theirs ours  callers');
for (const n of rows) {
  const t = has(theirs, n), o = has(ours, n);
  console.log(`${n.padEnd(22)} ${t ? 'yes' : 'NO '}   ${o ? 'yes' : 'NO '}  ${[...used.get(n)].length}`);
}
