// Which tokens exist in the fork's manifest (git HEAD) but not in the merged one, and vice versa.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const cwd = 'H:/StrongholdProtocol_Custom';
const mine = JSON.parse(fs.readFileSync(`${cwd}/data/assets.json`, 'utf8'));
const fork = JSON.parse(execFileSync('git', ['show', 'HEAD:data/assets.json'], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }));

const a = new Set(Object.keys(mine.tokens ?? {})), b = new Set(Object.keys(fork.tokens ?? {}));
console.log('only in the fork:', [...b].filter((k) => !a.has(k)).join(', ') || '(none)');
console.log('only in the merged:', [...a].filter((k) => !b.has(k)).join(', ') || '(none)');
console.log('stats merged:', JSON.stringify(mine.stats));
console.log('stats fork  :', JSON.stringify(fork.stats));
