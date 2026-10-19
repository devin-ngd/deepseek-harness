/** Current field regression: original publication script, dynamic SDK action identity and offline endpoint-policy compatibility. */
import base from './first-use-wiring.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-field-interaction', test: { ...base.test, name: 'harmony-field-interaction', include: [...base.test.include, 'clients/harmony-mobile/integration/endpoint-timers.spec.ts'] } }
