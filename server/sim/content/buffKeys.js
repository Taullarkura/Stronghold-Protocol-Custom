// Extra band buff keys bound by script plugins (docs/PLUGINS.md §13). Kept import-free so the dispatch
// table in bands/battle.js and the registration guard in content/extensions.js share one registry without a
// module cycle. Official keys never live here: bands/battle.js BY_KEY wins when a key is in both.

/** @type {Map<string, (battle: any, ps: any, params: any, bandId: string, api: any) => void>} */
const installers = new Map();

/** Bind a band buff key to a plugin installer. The caller rejects duplicates and invalid keys first. */
export function registerBuffKeyInstaller(key, fn) { installers.set(key, fn); }
/** The plugin installer bound to a band buff key, or null (an official key is not registered here). */
export function buffKeyInstaller(key) { return installers.get(key) ?? null; }
/** Every bound key, sorted (tests / tooling). */
export function buffKeyInstallerKeys() { return [...installers.keys()].sort(); }
/** Drop every binding; `resetExtensions` calls this between hosts. */
export function clearBuffKeyInstallers() { installers.clear(); }
