// Composition registration preflight. Only this disposable child imports author modules.
import fs from 'node:fs';
import { loadScripts, scriptExecution } from '../../shared/plugins/scriptLoad.js';
// Sandbox mode needs two runtime packages that nothing imports before a script set is composed, so a stale
// node_modules otherwise surfaces as a bare ERR_MODULE_NOT_FOUND from inside the probe.
const runtimePackage = async (name) => {
  try { return await import(name); } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND') throw e;
    const err = new Error(`the "${name}" package is not installed — run npm ci (or node tools/setup.mjs) in the app directory`);
    err.code = 'PLUGIN_SCRIPT_DEPENDENCY';
    throw err;
  }
};
try {
  const {scripts, hashInput} = JSON.parse(fs.readFileSync(0,'utf8'));
  let registrations;
  if (scriptExecution(scripts) === 'sandbox') {
    if (!process.permission || process.env.SP_PLUGIN_SCRIPTS !== 'sandbox') throw new Error('sandbox probe requires permissions');
    const sandbox = await import('../../shared/plugins/sandbox.js');
    await sandbox.initializeSandbox({ loadSES: () => runtimePackage('ses') });
    const { parse } = await runtimePackage('acorn');
    registrations = await sandbox.installSandboxScripts(scripts, { hashInput, parse });
  } else registrations = await loadScripts(scripts,{hashInput});
  fs.writeFileSync(3,JSON.stringify({registrations}));
} catch (e) { fs.writeFileSync(3,JSON.stringify({code:e.code || 'PLUGIN_SCRIPT_CHECK',message:e.message})); process.exitCode=1; }
