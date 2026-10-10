// 精确字面量替换：old.txt → new.txt（只用一次），失败即报错。用法：node exact-replace.mjs <target> <old> <new>
import { readFileSync, writeFileSync } from 'node:fs';

const [target, oldPath, newPath] = process.argv.slice(2);
const raw = readFileSync(target, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');
const oldStr = readFileSync(oldPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
const newStr = readFileSync(newPath, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');

const first = text.indexOf(oldStr);
if (first < 0) { console.error('未找到匹配文本，未修改'); process.exit(1); }
if (text.indexOf(oldStr, first + 1) >= 0) { console.error('匹配到多处，未修改'); process.exit(1); }
text = text.slice(0, first) + newStr + text.slice(first + oldStr.length);
writeFileSync(target, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log(`已替换（原 ${oldStr.length} 字符 → 新 ${newStr.length} 字符）`);
