import { acquireCore } from '../dsh-persona-select/lib/core/owner.js';

export const inject = [];

export function apply(ctx) {
  acquireCore(ctx);
}
