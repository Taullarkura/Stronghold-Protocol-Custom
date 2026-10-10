// 把 fork 的 7 名联动干员资源条目并入 data/assets.json（上游 0.2.3 的清单 + fork 的联动干员）。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const IDS = ['char_456_ash', 'char_1029_yato2', 'char_1048_orchd2', 'char_4123_ela', 'char_4141_marcil', 'char_4182_oblvns', 'char_4217_makoto'];

const cur = JSON.parse(readFileSync('data/assets.json', 'utf8'));
const fork = JSON.parse(execFileSync('git', ['show', 'HEAD:data/assets.json'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));

const added = { chars: [], voice: [], voiceJp: [], sfx: [] };
for (const id of IDS) {
  if (fork.chars?.[id] && !cur.chars[id]) { cur.chars[id] = fork.chars[id]; added.chars.push(id); }
  for (const [from, to] of [['voice', 'voice'], ['voiceJp', 'voiceJp']]) {
    const src = fork.audio?.[from]?.[id];
    if (src && !(cur.audio[to] && cur.audio[to][id])) {
      cur.audio[to] = cur.audio[to] || {};
      cur.audio[to][id] = src;
      added[to].push(id);
    }
  }
  const sfx = fork.audio?.sfx?.units?.[id];
  if (sfx && !(cur.audio.sfx.units && cur.audio.sfx.units[id])) {
    cur.audio.sfx.units = cur.audio.sfx.units || {};
    cur.audio.sfx.units[id] = sfx;
    added.sfx.push(id);
  }
}
writeFileSync('data/assets.json', JSON.stringify(cur));
console.log('added:', JSON.stringify(added));
console.log('chars:', Object.keys(cur.chars).length, 'voice:', Object.keys(cur.audio.voice || {}).length);
