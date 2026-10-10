// 精确区间替换：把 [startText, endText) 之间的内容换成 newFile 的内容（endText 保留）。
// 用法：node replace-between.mjs <target> <startText> <endText> <newFile>
import { readFileSync, writeFileSync } from 'node:fs';

const [target, startText, endText, newPath] = process.argv.slice(2);
const raw = readFileSync(target, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const start = text.indexOf(startText);
if (start < 0) { console.error('未找到起始锚点，未修改'); process.exit(1); }
if (text.indexOf(startText, start + 1) >= 0) { console.error('起始锚点出现多次，未修改'); process.exit(1); }
const end = text.indexOf(endText, start + startText.length);
if (end < 0) { console.error('未找到结束锚点，未修改'); process.exit(1); }
const next = readFileSync(newPath, 'utf8').replace(/\r\n/g, '\n');
text = text.slice(0, start) + next + text.slice(end);
writeFileSync(target, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log(`已替换区间：${end - start} 字符 → ${next.length} 字符`);
