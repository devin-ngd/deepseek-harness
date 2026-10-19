/** Only synthetic loopback handshake and retained-public-trust recovery cases. */
import base from './field-interaction.vitest.config.mjs'
export default { ...base, cacheDir: base.cacheDir + '-phase68', test: { ...base.test, name: 'harmony-phase68-connection', include: ['clients/harmony-mobile/integration/phase68-connection.spec.ts', 'clients/harmony-mobile/integration/first-use-wiring.spec.ts', 'clients/harmony-mobile/integration/relay-denial.spec.ts'], testNamePattern: undefined } }
