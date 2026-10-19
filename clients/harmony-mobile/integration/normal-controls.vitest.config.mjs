/** Three focused synthetic injection cases; no installed profile or live provider. */
import previous from './normal-product.vitest.config.mjs'
export default { ...previous, test: { ...previous.test, name: 'normal-controls', include: ['clients/harmony-mobile/integration/normal-controls.spec.ts'] } }
