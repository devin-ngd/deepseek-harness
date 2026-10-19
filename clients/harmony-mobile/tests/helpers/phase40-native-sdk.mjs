/** Actual ETS owners against synthetic kit substitutes and optional explicitly installed loopback ws fixture. No HUKS device, real TLS or user key access. */
import { cryptoFramework as original, huks as fixedHuks, state, reset as resetOriginal } from './phase35-native-sdk.mjs'
import { createECDH, createPrivateKey, createPublicKey } from 'node:crypto'
export { state }
export const network = { factory: undefined, sockets: [], requests: [], agreement: 7, nonce: 1 }
export function reset() { resetOriginal(); network.sockets.length = 0; network.requests.length = 0; network.factory = undefined; network.agreement = 7; network.nonce = 1 }
export const huks = { ...fixedHuks, async exportKeyItem(alias) { const value = await fixedHuks.exportKeyItem(alias); return { outData: Uint8Array.from(value.outData) } } }
export const cryptoFramework = {
  ...original,
  createRandom: () => ({ generateRandomSync: length => ({ data: new Uint8Array(length).fill(network.nonce++) }) }),
  createAsyKeyGenerator() {
    const generator = original.createAsyKeyGenerator()
    return { ...generator, async generateKeyPair() {
      const bytes = Buffer.alloc(32); bytes[31] = network.agreement++
      const ec = createECDH('prime256v1'); ec.setPrivateKey(bytes)
      const point = ec.getPublicKey(), key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: bytes.toString('base64url'), x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } }), publicKey = createPublicKey(key)
      state.calls.push('ephemeral-fixture')
      return { pubKey: { key: publicKey, getEncoded: () => ({ data: publicKey.export({ format: 'der', type: 'spki' }) }) }, priKey: { key, clearMem() { state.clears++ } } }
    } }
  },
}
export const webSocket = { createWebSocket() { if (network.factory === undefined) throw new Error('synthetic network fixture absent'); const socket = network.factory(); network.sockets.push(socket); return socket } }
export const util = { Type: { BASIC_URL_SAFE: 1 }, TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text) } }, TextDecoder: class { static create(encoding, options) { const decoder = new TextDecoder(encoding, options); return { decodeToString: bytes => decoder.decode(bytes) } } }, Base64Helper: class { encodeToStringSync(bytes) { return Buffer.from(bytes).toString('base64url') } decodeSync(text) { return new Uint8Array(Buffer.from(text, 'base64url')) } } }
