import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\\/]$/, '');
const registrations = new Map();
globalThis.window = {
  __ModuleLoader__: {
    load(reg) {
      const key = reg.chunk === undefined ? reg.id : reg.id + '::' + reg.chunk;
      if (registrations.has(key)) throw new Error('duplicate registration: ' + key);
      registrations.set(key, reg);
    },
  },
};
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useContext: () => ({}),
  useReducer: (reducer, init) => [init, () => {}],
  memo: (fn) => fn,
  Fragment: 'fragment',
};
function makeRequire(ownerId) {
  const req = (spec) => {
    if (spec === 'react') return ReactStub;
    throw new Error('require miss: ' + spec);
  };
  req.async = async (spec) => {
    if (!spec.startsWith('./')) throw new Error('only package-local chunks: ' + spec);
    const fileName = spec.slice(2);
    const reg = registrations.get(ownerId + '::' + fileName);
    if (reg === undefined) throw new Error('chunk not registered: ' + ownerId + '::' + fileName);
    return reg.factory(makeRequire(ownerId));
  };
  return req;
}
function loadScript(rel) {
  vm.runInThisContext(readFileSync(ROOT + '/' + rel, 'utf8'), { filename: rel });
}
function mockCtx() {
  const slots = [];
  const locales = [];
  const ctx = {
    locale: { bind: () => (key) => key, register: (ns) => { locales.push(ns); return () => {}; } },
    slots: {
      inject: (name, cb) => cb(),
      register: (opts, comp) => { slots.push({ opts, comp }); return () => {}; },
    },
    effect: (fn) => fn(),
    get: () => undefined,
    inject: () => {},
  };
  return { ctx, slots, locales };
}
function check(condition, message) {
  if (!condition) throw new Error('CHECK FAILED: ' + message);
  console.log('ok  - ' + message);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- picker bundle ----
loadScript('packages/dsh-persona-select-picker/client.js');
loadScript('packages/dsh-persona-select-picker/client.picker.js');
check(registrations.has('dsh-persona-select-picker'), 'picker bundle id is its package name');
check(registrations.has('dsh-persona-select-picker::client.picker.js'), 'picker chunk belongs to the picker bundle');
const pickerRequire = makeRequire('dsh-persona-select-picker');
const picker = registrations.get('dsh-persona-select-picker').factory(pickerRequire);
const pickerMock = mockCtx();
picker.apply(pickerMock.ctx);
await sleep(60);
check(pickerMock.slots.length === 1 && pickerMock.slots[0].opts.name === 'conversation.input.dock', 'picker bundle registers exactly the input dock');
check(pickerMock.locales.includes('dsh-persona-select-picker'), 'picker uses its own locale namespace');
const pickerNode = pickerMock.slots[0].comp({ t: (k) => k });
check(typeof pickerNode.type === 'function', 'picker chunk loaded and built a component');

// ---- settings bundle ----
loadScript('packages/dsh-persona-select-settings/client.js');
loadScript('packages/dsh-persona-select-settings/client.settings.js');
loadScript('packages/dsh-persona-select-settings/client.io-export.js');
loadScript('packages/dsh-persona-select-settings/client.log-import.js');
check(registrations.has('dsh-persona-select-settings'), 'settings bundle id is its package name');
const settingsRequire = makeRequire('dsh-persona-select-settings');
const settings = registrations.get('dsh-persona-select-settings').factory(settingsRequire);
const settingsMock = mockCtx();
settings.apply(settingsMock.ctx);
await sleep(60);
check(settingsMock.slots.length === 1 && settingsMock.slots[0].opts.name === 'settings.section', 'settings bundle registers exactly the settings section');
check(settingsMock.locales.includes('dsh-persona-select-settings'), 'settings uses its own locale namespace');
const settingsNode = settingsMock.slots[0].comp({ t: (k) => k });
check(typeof settingsNode.type === 'function', 'settings chunk loaded and built a component');
const io = await settingsRequire.async('./client.io-export.js');
const log = await settingsRequire.async('./client.log-import.js');
check(typeof io.create === 'function' && typeof log.create === 'function', 'settings chunks io-export + log-import load');

// ---- host: core owner refcount ----
const owner = await import('file:///' + (ROOT + '/packages/dsh-persona-select/lib/core/owner.js').replace(/\\/g, '/'));
let captured = null;
const disposed = [];
const rootCtx = { plugin: (plugin) => { captured = plugin; return { dispose: () => { disposed.push(1); } }; } };
const makeOwnerCtx = () => {
  const cleanups = [];
  const ctx = { root: rootCtx, parent: undefined, effect: (fn) => { cleanups.push(fn()); } };
  return { ctx, cleanups };
};
const a = makeOwnerCtx();
const b = makeOwnerCtx();
owner.acquireCore(a.ctx);
owner.acquireCore(b.ctx);
check(captured !== null && typeof captured.apply === 'function', 'core mounts on ctx.root (not on a component row)');
check(disposed.length === 0, 'two owners -> core stays mounted');
a.cleanups[0]();
check(disposed.length === 0, 'one component row left -> core keeps running');
b.cleanups[0]();
check(disposed.length === 1, 'last component row disabled -> core disposed');
const c = makeOwnerCtx();
owner.acquireCore(c.ctx);
check(captured !== null && disposed.length === 1, 're-enabling a component mounts core again');

console.log('\nALL CHECKS PASSED');
