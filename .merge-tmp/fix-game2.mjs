// 删除 game.js 中所有独占一行的 ">>>>>>> upstream/master" 残留标记。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/screens/game.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const lines = text.split('\n');
const keep = lines.filter((l) => l !== '>>>>>>> upstream/master');
const removed = lines.length - keep.length;
if (removed === 0) throw new Error('没有可删除的标记行');
writeFileSync(file, crlf ? keep.join('\n').replace(/\n/g, '\r\n') : keep.join('\n'));
console.log(`删除 ${removed} 行残留标记`);
