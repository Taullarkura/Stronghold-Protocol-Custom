// 把 fork 测试里过时的 78 → 79（上游 0.2.3 新增 1 名 6★，本仓库再含 7 名联动）以及 diyPool 的期望长度。
import { readFileSync, writeFileSync } from 'node:fs';

const patch = (file, pairs) => {
  const raw = readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.replace(/\r\n/g, '\n');
  for (const [from, to, expect] of pairs) {
    const n = text.split(from).length - 1;
    if (n !== expect) throw new Error(`${file}: "${from.slice(0, 30)}" 出现 ${n} 次（期望 ${expect}）`);
    text = text.split(from).join(to);
  }
  writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
  console.log(`${file}: ok`);
};

patch('test/backups.test.js', [
  ['the 78 owned 6★', 'the 79 owned 6★', 2],
  ['assert.equal(ownedPool.length, 78);', 'assert.equal(ownedPool.length, 79);', 2],
  ["assert.equal(legal.length, 78, 'the excel\\'s 78 obtainable 6★ outside the chess pool');",
    "assert.equal(legal.length, 79, 'the excel\\'s 79 obtainable 6★ outside the chess pool');", 1],
]);
patch('test/diy.test.js', [
  ['tier 5 = 15 prototypes + 78 owned 6★, tier 6 = 9 + 78', 'tier 5 = 15 prototypes + 79 owned 6★, tier 6 = 9 + 79', 1],
  ['assert.deepEqual([p5.length, p6.length], [93, 87]);', 'assert.deepEqual([p5.length, p6.length], [94, 88]);', 1],
]);
