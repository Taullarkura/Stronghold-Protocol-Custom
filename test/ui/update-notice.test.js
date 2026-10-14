import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATE_NOTICE_CONTENT, UPDATE_NOTICE_ID, hasSeenUpdateNotice, rememberUpdateNotice,
} from '../../public/js/screens/title.js';

test('update notice shows once per notice id and can be reopened from its title-screen entry', () => {
  assert.equal(hasSeenUpdateNotice([]), false);
  const seen = rememberUpdateNotice([]);
  assert.deepEqual(seen, [UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(seen), true);
  assert.equal(UPDATE_NOTICE_CONTENT, '合并上游0.2.6版本');
});

test('update notice keeps prior ids and treats invalid values as unseen', () => {
  assert.deepEqual(rememberUpdateNotice(['previous-notice']), ['previous-notice', UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(null), false);
  assert.deepEqual(rememberUpdateNotice(null), [UPDATE_NOTICE_ID]);
});
