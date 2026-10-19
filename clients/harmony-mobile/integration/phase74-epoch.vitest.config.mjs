/** Only the new isolated original-owner epoch test; no browser/device or real field profile. */
import base from './phase69-renewal.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase74', test: { ...base.test, name: 'harmony-phase74-epoch', include: ['clients/harmony-mobile/integration/phase74-epoch.spec.ts'] } }
