// assets-diy.test.js：取上游版，并把「联动干员被排除」的那条断言换成 fork 策略（联动干员在本仓库是自选干员，保留全部资源）。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const file = 'test/assets-diy.test.js';
// 用上游版本覆盖（fork 版依赖已删除的 tools/assets/voice.mjs）
execFileSync('git', ['checkout', 'upstream/master', '--', file]);
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const COLLAB_BLOCK = [
  '// This fork (the owner\'s decision of 2026-10-08, tools/build-data.mjs FORK_INCLUDE_COLLAB_PICKS): the 7 collab 6★',
  '// upstream leaves out of 自选 for copyright are picks here, so the manifest carries their art too.',
  'const COLLAB = [\'char_456_ash\', \'char_1029_yato2\', \'char_1048_orchd2\', \'char_4123_ela\', \'char_4141_marcil\', \'char_4182_oblvns\', \'char_4217_makoto\'];',
  '',
  'test(\'the fork\\\'s 7 collab picks are 自选 picks here: nothing is left out and each keeps its art in data/assets.json\', () => {',
  '  const m = load(\'assets\');',
  '  assert.deepEqual(BACKUPS.diy.excluded, [], \'nothing left out\');',
  '  for (const id of COLLAB) {',
  '    assert.ok(BACKUPS.diy.ownedPool.includes(id), `${id}: a 自选 pick of the data`);',
  '    const c = m.chars[id];',
  '    assert.ok(c && c.avatar && c.portrait && c.spine?.front?.skel, `${id}: art in data/assets.json`);',
  '  }',
  '  assert.equal(m.stats.chars, Object.keys(m.chars).length);',
  '});',
].join('\n');

const start = text.indexOf("test('an operator left out of");
if (start < 0) throw new Error('找不到上游那条测试');
const end = text.indexOf('\n});\n', start);
if (end < 0) throw new Error('找不到测试结尾');
text = `${text.slice(0, start)}${COLLAB_BLOCK}\n`;
writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('assets-diy.test.js: 已按 fork 策略改写');
