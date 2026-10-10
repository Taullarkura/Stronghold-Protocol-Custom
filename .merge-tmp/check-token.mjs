// Compare the token metadata of data/assets.json between this tree (merged) and the 0.2.1 fork reference.
import fs from 'node:fs';

const id = process.argv[2] ?? 'token_10002_kalts_mon3tr';
const files = {
  merged: 'H:/StrongholdProtocol_Custom/data/assets.json',
  fork: 'H:/Stronghold-Protocol-v0.2.1/Stronghold-Protocol/data/assets.json',
};
for (const [tag, f] of Object.entries(files)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const t = j.tokens?.[id] ?? null;
  console.log(`--- ${tag}: ${f}`);
  console.log(JSON.stringify(t, null, 1));
  console.log(`tokens total: ${Object.keys(j.tokens ?? {}).length}`);
}
