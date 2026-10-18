// test/plugins/roomContent.test.js — a server's own gameplay plugins are its content (DESIGN §F14): a new room starts
// with them and a room playing only them is the original game for the interface and the statistics. Pins
// server/plugins/roomSets.js defaults() / official() / fixed() against a registry stub, so the rule holds whichever
// plugin classes the version loads.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomSets } from '../../server/plugins/roomSets.js';

/** A loaded plugin record of the class, shaped as the registry's (server/plugins/registry.js). */
const plugin = (id, cls, extra = {}) => ({
  id,
  class: cls,
  status: 'loaded',
  content: { files: {}, hash: 'a'.repeat(64) },
  manifest: { version: '1.0.0', scope: ['room'], settings: {} },
  ...extra,
});

const registryOf = (...list) => ({ plugin: (id) => list.find((p) => p.id === id) || null, plugins: () => list });
const policyOf = (patch = {}) => ({ get: () => ({ rooms: 'host', default: [], allow: ['*'], ...patch }), allows: () => true });

/** @param {{ list?: any[], policy?: any, contents?: any, visual?: any }} opts */
const roomSets = ({ list = [], policy = policyOf(), contents = {}, visual = null } = {}) =>
  createRoomSets({ registry: registryOf(...list), visual, contents, policy });

test('a new room starts with every installed gameplay plugin (content and script), and the policy default', () => {
  const sets = roomSets({
    list: [plugin('yi-strategy', 'script'), plugin('askalen-strategy', 'content'), plugin('skin', 'cosmetic'), plugin('garbled', 'content', { status: 'invalid' })],
    policy: policyOf({ default: ['skin'] }),
  });
  assert.deepEqual(sets.defaults(), ['skin', 'yi-strategy', 'askalen-strategy'], 'the policy default first, then the installed gameplay plugins; a broken one is not installed');
  assert.deepEqual(sets.fixed(), null, 'rooms: host');
  assert.deepEqual(roomSets({ list: [plugin('a', 'content')], policy: policyOf({ rooms: 'fixed' }) }).fixed(), ['a'], 'rooms: fixed holds the same set');
  assert.deepEqual(roomSets({ list: [plugin('a', 'content')], policy: policyOf({ rooms: 'off' }) }).defaults(), [], 'rooms: off plays the original game');
});

test('a room playing only the server\'s gameplay plugins is the original game; anything else is not', () => {
  const owned = plugin('yi-strategy', 'content');
  const sets = roomSets({ list: [owned] });
  assert.equal(sets.official([{ id: 'yi-strategy', class: 'content' }]), true);
  assert.equal(sets.official([{ id: 'yi-strategy', class: 'content' }, { id: 'skin', class: 'cosmetic' }]), true, 'a skin changes no rule');
  assert.equal(sets.official([{ id: 'yi-strategy', class: 'content' }, { id: 'other', class: 'content' }]), false, 'a gameplay plugin the server does not own');
  assert.equal(sets.official([{ id: 'skin', class: 'cosmetic' }]), false, 'no gameplay plugin in the list');
  assert.equal(sets.official([]), false);
  assert.equal(sets.official(null), false);
});

test('a lobby wired without a policy takes no plugins by default (the test harnesses and embedders)', () => {
  const sets = roomSets({ list: [plugin('yi-strategy', 'content')], policy: null });
  assert.deepEqual(sets.defaults(), [], 'no switchboard, no plugins');
  assert.equal(sets.official([{ id: 'yi-strategy', class: 'content' }]), false, 'and no room is the server\'s own content');
  assert.deepEqual(sets.fixed(), null);
});
