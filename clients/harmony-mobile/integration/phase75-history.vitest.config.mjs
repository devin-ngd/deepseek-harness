/** Synthetic memory authorization and actual ETS owners with SDK substitutes; no network scenarios. */
import base from './field-interaction.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase75', test: { ...base.test, name: 'harmony-phase75-history', include: ['clients/harmony-mobile/integration/phase75-history.spec.ts', 'clients/harmony-mobile/integration/phase69-renewal.spec.ts', 'clients/harmony-mobile/integration/phase74-epoch.spec.ts'], testNamePattern: undefined } }
