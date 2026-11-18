/** One signed address publication or lookup on the relay control socket. */
import { z } from 'zod'
import { relayChallenge, relayProof, relayProofBytes, type RelayChallenge } from './relay-control-protocol.ts'
import { isDeviceLanEndpoint, isDeviceLanPort, isDeviceTailnetAddress } from './device-lan-address.ts'
import { transcriptBytes } from './signing-bytes.ts'
import type { EndpointRelayTrust } from './relay-control-client.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import type { RelaySocket } from '../integration/relay-core.ts'

export const DEVICE_ENDPOINT_SUBPROTOCOL = 'harmony-relay-endpoints-v1'
/** Maximum time a signed desktop publication stays usable after its proof challenge. */
export const DEVICE_ENDPOINT_LEASE_MS = 120_000

const address = z.string().max(15)
const candidatesSchema = z.object({
  wlan: address.refine(value => value !== '127.0.0.1' && isDeviceLanEndpoint(value, 1)).nullable(),
  tailnet: address.refine(isDeviceTailnetAddress).nullable(),
  port: z.number().refine(isDeviceLanPort),
}).strict()
/** Current direct candidates reported by the paired desktop. */
export type DeviceEndpoints = z.infer<typeof candidatesSchema>
export interface EndpointProof { challenge: RelayChallenge; candidates: DeviceEndpoints | null; signature: string }

/** @param value - untrusted control payload. @returns a canonical proof with exactly one role-appropriate payload. */
export function endpointProof(value: unknown): EndpointProof {
  const packet = z.object({ challenge: z.unknown(), candidates: candidatesSchema.nullable(), signature: z.unknown() }).strict().parse(value)
  const proof = relayProof({ challenge: packet.challenge, signature: packet.signature })
  if ((proof.challenge.role === 'desktop') !== (packet.candidates !== null)) throw new Error('endpoint role denied')
  return { ...proof, candidates: packet.candidates }
}

/** @param challenge - single-use relay challenge. @param candidates - desktop addresses, or null for lookup. @returns a signature domain distinct from relay room requests. */
export function endpointProofBytes(challenge: RelayChallenge, candidates: DeviceEndpoints | null): Uint8Array {
  return transcriptBytes([DEVICE_ENDPOINT_SUBPROTOCOL, new TextDecoder().decode(relayProofBytes(challenge)), JSON.stringify(candidates)])
}

interface ExchangeOptions {
  socket: RelaySocket
  trust: EndpointRelayTrust
  signer: P256IdentitySigner
  primitives: E2EPrimitives
  desktopPublicSpki: string
  candidates: DeviceEndpoints | null
  clock: () => number
  maxTtlMs: number
  maxBytes: number
  signal: AbortSignal
}
export interface EndpointExchangeResult { candidates: DeviceEndpoints | null; expiresAt: number }
const responseSchema = z.object({ kind: z.literal('endpoints'), proof: z.unknown() }).strict()

/** @param options - owned control port, original pairing pins and one publication or lookup. @returns after relay acknowledgement or verified desktop candidates. The caller closes the port. */
export function exchangeDeviceEndpoints(options: ExchangeOptions): Promise<EndpointExchangeResult> {
  const { socket, trust, signer, primitives, clock, signal } = options
  return new Promise((resolve, reject) => {
    let closed = false, pending = false, challenge: RelayChallenge | undefined
    const stops: (() => void)[] = []
    const finish = (value?: EndpointExchangeResult) => {
      if (closed) return
      closed = true
      for (const stop of stops) stop()
      if (value === undefined) reject(new Error('endpoint exchange unavailable'))
      else resolve(value)
    }
    const abort = () => finish()
    const current = (value: RelayChallenge, role: EndpointRelayTrust['role'], leaseMs = 0) => !closed && !signal.aborted
      && value.role === role && value.pairId === trust.pairId && value.epoch === trust.epoch && value.audience === trust.audience
      && Math.min(trust.expiresAt, value.expiresAt + leaseMs) > clock()
      && value.expiresAt <= Math.min(trust.expiresAt, clock() + options.maxTtlMs)
    const listen = (bytes: Uint8Array, binary: boolean) => {
      if (closed || pending || binary || bytes.length === 0 || bytes.length > options.maxBytes) { finish(); return }
      pending = true
      void (async () => {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        if (challenge === undefined) {
          const request = relayChallenge(value)
          if (!current(request, trust.role) || request.credentialId !== trust.credentialId
            || request.credentialId !== await primitives.credentialId(signer.publicSpki)) throw new Error('endpoint challenge denied')
          const candidates = options.candidates === null ? null : candidatesSchema.parse(options.candidates)
          const signature = primitives.encode(await signer.sign(endpointProofBytes(request, candidates)))
          if (!current(request, trust.role)) throw new Error('endpoint challenge retired')
          const frame = new TextEncoder().encode(JSON.stringify(endpointProof({ challenge: request, candidates, signature })))
          if (frame.length > options.maxBytes) throw new Error('endpoint proof too large')
          challenge = request
          pending = false
          socket.send(frame)
          return
        }
        if (!current(challenge, trust.role)) throw new Error('endpoint reply expired')
        if (trust.role === 'desktop') {
          z.object({ kind: z.literal('published') }).strict().parse(value)
          finish({ candidates: options.candidates, expiresAt: Math.min(trust.expiresAt, challenge.expiresAt + DEVICE_ENDPOINT_LEASE_MS) })
          return
        }
        const { proof: reply } = responseSchema.parse(value)
        if (reply === null) { finish({ candidates: null, expiresAt: challenge.expiresAt }); return }
        const proof = endpointProof(reply)
        if (!current(proof.challenge, 'desktop', DEVICE_ENDPOINT_LEASE_MS) || proof.challenge.credentialId !== await primitives.credentialId(options.desktopPublicSpki)
          || !await primitives.verify(options.desktopPublicSpki, endpointProofBytes(proof.challenge, proof.candidates), primitives.decode(proof.signature))
          || !current(proof.challenge, 'desktop', DEVICE_ENDPOINT_LEASE_MS)) throw new Error('endpoint publication denied')
        finish({ candidates: proof.candidates, expiresAt: Math.min(trust.expiresAt, proof.challenge.expiresAt + DEVICE_ENDPOINT_LEASE_MS) })
      })().catch(error => { void error; finish() })
    }
    signal.addEventListener('abort', abort, { once: true })
    stops.push(() => signal.removeEventListener('abort', abort), socket.onEnd(abort), socket.onFrame(listen))
    if (signal.aborted) finish()
  })
}
