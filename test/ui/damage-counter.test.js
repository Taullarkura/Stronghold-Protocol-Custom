import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DamageCounter } from '../../public/js/ui/damageCounter.js';

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}

const hasClass = (v, name) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(name);
const byClass = (tree, name) => [...walk(tree)].find((v) => hasClass(v, name));
const textOf = (v) => {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return textOf(v.props?.children);
};

test('damage counter button toggles a lower-left report with sorted damage shares and a stats explanation', () => {
  let nextOpen = null;
  const report = {
    battleId: 'battle-1', fieldId: 'n:p1', round: 15, done: false, total: 30_000_000,
    rows: [
      { key: 'op:1', kind: 'chess', defId: 'chess_char_6_02_a', name: '圣聆初雪', golden: false, damage: 17_751_425 },
      { key: 'op:2', kind: 'chess', defId: 'chess_char_5_01_a', name: '丰川祥子', golden: false, damage: 12_127_497 },
      { key: 'other', kind: 'other', name: null, damage: 121_078 },
    ],
  };
  const closed = DamageCounter({ report, playerName: 'Siki', open: false, onToggle: (v) => { nextOpen = v; } });
  const toggle = byClass(closed, 'dmgcounter__toggle');
  assert.equal(toggle.props['aria-expanded'], false);
  toggle.props.onClick();
  assert.equal(nextOpen, true);
  assert.equal(byClass(closed, 'dmgcounter__panel'), undefined);

  nextOpen = null;
  const opened = DamageCounter({ report, playerName: 'Siki', open: true, onToggle: (v) => { nextOpen = v; } });
  assert.match(textOf(opened), /DAMAGE REPORT/);
  assert.match(textOf(opened), /Siki/);
  assert.match(textOf(opened), /第 15 回合 · 每半秒更新/);
  assert.match(textOf(opened), /17,751,425/);
  assert.match(textOf(opened), /59\.2%/);
  assert.match(textOf(opened), /统计口径/);
  assert.equal(byClass(opened, 'dmgcounter__row').props.class, 'dmgcounter__row');
  byClass(opened, 'dmgcounter__close').props.onClick();
  assert.equal(nextOpen, false);
});
