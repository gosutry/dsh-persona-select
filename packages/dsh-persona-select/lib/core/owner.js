import * as core from './index.js';

/**
 * 核心实例只挂一份，由 picker / settings 两个组件共同持有。
 * 卸载立即开始（不等“空闲期”），但下一次挂载会排在卸载完成之后——
 * 这样不会出现两份核心同时往存活 agent 的 scoped 层里注册同名段。
 */
let handle = null;
let disposing = null;
const owners = new Set();

function rootOf(ctx) {
  if (ctx !== null && ctx !== undefined && ctx.root !== undefined) return ctx.root;
  let current = ctx;
  while (current !== null && current !== undefined && current.parent !== undefined) current = current.parent;
  return current;
}

function beginDispose() {
  if (disposing !== null || handle === null) return;
  const current = handle;
  handle = null;
  let pending;
  try {
    pending = current.dispose();
  } catch {
    disposing = null;
    return;
  }
  const running = Promise.resolve(pending).catch(() => {});
  disposing = running;
  running.then(() => {
    if (disposing === running) disposing = null;
  });
}

function mount(root) {
  if (handle !== null || owners.size === 0) return;
  handle = root.plugin(core);
}

export function acquireCore(ctx) {
  owners.add(ctx);
  try {
    ctx.effect(() => () => {
      owners.delete(ctx);
      if (owners.size === 0) beginDispose();
    }, 'persona-select: core owner');
  } catch {
  }
  if (handle !== null) return;
  const root = rootOf(ctx);
  if (disposing === null) {
    mount(root);
    return;
  }
  // 上一次卸载还没结束：等它收完再挂。
  disposing.then(() => mount(root));
}
