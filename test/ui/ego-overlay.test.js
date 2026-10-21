// The E.G.O 饰品 / 苦难 pick overlay (a remake extension, docs/design/ego.md; ui/egoOverlay.js,
// css/screens/game-panels.css): the 机变 draft's frame and cards, cut in two halves — the 饰品 the picker gains over the
// 苦难 it costs the team — in a three-card row, with the same two-tap pick as the shop and the 机变 draft, a 刷新 that
// costs the picker's own funds (twice at most) and no turn order: the pick is simultaneous, so the header names who has
// not chosen yet instead of whose turn it is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// the browser data store reads the real data files from disk (the card renders below)
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { EgoView, egoArt, egoPickable, egoRefreshable, egoTap, egoArmed } = await import('../../public/js/ui/egoOverlay.js');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const textOf = (v) => {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return typeof v === 'object' ? textOf(v.props?.children) : '';
};
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);

// `short` is an optional one-line summary for a record whose description is too long for the card; a record without
// one shows its `desc` on the card too, and the in-match effect list always shows the full `desc`.
const rec = (id, name, desc, tier = 1, short = undefined) => ({ id, name, desc, ...(short ? { short } : {}), tier, icon: id });
const ego = (o = {}) => ({
  id: 'ego.1.0', round: 1, refreshes: 0, refreshMax: 2, refreshCost: 1, funds: 4, untimed: false,
  deadline: 1_700_000_008_000, turnSeconds: 25, picked: null,
  options: [
    { idx: 0, tier: 1, trinket: rec('dust-to-dust', '尘归尘', '敌方单位出场时，获得 3 层「烧伤」。', 1, '敌方出场即获得「烧伤」。'), hardship: rec('sharpness-1', '锐利 I', '敌人攻击力 +15%。') },
    { idx: 1, tier: 1, trinket: rec('smothered-flame', '郁火', '我方干员对带有「烧伤」的敌方单位造成伤害后，攻速 +10。'), hardship: rec('toughness-1', '强韧 I', '敌人生命上限 +15%，防御力 +15%。') },
    { idx: 2, tier: 2, trinket: rec('ashes-to-ashes', '土归土', '敌方单位出场时，获得 2 层「烧伤」，每层持续时间 +1 秒。', 2), hardship: rec('refraction-1', '折射 I', '敌人出场时获得「折射」，持续 20 秒。', 2) },
  ],
  ...o,
});
const pub = (o = {}) => ({ players: [{ playerId: 'me', seat: 0, name: 'Me' }, { playerId: 'p1', seat: 1, name: 'Amiya' }], deadline: 0, ego: { round: 1, waiting: ['me', 'p1'], picks: [], taken: {} }, ...o });

test('egoPickable: an open offer with nothing in flight; egoRefreshable: refreshes left and the funds for one', () => {
  assert.equal(egoPickable(ego()), true);
  assert.equal(egoPickable(ego({ picked: 1 })), false, 'a seat that picked is done');
  assert.equal(egoPickable(ego(), 0), false, 'a pick already on the wire');
  assert.equal(egoPickable(null), false);
  assert.equal(egoRefreshable(ego()), true);
  assert.equal(egoRefreshable(ego({ refreshes: 2 })), false, 'at most twice');
  assert.equal(egoRefreshable(ego({ funds: 0 })), false, 'the cost is short');
  assert.equal(egoRefreshable(ego(), true), false, 'a refresh in flight');
  assert.equal(egoRefreshable(ego({ picked: 2 })), false);
});

test('egoTap: the first tap selects, the second confirms, an unavailable option changes nothing', () => {
  assert.deepEqual(egoTap(null, 1, true), { armed: 1, pick: null });
  assert.deepEqual(egoTap(1, 1, true), { armed: null, pick: 1 }, 'the second tap sends g.trinket');
  assert.deepEqual(egoTap(1, 2, true), { armed: 2, pick: null }, 'another card moves the selection');
  assert.deepEqual(egoTap(1, 2, false), { armed: 1, pick: null });
  assert.deepEqual(egoTap(2, 1.5, true), { armed: 2, pick: null }, 'a malformed idx keeps whatever was selected');
  assert.deepEqual(egoTap(null, null, true), { armed: null, pick: null });
});

test('egoArmed: a selection never outlives the offer it was made in', () => {
  assert.equal(egoArmed(1, ego()), 1);
  assert.equal(egoArmed(9, ego()), null, 'no such option');
  assert.equal(egoArmed(1, ego(), { busy: 1 }), null, 'in flight');
  assert.equal(egoArmed(1, ego({ picked: 0 })), null, 'already picked');
  assert.equal(egoArmed(null, ego()), null);
});

test('EgoView: three cards, each with its 饰品 over its 苦难, and the tier chip of the pair', () => {
  const v = EgoView({ pub: pub(), ego: ego(), myId: 'me' });
  const cards = [...walk(v)].filter((n) => hasClass(n, 'egocard'));
  assert.equal(cards.length, 3);
  for (const c of cards) {
    assert.ok([...walk(c)].some((n) => hasClass(n, 'egocard__part--trinket')), 'the 饰品 half');
    assert.ok([...walk(c)].some((n) => hasClass(n, 'egocard__part--hardship')), 'the 苦难 half');
    assert.ok([...walk(c)].some((n) => n.type?.name === 'TierChip'), 'the pair is one tier');
  }
  assert.match(textOf(cards[0]), /尘归尘/);
  assert.match(textOf(cards[0]), /锐利 I/);
  // the card shows `short` when a record has one and its full `desc` when it does not (the effect list always shows
  // the full text); descriptions are `RichText` props, not text children, so the walk reads `props.text`
  const cardText = [...walk(cards[0])].map((n) => n.props?.text).filter((x) => typeof x === 'string');
  assert.ok(cardText.includes('敌方出场即获得「烧伤」。'), 'the 饰品 half shows its short summary');
  assert.ok(!cardText.some((x) => x.includes('3 层')), 'the full desc never reaches the card');
  assert.ok(cardText.includes('敌人攻击力 +15%。'), 'a record without a summary falls back to its desc');
  assert.match(textOf(v), /E\.G\.O 抉择/);
  assert.ok(!cards.some((c) => c.props.disabled !== false), 'every card is pickable while nothing is picked');
});

test('EgoView: the header names who has not chosen yet, the refresh says how many are left', () => {
  const v = EgoView({ pub: pub(), ego: ego({ refreshes: 1 }), myId: 'me' });
  assert.match(textOf(v), /1 位博士尚未选择/, 'the other seat only');
  const refresh = [...walk(v)].find((n) => hasClass(n, 'egoov__refresh'));
  assert.ok(refresh, 'the redraw button');
  assert.equal(textOf(refresh), '刷新（剩余 1 次）');
  assert.equal(refresh.props.disabled, false);
  const broke = [...walk(EgoView({ pub: pub(), ego: ego({ funds: 0 }), myId: 'me' }))].find((n) => hasClass(n, 'egoov__refresh'));
  assert.equal(broke.props.disabled, true, 'no funds, no redraw');
  const spent = [...walk(EgoView({ pub: pub(), ego: ego({ refreshes: 2 }), myId: 'me' }))].find((n) => hasClass(n, 'egoov__refresh'));
  assert.equal(spent.props.disabled, true);
});

test('EgoView: a picked seat sees its offer read-only; an untimed solo pick shows no countdown', () => {
  const done = EgoView({ pub: pub({ ego: { round: 1, waiting: [], picks: ['me'], taken: { me: 'dust-to-dust' } } }), ego: ego({ picked: 0 }), myId: 'me' });
  const cards = [...walk(done)].filter((n) => hasClass(n, 'egocard'));
  assert.ok(cards.every((c) => c.props.disabled === true), 'nothing left to tap');
  assert.match(textOf(done), /已完成选择/);
  const solo = EgoView({ pub: pub(), ego: ego({ untimed: true, deadline: 0, turnSeconds: 0 }), myId: 'me', solo: true });
  assert.ok(![...walk(solo)].some((n) => n.type?.name === 'Countdown'), 'solo is untimed (Match.soloUntimed)');
  assert.match(textOf(solo), /选择一项（无时间限制）/);
  assert.ok([...walk(EgoView({ pub: pub(), ego: ego(), myId: 'me' }))].some((n) => n.type?.name === 'Countdown'), 'a timed room counts down');
});

test('the armed card\'s strip is ☑ 确认选择 · 再次点击 and the frame is the 机变 card\'s', () => {
  const v = EgoView({ pub: pub(), ego: ego(), myId: 'me', armed: 1 });
  const strip = [...walk(v)].find((n) => hasClass(n, 'spcard__confirm'));
  assert.ok(strip);
  assert.equal(textOf(strip), '确认选择再次点击');
  const armed = [...walk(v)].find((n) => hasClass(n, 'egocard') && hasClass(n, 'is-armed'));
  assert.ok(armed);
  assert.ok(hasClass(v, 'has-armed'), 'the other cards dim');
});

test('the wire: the overlay sends g.trinket (with the offer id) and g.trinketRefresh (source contract)', () => {
  const overlay = read('public/js/ui/egoOverlay.js');
  assert.match(overlay, /props\.onPick\(r\.pick, ego\.id\)/, 'a pick carries the seat offer id');
  assert.match(overlay, /onRefresh\(ego\.id\)/, 'a redraw carries it too');
  const actions = read('public/js/ui/gameActions.js');
  assert.match(actions, /trinket: \(idx, pickId\) => act\('g\.trinket', pickId \? \{ idx, pickId \} : \{ idx \}\)/);
  assert.match(actions, /trinketRefresh: \(pickId\) => act\('g\.trinketRefresh', pickId \? \{ pickId \} : \{\}\)/);
  const game = read('public/js/screens/game.js');
  assert.match(game, /const ego = phase === PHASE\.EGO_PICK && !spectator && alive \? \(priv\?\.ego \|\| null\) : null;/);
  assert.match(game, /<span class="egoov__waiting">|<EgoOverlay|<\$\{EgoOverlay\}/);
  assert.match(read('public/css/screens/game-panels.css'), /\.egocard__part \+ \.egocard__part \{/, 'the two halves are ruled apart');
});

test('the icon: localAsset(\'ego\', record id), and a record with no picture draws its glyph and asks for nothing', () => {
  // this machine's data/local-assets.json has no `ego` group unless the art was downloaded, so every card draws its glyph
  assert.equal(egoArt(rec('dust-to-dust', '尘归尘', '…')), null, 'no entry: no URL, so Img renders the fallback');
  assert.equal(egoArt(null), null);
  assert.equal(egoArt({}), null);
  assert.equal(egoArt({ id: '' }), null);
  // the contract with server/http/localEgoArt.js: the group is `ego` and the key is the record id
  assert.match(read('public/js/ui/egoOverlay.js'), /export function egoArt\(rec\) \{\n  return rec && typeof rec\.id === 'string' && rec\.id \? localAsset\('ego', rec\.id\) : null;/);
  assert.match(read('server/http/localEgoArt.js'), /export const EGO_ART_GROUP = 'ego';/);
  assert.match(read('server/http/localEgoArt.js'), /entries\[found\.id\] = entry;/, 'the manifest entry is keyed by the record id');
  // and the card uses it for both halves, so a trinket and a hardship each show their own picture
  assert.equal((read('public/js/ui/egoOverlay.js').match(/src=\$\{egoArt\(/g) || []).length, 2);
  const v = EgoView({ pub: pub(), ego: ego(), myId: 'me' });
  const icons = [...walk(v)].filter((n) => hasClass(n, 'spcard__icon'));
  assert.equal(icons.length, 6, 'three cards × the 饰品 and the 苦难 half');
  assert.ok(icons.every((n) => n.props.children), 'a half always draws something (Img falls back to the glyph)');
});
