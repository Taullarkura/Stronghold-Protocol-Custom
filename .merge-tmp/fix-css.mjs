// 把 fork 侧 CSS 里仍是固定 rem 的 font-size 改成 calc(x * var(--t))（上游 text-scale 测试要求：只有字号读 --t）。
import { readFileSync, writeFileSync } from 'node:fs';

const pairs = [
  ['public/css/components.css', 'font-size:max(.15rem, 10px)', 'font-size:max(calc(.15 * var(--t)), 10px)'],
  ['public/css/devices.css', 'font-size:max(.2rem, 12px)', 'font-size:max(calc(.2 * var(--t)), 12px)'],
  ['public/css/devices.css', 'font-size:max(.15rem, 11px)', 'font-size:max(calc(.15 * var(--t)), 11px)'],
  ['public/css/devices.css', 'font-size:max(.14rem, 8px)', 'font-size:max(calc(.14 * var(--t)), 8px)'],
  ['public/css/devices.css', 'font-size:max(.12rem, 7px)', 'font-size:max(calc(.12 * var(--t)), 7px)'],
  ['public/css/devices.css', 'font-size:max(.17rem, 9px)', 'font-size:max(calc(.17 * var(--t)), 9px)'],
  ['public/css/devices.css', 'font-size:max(.14rem, 9px)', 'font-size:max(calc(.14 * var(--t)), 9px)'],
  ['public/css/devices.css', 'font-size:max(.12rem, 8px)', 'font-size:max(calc(.12 * var(--t)), 8px)'],
  ['public/css/resources.css', 'font-size:.2rem', 'font-size:calc(.2 * var(--t))'],
  ['public/css/resources.css', 'font-size:.16rem', 'font-size:calc(.16 * var(--t))'],
  ['public/css/resources.css', 'font-size:.15rem', 'font-size:calc(.15 * var(--t))'],
  ['public/css/screens/game-panels.css', 'font-size:.14rem', 'font-size:calc(.14 * var(--t))'],
  ['public/css/screens/game.css', 'font-size:.14rem', 'font-size:calc(.14 * var(--t))'],
  ['public/css/screens/lobby.css', 'font-size:max(.18rem, 12px)', 'font-size:max(calc(.18 * var(--t)), 12px)'],
  ['public/css/screens/lobby.css', 'font-size:max(.2rem, 13px)', 'font-size:max(calc(.2 * var(--t)), 13px)'],
  ['public/css/screens/lobby.css', 'font-size:max(.15rem, 10px)', 'font-size:max(calc(.15 * var(--t)), 10px)'],
  ['public/css/screens/room.css', 'font-size:.18rem', 'font-size:calc(.18 * var(--t))'],
  ['public/css/screens/room.css', 'font-size:.11rem', 'font-size:calc(.11 * var(--t))'],
  ['public/css/screens/room.css', 'font-size:.2rem', 'font-size:calc(.2 * var(--t))'],
  ['public/css/screens/room.css', 'font-size:.15rem', 'font-size:calc(.15 * var(--t))'],
  ['public/css/screens/room.css', 'font-size:.16rem', 'font-size:calc(.16 * var(--t))'],
  ['public/css/screens/title.css', 'font-size:.13rem', 'font-size:calc(.13 * var(--t))'],
  ['public/css/screens/title.css', 'font-size:.23rem', 'font-size:calc(.23 * var(--t))'],
  ['public/css/screens/title.css', 'font-size:max(.13rem, 10px)', 'font-size:max(calc(.13 * var(--t)), 10px)'],
];

const byFile = new Map();
for (const [f, a, b] of pairs) {
  if (!byFile.has(f)) byFile.set(f, []);
  byFile.get(f).push([a, b]);
}
for (const [f, list] of byFile) {
  const raw = readFileSync(f, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  for (const [a, b] of list) {
    const n = text.split(a).length - 1;
    if (n !== 1) throw new Error(`${f}: "${a}" 出现 ${n} 次（期望 1）`);
    text = text.replace(a, b);
  }
  writeFileSync(f, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log(`${f}: ${list.length} 处已改`);
}
