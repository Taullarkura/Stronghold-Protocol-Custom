// E.G.O 饰品 / 苦难 pick overlay (docs/design/ego.md, DESIGN §F16): a remake extension, opt-in per room (room.setEgo).
// On rounds 1 / 4 / 7 / 11 every living Doctor is offered three pairs (the owner's plan of 2026-10-19) and
// picks one at their own pace and with their own funds — the three offers are drawn from the seat's own stream
// (server/match/match/egoPick.js _egoSeat), so the pick is simultaneous, not turn-based: there is no "whose turn" line,
// only who has decided (m.public.ego picks / waiting) and the single window countdown (m.private.ego.deadline, untimed in
// solo). Each card shows its 饰品 (the reward: it strengthens the owner) and its 苦难 (the price: it strengthens the
// enemies, and at the boss rounds 14 / 15 the whole team's hardships scale to 1/3, floored — shared/ego.js
// scaleEgoEffects). Picking takes two taps like the shop and the 机变 draft (the first selects, the second confirms —
// user playtest #4 item 2), Escape or a tap outside drops the selection. 刷新 redraws the same seat's three options for
// 1 fund, at most twice (EGO_REFRESH_MAX); the button says how many are left and is disabled at 0 or without the funds.
// The offer records (name / desc / tier / icon) come from the server (m.private.ego.options), not from a data file: the
// client does not load data/ego-trinkets.json. A record's icon is machine-local art — public/assets/local/ego/<id>.png
// (server/http/localEgoArt.js serves it as the `ego` group of data/local-assets.json, custom_tools/download-egogift.cjs
// downloads it there) — and a record without one draws its glyph, so an install with no art requests nothing.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon, TierChip, Countdown, Button } from './components.js';
import { Img, RichText, GIcon } from './gameComponents.js';
import { localAsset } from '../data.js';
import { t, tName } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * URL of a record's icon, or null when this installation has none (then the card draws its glyph).
 * The art is machine-local (public/assets/local/ego/<record id>.png, server/http/localEgoArt.js), served as the `ego`
 * group of data/local-assets.json: a record whose file is absent has no entry, so nothing is requested and nothing 404s.
 * @param {any} rec a 饰品 / 苦难 record of m.private.ego.options
 */
export function egoArt(rec) {
  return rec && typeof rec.id === 'string' && rec.id ? localAsset('ego', rec.id) : null;
}

/**
 * Whether the picker may still act: the offer is open (no pick yet) and no request is in flight.
 * @param {any} ego m.private.ego @param {number|null} [busy] the option idx being sent, if any
 */
export function egoPickable(ego, busy = null) {
  return !!ego && ego.picked == null && busy == null;
}

/**
 * Whether the refresh may be sent: nothing picked, nothing in flight, refreshes left and the funds to pay for one.
 * @param {any} ego m.private.ego @param {boolean} [busy] a refresh is in flight
 */
export function egoRefreshable(ego, busy = false) {
  if (!ego || busy || ego.picked != null) return false;
  const left = Number(ego.refreshMax) - Number(ego.refreshes || 0);
  const cost = Number(ego.refreshCost || 0);
  return Number.isFinite(left) && left > 0 && Number(ego.funds || 0) >= cost;
}

/**
 * Two-tap step of an option tap, exactly as the shop and the 机变 draft behave: tapping an available option selects it,
 * tapping the selected one again confirms it, tapping one that cannot be picked changes nothing.
 * @param {number|null} armed the selected option's idx @param {number} idx the tapped option @param {boolean} pickable
 * @returns {{ armed: number|null, pick: number|null }} the new selection and the option to send (g.trinket) or null
 */
export function egoTap(armed, idx, pickable) {
  if (!pickable || !Number.isInteger(idx)) return { armed, pick: null };
  if (armed === idx) return { armed: null, pick: idx };
  return { armed: idx, pick: null };
}

/**
 * The selected option while it can still be picked, else null — a selection never outlives the state that allowed it
 * (a pick landing, a refresh replacing the options, a request in flight).
 * @param {number|null} armed @param {any} ego @param {{ busy?: number|null }} [o]
 */
export function egoArmed(armed, ego, { busy = null } = {}) {
  if (armed == null || !egoPickable(ego, busy)) return null;
  const opt = Array.isArray(ego.options) ? ego.options.find((o) => o && o.idx === armed) : null;
  return opt ? armed : null;
}

/**
 * The overlay: keeps the two-tap selection and renders EgoView. `onPick(idx, pickId)` sends g.trinket,
 * `onRefresh(pickId)` sends g.trinketRefresh.
 * @param {{ pub: any, ego: any, myId: string, solo?: boolean, total?: number|null, busy?: number|null, refreshing?: boolean,
 *   onPick: (idx: number, pickId: string) => void, onRefresh: (pickId: string) => void }} props
 */
export function EgoOverlay(props) {
  const { ego, busy = null } = props;
  const [sel, setSel] = useState(null);
  const armed = egoArmed(sel, ego, { busy });
  useEffect(() => { if (sel != null && armed == null) setSel(null); }, [sel, armed]);
  useEffect(() => {
    if (armed == null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed]);
  if (!ego) return null;
  const tap = (idx) => {
    const r = egoTap(armed, idx, egoPickable(ego, busy));
    setSel(r.armed);
    if (r.pick != null) props.onPick(r.pick, ego.id);
  };
  return html`<${EgoView} ...${props} armed=${armed} onTap=${tap}
    onConfirm=${() => { if (armed != null) tap(armed); }} onDisarm=${() => setSel(null)} />`;
}

/**
 * The overlay's view (pure: no hooks — test/ui renders it as a function).
 * @param {{ pub: any, ego: any, myId: string, solo?: boolean, total?: number|null, busy?: number|null, refreshing?: boolean,
 *   armed?: number|null, onTap?: (idx: number) => void, onConfirm?: () => void, onDisarm?: () => void,
 *   onRefresh?: (pickId: string) => void }} props
 */
export function EgoView({
  pub, ego, myId, solo = false, total = null, busy = null, refreshing = false, armed = null,
  onTap = () => {}, onConfirm = () => {}, onDisarm = () => {}, onRefresh = () => {},
}) {
  if (!ego) return null;
  const options = Array.isArray(ego.options) ? ego.options.filter((o) => o && o.trinket) : [];
  const picked = ego.picked != null;
  const can = egoPickable(ego, busy);
  const armedOpt = armed != null ? options.find((o) => o.idx === armed) : null;
  const armedName = armedOpt?.trinket ? (tName(armedOpt.trinket.name) || armedOpt.trinket.name) : null;
  const timed = !solo && !ego.untimed && Number(ego.deadline) > 0;
  const publicEgo = pub?.ego && typeof pub.ego === 'object' ? pub.ego : null;
  const waiting = Array.isArray(publicEgo?.waiting) ? publicEgo.waiting : [];
  const others = waiting.filter((pid) => pid !== myId);
  const left = Math.max(0, Number(ego.refreshMax || 0) - Number(ego.refreshes || 0));
  const canRefresh = egoRefreshable(ego, refreshing);
  // a press anywhere but a card or the confirm button drops the selection
  const onDown = (e) => {
    if (armed == null) return;
    const el = e.target;
    if (el && typeof el.closest === 'function' && el.closest('.egocard, .spov__confirm')) return;
    onDisarm();
  };
  return html`<div class=${cx('spov egoov', armed != null && 'has-armed')} role="dialog" aria-label=${t('E.G.O 抉择')} onPointerDown=${onDown}>
    <div class="spov__veil" aria-hidden="true"></div>
    <div class="spov__inner">
      <header class="spov__head">
        <div class="spov__titles">
          <i class="spov__deco" aria-hidden="true"></i>
          <h2 class="spov__title is-special"><span class="spov__name">${t('E.G.O 抉择')}</span><span class="spov__bar">|</span><span class="spov__desc"><${RichText} text=${t('选择一件饰品与一项苦难')} /></span></h2>
          <p class="spov__sub">${timed ? t('倒计时结束后仍未选定将自动分配') : t('选择一项（无时间限制）')}${can ? t(' · 点击卡牌选中，再次点击确认') : ''}</p>
        </div>
        <div class="spov__turn">
          ${picked ? html`<span class="spov__turntxt is-done"><${Icon} name="check" />${t('已完成选择')}</span>`
            : can ? html`<span class="spov__turntxt is-mine">${t('当前轮到你决策')}</span>`
            : html`<span class="spov__tw"><b>${t('选择中')}</b></span>`}
          ${others.length ? html`<span class="egoov__waiting">${t('{n} 位博士尚未选择', { n: others.length })}</span>` : null}
          ${armed != null ? html`<${Button} variant="primary" size="lg" icon="check" class="spov__confirm" data-testid="ego-confirm"
              title=${armedName ? t('确认选择「{armedName}」（再次点击卡牌亦可）', { armedName }) : t('确认选择')} onClick=${onConfirm}>${t('确认选择')}<//>` : null}
          ${can && Number(ego.refreshMax) > 0 ? html`<${Button} variant="secondary" size="md" icon="refresh" class="egoov__refresh"
              disabled=${!canRefresh} loading=${!!refreshing} title=${t('花 1 资金重抽三选一')} onClick=${() => canRefresh && onRefresh(ego.id)}>${t('刷新（剩余 {n} 次）', { n: left })}<//>` : null}
          ${timed ? html`<${Countdown} deadline=${ego.deadline} total=${total ?? ego.turnSeconds ?? undefined} size="md" />` : null}
        </div>
      </header>
      <p class="egoov__note">${t('饰品强化我方，苦难强化敌方；第 14 / 15 回合苦难作用于全队，效果降为三分之一')}</p>
      <div class="spov__grid spov__grid--3 egoov__grid">
        ${options.map((opt) => {
          const tr = opt.trinket || {};
          const hs = opt.hardship || null;
          const isArmed = can && armed === opt.idx;
          const isBusy = busy != null && busy === opt.idx;
          const trName = tName(tr.name) || tr.name || t('饰品');
          const hsName = hs ? (tName(hs.name) || hs.name || t('苦难')) : t('苦难');
          return html`<button key=${opt.idx} type="button"
              class=${cx('spcard egocard', picked && 'is-taken', isArmed && 'is-armed', isBusy && 'is-busy')}
              aria-busy=${isBusy ? 'true' : undefined} aria-pressed=${can ? String(isArmed) : undefined} disabled=${!can}
              onClick=${() => can && onTap(opt.idx)}
              aria-label=${isArmed ? t('{name}，已选中，再次点击确认', { name: trName }) : `${trName} · ${hsName}`}
              title=${`${trName}\n${tr.desc || ''}${hs ? `\n${hsName}\n${hs.desc || ''}` : ''}`}>
            <span class="egocard__part egocard__part--trinket">
              <span class="spcard__head">
                <span class="spcard__icon"><${Img} src=${egoArt(tr)} fallback=${html`<${GIcon} name="bolt" />`} /></span>
                <span class="spcard__title">
                  <b class="spcard__name">${trName}</b>
                  <span class="spcard__tags"><span class="spcard__tag spcard__tag--team">${t('饰品')}</span></span>
                </span>
              </span>
              <${RichText} text=${tr.desc || ''} class="spcard__desc" />
            </span>
            ${hs ? html`<span class="egocard__part egocard__part--hardship">
              <span class="spcard__head">
                <span class="spcard__icon"><${Img} src=${egoArt(hs)} fallback=${html`<${GIcon} name="skull" />`} /></span>
                <span class="spcard__title">
                  <b class="spcard__name">${hsName}</b>
                  <span class="spcard__tags"><span class="spcard__tag spcard__tag--coin">${t('苦难')}</span></span>
                </span>
              </span>
              <${RichText} text=${hs.desc || ''} class="spcard__desc" />
            </span>` : null}
            ${Number.isFinite(opt.tier) ? html`<${TierChip} tier=${opt.tier} size="md" class="spcard__tier" />` : null}
            ${isArmed ? html`<span class="spcard__confirm" role="status"><span class="spcard__cbox"><${Icon} name="check" /></span><b>${t('确认选择')}</b><small>${t('再次点击')}</small></span>` : null}
            ${isBusy ? html`<span class="spcard__busy" role="status">${t('选择中')}</span>` : null}
          </button>`;
        })}
      </div>
    </div>
  </div>`;
}
