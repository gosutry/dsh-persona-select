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

const yaml = readFileSync(join(ROOT, 'packages', 'dsh-persona-select', 'cordis.patch.yml'), 'utf8');
const rows = [...yaml.matchAll(/name:\s*(\S+)/g)].map((m) => m[1]);
check(rows.length === 2, 'main patch declares exactly two component rows', rows.join(', '));
check(rows.includes('dsh-persona-select-picker') && rows.includes('dsh-persona-select-settings'), 'rows name the two component packages');

function exactPackageSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length === 2 && parts.every(Boolean) ? specifier : undefined;
  }
  return specifier.length > 0 && !specifier.includes('/') && !specifier.includes(':') ? specifier : undefined;
}
function nearestPackage(modulePath, expected) {
  let dir = dirname(modulePath);
  while (true) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const name = JSON.parse(readFileSync(candidate, 'utf8')).name;
      if (typeof name === 'string' && (expected === undefined || name === expected)) return { path: candidate, packageName: name };
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
function resolveMeta(loaderName) {
  const expected = exactPackageSpecifier(loaderName);
  const entry = require.resolve(loaderName);
  const located = nearestPackage(entry, expected);
  if (located === undefined) return null;
  const pkg = JSON.parse(readFileSync(located.path, 'utf8'));
  const decl = pkg.dsh && pkg.dsh.client;
  if (!decl || decl.platform !== 'web') return null;
  const clientPath = join(dirname(located.path), pkg.exports['./client']);
  if (!existsSync(clientPath)) throw new Error('missing bundle ' + clientPath);
  return { packageName: located.packageName, clientPath, hasBundle: pkg.dsh?.bundle !== undefined };
}

const seen = new Map();
for (const row of rows) {
  try {
    const meta = resolveMeta(row);
    if (meta === null) { check(false, row + ' resolves to no client bundle'); continue; }
    if (seen.has(meta.packageName)) { check(false, 'duplicate active source ' + meta.packageName); continue; }
    seen.set(meta.packageName, meta);
    check(!meta.hasBundle, row + ' is a component package without its own bundle card');
    console.log('       bundle -> ' + meta.clientPath.split('node_modules\\').pop());
  } catch (error) {
    check(false, row + ': ' + error.message);
  }
}
check(seen.size === 2, 'two distinct component bundles (each row gets its own browser half)');

const mainPkg = JSON.parse(readFileSync(require.resolve('dsh-persona-select/package.json'), 'utf8'));
check(mainPkg.dsh.bundle !== undefined && mainPkg.dsh.client === undefined, 'main package is the card only');

for (const row of rows) {
  const pkg = JSON.parse(readFileSync(require.resolve(row + '/package.json'), 'utf8'));
  check(typeof pkg.icon === 'string' && existsSync(join(dirname(require.resolve(row + '/package.json')), pkg.icon)), row + ' manifest icon resolves');
  check(existsSync(require.resolve(row + '/locale/zh.json')), row + ' locale resolves');
}

console.log(failed === 0 ? '\nONE CARD / TWO REAL COMPONENTS OK' : '\nFAILURES: ' + failed);
process.exitCode = failed === 0 ? 0 : 1;
