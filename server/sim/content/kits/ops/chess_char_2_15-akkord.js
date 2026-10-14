// server/sim/content/kits/ops/chess_char_2_15-akkord.js — 协律 (char_4051_akkord) kit, tier 2. The fork un-hid this chess
// (tools/build-data.mjs FORK_VISIBLE_CHESS, docs/design/fork.md §F7), so its kit is required like every visible one's.
// Conventions of the tier-2 kits: ../shared/tier2.js; kit contract and rules: ../README.md.

import {
  num, talentBb, traitBb, alliesInGridOf, onHitBy, instantKind, toggleBuff,
} from '../shared/tier1.js';
import { hypot } from '../../../detmath.js';

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 2_15 协律 震爆调谐 (S2, the default): ATK +atk; each attack sets off a sonic boom at every other operator in range:
  // attack@aoe_atk_scale × ATK arts within attack@range_radius. 律脉同构: ATK +atk with another operator in range. Elite
  // module (BLA-X): damage grows with distance, up to +damage_scale at max_dist tiles.
  // S1 反拍重音 (alt, 可充能2次): the next attack deals atk_scale × ATK arts (145 % / 170 %).
  chess_char_2_15_a: (bb, chess, def) => {
    const t = talentBb(chess, 0);
    const tb = traitBb(chess);
    const rad = num(bb['attack@range_radius'], 0.9), sc = num(bb['attack@aoe_atk_scale']);
    return {
      skill: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        onAttack({ battle, unit }) {
          if (!(sc > 0)) return;
          for (const a of alliesInGridOf(battle, unit)) {
            if (a === unit || a.kind !== 'op') continue;
            battle.fx('sonic', { x: a.x, y: a.y, radius: rad, id: unit.id });
            for (const e of battle.foesInRadius(a.x, a.y, rad)) {
              if (!e.s.flags.untargetable) battle.dealDamage(unit, e, { amount: unit.s.atk * sc, type: 'arts', isSkill: true, isSplash: true, tags: ['sonic'] });
            }
          }
        },
      },
      skills: {
        skchr_akkord_1: { kind: instantKind(def), attack: { atkScale: num(bb.atk_scale, 1), dmgType: 'arts' } },
      },
      talents: [{ install(battle, unit) {
        const v = num(t.atk);
        if (v) toggleBuff(battle, unit, 'akkord:sync', () => alliesInGridOf(battle, unit).some((a) => a !== unit && a.kind === 'op'), { atkPct: v });
        if (tb.damage_scale != null) {
          const mn = num(tb.min_dist), mx = num(tb.max_dist, 4), ds = num(tb.damage_scale);
          onHitBy(battle, unit, ({ target, dmg }) => {
            if (!dmg.isAttack) return;
            const d = hypot(target.x - unit.x, target.y - unit.y);
            dmg.amount *= 1 + ds * (mx > mn ? Math.max(0, Math.min(1, (d - mn) / (mx - mn))) : 1);
          });
        }
      } }],
    };
  },
};
