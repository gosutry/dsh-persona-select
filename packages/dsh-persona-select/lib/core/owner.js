import * as core from './index.js';

/**
 * 内核宿主（路由 / 系统提示词注入 / 存储）的共享挂载点。
 *
 * 两个组件行各自是独立包、可能被单独停用；内核不能绑在某一行上，否则停用
 * 那个组件会把另一个也拖死。所以内核挂在 ctx.root 上，由两个组件行共同持有：
 * 最后一个持有者卸载时才真正 dispose。
 */
let handle = null;
const owners = new Set();

function rootOf(ctx) {
  if (ctx !== null && ctx !== undefined && ctx.root !== undefined) return ctx.root;
  let current = ctx;
  while (current !== null && current !== undefined && current.parent !== undefined) current = current.parent;
  return current;
}

/**
 * 组件宿主调用：持有内核。
 * @param {object} ctx 组件行自己的 cordis 上下文
 */
export function acquireCore(ctx) {
  owners.add(ctx);
  try {
    ctx.effect(() => () => {
      owners.delete(ctx);
      if (owners.size === 0 && handle !== null) {
        const current = handle;
        handle = null;
        try {
          current.dispose();
        } catch {
        }
      }
    }, 'persona-select: core owner');
  } catch {
  }
  if (handle === null) {
    const root = rootOf(ctx);
    handle = root.plugin(core);
  }
}
