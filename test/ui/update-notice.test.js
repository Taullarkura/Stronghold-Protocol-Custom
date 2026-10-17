import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UPDATE_NOTICE_CONTENT, UPDATE_NOTICE_ID, UPDATE_NOTICE_VERSION, hasSeenUpdateNotice, rememberUpdateNotice,
  updateNoticeId,
} from '../../public/js/screens/title.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('update notice shows once per notice id and can be reopened from its title-screen entry', () => {
  assert.equal(hasSeenUpdateNotice([]), false);
  const seen = rememberUpdateNotice([]);
  assert.deepEqual(seen, [UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(seen), true);
});

test('update notice keeps prior ids and treats invalid values as unseen', () => {
  assert.deepEqual(rememberUpdateNotice(['previous-notice']), ['previous-notice', UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(null), false);
  assert.deepEqual(rememberUpdateNotice(null), [UPDATE_NOTICE_ID]);
  assert.deepEqual(rememberUpdateNotice(['a', 'a', UPDATE_NOTICE_ID]), ['a', UPDATE_NOTICE_ID]);
});

test('the notice id is its version plus a fingerprint of its text, so an edited notice pops again', () => {
  assert.equal(UPDATE_NOTICE_ID, updateNoticeId());
  assert.equal(UPDATE_NOTICE_ID, `${UPDATE_NOTICE_VERSION}-${UPDATE_NOTICE_ID.slice(UPDATE_NOTICE_VERSION.length + 1)}`);
  assert.match(UPDATE_NOTICE_ID.slice(UPDATE_NOTICE_VERSION.length + 1), /^[0-9a-f]{8}$/);
  // the same text always makes the same id (a reload does not pop the notice again)
  assert.equal(updateNoticeId(UPDATE_NOTICE_VERSION, '调整', UPDATE_NOTICE_CONTENT), UPDATE_NOTICE_ID);
  // a new release re-shows it …
  assert.notEqual(updateNoticeId('9.9.9', '调整', UPDATE_NOTICE_CONTENT), UPDATE_NOTICE_ID);
  // … and so does editing the notice without bumping the version
  const edited = structuredClone(UPDATE_NOTICE_CONTENT);
  edited[0].items.push('新条目');
  assert.notEqual(updateNoticeId(UPDATE_NOTICE_VERSION, '调整', edited), UPDATE_NOTICE_ID);
  const retitled = structuredClone(UPDATE_NOTICE_CONTENT);
  retitled[0].title = '阿戈尔(改)';
  assert.notEqual(updateNoticeId(UPDATE_NOTICE_VERSION, '调整', retitled), UPDATE_NOTICE_ID);
});

test('the notice content is versioned prose: every group names a faction and carries lines', () => {
  assert.ok(UPDATE_NOTICE_CONTENT.length >= 1);
  for (const group of UPDATE_NOTICE_CONTENT) {
    assert.equal(typeof group.title, 'string');
    assert.ok(group.title.length > 0);
    assert.ok(Array.isArray(group.items) && group.items.length > 0, `${group.title} has no lines`);
    for (const item of group.items) assert.ok(typeof item === 'string' && item.length > 0);
    if (group.detail != null) assert.equal(typeof group.detail, 'string');
  }
});

test('the notice draws its version beside the heading', () => {
  const src = read('public/js/screens/title.js');
  assert.match(src, /<span class="update-notice__version">v\$\{UPDATE_NOTICE_VERSION\}<\/span>/);
  assert.match(read('public/css/components.css'), /^\.update-notice__version \{/m);
});
