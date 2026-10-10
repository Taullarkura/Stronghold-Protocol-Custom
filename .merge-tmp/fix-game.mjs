// 一次性解决 public/js/screens/game.js 的 12 个冲突（锚点精确替换，失败即报错、不写入）。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/screens/game.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const once = (from) => {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`锚点缺失: ${JSON.stringify(from.slice(0, 50))}`);
  if (text.indexOf(from, i + 1) >= 0) throw new Error(`锚点重复: ${JSON.stringify(from.slice(0, 50))}`);
  return i;
};
const swap = (from, to, label) => { const i = once(from); text = text.slice(0, i) + to + text.slice(i + from.length); console.log(`[${label}] ok`); };
const cut = (startText, endText, newText, label) => {
  const s = once(startText);
  const e = text.indexOf(endText, s + startText.length);
  if (e < 0) throw new Error(`[${label}] 结束锚点缺失: ${JSON.stringify(endText.slice(0, 50))}`);
  text = text.slice(0, s) + newText + text.slice(e);
  console.log(`[${label}] ${e - s} -> ${newText.length}`);
};

// 1) ../ui/gameLogic.js 的导入（并集）
cut('<<<<<<< HEAD\n  snapHud, createHudDelay,', ">>>>>>> upstream/master\n} from '../ui/gameLogic.js';",
  '  snapHud, createHudDelay, pickDrawn, drawnChanged, hudChanged, drawnOf, ownFieldGate, snapUnits, activeBubbles, shortcutFor, shortcutBlocked, closesOnFieldPress, phaseTotalSeconds, homeFieldId, ownFieldId, normalizeSp, normalizePersonalChoice, sortedPlayers,\n'
  + '  terrainInfo, deviceInfo, deviceTipAt, noteDeviceUnits,\n'
  + '  countdownState, shopBlockReason, stageOverrides, effectiveStage, watchTarget, dropFailureReason,\n'
  + '  previewEnemyKey, prepCamera, prepCameraFor, foldCamera, deployFieldOf, fieldTile, panelSide, panelSlots, bondPopupPlace, unitLoadout, deployedRecord,\n'
  + '  mergeTarget, modeOffBonds, readyFundsPrompt, readyShopFold, ownerBandId, ownDiyRecord, ownStandIn, selectVoiceKey, detailSelectVoice, bondStripFolded,\n',
  'imports-gameLogic');

// 2) ./game/* 的导入（并集）
cut("<<<<<<< HEAD\nimport { keepEarly } from './game/early.js';", "import { t, tParts } from '../../../shared/i18n.js';",
  "import { keepEarly, audioEarly } from './game/early.js';\n"
  + "import { MatchEnded, PausedOverlay, SpectatorPresence } from './game/overlays.js';\n"
  + "import { inspectRange } from './game/range.js';\n",
  'imports-game');

// 3) 音频导入：结算语音改用上游的 resultSpeaker / resultVoiceSlot
swap("import { audio, unitSoundClass, settlementVoice } from '../audio.js';",
  "import { audio, unitSoundClass, resultSpeaker, resultVoiceSlot } from '../audio.js';", 'imports-audio');

// 4) sayResult：文案 + 实现（上游的 resultSpeaker + resultVoiceSlot）
cut(' * 结算 voice (DESIGN §21.30): the settlement line after one of the player\'s own battles',
  'function sayResult(battleId, myId, difficulty, shownCharId = null) {',
  ' * 结算 voice (DESIGN §21.30): the settlement line after one of the player\'s own battles — picked from how THAT battle\n'
  + ' * went (battle/runner.js settlement: perfect → 3星结束行动, on 绝境 / 终极 完成高难行动; a leak → 非3星结束行动; nothing\n'
  + ' * killed, or a boss that survived → 行动失败) and spoken by an operator of that battle (its unitsEnd, survivors first,\n'
  + ' * one that has the line: audio.js resultSpeaker + voiceLine), whatever field is on screen. unitsEnd names chess ids:\n'
  + ' * `shownCharId` maps one to the operator the own piece shows (MatchScreen ownShown) — a 补位 piece\'s stand-in, whose\n'
  + ' * own voice speaks (a 预备干员 stand-in has no lines: another operator of the battle says it, never the operator it\n'
  + ' * replaces), a filled 自选 slot\'s operator, else the chess record\'s charId. The battle id rides along as the\n'
  + ' * unitKey, so re-mounts, replays, the drawn end and the runner\'s \'ownDone\' alike say it once per battle. Nothing\n'
  + ' * for a battle still running, a display replica, or server-run combat (no runner).\n'
  + ' * @param {string} battleId @param {string|null} myId @param {string|null|undefined} difficulty m.public.difficulty\n'
  + ' * @param {((chessId: string) => string|null) | null} [shownCharId]\n'
  + ' */\n',
  'sayResult-doc');
cut('    const v = settlementVoice(st, {', '  } catch { /* the line is cosmetic */ }',
  '    if (!st) return;\n'
  + '    const charId = resultSpeaker(st, Math.random, typeof shownCharId === \'function\' ? shownCharId : (id) => getChess(id)?.charId ?? null);\n'
  + '    if (!charId) return;\n'
  + '    audio.voice(charId, resultVoiceSlot({\n'
  + '      perfect: !!st.perfect,\n'
  + '      leaked: Array.isArray(st.leaked) ? st.leaked.length : 0,\n'
  + '      killed: st.killed ?? 0,\n'
  + '      total: st.total ?? 0,\n'
  + '      hard: difficulty === \'HARD\' || difficulty === \'ABYSS\',\n'
  + '    }), { unitKey: battleId });\n'
  + '  } catch { /* the line is cosmetic */ }',
  'sayResult-body');

// 5) 观战者（fork 的 isSpectator / publicSpectator + 上游的 specFacts）
swap("  const roomSolo = useStore((s) => s.room?.mode === 'solo');\n<<<<<<< HEAD\n",
  "  const roomSolo = useStore((s) => s.room?.mode === 'solo');\n", 'h3a');
cut("=======\n  const spectator = useStore((s) => isSpectating(s.room, s.me.playerId));\n", '>>>>>>> upstream/master\n', '', 'h3b');

// 6) live.current（并集）
cut('<<<<<<< HEAD\n  live.current = {', '>>>>>>> upstream/master\n',
  '  live.current = { pub, priv, field, editable, hasPersonalChoice, placeCtx, watching, watchWho, home, myId, alive, spectator, detail, drawer, bondOpen, emoteOpen, settingsOpen, exitOpen, drag, facing, sel, selBusy, pen, collapsedNow: collapsed, drawnDone: false, ownHeld: false, localDone: false, canPause: false, paused, shownCharId };\n',
  'h4');

// 7) snapUnitsRef / deviceUnitsRef（并集）
cut('<<<<<<< HEAD\n  const snapUnitsRef = useRef(new Map());', '>>>>>>> upstream/master\n',
  '  const snapUnitsRef = useRef(new Map());              // the drawn frame\'s units (released through the HUD queue)\n'
  + '  // the shown battle\'s device units (crates / “双眼皮” turrets: UnitInfo by id) — the meta\'s `units` plus the \'spawn\' events,\n'
  + '  // for the tap on a device (gameLogic.deviceTipAt); the renderer\'s pick skips devices, a tap on one lands in tileClick\n'
  + '  const deviceUnitsRef = useRef(new Map());\n',
  'h5');

// 8) 离开旧战场时的结算语音（上游的 inBattleCard + fork 的 leaving）
cut('<<<<<<< HEAD\n    if (lastFieldRef.current &&', '>>>>>>> upstream/master\n',
  '    if (lastFieldRef.current && lastFieldRef.current !== field.fieldId) setDetail((d) => (inBattleCard(d) ? null : d));\n'
  + '    // the own battle drawn until now whose end was not drawn yet (the view moves to another field, or re-enters this one\n'
  + '    // and starts its picture at the end): its settlement line goes now if it is over (sayResult; once per battle) — else\n'
  + '    // the runner\'s \'ownDone\' says it when it ends off screen, or its drawn end when it is back on screen\n'
  + '    const leaving = drawnRef.current;\n',
  'h6');

// 9) 进入战场时回放早期事件（fork 的 quiet 推送 + 上游的 audioEarly 声音）
cut('<<<<<<< HEAD\n      // replay state-bearing events and lasting fx only', '>>>>>>> upstream/master\n',
  '      // replay state-bearing events and lasting fx only (a burst of stale hit sparks / damage numbers would look wrong);\n'
  + '      // stamped with the snapshot\'s game time, so the render clock does not drop a lasting fx as a stale cosmetic one —\n'
  + '      // and `quiet`, so the engine draws them without handing them to the sound (\'battleEvents\'): that stamp makes them\n'
  + '      // look fresh, and a field shown again after a catch-up would replay the deaths, deploys and 漏怪 alarm of the\n'
  + '      // seconds it skipped. The sound gets the buffer\'s spawns instead (audioEarly: the \'spawn\' tuples alone, which\n'
  + '      // teach the audio who is on the field, never the old deaths / deploy lines / casts of the skipped seconds).\n'
  + '      view.pushEvents({ ev: early, gt: earlySnap?.gt, quiet: true });\n'
  + '      audio.handleBattleEvents(audioEarly(early));\n',
  'h7');

// 10) 实时帧的声音（上游的 noteDeviceUnits + fork 的 handOver 过滤）
cut('<<<<<<< HEAD\n      // the DOM fallback hears the frames', '>>>>>>> upstream/master\n',
  '      noteDeviceUnits(deviceUnitsRef.current, { events: msg.ev });\n'
  + '      // the DOM fallback hears the frames as they come, with no render clock to drop a late tuple (render/app.js\n'
  + '      // heardEvents): a hand-over batch — a catch-up frame, the hidden-tab backlog (battle/runner.js `handOver`) —\n'
  + '      // gives the sound only its spawns (the unit map), so a field shown again after a catch-up never says a 作战中 /\n'
  + '      // 部署 or plays a death of the seconds it skipped\n'
  + '      if (!engine) audio.handleBattleEvents(msg.handOver ? msg.ev.filter((x) => Array.isArray(x) && x[0] === \'spawn\') : msg.ev);\n',
  'h8');

// 11) 阶段变化时关闭详情卡（上游的 inBattleCard + fork 的道具卡清理）
cut("<<<<<<< HEAD\n    if (!isCombatPhase(phase) && phase !== PHASE.SETTLE) setDetail((d) => (d?.kind === 'unit' ? null : d));", '>>>>>>> upstream/master\n',
  "    if (!isCombatPhase(phase) && phase !== PHASE.SETTLE) setDetail((d) => (inBattleCard(d) ? null : d));\n"
  + "    // a shop card's / item's detail belongs to the prep it was opened in: on a phone it kept covering the left of the\n"
  + "    // battlefield through the fight (phone audit S6)\n"
  + "    if (isCombatPhase(phase)) { setCollapsed(false); setDrag(null); view?.highlightTiles(null, null); setDetail((d) => (d?.kind === 'chess' || d?.kind === 'item' ? null : d)); }\n",
  'h9');

// 12) 两个 effect：公开赛观战跟随（fork）+ 个人机变选择（上游）
cut("<<<<<<< HEAD\n  // a public match's spectator watches", '>>>>>>> upstream/master\n',
  "  // a public match's spectator watches the field the room Worker pushes it (worker/rooms/spectators.js sync: the\n"
  + "  // watched player's board in prep, the watched battle — a team row's g.watch picks them), in every phase\n"
  + "  useEffect(() => { if (publicSpectator && field?.fieldId) setWatching(field.fieldId); }, [publicSpectator, field?.fieldId, phaseKey]);\n"
  + '\n'
  + '  useEffect(() => {\n'
  + '    setPersonalBusy((b) => b?.choiceId === personalChoice?.id ? b : null);\n'
  + '    if (!personalChoice) return;\n'
  + '    setSel(null);\n'
  + '    setDetail(null);\n'
  + '    setArmedCard(null);\n'
  + '    setDrag(null);\n'
  + '    view?.highlightTiles(null, null);\n'
  + '    cancelFacingRef.current();\n'
  + '  }, [personalChoice?.id, view]);\n',
  'h10');

// 13) 选中的棋子的射程高亮（fork 独有；上游这一侧为空）
swap('<<<<<<< HEAD\n  const selRangeKey =', '  const selRangeKey =', 'h11a');
swap('  }, [view, cardRangeKey]);\n=======\n>>>>>>> upstream/master\n', '  }, [view, cardRangeKey]);\n', 'h11b');

// 14) 详情卡：fork 的 voice + 上游的 ops
cut('<<<<<<< HEAD\n        voice=${detailSelectVoice(', '>>>>>>> upstream/master\n',
  '        voice=${detailSelectVoice({ phase, fieldId: lastFieldRef.current, target: detailTarget, resolved })}\n'
  + '        ops=${priv?.ops ?? null}\n'
  + '        bonds=${detailBonds} offBonds=${offBonds} loadout=${detailLoadout} side=${dSide} shopOpen=${shopOpen} live=${liveStats}\n',
  'h12');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('game.js 处理完成');
