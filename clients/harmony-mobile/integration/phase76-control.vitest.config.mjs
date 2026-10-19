/** Fixed memory broker/control regressions and complete-history SDK substitutes; no live endpoint or credential source. */
import base from './phase75-history.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase76-control', test: { ...base.test, name: 'harmony-phase76-control', include: [...base.test.include, 'clients/harmony-mobile/integration/phase39-broker.spec.ts', 'clients/harmony-mobile/integration/phase76-epoch.spec.ts'] } }
