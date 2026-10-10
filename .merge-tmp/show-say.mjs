// 打印上游 game.js 里含 sayResult 的那一段（按行号）。
import { execFileSync } from 'node:child_process';
const src = execFileSync('git', ['show', 'upstream/master:public/js/screens/game.js'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const lines = src.split('\n');
const at = lines.findIndex((l) => l.includes('function sayResult'));
console.log(`sayResult @ ${at + 1}`);
for (let i = Math.max(0, at - 14); i < Math.min(lines.length, at + 30); i++) console.log(`${i + 1}: ${lines[i]}`);
