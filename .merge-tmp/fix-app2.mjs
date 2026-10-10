// 修复 public/js/render/app.js 的三处遗留：A 缺 ctx 对象收尾、B 缩进、D pickImpostorInterval 头部被吃。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/render/app.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const swap = (from, to) => {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`锚点缺失: ${JSON.stringify(from.slice(0, 50))}`);
  if (text.indexOf(from, i + 1) >= 0) throw new Error(`锚点重复: ${JSON.stringify(from.slice(0, 50))}`);
  text = text.slice(0, i) + to + text.slice(i + from.length);
};

// A：ctx 对象字面量的收尾
swap('    viewport: () => vp,\n  const tiles = new TileField(', '    viewport: () => vp,\n  };\n  const tiles = new TileField(');

// B：3D canvas 变量的缩进
swap('\n\n    let board3dCanvas = null;', '\n\n  let board3dCanvas = null;');

// D：pickImpostorInterval 的头部（上游原文）被前一次编辑吞掉
const lines = text.split('\n');
const at = lines.findIndex((l) => l.startsWith('  }ice (load level'));
if (at < 0) throw new Error('未找到 pickImpostorInterval 的断行');
lines[at] = [
  '  }',
  '  function pickImpostorInterval() {',
  '    let n = 0;',
  '    for (const v of views.values()) if (v.actor && v.spineReady) n++;',
  '    const q = settings.quality;',
  "    const base = (q === 'low' ? 12 : q === 'medium' ? 26 : 44) / (1 + loadLevel);",
  '    if (n <= base) return 0;',
  '    // a struggling device (load level ≥ 2) may refresh a big crowd more rarely (10 Hz at worst)',
].join('\n');
text = lines.join('\n');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('app.js 三处遗留已修复');
