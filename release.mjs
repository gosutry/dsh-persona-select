#!/usr/bin/env node
/**
 * 打 Release 源码包（白名单制）。
 *
 * 只放「三个运行包」，每个包的内容严格按该包 package.json 的 `files` 白名单收集
 * —— 与 npm publish 进包的内容一致；`package.json` 本身总是带上。
 * 仓库里只给构建/开发用的目录（`_build/`、`i18n/`、`_test/`、点开头的一切、
 * node_modules）因此天然进不来，也不需要额外维护排除表。
 *
 * 用法：node release.mjs [输出目录]        默认写到仓库根目录
 * 产物：dsh-persona-select-<version>.tar.gz（内含 dsh-persona-select-<version>/packages/…）
 */
import { readFileSync, mkdirSync, cpSync, rmSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '');
const PACKAGES = ['dsh-persona-select', 'dsh-persona-select-picker', 'dsh-persona-select-settings'];
const main = JSON.parse(readFileSync(join(ROOT, 'packages', 'dsh-persona-select', 'package.json'), 'utf8'));
const version = main.version;
const name = `dsh-persona-select-${version}`;
const outDir = process.argv[2] ?? ROOT;
const outFile = join(outDir, `${name}.tar.gz`);

const stage = join(tmpdir(), `zz-release-${process.pid}`);
const root = join(stage, name);
mkdirSync(join(root, 'packages'), { recursive: true });

const entries = [];
for (const pkg of PACKAGES) {
  const dir = join(ROOT, 'packages', pkg);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const target = join(root, 'packages', pkg);
  const allow = new Set(['package.json', ...(Array.isArray(manifest.files) ? manifest.files : [])]);
  for (const entry of allow) {
    const source = join(dir, entry);
    if (!existsSync(source)) throw new Error(`${pkg}: files 白名单里的 "${entry}" 不存在`);
    cpSync(source, join(target, entry), { recursive: true });
    entries.push(`packages/${pkg}/${entry}`);
  }
  const unexpected = (manifest.files ?? []).length === 0 ? '（该包没有 files 白名单，已整包收录）' : '';
  console.log(`${pkg}@${manifest.version}: ${allow.size} 项${unexpected}`);
}

execFileSync('tar', ['-czf', outFile, '-C', stage, name], { stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });

const listed = execFileSync('tar', ['-tzf', outFile], { encoding: 'utf8' }).trim().split('\n');
const leaked = listed.filter((line) => /(^|\/)(_build|i18n|_test|node_modules|\.git[^/]*)(\/|$)/.test(line));
if (leaked.length > 0) throw new Error(`包里出现不该有的目录：\n${leaked.join('\n')}`);
const size = statSync(outFile).size;
console.log(`\n${basename(outFile)}  ${listed.length} 个条目  ${size} 字节`);
console.log(`白名单检查：_build / i18n / _test / node_modules —— 0 命中`);
