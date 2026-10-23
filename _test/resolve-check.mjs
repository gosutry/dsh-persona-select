import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, prepareSandbox } from './prepare-sandbox.mjs';

await prepareSandbox();
const require = createRequire(join(ROOT, '_test', 'sandbox', 'probe.cjs'));
let failed = 0;
const check = (ok, label, extra = '') => {
  console.log((ok ? 'ok  - ' : 'FAIL - ') + label + (extra ? ' ' + extra : ''));
  if (!ok) failed++;
};
const iconOk = (file) => {
  const bytes = existsSync(file) ? readFileSync(file) : null;
  return bytes !== null && bytes.length <= 256 * 1024
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
};

const mainPkgPath = require.resolve('dsh-persona-select/package.json');
const mainPkg = JSON.parse(readFileSync(mainPkgPath, 'utf8'));
const mainDir = dirname(mainPkgPath);
check(mainPkg.version === '0.4.0-rc4', 'main version', mainPkg.version);
check(mainPkg.dsh?.bundle?.patch === './cordis.patch.yml', 'main declares bundle patch');
check(existsSync(join(mainDir, 'cordis.patch.yml')), 'main patch file exists');
check(mainPkg.dsh?.client === undefined, 'main has no client (no row -> no bundle)');
check(iconOk(join(mainDir, mainPkg.icon)), 'main icon ' + mainPkg.icon);
for (const lang of ['en', 'zh']) {
  const doc = JSON.parse(readFileSync(require.resolve('dsh-persona-select/locale/' + lang + '.json'), 'utf8'));
  check(typeof doc.meta?.title === 'string', 'main locale ' + lang, doc.meta?.title);
}
for (const dep of Object.keys(mainPkg.dependencies ?? {})) {
  check(mainPkg.dependencies[dep].startsWith('file:../'), dep + ' is a file: sibling dependency', mainPkg.dependencies[dep]);
  const dir = join(mainDir, mainPkg.dependencies[dep].slice('file:'.length));
  check(existsSync(join(dir, 'package.json')), dep + ' sibling package present');
}
check(existsSync(join(mainDir, 'lib', 'core', 'index.js')), 'main ships the host core');
check(existsSync(join(mainDir, 'lib', 'core', 'owner.js')), 'main ships the core owner');

for (const name of ['dsh-persona-select-picker', 'dsh-persona-select-settings']) {
  const pkg = JSON.parse(readFileSync(require.resolve(name + '/package.json'), 'utf8'));
  const dir = dirname(require.resolve(name + '/package.json'));
  check(pkg.version === '0.4.0-rc4', name + ' version', pkg.version);
  check(pkg.dsh?.client?.platform === 'web', name + ' declares a web client');
  check(pkg.dsh?.bundle === undefined, name + ' is not a bundle (cannot appear as a card)');
  check(existsSync(join(dir, pkg.exports['./client'])), name + ' client bundle exists');
  check(iconOk(join(dir, pkg.icon)), name + ' icon');
  for (const lang of ['en', 'zh']) {
    const doc = JSON.parse(readFileSync(require.resolve(name + '/locale/' + lang + '.json'), 'utf8'));
    check(typeof doc.meta?.title === 'string', name + ' locale ' + lang, doc.meta?.title);
  }
  const entry = require.resolve(name);
  check(existsSync(entry), name + ' host entry resolves');
}

try {
  require.resolve('dsh-persona-select/core');
  require.resolve('dsh-persona-select/core/owner');
  check(true, 'component hosts can resolve dsh-persona-select/core(/owner)');
} catch (error) {
  check(false, 'core exports: ' + error.message);
}

console.log(failed === 0 ? '\nTHREE PACKAGES / ONE CARD METADATA OK' : '\nFAILURES: ' + failed);
process.exitCode = failed === 0 ? 0 : 1;
