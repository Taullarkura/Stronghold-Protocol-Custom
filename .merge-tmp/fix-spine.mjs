// 一次性解决 public/js/render/spine.js 的 6 个冲突（锚点精确替换，失败即报错）。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/render/spine.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const fix = (startText, endText, newText, label) => {
  const s = text.indexOf(startText);
  if (s < 0) throw new Error(`[${label}] 起始锚点缺失`);
  if (text.indexOf(startText, s + 1) >= 0) throw new Error(`[${label}] 起始锚点重复`);
  const e = text.indexOf(endText, s + startText.length);
  if (e < 0) throw new Error(`[${label}] 结束锚点缺失`);
  text = text.slice(0, s) + newText + text.slice(e);
  console.log(`[${label}] ${e - s} → ${newText.length} 字符`);
};

// h1：文件头的说明（fork 的动画规则 + 上游的 poseHeld / attack mode 两条）
fix('<<<<<<< HEAD\n//\n// As the original', '//\n//   update(dt)', // 占位，下面会用更精确的锚点重做
  '', 'h1a');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
