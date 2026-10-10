// 按「选择器作用域」把 fork 侧固定 rem 的 font-size 改成 calc(x * var(--t))。
// 每条：（文件, 选择器, 旧声明, 新声明）
import { readFileSync, writeFileSync } from 'node:fs';

const entries = [
  ['public/css/components.css', '.presence', 'max(.15rem, 10px)', 'max(calc(.15 * var(--t)), 10px)'],
  ['public/css/devices.css', '.queue-panel__time, .queue-panel__body b', 'max(.2rem, 12px)', 'max(calc(.2 * var(--t)), 12px)'],
  ['public/css/devices.css', '.queue-panel .btn', 'max(.15rem, 11px)', 'max(calc(.15 * var(--t)), 11px)'],
  ['public/css/devices.css', '.funds__label', 'max(.14rem, 8px)', 'max(calc(.14 * var(--t)), 8px)'],
  ['public/css/devices.css', '.dstat__k', 'max(.12rem, 7px)', 'max(calc(.12 * var(--t)), 7px)'],
  ['public/css/devices.css', '.dstat__v', 'max(.17rem, 9px)', 'max(calc(.17 * var(--t)), 9px)'],
  ['public/css/devices.css', '.dtrait', 'max(.14rem, 9px)', 'max(calc(.14 * var(--t)), 9px)'],
  ['public/css/devices.css', '.dgarrison__k', 'max(.14rem, 8px)', 'max(calc(.14 * var(--t)), 8px)'],
  ['public/css/devices.css', '.dhead__pos', 'max(.12rem, 8px)', 'max(calc(.12 * var(--t)), 8px)'],
  ['public/css/resources.css', '.resource-stat', '.2rem', 'calc(.2 * var(--t))'],
  ['public/css/resources.css', '.resource-message', '.16rem', 'calc(.16 * var(--t))'],
  ['public/css/resources.css', '.resource-note', '.15rem', 'calc(.15 * var(--t))'],
  ['public/css/screens/game-panels.css', '.spov__order--dense .spov__idx', '.14rem', 'calc(.14 * var(--t))'],
  ['public/css/screens/game-panels.css', '.spov__order--dense .spov__wname', '.14rem', 'calc(.14 * var(--t))'],
  ['public/css/screens/game.css', '.spectator-presence', '.14rem', 'calc(.14 * var(--t))'],
  ['public/css/screens/lobby.css', '.queue-panel__title', 'max(.18rem, 12px)', 'max(calc(.18 * var(--t)), 12px)'],
  ['public/css/screens/lobby.css', '.queue-panel__time', 'max(.2rem, 13px)', 'max(calc(.2 * var(--t)), 13px)'],
  ['public/css/screens/lobby.css', '.queue-panel__body', 'max(.15rem, 10px)', 'max(calc(.15 * var(--t)), 10px)'],
  ['public/css/screens/lobby.css', '.queue-panel__body b', 'max(.2rem, 13px)', 'max(calc(.2 * var(--t)), 13px)'],
  ['public/css/screens/room.css', '.seats--wide .seat__no', '.18rem', 'calc(.18 * var(--t))'],
  ['public/css/screens/room.css', '.seats--wide .seat__host', '.11rem', 'calc(.11 * var(--t))'],
  ['public/css/screens/room.css', '.seats--wide .seat__bot-label', '.11rem', 'calc(.11 * var(--t))'],
  ['public/css/screens/room.css', '.seats--wide .seat__name', '.2rem', 'calc(.2 * var(--t))'],
  ['public/css/screens/room.css', '.seats--wide .seat__state', '.15rem', 'calc(.15 * var(--t))'],
  ['public/css/screens/room.css', '.seats--wide .seat__wait', '.16rem', 'calc(.16 * var(--t))'],
  ['public/css/screens/title.css', '.title-login__identity > span', '.13rem', 'calc(.13 * var(--t))'],
  ['public/css/screens/title.css', '.title-login__identity > strong', '.23rem', 'calc(.23 * var(--t))'],
  ['public/css/screens/title.css', '.title-foot .presence', 'max(.13rem, 10px)', 'max(calc(.13 * var(--t)), 10px)'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 旧声明 → 允许任意空白的正则（font-size 与 max(...) 内都可有多余空格）
const declRe = (decl) => new RegExp('font-size:\\s*' + esc(decl).replace(/\\ /g, '\\s*'), 'g');

const byFile = new Map();
for (const e of entries) {
  if (!byFile.has(e[0])) byFile.set(e[0], []);
  byFile.get(e[0]).push(e);
}

for (const [file, list] of byFile) {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  for (const [, selector, oldDecl, newDecl] of list) {
    const selRe = new RegExp(esc(selector) + '\\s*[,{]');
    const m = selRe.exec(text);
    if (!m) throw new Error(`[${file}] 找不到选择器 ${selector}`);
    // 从选择器处找到块起始 '{' 与配对的 '}'
    let i = m.index + m[0].length - 1;
    if (m[0].endsWith(',')) { const b = text.indexOf('{', i); if (b < 0) throw new Error(`[${file}] ${selector}: 无块`); i = b; }
    let depth = 0, end = -1;
    for (let k = i; k < text.length; k++) {
      if (text[k] === '{') depth++;
      else if (text[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) throw new Error(`[${file}] ${selector}: 块未闭合`);
    const block = text.slice(i, end + 1);
    const re = declRe(oldDecl);
    const hits = block.match(re);
    if (!hits || hits.length !== 1) throw new Error(`[${file}] ${selector}: 声明 ${oldDecl} 命中 ${hits ? hits.length : 0} 次`);
    const nextBlock = block.replace(re, `font-size:${newDecl}`);
    text = text.slice(0, i) + nextBlock + text.slice(end + 1);
  }
  writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log(`${file}: ${list.length} 处`);
}
