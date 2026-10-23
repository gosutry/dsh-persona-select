import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\\/]$/, '');
export const PACKAGES = [
  'dsh-persona-select',
  'dsh-persona-select-picker',
  'dsh-persona-select-settings',
];

/** 把三个包复制到 _test/sandbox/node_modules，模拟装进 profile 后的解析布局。 */
export async function prepareSandbox() {
  const modules = join(ROOT, '_test', 'sandbox', 'node_modules');
  await mkdir(modules, { recursive: true });
  for (const name of PACKAGES) {
    await rm(join(modules, name), { recursive: true, force: true });
    await cp(join(ROOT, 'packages', name), join(modules, name), { recursive: true });
  }
  return modules;
}
