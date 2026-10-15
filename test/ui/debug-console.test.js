// 开发控制台 (ui/debugConsole.js): the command parser and the resolver against the client's own data, the batch runner
// (funds / chess / item), and the panel's rendering. The server half — the DEBUG_NAME gate and the grants — is
// test/match/debug-console.test.js; docs/design/network.md g.debug.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DebugConsolePanel, MAX_COUNT, USAGE, execLine, parseLine, resolveTarget, targetsOf } from '../../public/js/ui/debugConsole.js';
import { DEBUG_FUNDS_STEP, DEBUG_NAME } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataFile = (name) => JSON.parse(readFileSync(path.join(ROOT, 'data', name), 'utf8'));

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const byClass = (tree, name) => [...walk(tree)].find((v) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(name));
const textOf = (v) => {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return textOf(v.props?.children);
};
/** A fake server: records every call and answers from `reply`. */
const fakeSend = (reply = () => ({ ok: true })) => {
  const calls = [];
  return { calls, send: (fields) => { calls.push(fields); return Promise.resolve(reply(fields)); } };
};
const targetList = (records) => records;

test('parseLine: funds / chess / item with a count, help, clear — and an error for anything else', () => {
  assert.deepEqual(parseLine(''), { op: 'none' });
  assert.deepEqual(parseLine('   '), { op: 'none' });
  assert.deepEqual(parseLine('funds'), { op: 'funds', n: DEBUG_FUNDS_STEP });
  assert.deepEqual(parseLine('gold 250'), { op: 'funds', n: 250 });
  assert.deepEqual(parseLine('资金 -30'), { op: 'funds', n: -30 });
  assert.ok(parseLine('funds 1 2').error, 'two values are refused');
  assert.ok(parseLine('funds abc').error);
  assert.deepEqual(parseLine('chess 隐现'), { op: 'chess', query: '隐现', count: 1 });
  assert.deepEqual(parseLine('干员 隐现 3'), { op: 'chess', query: '隐现', count: 3 });
  assert.deepEqual(parseLine('item chess_item_6_01_e_a 2'), { op: 'item', query: 'chess_item_6_01_e_a', count: 2 });
  assert.deepEqual(parseLine('装备 维式重锤'), { op: 'item', query: '维式重锤', count: 1 });
  assert.ok(parseLine(`chess 隐现 ${MAX_COUNT + 1}`).error, 'the count is capped');
  assert.ok(parseLine('chess').error, 'an operator needs a query');
  assert.ok(parseLine('nope').error, 'an unknown command');
  assert.deepEqual(parseLine('help'), { op: 'help' });
  assert.deepEqual(parseLine('?'), { op: 'help' });
  assert.deepEqual(parseLine('clear'), { op: 'clear' });
});

test('targetsOf / resolveTarget: an id wins, then a name, then a prefix or a substring; an ambiguity lists candidates', () => {
  const targets = [
    { id: 'chess_char_1_01_a', name: '隐现', alt: 'Insider', golden: false },
    { id: 'chess_char_1_02_a', name: '角峰', alt: 'Matterhorn', golden: false },
    { id: 'chess_char_1_03_a', name: '角峰界', alt: 'Matterhorn2', golden: false },
  ];
  assert.equal(resolveTarget('chess_char_1_02_a', targets).target.id, 'chess_char_1_02_a');
  assert.equal(resolveTarget('CHESS_CHAR_1_02_A', targets).target.id, 'chess_char_1_02_a', 'the id pass is case-insensitive');
  assert.equal(resolveTarget('隐现', targets).target.id, 'chess_char_1_01_a');
  assert.equal(resolveTarget('Insider', targets).target.id, 'chess_char_1_01_a', 'the appellation resolves too');
  assert.equal(resolveTarget('insider', targets).target.id, 'chess_char_1_01_a');
  const many = resolveTarget('角峰', targets);
  assert.equal(many.target.id, 'chess_char_1_02_a', 'an exact name beats a longer prefix');
  assert.ok(resolveTarget('角峰x', targets).error, 'nothing matches');
  const options = resolveTarget('角', targets);
  assert.ok(options.error, 'two candidates');
  assert.deepEqual(options.options, ['chess_char_1_02_a (角峰)', 'chess_char_1_03_a (角峰界)']);

  // targetsOf drops the records a grant cannot use: 精锐, an unfilled 自选 slot, an invisible one
  const chess = targetsOf([{ chessId: 'c1', name: '甲' }, { chessId: 'c2', name: '甲', isGolden: true }, { chessId: 'c3', name: '甄选干员', isDiy: true }, { chessId: 'c4', name: '乙', visible: false }]);
  assert.deepEqual(chess.map((t) => t.id), ['c1']);
});

test('resolveTarget on the real data: a Chinese name, an appellation and an id all reach a grantable operator', () => {
  const chess = targetsOf(Object.values(dataFile('chess.json')));
  assert.ok(chess.length > 100, `the searchable operators (${chess.length})`);
  assert.equal(resolveTarget('隐现', chess).target.id, 'chess_char_1_01_a');
  assert.equal(resolveTarget('Insider', chess).target.id, 'chess_char_1_01_a');
  const items = targetsOf(Object.values(dataFile('items.json')));
  assert.ok(items.length > 50, `the searchable items (${items.length})`);
  for (const t of [...chess, ...items]) assert.ok(t.id && !t.golden, `${t.id} is a plain record`);
});

test('execLine: funds, a grant (one request per copy), help, clear — and the failures the server reports', async () => {
  const targets = targetList([{ id: 'chess_char_1_01_a', name: '隐现', alt: 'Insider' }]);
  const io = { targets: () => targets };

  const funds = fakeSend();
  let res = await execLine('funds 250', { ...io, send: funds.send });
  assert.deepEqual(funds.calls, [{ op: 'funds', n: 250 }]);
  assert.deepEqual(res.lines.map((l) => l.kind), ['echo', 'ok']);
  assert.match(res.lines[1].text, /资金 \+250/);

  const grant = fakeSend();
  res = await execLine('chess 隐现 3', { ...io, send: grant.send });
  assert.equal(grant.calls.length, 3, 'one g.debug per copy');
  assert.deepEqual(grant.calls[0], { op: 'chess', id: 'chess_char_1_01_a' });
  assert.match(res.lines.at(-1).text, /获得 干员 隐现（chess_char_1_01_a） ×3/);

  // a copy the server refuses mid-batch stops the batch and says where
  let n = 0;
  const refuse = fakeSend(() => (++n < 3 ? { ok: true } : { ok: false, message: '整备区已满' }));
  res = await execLine('chess 隐现 3', { ...io, send: refuse.send });
  assert.equal(refuse.calls.length, 3, 'the third copy is not retried');
  assert.equal(res.lines.at(-1).kind, 'error');
  assert.match(res.lines.at(-1).text, /2\/3 — 隐现（chess_char_1_01_a）：整备区已满/);

  // an unresolved or ambiguous query sends nothing at all
  const none = fakeSend();
  res = await execLine('chess 不存在的人', { ...io, send: none.send });
  assert.deepEqual(none.calls, []);
  assert.match(res.lines.at(-1).text, /没有匹配/);

  const help = await execLine('help', { ...io, send: fakeSend().send });
  assert.equal(help.lines.length, USAGE.length + 2, 'the header plus one line per command');
  assert.ok(help.clear === undefined);
  const clear = await execLine('clear', { ...io, send: fakeSend().send });
  assert.deepEqual(clear, { lines: [{ kind: 'echo', text: '> clear' }], clear: true });
  assert.deepEqual(await execLine('', { ...io, send: fakeSend().send }), { lines: [] }, 'an empty line does nothing');
});

test('the panel draws the log, the prompt and the toggle target; the button toggles and Esc closes it', () => {
  let next = null;
  const closed = DebugConsolePanel({ lines: [{ id: 1, kind: 'info', text: '就绪' }], text: '', onText: () => {}, onKeyDown: () => {}, onSubmit: () => {}, onClose: () => { next = false; } });
  assert.match(textOf(closed), /DEBUG CONSOLE/);
  assert.match(textOf(closed), new RegExp(DEBUG_NAME));
  assert.match(textOf(closed), /就绪/);
  assert.equal(byClass(closed, 'dbgconsole__send').props.disabled, false);
  byClass(closed, 'dbgconsole__close').props.onClick();
  assert.equal(next, false, '✕ closes the panel');

  const input = byClass(closed, 'dbgconsole__input');
  assert.equal(input.props.value, '');
  assert.equal(input.props.spellcheck, false);
  let typed = null;
  const busy = DebugConsolePanel({ lines: [], text: '', busy: true, onText: (v) => { typed = v; }, onKeyDown: () => {}, onSubmit: () => {}, onClose: () => {} });
  assert.equal(byClass(busy, 'dbgconsole__send').props.disabled, true, 'a request in flight disables 执行');
  assert.equal(byClass(busy, 'dbgconsole__input').props.disabled, undefined, 'the input stays enabled: a disabled field would drop the focus');
  assert.equal(typed, null);

  const lines = [
    { id: 1, kind: 'echo', text: '> funds' },
    { id: 2, kind: 'ok', text: '获得 干员 隐现' },
  ];
  const panel = DebugConsolePanel({ lines, text: 'x', onText: () => {}, onKeyDown: () => {}, onSubmit: () => {}, onClose: () => {} });
  assert.match(textOf(panel), /> funds/);
  assert.match(textOf(panel), /获得 干员 隐现/);
  assert.equal(byClass(panel, 'dbgconsole__line').props.class, 'dbgconsole__line is-echo');
});

test('the g.debug intent validates: only the three ops, an id, a bounded n', () => {
  assert.equal(validateC2S({ t: 'g.debug', op: 'funds', n: 100 }), null);
  assert.equal(validateC2S({ t: 'g.debug', op: 'funds' }), null);
  assert.equal(validateC2S({ t: 'g.debug', op: 'chess', id: 'chess_char_1_01_a' }), null);
  assert.equal(validateC2S({ t: 'g.debug', op: 'item', id: 'chess_item_6_01_e_a' }), null);
  assert.ok(validateC2S({ t: 'g.debug', op: 'nuke' }), 'an unknown op');
  assert.ok(validateC2S({ t: 'g.debug' }), 'no op');
  assert.ok(validateC2S({ t: 'g.debug', op: 'funds', n: 1e9 }), 'n out of range');
  assert.ok(validateC2S({ t: 'g.debug', op: 'chess', id: 'a b' }), 'a malformed id');
});
