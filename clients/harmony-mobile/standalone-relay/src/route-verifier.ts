/** Public signature verification only; the standalone relay never imports a signer or private-key primitive. */
import { p256CredentialId, verifyP256 } from '../../integration/p256-public.ts'
import type { DeviceRouteVerifier } from '../../src/device-route-protocol.ts'
export const routeVerifier: DeviceRouteVerifier = { decode: value => Buffer.from(value, 'base64url'), credentialId: async value => p256CredentialId(value), verify: async (key, message, signature) => verifyP256(key, message, Buffer.from(signature).toString('base64url')) }
