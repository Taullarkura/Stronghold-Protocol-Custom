# DESIGN §F16 — E.G.O 饰品 and 苦难: an opt-in pick of three (a remake extension)

Part of [DESIGN.md](../DESIGN.md) (the index). The rule itself is §F16 in [fork.md](fork.md); this file is the reference
for the data and the code below it. Nothing here runs unless a room turns the option on (see the last section).

## What the system is

Every alive player, on its own screen, picks **one of three** options. An option pairs one **E.G.O 饰品** (a global
effect for the player who picked it — a buff to their own operators and their own economy) with one **苦难** (a buff
to that player's enemies). The pair is the deal: you cannot take the trinket without its hardship.

The pick opens on rounds **1 / 4 / 7 / 11** (`EGO_ROUNDS`) and comes right after `ROUND_START`, before the round's
`[SP_DRAFT]` — a 机变 round runs the pick first. Each pick is a bounded window (`timers.egoPick`, 25 s) with one shared
deadline (`m.public.deadline`); a player who lets it run out takes their first option. Solo and any single-human match
is untimed (`Match.soloUntimed`).

A refresh costs **1 资金 of the picker's own funds** and re-rolls their three options, at most **2 times** per pick
(`EGO_REFRESH_COST` / `EGO_REFRESH_MAX`). The offer belongs to one seat: another player's funds, options and refresh
count never move.

## The closed kind vocabulary

`server/sim/content/ego.js` reads effects; `shared/ego.js EFFECT_KINDS` declares them, and `validateEgo()` refuses an
unknown kind or a param outside its declaration (`tools/build-data.mjs` and `test/data.test.js` both run it). This is the
list a client labels a card from, and it is why an effect that exists in the data but has no reader cannot pass quietly.

**Trinket kinds (`target: 'own'`).**

| kind | params | what it does |
|---|---|---|
| `opMods` | `atk, def, hp, aspd, dmgDealt, dmgTaken, res` | percentages on every own operator (`directMods` keeps them additive) |
| `income` | `amount` | extra funds at each round start |
| `shopDiscount` | `pct` | shop prices down by that share (`onPrice` → `ctx.modifyPrice`) |
| `sellBonus` | `pct` | a larger refund on a sale (`onSold` → `ev.gain`) |
| `freeRefresh` | `count` | free shop refreshes each round |
| `bondLayers` | `bond, count` | layers on a named bond each round |
| `healOnKill` | `amount` | HP back on a kill |
| `burnOnSpawn` | `stacks` | 烧伤 layers on every enemy as it walks in (尘归尘 3, 土归土 2, 镇魂 5) |
| `burnSpan` | `seconds, perActiveBond, max` | one layer lasts longer: `seconds` flat, plus `perActiveBond` per active 盟约, the extra capped at `max` |
| `burnAmp` | `pct` | 烧伤 ticks harder — both the 法术伤害 and the 灼燃损伤 (镇魂 50 %) |
| `burnHaste` | `aspd, duration, maxStacks` | damaging a burning enemy gives an own operator 攻速 for `duration` s, at most `maxStacks` independent layers |
| `burnChance` | `pct, burningPct` | chance to add a layer on damage, the higher one when the target already burns (10 / 20) |
| `burnVuln` | `perStack` | a burning enemy takes that much more damage per layer (炎鳞 10) |
| `burnEndBurst` | `perLayer, floor` | when the 烧伤 runs out: (active 盟约 layers × layers spent × `perLayer`) 法术伤害, at least `floor` |
| `burnDetonate` | `threshold, consume, perLayer` | applying more than `threshold` layers eats `consume` of them and hits at once for (active 盟约 layers × `perLayer`) |

**Hardship kinds (`target: 'enemy'`).**

| kind | params | what it does |
|---|---|---|
| `enemyMods` | `atk, def, hp, aspd, res, moveSpeed, dmgDealt, physTaken, artsTaken` | enemy stats — **additively shared**: 锐利 I + II is +45 %, never 1.15 × 1.30 (`enemyModsOf` → `atkPct` / `defPct` / `hpPct`, never `*Mul`) |
| `enemyShield` | `pct` | a shield of that share of max HP at spawn |
| `extraEnemies` | `count, tier` | more enemies per wave |
| `enemyRegen` | `amount` | HP per second |
| `fasterSpawns` | `pct` | spawn interval × (1 − pct); the sum is capped at 90 % |
| `enemyDodge` | `phys, arts` | chance to dodge that damage type (怎么，打不中吗？ 20 / 20) |
| `enemyRefraction` | `res, duration` | 折射: +res 法抗 for `duration` seconds (0 = the whole battle); on an enemy that already refracts it is 免疫沉默 instead |
| `enemyTrueDrain` | `pct, cap` | loses that share of max HP a second as 真实伤害, at most `cap`; immune to 眩晕 / 恐惧 / 束缚 |
| `enemyUndying` | `seconds` | a lethal hit leaves 1 HP, then it dies for real after `seconds` |
| `enemyLastStandHeal` | `belowPct, healPct` | below that share of max HP it heals that share of max HP, once |
| `shopInflation` | `pct` | that share of shop 干员 / 装备 cost 1 more fund (the one hardship read by the prep side) |

`target` is enforced: a trinket never carries an `enemy` kind and a hardship never carries an `own` one.

**烧伤 (`BURN`).** Not a trinket: a general status the burn family adds. One status carries `stacks` layers, and **a
layer is time, not damage** — the clock spends one layer every `BURN.perStack` seconds (3), so N layers last
N × 3 s and the last one expires the status. Every second the burning unit takes `BURN.dmg` 法术伤害 and `BURN.chip`
灼燃损伤 — a **fixed** amount, never multiplied by the layer count (the owner's rule of 2026-10-20: 「每秒伤害恒为 300 +
100，每层只延长 3 秒」). 炎鳞's `burnEndBurst` counts only the layers the **clock** spent, not the ones `burnDetonate`
ate. The tick is the sim's own (`server/sim/constants.js TICK`), never a real clock, so the behaviour is the same at any
frame rate and the golden results stay deterministic.

## Tiers and the draw

Three tiers, I / II / III, rolled **before** the item at 60 / 30 / 10 %; inside a tier every record is equally likely
(the owner's rule 「先抽阶、再在同阶里等概率抽饰品」). **Both sides of a deal always come from the same tier**: the draw
rolls a tier, takes one 饰品 and one 苦难 from the ones that tier still has, and pairs them. A draw does not repeat a
trinket or a hardship among its three options, and a tier that has run dry on either side is **skipped, not widened**, so
a tier III 饰品 never arrives with a tier I 苦难 and a tier with no 饰品 never appears at all. Only when the whole ladder
is spent — a catalogue smaller than the offer — does an option repeat a record, and it repeats inside one tier. A draw
never comes back short. `rollEgoOffer` does this on a caller-owned rng stream.

**Determinism.** Each seat draws from `createRng(deriveSeed(seed, 'ego:<round>:<seat>:<salt>'))` — `salt` is `initial`
for the first offer and `refresh:<n>` for the n-th refresh. The result therefore never depends on the order players act
in, and one seat's refresh cannot move another's offer.

## Where a hardship reaches

A hardship's stored effects are always **full strength with `scope: 'own'`**; the record does not depend on the round.
`PlayerState._effectRef` decides at battle start:

- a normal round: that player's own half of the field (`scope: 'own'`);
- a boss round (**14 / 15**, `EGO_BOSS_ROUNDS`): scaled by `EGO_BOSS_DIVISOR` (3) and widened to **every** player's
  enemies (`scope: 'all'`). Scaling floors every numeric param; a param that would fall to 0 is dropped rather than kept
  at full strength (10 % → 3 %, a 1-point regen → skipped).

For 联防 the helper fights with **its own** hardships — the ones the player who runs to help picked — because the ref
rides that player's battle input (`egoSpawnMods`, `round.js` battleInput → playerEffects).

## The data

`data/ego-trinkets.json` is **generated**: `shared/ego.js` holds the hand-written `TRINKETS` / `HARDSHIPS` and
`tools/build-data.mjs buildEgoTrinkets()` writes the file (`trinkets`, `hardships`, `tiers`, `rounds`, `bossRounds`,
`bossDivisor`, `burn`, `kinds`). Never hand-edit it — see [DATA.md](../DATA.md) §19.

Each record: `{ id, name, tier, icon, short?, desc, effects: [{ kind, params }] }`. `short` is **optional** — it is the
pick card's one-line summary and is carried only by a record whose `desc` is too long for the card (today only 炎鳞, whose
three clauses of numbers and triggers used to overflow it). A record without one shows its `desc` on the card instead, and
the right-hand effect list shows the full `desc` either way. `validateEgo()` caps `short` at 60 characters. `icon` is the
record's display name (art is found by `id`, see "The icons"); the
client's icon family is `iconKind: 'ego'`.

The catalogue is the owner's design of 2026-10-20: six 饰品 of the 烧伤 school and eighteen 苦难. His numbers are used
as written; a value his note left open is marked **[ASSUMED]** in `shared/ego.js` where it is set (折射's 70 RES / 20 s,
and the 炎鳞 burst floor of 2500). Records are independent rows — 锐利 I and 锐利 II are separate picks and both can be
held at once, and the list keeps growing (the owner adds to it: 这只是部分饰品).

## The wire

| message | direction | payload |
|---|---|---|
| `room.setEgo { on }` | C2S, host, before the match | the room option 「E.G.O 饰品与苦难」 (see [network.md](network.md)) |
| `g.trinket { idx, pickId? }` | C2S | take option `idx`; `pickId` is the `m.private.ego.id` the client was shown, so a stale overlay cannot pick the wrong card |
| `g.trinketRefresh { pickId? }` | C2S | re-roll (1 资金, at most 2) |
| `m.private.ego` | S2C | the caller's own offer: `{ id, round, refreshes, refreshMax, refreshCost, funds, untimed, deadline, turnSeconds, picked, options: [{ idx, tier, trinket, hardship }] }` |
| `m.public.ego` | S2C | `{ round, untimed, turnSeconds, waiting, picks, taken }` — who is still deciding and what each has taken |

The offer is `m.private`, one per player: there is no shared pool and no turn order. [match.md](match.md) carries the
pick in the phase chain.

## The screen

`public/js/ui/egoOverlay.js` is the in-match overlay, built on the 机变 draft's frame (`public/css/screens/
game-panels.css`, the `.spov` / `.spcard` baseline) because both are a two-tap pick of three cards over the board:

- **One card is one deal.** The card is cut in two halves — the 饰品 (`GIcon bolt`, tag 饰品) above the 苦难 (`GIcon
  skull`, tag 苦难) — with the pair's `TierChip` on the card. A card is never a lone trinket.
- **A long description gets a summary** (the fix of 2026-10-21). Each half renders the record's `short` when it has one
  and its `desc` otherwise: 炎鳞's three-clause text used to overflow the card, so it and only it carries a summary, while a
  苦难 (one number per line) carries none. The full `desc` is read in battle in the right-hand effect list
  (`effectsList.js`, the 饰品 family), and the half's `title` attribute still carries it on hover.
- **Two taps, as everywhere else in the game.** The first tap arms a card (`.is-armed`, the others dim and the card
  shows `☑ 确认选择 · 再次点击`), the second sends `g.trinket`. A confirm button and `Escape` do the same thing, and a
  press outside the cards drops the selection (`egoTap` / `egoArmed` keep the state machine pure, as `choiceOverlay.js`
  does for the draft).
- **The refresh sits beside the confirm.** It is disabled with no refreshes left or no funds, and it says the count
  (`刷新（剩余 n 次）`).
- **No turn order, so the header names the wait instead.** `m.public.ego.waiting` minus the caller drives `{n} 位博士尚未
  选择`; a seat that has picked sees its offer read-only (`已完成选择`). An untimed pick (solo) shows no countdown.
- **Art is machine-local and optional.** `public/assets/local/ego/<record id>.png` (`.webp` / `.jpg` / `.avif` / `.gif`
  too) is served as the `ego` group of `data/local-assets.json` (`server/http/localEgoArt.js`, hashed like any other
  art), so the card asks for `localAsset('ego', id)` and a record with no file draws its glyph: no request, no 404. The
  directory is under `public/assets/local/**`, which `tools/fetch-assets.mjs --prune` never removes, and the art itself
  is never in git (game art). An operator drops one file per record; the mirror's official 饰品 icons are fetched by a
  script the owner keeps outside the repository. The same applies to the right-hand effect list (`effectsList.js` labels
  the family 饰品).

The overlay only renders in `PHASE.EGO_PICK` with an `m.private.ego` present, so a room with the option off never mounts
it. `public/js/ui/gameActions.js` carries the two messages (`trinket`, `trinketRefresh`), both with `pickId`, and
`test/ui/ego-overlay.test.js` pins the view, the two-tap step and the wire.

## Why off by default

The shipped build has `config.ego.enabled` **false**, so a normal match never reaches `PHASE.EGO_PICK` and every golden
result is unchanged. A host flips it per room (`room.setEgo`, `room.state.ego`); a server owner can change the default a
new room starts with (`startServer({ egoDefault: true })`). See §F16 in [fork.md](fork.md).
