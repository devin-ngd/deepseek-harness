/** Current alpha.4 access, authenticated adapter and host/projection comparisons, with isolated synthetic state. */
import base from './vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase62', test: { ...base.test, include: ['clients/harmony-mobile/integration/phase62-access.spec.ts', 'clients/harmony-mobile/integration/phase62-guest.spec.ts', 'clients/harmony-mobile/integration/phase32-plugin.spec.ts', 'clients/harmony-mobile/integration/phase34-device-auth.spec.ts', 'clients/harmony-mobile/integration/projection.spec.ts'] } }
