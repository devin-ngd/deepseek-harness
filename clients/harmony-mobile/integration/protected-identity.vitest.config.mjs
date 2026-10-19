/** Focused identity-storage qualification; the inherited replay guard/config never selects a real provider. */
import base from './first-use-wiring.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-protected', test: { ...base.test, name: 'harmony-protected-identity', include: ['clients/harmony-mobile/integration/protected-identity.spec.ts', 'clients/harmony-mobile/integration/first-use-refusals.spec.ts', 'clients/harmony-mobile/integration/field-world.spec.ts', 'clients/harmony-mobile/integration/durable-ports.spec.ts'] } }
