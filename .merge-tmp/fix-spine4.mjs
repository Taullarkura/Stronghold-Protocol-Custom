// 去掉 spine.js 两处残留的 >>>>>>> upstream/master 标记行。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/render/spine.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const swap = (from, to, label) => {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`[${label}] 锚点缺失`);
  if (text.indexOf(from, i + 1) >= 0) throw new Error(`[${label}] 锚点重复`);
  text = text.slice(0, i) + to + text.slice(i + from.length);
  console.log(`[${label}] ok`);
};

swap('  }\n\n>>>>>>> upstream/master\n  /**\n   * The equipped skill', '  }\n\n  /**\n   * The equipped skill', 'spine-a');
swap('      return;\n>>>>>>> upstream/master\n    }\n    const dur = this.dur(set.clip)', '      return;\n    }\n    const dur = this.dur(set.clip)', 'spine-b');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('spine.js 残留标记已清除');
