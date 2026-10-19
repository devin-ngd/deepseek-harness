/** Signed expiry continuation plus the exact existing Origin/browser rejection regressions. */
import base from './phase68-connection.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase69', test: { ...base.test, name: 'harmony-phase69-renewal', include: [...base.test.include, 'clients/harmony-mobile/integration/phase69-renewal.spec.ts', 'clients/harmony-mobile/integration/first-use-refusals.spec.ts'] } }
