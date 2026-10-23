import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PROFILE = 'C:/Users/gsc/.dsh/profiles/desktop/package.json';
const PROFILE_DIR = dirname(PROFILE);
const require = createRequire(PROFILE);
let failed = 0;
const check = (ok, label, extra = '') => {
  console.log((ok ? 'ok  - ' : 'FAIL - ') + label + (extra ? ' ' + extra : ''));
  if (!ok) failed++;
};
const iconOk = (file) => {
  const bytes = existsSync(file) ? readFileSync(file) : null;
  return bytes !== null && bytes.length <= 256 * 1024 && bytes[0] === 0x89 && bytes[1] === 0x50;
};

const mainPkg = JSON.parse(readFileSync(require.resolve('dsh-persona-select/package.json'), 'utf8'));
check(mainPkg.version === '0.4.0-rc4', 'main installed version', mainPkg.version);
check(mainPkg.dsh?.bundle?.patch === './cordis.patch.yml', 'main is the bundle card');
check(mainPkg.dsh?.client === undefined, 'main has no browser half');
const mainDir = realpathSync(dirname(require.resolve('dsh-persona-select/package.json')));
check(iconOk(join(mainDir, mainPkg.icon)), 'main icon');
check(existsSync(join(mainDir, 'lib/core/index.js')) && existsSync(join(mainDir, 'lib/core/owner.js')), 'main ships core + owner');
check(require.resolve('dsh-persona-select/core/owner').length > 0, 'core/owner resolves from the main package');

const components = ['dsh-persona-select-picker', 'dsh-persona-select-settings'];
for (const name of components) {
  const pkg = JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8'));
  const dir = realpathSync(dirname(require.resolve(name + '/package.json')));
  check(pkg.version === '0.4.0-rc4', name + ' version', pkg.version);
  check(pkg.dsh?.client?.platform === 'web', name + ' has its own web client');
  check(pkg.dsh?.bundle === undefined, name + ' is a plain dependency (no card)');
  check(existsSync(join(dir, pkg.exports['./client'])), name + ' bundle exists');
  check(iconOk(join(dir, pkg.icon)), name + ' icon');
  for (const lang of ['en', 'zh']) {
    const doc = JSON.parse(readFileSync(require.resolve(name + '/locale/' + lang + '.json'), 'utf8'));
    check(typeof doc.meta?.title === 'string', name + ' locale ' + lang, doc.meta?.title);
  }
  try {
    const url = 'file:///' + join(PROFILE_DIR, 'node_modules', name, 'index.js').replace(/\\/g, '/');
    const mod = await import(url);
    check(typeof mod.apply === 'function', name + ' host half imports from the profile');
  } catch (error) {
    check(false, name + ' host import: ' + error.message.split(String.fromCharCode(10))[0]);
  }
}

console.log(failed === 0 ? '\nPROFILE OK (one card + two real components)' : '\nFAILURES: ' + failed);
process.exitCode = failed === 0 ? 0 : 1;
