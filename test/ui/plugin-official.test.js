// test/ui/plugin-official.test.js — the interface side of DESIGN §F14: a room whose gameplay plugins are all the
// server's own content (room.state.content.official) is the original game — no 非官方 mark on the tag, briefing, HUD
// corner or result (public/js/ui/pluginTag.js isModdedRoom), and the match counts in the statistics overview
// (public/js/ui/stats.js contentOf records no content set).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isModdedRoom } from '../../public/js/ui/pluginTag.js';
import { contentOf } from '../../public/js/ui/stats.js';

const CS = 'a'.repeat(64);
const room = (content) => ({ content });
const moddedRoom = { cs: CS, vanilla: false, plugins: [{ id: 'other', class: 'content', version: '1.0.0' }] };
const officialRoom = { cs: CS, official: true, vanilla: false, plugins: [{ id: 'yi-strategy', class: 'content', version: '1.0.0' }] };

test('a room playing the server\'s own gameplay plugins is not marked unofficial', () => {
  assert.equal(isModdedRoom(room(moddedRoom)), true, 'a gameplay plugin the server does not own');
  assert.equal(isModdedRoom(room(officialRoom)), false, 'the server\'s own content');
  assert.equal(isModdedRoom(room({ cs: 'b'.repeat(64), vanilla: true })), false, 'the original game');
  assert.equal(isModdedRoom(room(null)), false);
  assert.equal(isModdedRoom(null), false);
});

test('such a match records no content set — the statistics overview counts it as the original game', () => {
  assert.equal(contentOf(officialRoom), null);
  assert.deepEqual(contentOf(moddedRoom), { cs: CS, plugins: ['other@1.0.0'] }, 'a plugin the server does not own stays unofficial');
  assert.equal(contentOf({ cs: CS, vanilla: true }), null);
});
