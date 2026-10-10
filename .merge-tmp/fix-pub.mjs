// 处理 game.js 的 cardRange 重复、public/index.html 与 public/dev/game-mock.js 的冲突。
import { readFileSync, writeFileSync } from 'node:fs';

const files = ['public/js/screens/game.js', 'public/index.html', 'public/dev/game-mock.js'];
const state = new Map();
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  state.set(f, { crlf: raw.includes('\r\n'), text: raw.replace(/\r\n/g, '\n') });
}

const once = (f, from) => {
  const { text } = state.get(f);
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`[${f}] 锚点缺失: ${JSON.stringify(from.slice(0, 50))}`);
  if (text.indexOf(from, i + 1) >= 0) throw new Error(`[${f}] 锚点重复: ${JSON.stringify(from.slice(0, 50))}`);
  return i;
};
const swap = (f, from, to, label) => {
  const s = state.get(f);
  const i = once(f, from);
  s.text = s.text.slice(0, i) + to + s.text.slice(i + from.length);
  console.log(`[${label}] ok`);
};
// 区间替换（含 endText 本身，即把结束锚点也吃掉）
const cutIn = (f, startText, endText, newText, label) => {
  const s = state.get(f);
  const i = once(f, startText);
  const e = s.text.indexOf(endText, i + startText.length);
  if (e < 0) throw new Error(`[${label}] 结束锚点缺失`);
  s.text = s.text.slice(0, i) + newText + s.text.slice(e + endText.length);
  console.log(`[${label}] ok`);
};

// ---- game.js：上游的 inspectRange 版 block 已在正文里，删掉 fork 那份重复的 cardRange -----------------
cutIn('public/js/screens/game.js',
  '  // the range of the operator whose card is open without a selection (issue #8): an own board piece opened read-only',
  '  }, [view, cardRangeKey]);\n', '', 'game-cardRange');
swap('public/js/screens/game.js',
  "import { needsFacing, facingIntent, previewGrid, pieceDir, underframeActions, retreatSlot, itemDestroyable, unitRange } from '../ui/facing.js';",
  "import { needsFacing, facingIntent, previewGrid, pieceDir, underframeActions, retreatSlot, itemDestroyable } from '../ui/facing.js';",
  'game-facing-import');

// ---- index.html：manifest + 图标集（上游）与 fork 的内联 SVG 图标 --------------------------------------
const iconLine = /^ {2}<link rel="icon" href="data:image\/svg\+xml,[^\n]*$/m.exec(state.get('public/index.html').text);
if (!iconLine) throw new Error('[index.html] 找不到内联 SVG 图标行');
cutIn('public/index.html', '<<<<<<< HEAD\n  <link rel="icon" href="data:image/svg+xml,', '>>>>>>> upstream/master\n',
  '  <link rel="manifest" href="/manifest.json" />\n'
  + '  <link rel="icon" href="/icons/favicon.ico" sizes="16x16 32x32 48x48" />\n'
  + '  <link rel="icon" href="/icons/favicon-16.png" type="image/png" sizes="16x16" />\n'
  + '  <link rel="icon" href="/icons/favicon-32.png" type="image/png" sizes="32x32" />\n'
  + '  <link rel="icon" href="/icons/app.svg" type="image/svg+xml" sizes="any" />\n'
  + '  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />\n'
  + '  <!-- Install as an app (PWA): the manifest and its icons (the inline SVG is this fork\'s tab icon); js/ui/install.js\n'
  + '       offers the title screen\'s 安装 button. -->\n'
  + iconLine[0] + '\n',
  'index-icons');

cutIn('public/index.html', '<<<<<<< HEAD\n    <div class="rotate-hint__tip">', '>>>>>>> upstream/master\n',
  '    <div class="rotate-hint__tip">转不过来？iPhone 请在控制中心关闭「竖屏方向锁定」，Android 请开启「自动旋转」</div>\n'
  + '    <button type="button" class="rotate-hint__fs">全屏并横屏</button>\n'
  + '    <button type="button" hidden class="btn btn--secondary btn--sm rotate-hint__pwa" id="rotate-hint-pwa">添加到桌面</button>\n',
  'index-rotate');

// ---- public/dev/game-mock.js：保留 fork 的 mockRoom()，并合上上游的 hurtDevice 钩子 --------------------
cutIn('public/dev/game-mock.js', '<<<<<<< HEAD\n    room: mockRoom(),\n', '>>>>>>> upstream/master\n', '    room: mockRoom(),\n', 'mock-room');
cutIn('public/dev/game-mock.js', '<<<<<<< HEAD\n  globalThis.__MOCK__ = { store, S: () => S, setPhase, setPlayers,', '>>>>>>> upstream/master\n',
  '  globalThis.__MOCK__ = { store, S: () => S, setPhase, setPlayers, mutate: (fn) => { fn(S); refreshPrivate(); }, pushPublic: () => pushPublic(),\n'
  + '    hurtDevice: (i, dmg) => S?.battle?.hurtDevice?.(i, dmg) ?? false };\n',
  'mock-globals');

for (const f of files) {
  const s = state.get(f);
  writeFileSync(f, s.crlf ? s.text.replace(/\n/g, '\r\n') : s.text);
}
console.log('完成');
