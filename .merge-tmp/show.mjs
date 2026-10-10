// 合并辅助：导出指定文件里的冲突块（含上下文与行号）。用完即删。
import { readFileSync } from 'node:fs';

const pad = Number(process.env.PAD ?? 3);
for (const f of process.argv.slice(2)) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { console.log(`===== ${f} (读取失败) =====\n`); continue; }
  const lines = text.split('\n');
  console.log(`===== ${f} =====`);
  let inC = false, start = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('<<<<<<<')) {
      inC = true;
      for (let j = Math.max(0, i - pad); j < i; j++) console.log(`   ${j + 1}: ${lines[j]}`);
    }
    if (inC) console.log(`${i + 1}: ${l}`);
    if (l.startsWith('>>>>>>>')) {
      inC = false;
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + pad); j++) console.log(`   ${j + 1}: ${lines[j]}`);
      console.log('');
    }
  }
  const n = lines.filter((l) => l.startsWith('<<<<<<<')).length;
  console.log(`-- ${n} 个冲突块 --\n`);
}
