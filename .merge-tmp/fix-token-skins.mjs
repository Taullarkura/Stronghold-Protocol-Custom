// Restore the fork's token skins (TOKEN_SKIN_SPINES: spineVariant + the web spine model) into the merged data/assets.json,
// taking them from the fork's 0.2.1 manifest dump. Aborts unless the file re-serializes byte-identically (same format).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { TOKEN_SKIN_SPINES } from '../tools/assets/plan.mjs';

const FILE = 'H:/StrongholdProtocol_Custom/data/assets.json';

const strip = (s) => s.replace(/^\uFEFF/, '');          // the dumps written by PowerShell carry a BOM
const raw = strip(fs.readFileSync(FILE, 'utf8'));
const j = JSON.parse(raw);
if (JSON.stringify(j) !== raw) { console.error('ABORT: the file is not plain JSON.stringify output'); process.exit(1); }

const fork = JSON.parse(execFileSync('git', ['show', 'HEAD:data/assets.json'], { cwd: 'H:/StrongholdProtocol_Custom', encoding: 'utf8', maxBuffer: 1 << 28 }));
const patched = [];
const bad = [];
for (const [id, skin] of Object.entries(TOKEN_SKIN_SPINES)) {
  const theirs = fork.tokens?.[id];
  if (!theirs?.spine || theirs.spineVariant !== skin) { bad.push(`${id}: the fork manifest has no ${skin}`); continue; }
  const mine = j.tokens?.[id];
  if (!mine) { j.tokens[id] = theirs; patched.push(`${id}: + the whole token (${skin})`); continue; }
  if (mine.spineVariant === skin && mine.spine) continue;
  mine.spine = theirs.spine;
  mine.spineVariant = skin;
  patched.push(`${id}: + spine/spineVariant (${skin})`);
}

// countStats, exactly as tools/fetch-assets.mjs:320 computes it (files/bytes come from the disk scan: kept as they are)
const vals = (o) => Object.values(o || {});
const spines = new Set();
for (const c of vals(j.chars)) for (const sp of vals(c.spine)) spines.add(sp.skel);
for (const e of vals(j.enemies)) if (e.spine) spines.add(e.spine.skel);
for (const t of vals(j.tokens)) if (t.spine) spines.add(t.spine.skel);
j.stats = {
  ...j.stats,
  chars: Object.keys(j.chars || {}).length,
  charsWithBack: vals(j.chars).filter((c) => c.spine?.back).length,
  enemies: Object.keys(j.enemies || {}).length,
  enemiesWithSpine: vals(j.enemies).filter((e) => e.spine).length,
  tokens: Object.keys(j.tokens || {}).length,
  tokensWithSpine: vals(j.tokens).filter((t) => t.spine).length,
  spineModels: spines.size,
};

console.log(patched.length ? patched.join('\n') : 'nothing to patch');
if (bad.length) { console.error('ABORT: unresolved entries\n' + bad.join('\n')); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(j));
console.log(`wrote ${FILE}`);
console.log(`stats: ${JSON.stringify(j.stats)}`);
