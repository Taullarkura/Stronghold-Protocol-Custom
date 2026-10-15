// (i18n-ignore-file: 开发控制台 — a developer tool: its help and its output are never player-facing UI text, docs/I18N.md)
//
// 开发控制台 (the in-match debug console): the client half of `g.debug` (server/match/match/debug.js). Checking a kit, a
// 召唤物, a merge or an economy rule in a real match otherwise means playing up to it — the console grants the 干员 /
// 装备 / 资金 on demand instead.
//
// The console is drawn for a seat whose nickname is DEBUG_NAME (shared/constants.js) only, and the *server* is what
// answers `g.debug`: anyone else gets BAD_MSG, exactly like an unknown intent. Anyone may type that nickname — it is a
// testing convenience, not a permission system (see the constant).
//
//   funds [n]                       资金 +n (default DEBUG_FUNDS_STEP; negative spends)
//   chess <id | 名称 | 英文名> [份数]  obtain an operator (3 copies merge into the 精锐)
//   item  <id | 名称> [份数]          obtain an item
//   help · clear
//
// A query resolves against the client's own data (data/chess.json, data/items.json): an exact id wins, then a unique
// name / appellation, then a prefix, then a substring; an ambiguous query lists its candidates and grants nothing.
//
// Layout: parseLine / targetsOf / resolveTarget / execLine are pure (test/ui/debug-console.test.js);
// DebugConsolePanel draws one state; DebugConsole owns the state and sends the intents.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { data } from '../data.js';
import { net } from '../net.js';
import { DEBUG_FUNDS_STEP, DEBUG_NAME } from '../../../shared/constants.js';

/** Most copies one command may grant (3 already merge a normal operator into its 精锐). */
export const MAX_COUNT = 9;
/** Output lines kept on screen (the oldest are dropped). */
const LOG_MAX = 60;
/** Typed lines remembered for ↑ / ↓. */
const HISTORY_MAX = 40;

/** The `help` output. */
export const USAGE = Object.freeze([
  `funds [n] — 资金 +n（默认 ${DEBUG_FUNDS_STEP}，可为负）`,
  'chess <干员 id | 名称 | 英文名> [份数] — 获得干员（3 份自动精锐化）',
  'item <装备 id | 名称> [份数] — 获得装备',
  'clear — 清空输出',
]);

/**
 * One console line → an intent. A trailing integer is the count (`chess 隐现 3`); the words before it are the query.
 * @param {any} raw
 * @returns {{ op: 'none' } | { op: 'help' } | { op: 'clear' } | { op: 'funds', n: number }
 *   | { op: 'chess'|'item', query: string, count: number } | { error: string }}
 */
export function parseLine(raw) {
  const line = String(raw ?? '').trim();
  if (!line) return { op: 'none' };
  const words = line.split(/\s+/);
  const cmd = words[0].toLowerCase();
  const rest = words.slice(1);
  if (cmd === 'help' || cmd === '?') return { op: 'help' };
  if (cmd === 'clear') return { op: 'clear' };
  if (cmd === 'funds' || cmd === 'gold' || cmd === '资金') {
    if (!rest.length) return { op: 'funds', n: DEBUG_FUNDS_STEP };
    if (rest.length > 1 || !/^-?\d+$/.test(rest[0])) return { error: `资金需要一个整数（收到「${rest.join(' ')}」）` };
    const n = Number(rest[0]);
    if (!Number.isSafeInteger(n)) return { error: `资金超出范围（${rest[0]}）` };
    return { op: 'funds', n };
  }
  if (cmd === 'chess' || cmd === 'item' || cmd === '干员' || cmd === '装备') {
    const kind = cmd === 'chess' || cmd === '干员' ? 'chess' : 'item';
    let count = 1;
    if (rest.length > 1 && /^\d+$/.test(rest[rest.length - 1])) {
      count = Number(rest.pop());
      if (count < 1 || count > MAX_COUNT) return { error: `份数需要在 1–${MAX_COUNT} 之间（收到 ${count}）` };
    }
    const query = rest.join(' ').trim();
    if (!query) return { error: `${kind === 'chess' ? '需要一个干员' : '需要一件装备'}（id 或名称）` };
    return { op: kind, query, count };
  }
  return { error: `未知命令「${words[0]}」— 输入 help 查看用法` };
}

/**
 * The searchable targets of a data list (data/chess.json or data/items.json records).
 * @param {any[]} records
 * @returns {{ id: string, name: string, alt: string, golden: boolean }[]}
 */
export function targetsOf(records) {
  const out = [];
  for (const rec of Array.isArray(records) ? records : []) {
    if (!rec || typeof rec !== 'object') continue;
    const id = typeof rec.chessId === 'string' ? rec.chessId : rec.id;
    if (typeof id !== 'string' || !id) continue;
    // a 精锐 (golden) record, an unfilled 自选 slot and an invisible record are asked for by id, not searched by name
    if (rec.isGolden || rec.isDiy || rec.visible === false) continue;
    out.push({ id, name: typeof rec.name === 'string' ? rec.name : '', alt: typeof rec.appellation === 'string' ? rec.appellation : '', golden: false });
  }
  return out;
}

/**
 * Resolve a query to one target: exact id, then an exact name / appellation, then a prefix, then a substring (all
 * case-insensitive after the id pass).
 * @param {string} query
 * @param {{ id: string, name: string, alt: string, golden: boolean }[]} targets
 * @returns {{ target: any } | { error: string, options?: string[] }}
 */
export function resolveTarget(query, targets) {
  const q = String(query ?? '').trim();
  if (!q) return { error: '需要一个 id 或名称' };
  const list = Array.isArray(targets) ? targets : [];
  const byId = list.find((t) => t.id === q);
  if (byId) return { target: byId };
  const lq = q.toLowerCase();
  const byIdLoose = list.find((t) => t.id.toLowerCase() === lq);
  if (byIdLoose) return { target: byIdLoose };
  const named = (t) => t.name.toLowerCase() === lq || t.alt.toLowerCase() === lq;
  const exact = list.filter(named);
  if (exact.length) return { target: exact.find((t) => !t.golden) || exact[0] };
  const starts = list.filter((t) => t.name.toLowerCase().startsWith(lq) || t.alt.toLowerCase().startsWith(lq));
  const pool = starts.length ? starts : list.filter((t) => t.name.toLowerCase().includes(lq) || t.alt.toLowerCase().includes(lq));
  const unique = [...new Map(pool.map((t) => [t.id, t])).values()];
  if (unique.length === 1) return { target: unique[0] };
  if (!unique.length) return { error: `没有匹配「${q}」的条目` };
  return {
    error: `「${q}」有 ${unique.length} 个候选，请输入更完整的 id 或名称`,
    options: unique.slice(0, 8).map((t) => `${t.id}${t.name ? ` (${t.name})` : ''}`),
  };
}

/**
 * Run one typed line: what to print, and whether the panel is cleared.
 * @param {string} raw
 * @param {{ send: (fields: { op: string, id?: string, n?: number }) => Promise<{ ok: boolean, message?: string }>,
 *           targets: (kind: 'chess'|'item') => any[] }} io
 * @returns {Promise<{ lines: { kind: string, text: string }[], clear?: boolean }>}
 */
export async function execLine(raw, io) {
  const lines = [];
  const push = (kind, text, options = null) => {
    lines.push({ kind, text });
    for (const o of options || []) lines.push({ kind: 'dim', text: `  ${o}` });
  };
  const parsed = parseLine(raw);
  if (parsed.op === 'none') return { lines };
  push('echo', `> ${String(raw).trim()}`);
  if (parsed.error) { push('error', parsed.error); return { lines }; }
  if (parsed.op === 'clear') return { lines, clear: true };
  if (parsed.op === 'help') {
    push('info', '命令：');
    for (const u of USAGE) push('dim', `  ${u}`);
    return { lines };
  }
  if (parsed.op === 'funds') {
    const res = await io.send({ op: 'funds', n: parsed.n });
    if (!res.ok) push('error', `资金：${res.message}`);
    else push('ok', `资金 ${parsed.n >= 0 ? '+' : ''}${parsed.n} — 新余额见商店`);
    return { lines };
  }
  const found = resolveTarget(parsed.query, io.targets(parsed.op));
  if (found.error) { push('error', found.error, found.options || null); return { lines }; }
  const label = parsed.op === 'chess' ? '干员' : '装备';
  const name = found.target.name ? `${found.target.name}（${found.target.id}）` : found.target.id;
  let done = 0;
  while (done < parsed.count) {
    // sequential: the server merges each copy as it arrives, so a failure (整备区已满) stops the batch
    const res = await io.send({ op: parsed.op, id: found.target.id }); // eslint-disable-line no-await-in-loop
    if (!res.ok) {
      push('error', `${done}/${parsed.count} — ${name}：${res.message}`);
      return { lines };
    }
    done += 1;
  }
  push('ok', `获得 ${label} ${name}${parsed.count > 1 ? ` ×${parsed.count}` : ''}`);
  return { lines };
}

/** The console panel: a scrollback and a prompt line (no state of its own — DebugConsole drives it). The input stays
 * enabled while a batch runs (a disabled field would lose the keyboard focus): `busy` dims the 执行 button, and the
 * component ignores a second line until the batch settles. */
export function DebugConsolePanel({ lines = [], text = '', busy = false, onText, onKeyDown, onSubmit, onClose, listRef, inputRef }) {
  return html`<section class="dbgconsole__panel" role="region" aria-label="开发控制台">
    <header class="dbgconsole__head">
      <span class="dbgconsole__eyebrow">DEBUG CONSOLE</span>
      <b>${DEBUG_NAME}</b>
      <button type="button" class="dbgconsole__close" aria-label="关闭控制台" title="关闭" onClick=${() => onClose()}><${Icon} name="close" /></button>
    </header>
    <ol class="dbgconsole__log" ref=${listRef}>
      ${lines.map((l, i) => html`<li key=${l.id ?? i} class=${`dbgconsole__line is-${l.kind}`}>${l.text}</li>`)}
    </ol>
    <form class="dbgconsole__form" onSubmit=${(e) => { e?.preventDefault?.(); onSubmit(); }}>
      <span class="dbgconsole__prompt" aria-hidden="true">›</span>
      <input ref=${inputRef} class="dbgconsole__input" type="text" name="cmd" autocomplete="off" spellcheck=${false}
        placeholder="funds 100 · chess 隐现 3 · item 维式重锤 · help" value=${text}
        onInput=${(e) => onText(e.currentTarget.value)} onKeyDown=${onKeyDown} />
      <button type="submit" class="dbgconsole__send" disabled=${busy}>执行</button>
    </form>
  </section>`;
}

/** The console: the corner's toggle button and, while open, the panel above it. */
export function DebugConsole({ open = false, onToggle }) {
  const [lines, setLines] = useState([{ id: 0, kind: 'info', text: `开发控制台 · 昵称 ${DEBUG_NAME} · 输入 help 查看命令` }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const history = useRef([]);
  const histAt = useRef(-1);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const append = (fresh) => setLines((prev) => [...prev, ...fresh.map((l) => ({ id: ++seq.current, ...l }))].slice(-LOG_MAX));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    if (open) inputRef.current?.focus?.();
  }, [open]);

  const send = async (fields) => {
    try {
      await net.request('g.debug', fields);
      return { ok: true };
    } catch (err) {
      // NetError.message is already the Chinese text of its code (net.js errorText)
      return { ok: false, message: err?.message || String(err) };
    }
  };

  const run = async (raw) => {
    const line = String(raw ?? '').trim();
    if (!line || busy) return;
    setBusy(true);
    history.current = [...history.current, line].slice(-HISTORY_MAX);
    histAt.current = -1;
    setText('');
    try {
      const res = await execLine(line, { send, targets: (kind) => targetsOf(data.list(kind === 'chess' ? 'chess' : 'items')) });
      if (res.clear) setLines([]);
      if (res.lines.length) append(res.lines);
    } finally {
      setBusy(false);
      inputRef.current?.focus?.();
    }
  };

  const onKeyDown = (e) => {
    // the game's hotkeys are already inert while a text field has the focus (ui/gameLogic/shortcuts.js); these are the
    // console's own keys — Esc closes the panel, ↑ / ↓ walk the typed history
    e.stopPropagation();
    if (e.key === 'Escape') { onToggle?.(false); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const items = history.current;
    if (!items.length) return;
    e.preventDefault();
    const next = e.key === 'ArrowUp'
      ? (histAt.current < 0 ? items.length - 1 : Math.max(0, histAt.current - 1))
      : histAt.current < 0 ? -1 : Math.min(items.length - 1, histAt.current + 1);
    histAt.current = next;
    setText(next < 0 ? '' : items[next]);
  };

  return html`<div class="dbgconsole">
    ${open ? html`<${DebugConsolePanel} lines=${lines} text=${text} busy=${busy} listRef=${listRef} inputRef=${inputRef}
      onText=${setText} onKeyDown=${onKeyDown} onSubmit=${() => void run(text)} onClose=${() => onToggle?.(false)} />` : null}
    <button type="button" class=${`dbgconsole__toggle${open ? ' is-open' : ''}`} aria-expanded=${open}
      aria-label=${open ? '关闭控制台' : '打开控制台'} title="开发控制台"
      onKeyDown=${(e) => { if (e.key === ' ') e.stopPropagation(); }}
      onClick=${() => onToggle?.(!open)}>
      <${Icon} name="terminal" /><span>控制台</span>
    </button>
  </div>`;
}
