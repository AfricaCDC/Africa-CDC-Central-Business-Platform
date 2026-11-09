/**
 * @rbm/lib/cache — ESM wrapper.
 *
 * Re-exports the CJS implementation so the same `createCache` is reachable
 * from `import { createCache } from '@rbm/lib/cache'`. Frontend bundlers
 * never tree-shake into this file (it's a server-side helper), but the wrapper
 * keeps the dual-format pattern Agent 5 established for the rest of the
 * package.
 */

import cache from './cache.js';

export const { createCache } = cache;
export default cache;
