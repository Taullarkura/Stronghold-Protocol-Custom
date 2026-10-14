// shared/diyOnly.js — FORK EXTENSION, the owner's 可用干员 → 自选干员 demotions (decisions of 2026-10-12 and 2026-10-13). The
// inverse of the 自选干员 → 可用干员 promotions of shared/promoted.js.
//
// A demoted operator's shop chess leaves the global roster: `tools/build-data.mjs` no longer writes its chess records,
// so the shop, the draft pool, the band rosters and the bond member lists lose it. As an owned 6★ outside the shop
// roster ("不可甄选加入已在名单中的固定干员": the pool excludes every character a shop chess names) it then enters
// `diy.ownedPool` on its own, and is fieldable through the 4 自选 slots only — at the slots' 练度 (normal E2 Lv1 skill
// rank 4 without a module, elite E2 Lv60 rank 7 with every module at its stage).
//
// A 自选 piece carries **no 特质** (shared/standIn.js composeUnitRecord: `raw.garrisonIds` is empty) and derives its 盟约
// from its operator's own factions. So a demotion removes the operator's `garrison_<n>_a/_b` records from
// data/garrisons.json as well — build-data only emits the garrisons a chess references, and no chess references them
// any more — and its bonds come from `charTable[charId].mainPower` / `.subPower` (the DIY rule), not from its former
// chess's `bondIds`.
//
// Because its kit file is keyed by the chess id it used to have, `server/sim/content/kits/index.js` aliases that kit
// under the operator's charId — the key a 自选 piece resolves its kit by (content/index.js kitOf: an "other body" def
// looks up `def.charId`) — and adds the operator to KITTED_CHARS (a pick without a kit is not offered: shared/diy.js
// diyPool / validateDiyPicks `kitted`).
//
// Consumed by tools/build-data.mjs (the chess records + the 自选 pool) and server/sim/content/kits/index.js (the kit
// alias). An empty list restores upstream's data.
//
// @typedef {{ charId: string, label: string, chessIds: string[], kitChessId: string }} DiyOnlyOperator

/** Every shop operator demoted into the 自选 pool. */
export const DIY_ONLY_OPERATORS = Object.freeze([
  Object.freeze({
    charId: 'char_245_cello',       // 塑心, the fork's 自选-only 6★ SUPPORT ritualist (盟约 by its own faction: 拉特兰)
    label: '塑心',                   // i18n-ignore: the operator's own data name, the same as character_table carries
    chessIds: Object.freeze(['chess_char_6_09_a', 'chess_char_6_09_b']),   // its former shop chess (normal + elite)
    kitChessId: 'chess_char_6_09_a', // the key its kit file registers (kits/ops/chess_char_6_09-cello.js → TIER_KITS)
  }),
  Object.freeze({
    charId: 'char_1028_texas2',     // 缄默德克萨斯, the owner's plan of 2026-10-12 (盟约 by its own faction: 叙拉古)
    label: '缄默德克萨斯',            // i18n-ignore: as above
    chessIds: Object.freeze(['chess_char_4_16_a', 'chess_char_4_16_b']),   // its former shop chess (tier 4, normal + elite)
    kitChessId: 'chess_char_4_16_a', // kits/ops/chess_char_4_16-texas2.js → TIER_KITS
  }),
  Object.freeze({
    charId: 'char_426_billro',      // 卡涅利安, the owner's plan of 2026-10-13 (盟约 by its own factions)
    label: '卡涅利安',               // i18n-ignore: as above
    chessIds: Object.freeze(['chess_char_4_24_a', 'chess_char_4_24_b']),   // its former shop chess (tier 4, normal + elite)
    kitChessId: 'chess_char_4_24_a', // kits/ops/chess_char_4_24-billro.js → TIER_KITS
  }),
  Object.freeze({
    charId: 'char_213_mostma',      // 莫斯提马, the owner's plan of 2026-10-13 (盟约 by its own factions: her mainPower
                                    // laterano meets 拉特兰, its lungmen subPower adds 炎 — not the chess's 拉特兰 + 奥术)
    label: '莫斯提马',               // i18n-ignore: as above
    chessIds: Object.freeze(['chess_char_4_02_a', 'chess_char_4_02_b']),   // its former shop chess (tier 4, normal + elite)
    kitChessId: 'chess_char_4_02_a', // kits/ops/chess_char_4_02-mostma.js → TIER_KITS
  }),
]);

/** Every chess id a demotion withdraws (tools/build-data.mjs buildChess skips these). @returns {Set<string>} */
export function diyOnlyChessIds() {
  return new Set(DIY_ONLY_OPERATORS.flatMap((p) => p.chessIds));
}

/** `[{ charId, kitChessId }]` — the kit alias a demoted operator needs (server/sim/content/kits/index.js). */
export function diyOnlyKitAliases() {
  return DIY_ONLY_OPERATORS.map((p) => ({ charId: p.charId, kitChessId: p.kitChessId }));
}
