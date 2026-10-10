// 一次性修复 public/js/render/app.js 的四处受损区（锚点区间精确替换）。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/render/app.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const fix = (startText, endText, newText) => {
  const s = text.indexOf(startText);
  if (s < 0) throw new Error(`起始锚点缺失: ${JSON.stringify(startText.slice(0, 40))}`);
  if (text.indexOf(startText, s + 1) >= 0) throw new Error(`起始锚点重复: ${JSON.stringify(startText.slice(0, 40))}`);
  const e = text.indexOf(endText, s + startText.length);
  if (e < 0) throw new Error(`结束锚点缺失: ${JSON.stringify(endText.slice(0, 40))}`);
  text = text.slice(0, s) + newText + text.slice(e);
  return e - s;
};

// A：ctx 的 impostorSlot / clipAllowed（重复了两次）
const a = fix('<<<<<<< HEAD\n=======\n    impostorSlot', '  const tiles = new TileField(',
  '    impostorSlot: () => impSlot++,\n    clipAllowed: () => clipAllowed,\n    viewport: () => vp,\n');

// B：artPromise 的早期等待（上游在函数末尾等，这里去掉重复）
const b = fix('<<<<<<< HEAD\n  await withTimeout(artPromise, waitFor(2500));\n=======\n', '    let board3dCanvas = null;', '\n');

// C：3D 棋盘的挂载（保留上游的 boardReady 绑定）
const c = fix('<<<<<<< HEAD\n  if (want3d) {', '  let offShadow = null;',
  '  // Attach the board only after synchronous setup completes; enable3d also guards late arrivals.\n'
  + '  const boardReady = Promise.all([threePromise, packPromise]).then(([THREE, pack]) => (THREE && pack ? enable3d(THREE, pack) : false), () => false);\n');

// D：Spine 裁剪遮罩的开关（上游的 pickClipping + fork 的说明）
const d = fix('<<<<<<< HEAD\n  // Spine clipping masks stay on:', '  let clipAllowed = true;',
  '  // Spine clipping masks (the eyelids on the current roster) each cost a stencil render-pass break (~2–5 ms of GPU on\n'
  + '  // tiled GPUs): kept only for a lone clipped skeleton at high quality; without them SpineActor hides the eyeball slots a\n'
  + '  // closed lid would cut (GitHub #177, spine.js _eyeMaskFallback). The fork kept them on for every clipped skeleton —\n'
  + '  // its battle chibis blink by switching the eye-cut clip of their eyes (32 operators) — and drew those through the\n'
  + '  // impostor atlas\'s clip pages (units.js), which keeps their stencil passes out of the main pass.\n');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log(`app.js 修复完成：A ${a} / B ${b} / C ${c} / D ${d} 字符`);
