// Diff the token entries (spine / spineVariant) between the merged manifest and the 0.2.1 reference tree.
import fs from 'node:fs';

const merged = JSON.parse(fs.readFileSync('H:/StrongholdProtocol_Custom/data/assets.json', 'utf8'));
const ref = JSON.parse(fs.readFileSync('H:/Stronghold-Protocol-v0.2.1/Stronghold-Protocol/data/assets.json', 'utf8'));

const ids = new Set([...Object.keys(merged.tokens ?? {}), ...Object.keys(ref.tokens ?? {})]);
const rows = [];
for (const id of [...ids].sort()) {
  const a = merged.tokens?.[id] ?? {};
  const b = ref.tokens?.[id] ?? {};
  const pa = [a.spine ? 'spine' : '-', a.spineVariant ?? '-', a.spineLocal ? 'local' : '-'].join('/');
  const pb = [b.spine ? 'spine' : '-', b.spineVariant ?? '-', b.spineLocal ? 'local' : '-'].join('/');
  if (pa !== pb) rows.push(`${id}: merged=${pa} ref=${pb}`);
}
console.log(`tokens merged=${Object.keys(merged.tokens ?? {}).length} ref=${Object.keys(ref.tokens ?? {}).length}`);
console.log(`differences: ${rows.length}`);
for (const r of rows) console.log('  ' + r);
console.log('ref has collab op char_456_ash:', Object.hasOwn(ref.ops ?? ref.chars ?? {}, 'char_456_ash'));
console.log('top-level keys:', Object.keys(ref).join(','));
