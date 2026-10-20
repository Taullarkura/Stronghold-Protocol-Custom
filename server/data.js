// server/data.js — loads the generated game data (data/*.json, produced by tools/build-data.mjs) once.
//
// Every `*.json` file in the data directory becomes a top-level key named after its basename
// (config, chess, bonds, garrisons, items, bands, effects, choices, enemies, factions, waves, stages,
// bosses, tokens, assets, backups, …). The result is deep-frozen so no module can mutate shared data by accident.
// Missing or unparsable files are tolerated with a warning (data is generated in parallel with the
// server); consumers must cope with an absent key.
//
// Index getters (DESIGN §2; same names as public/js/data.js): getChess, getBond, getGarrison, getItem, getBand,
// getEffect, getEnemy, getWave, getStage, getBoss, getToken, getConfig, getMode. The id-keyed files are already
// `{ [id]: record }` maps (docs/DATA.md), so a getter is an OWN-property lookup: ids that come from client
// intents (e.g. `g.band {bandId: "constructor"}`) can never resolve to inherited Object.prototype members.
// Every getter returns null for unknown ids / missing files and takes an optional data object (default:
// the process-wide getData() singleton).

import { ROOT, DATA_DIR, readDataDirectory } from './data-node.js';
export { ROOT, DATA_DIR };
import { forgetOfficialBounds, rememberOfficialBounds } from '../shared/plugins/officialBounds.js';

/** Files the game expects (a warning lists the missing ones). */
export const DATA_FILES = Object.freeze([
  'config', 'chess', 'bonds', 'garrisons', 'items', 'bands', 'effects', 'choices',
  'enemies', 'factions', 'waves', 'stages', 'bosses', 'tokens', 'assets', 'backups',
  // FORK: E.G.O 饰品 / 苦难 (shared/ego.js → tools/build-data.mjs buildEgoTrinkets)
  'ego-trinkets',
]);

/**
 * Recursively freeze an object graph (iterative; safe for deep JSON). Returns the same object.
 * @template T
 * @param {T} root
 * @returns {Readonly<T>}
 */
export function deepFreeze(root) {
  const stack = [root];
  const seen = new Set();
  while (stack.length) {
    const o = stack.pop();
    if (o === null || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    for (const v of Object.values(o)) if (v !== null && typeof v === 'object') stack.push(v);
    Object.freeze(o);
  }
  return root;
}

/** data/*.json files the server never reads, so never loads: the official effects' file list (data/local-fx.json, written
 * by tools/local-extract/fx.py, DESIGN §33 — ~1 MB the browser alone fetches, through its served view). */
export const UNLOADED_DATA = Object.freeze(['local-fx.json']);

/**
 * Read every `*.json` in `dir` into `{ [basename]: parsed }`, deep-frozen, leaving out UNLOADED_DATA.
 * The reading itself is ./data-node.js's readDataDirectory (the Node side of the filesystem boundary).
 * Never throws: an unreadable directory yields `{}`; bad files are skipped with an error log.
 * @param {string} [dir] data directory (default ROOT/data)
 * @param {{ log?: { warn: Function, error: Function, info?: Function }, expected?: readonly string[] }} [opts]
 * @returns {Readonly<Record<string, any>>}
 */
export function loadData(dir = DATA_DIR, { log = console, expected = DATA_FILES } = {}) {
  const loaded = readDataDirectory(dir, log);
  // UNLOADED_DATA lives here, not in the reader (./data-node.js, replaced by worker/data-loader.js): the Worker bundle
  // never carries those files, and its reader takes no options.
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(loaded)) {
    if (!UNLOADED_DATA.includes(`${key.toLowerCase()}.json`)) out[key] = value;
  }
  const missing = expected.filter((k) => !(k in out));
  if (missing.length) log.warn(`[data] missing data files: ${missing.map((k) => k + '.json').join(', ')}`);
  return deepFreeze(out);
}

/** @type {Readonly<Record<string, any>> | null} */
let singleton = null;

/**
 * Process-wide data singleton; loads on first call (later calls ignore the options).
 * @param {{ dir?: string, log?: object }} [opts]
 * @returns {Readonly<Record<string, any>>}
 */
export function getData({ dir = DATA_DIR, log = console } = {}) {
  if (!singleton) {
    singleton = loadData(dir, { log });
    rememberOfficialBounds(singleton);
  }
  return singleton;
}

/** Drop the singleton so the next getData() reloads (tests / hot reload). */
export function resetData() {
  singleton = null;
  forgetOfficialBounds();
}

/**
 * Make `data` the process-wide singleton (deep-frozen) — a match host worker (server/match/host/entry.js, DESIGN §32
 * P1c) calls it with its content set's merged data before it imports the match: every module of that worker that reads
 * getData() (the content modules' gameData(), builtinMeta, the sim's default DataSource) then sees the content set,
 * never the vanilla files. The main process never calls it. The official-bounds cache (shared/plugins/officialBounds.js,
 * filled by getData() from the vanilla files in the main process) is never filled from `data` (a plugin must not raise its
 * own caps): the match host installs the content set's snapshot after this (entry.js), as its pages do (runner.js).
 * @param {Record<string, any>} data
 * @returns {Readonly<Record<string, any>>}
 */
export function setData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('setData: a data object { <file>: record map } is required');
  singleton = deepFreeze(data);
  return singleton;
}

// ---------------------------------------------------------------------------------------------------
// Index getters
// ---------------------------------------------------------------------------------------------------

/** Data files that are `{ [id]: record }` maps, with the getter name exported for each. */
export const INDEXED_FILES = Object.freeze({
  chess: 'getChess', bonds: 'getBond', garrisons: 'getGarrison', items: 'getItem', bands: 'getBand',
  effects: 'getEffect', enemies: 'getEnemy', waves: 'getWave', stages: 'getStage', bosses: 'getBoss', tokens: 'getToken',
});
/** Own-property record lookup in a plain-object map; null for anything else. */
function ownRecord(map, id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!map || typeof map !== 'object' || Array.isArray(map) || !Object.hasOwn(map, id)) return null;
  const rec = map[id];
  return rec !== null && typeof rec === 'object' ? rec : null;
}

/**
 * Record by id from an id-keyed data file (own properties only; never throws).
 * @param {string} file data file basename, e.g. 'chess'
 * @param {unknown} id record id
 * @param {Readonly<Record<string, any>>} [data] data object (default: getData())
 * @returns {any | null}
 */
export function lookup(file, id, data = getData()) {
  if (!data || typeof data !== 'object' || typeof file !== 'string' || !Object.hasOwn(data, file)) return null;
  return ownRecord(data[file], id);
}

/** @param {unknown} id chess id (normal `_a` or elite `_b`) @param {object} [data] */
export const getChess = (id, data) => lookup('chess', id, data);
/** @param {unknown} id bond id, e.g. 'yanShip' @param {object} [data] */
export const getBond = (id, data) => lookup('bonds', id, data);
/** @param {unknown} id garrison (特质) id @param {object} [data] */
export const getGarrison = (id, data) => lookup('garrisons', id, data);
/** @param {unknown} id item chess id @param {object} [data] */
export const getItem = (id, data) => lookup('items', id, data);
/** @param {unknown} id band (strategy) id @param {object} [data] */
export const getBand = (id, data) => lookup('bands', id, data);
/** @param {unknown} id effect id @param {object} [data] */
export const getEffect = (id, data) => lookup('effects', id, data);
/** @param {unknown} key enemy key @param {object} [data] */
export const getEnemy = (key, data) => lookup('enemies', key, data);
/** @param {unknown} id wave template id @param {object} [data] */
export const getWave = (id, data) => lookup('waves', id, data);
/** @param {unknown} id stage id @param {object} [data] */
export const getStage = (id, data) => lookup('stages', id, data);
/** @param {unknown} id boss id @param {object} [data] */
export const getBoss = (id, data) => lookup('bosses', id, data);
/** @param {unknown} id token id @param {object} [data] */
export const getToken = (id, data) => lookup('tokens', id, data);
/** @param {unknown} id trinket id (ego-trinkets.json `trinkets`) @param {object} [data] */
export const getTrinket = (id, data) => trinketFrom('trinkets', id, data);
/** @param {unknown} id hardship id (ego-trinkets.json `hardships`) @param {object} [data] */
export const getHardship = (id, data) => trinketFrom('hardships', id, data);

/** A record of data/ego-trinkets.json's `trinkets` / `hardships` map (not `{ [id]: record }` at the file's top level). */
function trinketFrom(map, id, data) {
  const file = data && typeof data === 'object' ? data['ego-trinkets'] : null;
  const rec = file && typeof file === 'object' ? file[map] : null;
  return ownRecord(rec, id);
}

/**
 * data/config.json, or null when missing.
 * @param {Readonly<Record<string, any>>} [data]
 * @returns {any | null}
 */
export function getConfig(data = getData()) {
  const cfg = data && typeof data === 'object' && Object.hasOwn(data, 'config') ? data.config : null;
  return cfg !== null && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : null;
}

/**
 * Mode record `config.modes[modeId]` (e.g. 'mode_multi_hard'), or null.
 * @param {unknown} modeId
 * @param {Readonly<Record<string, any>>} [data]
 * @returns {any | null}
 */
export function getMode(modeId, data = getData()) {
  const cfg = getConfig(data);
  return cfg ? ownRecord(cfg.modes, modeId) : null;
}
