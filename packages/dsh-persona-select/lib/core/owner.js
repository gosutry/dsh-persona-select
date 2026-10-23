import * as core from './index.js';

let handle = null;
const owners = new Set();

function rootOf(ctx) {
  if (ctx !== null && ctx !== undefined && ctx.root !== undefined) return ctx.root;
  let current = ctx;
  while (current !== null && current !== undefined && current.parent !== undefined) current = current.parent;
  return current;
}

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
