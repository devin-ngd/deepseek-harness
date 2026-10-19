/** alpha.4 package-owner, history, device and rich-interaction regressions. */
import base from './phase62.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase63', test: { ...base.test, include: [...base.test.include, 'clients/harmony-mobile/integration/phase63-*.spec.ts'] } }
