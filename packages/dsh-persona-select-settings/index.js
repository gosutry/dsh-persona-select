import { acquireCore } from '../dsh-persona-select/lib/core/owner.js';

/**
 * 设置页组件的宿主半。
 *
 * 这个组件是独立包（包根行 → 有自己的浏览器半），启动时只需要把内核认领起来；
 * 行被停用 = 本插件整体卸载 = 浏览器半同时消失，是真实的关闭效果。
 *
 * @param {object} ctx 本行自己的 cordis 上下文
 */
export const inject = [];

export function apply(ctx) {
  acquireCore(ctx);
}
