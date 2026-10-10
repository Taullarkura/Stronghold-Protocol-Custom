// 文档类冲突的智能并集：相同的取一份；一边包含另一边取超集；否则两边都保留（ours 在前）。
import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
const clean = (s) => s.replace(/^\n+|\n+$/g, '');
let total = 0;
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  let n = 0;
  // 逐个冲突块处理（非贪婪到结束标记）
  text = text.replace(/^<<<<<<< HEAD\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> upstream\/master\n?/gm, (_m, ours, theirs) => {
    n++;
    const a = clean(ours), b = clean(theirs);
    if (a === b) return a ? `${a}\n` : '';
    if (b && a.includes(b)) return `${a}\n`;
    if (a && b.includes(a)) return `${b}\n`;
    return `${a}\n\n${b}\n`;
  });
  const left = (text.match(/^(<<<<<<<|=======|>>>>>>>)/gm) || []).length;
  writeFileSync(f, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log(`${f}: ${n} 块，剩余标记 ${left}`);
  total += n;
}
console.log(`共 ${total} 块`);
