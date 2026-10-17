import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  END, NOTE_FILE, START, TARGET_FILE, noticeGroups, parseNote, renderBlock, replaceBlock,
} from '../tools/update-notice.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOTE = join(ROOT, NOTE_FILE);
const TARGET = join(ROOT, TARGET_FILE);

const SAMPLE = `### v9.9.9
- 上线一件事
- 上线另一件事
### v9.9.8
#### 调整
##### 阿戈尔
- 一条
- 两条
##### 拉特兰
- 三条
<在场6名干员>这一行是说明
`;

test('the note parses into releases: a flat list is one group, ##### factions are groups, a bare line is the detail', () => {
  const releases = parseNote(SAMPLE);
  assert.deepEqual(releases.map((r) => r.version), ['9.9.9', '9.9.8']);
  assert.equal(releases[0].groups.length, 1);
  assert.equal(releases[0].groups[0].name, null);
  assert.deepEqual(releases[0].groups[0].items, ['上线一件事', '上线另一件事']);
  assert.deepEqual(releases[1].groups.map((g) => g.name), ['阿戈尔', '拉特兰']);
  assert.deepEqual(releases[1].groups[1].items, ['三条']);
  assert.equal(releases[1].groups[1].detail, '<在场6名干员>这一行是说明');
  assert.equal(releases[1].groups[0].detail, null);
});

test('group titles keep the release they came from', () => {
  assert.deepEqual(noticeGroups(parseNote(SAMPLE)).map((g) => g.title), [
    'v9.9.9', 'v9.9.8 · 阿戈尔', 'v9.9.8 · 拉特兰',
  ]);
});

test('the generated block carries the newest version, the groups and both markers', () => {
  const block = renderBlock(parseNote(SAMPLE));
  assert.match(block, new RegExp(`^${START}`));
  assert.match(block, new RegExp(`${END}$`));
  assert.match(block, /export const UPDATE_NOTICE_VERSION = '9\.9\.9';/);
  assert.match(block, /title: 'v9\.9\.8 · 拉特兰',/);
  assert.match(block, /detail: '<在场6名干员>这一行是说明',/);
  // quoted text survives the round trip through a source file
  const source = `before\n${START} — stale\n${END}\nafter\n`;
  assert.equal(replaceBlock(source, block), `before\n${block}\nafter\n`);
});

test('a note without a release heading and a source without markers are refused', () => {
  assert.throws(() => renderBlock(parseNote('- 没有版本标题\n')), /release heading/);
  assert.throws(() => replaceBlock('no markers here\n', 'block'), /markers to fill/);
});

test('the title screen is in sync with the maintainer note', { skip: !existsSync(NOTE) && `${NOTE_FILE} is a local draft` }, () => {
  const target = readFileSync(TARGET, 'utf8');
  const block = renderBlock(parseNote(readFileSync(NOTE, 'utf8')));
  assert.equal(replaceBlock(target, block), target, 'run `npm run notice`');
});
