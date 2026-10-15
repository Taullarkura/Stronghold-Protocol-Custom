// In-match damage report: actual damage credited by the local battle simulation, sorted by operator.

import { html, Icon } from './components.js';
import { UnitThumb } from './gameComponents.js';
import { fmtNum } from './gameLogic.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const exactDamage = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US');

/**
 * @param {{ report: any, playerName?: string, open: boolean, onToggle: (open: boolean) => void }} props
 */
export function DamageCounter({ report = null, playerName = '', open = false, onToggle }) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const total = Math.max(0, Number(report?.total) || 0);
  return html`<div class="dmgcounter">
    ${open ? html`<section class="dmgcounter__panel" role="region" aria-label=${t('局内伤害统计')}>
      <header class="dmgcounter__head">
        <div class="dmgcounter__title">
          <span class="dmgcounter__eyebrow">DAMAGE REPORT</span>
          <b>${playerName || t('本局')}</b>
        </div>
        <span class=${cx('dmgcounter__status', report?.done && 'is-done')}>${report?.done ? t('已结算') : t('进行中')}</span>
        <button type="button" class="dmgcounter__close" aria-label=${t('关闭伤害统计')} title=${t('关闭')}
          onClick=${() => onToggle(false)}><${Icon} name="close" /></button>
      </header>
      <div class="dmgcounter__summary">
        <span>${t('实际伤害')}</span>
        <strong>${fmtNum(total)}</strong>
        <small>${t('第 {round} 回合 · 每半秒更新', { round: report?.round ?? '—' })}</small>
      </div>
      <ol class="dmgcounter__rows" aria-label=${t('干员伤害排行')}>
        ${rows.length ? rows.map((row, i) => {
          const share = total > 0 ? Math.max(0, Math.min(100, row.damage / total * 100)) : 0;
          return html`<li key=${row.key} class="dmgcounter__row">
            <span class="dmgcounter__rank">${i + 1}</span>
            ${row.kind === 'chess'
              ? html`<${UnitThumb} kind="chess" id=${row.defId} golden=${row.golden} size="sm" showTier=${false} class="dmgcounter__thumb" title=${row.name} />`
              : html`<span class="dmgcounter__other" aria-hidden="true">···</span>`}
            <div class="dmgcounter__operator">
              <b title=${row.name || t('其他单位')}>${row.name || t('其他单位')}</b>
              <div class="dmgcounter__bar" aria-hidden="true"><i style=${`--damage-share:${share.toFixed(1)}%`}></i></div>
            </div>
            <div class="dmgcounter__value">
              <b>${exactDamage(row.damage)}</b>
              <span>${share.toFixed(1)}%</span>
            </div>
          </li>`;
        }) : html`<li class="dmgcounter__empty">${t('尚无伤害记录')}</li>`}
      </ol>
      <details class="dmgcounter__criteria">
        <summary>${t('统计口径')}</summary>
        <p>${t('按实际扣除的敌方生命值统计；召唤物伤害计入所属干员，其他单位单独归类。多人战场统计当前战场。')}</p>
      </details>
    </section>` : null}
    <button type="button" class=${cx('dmgcounter__toggle', open && 'is-open')} aria-expanded=${open}
      aria-label=${open ? t('关闭伤害统计') : t('打开伤害统计')} title=${t('伤害统计')}
      onKeyDown=${(e) => { if (e.key === ' ') e.stopPropagation(); }}
      onClick=${() => onToggle(!open)}>
      <${Icon} name="chart" /><span>${t('伤害')}</span>
    </button>
  </div>`;
}
