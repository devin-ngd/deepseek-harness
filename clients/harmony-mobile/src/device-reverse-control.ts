/** Signed reverse dial requests use a dedicated relay control protocol and the original pairing pins. */
import { z } from 'zod'
import type { RelaySocket } from '../integration/relay-core.ts'
import type { E2EPrimitives, P256IdentitySigner } from './e2e-channel.ts'
import type { EndpointRelayTrust } from './relay-control-client.ts'
import { relayChallenge, relayProof, relayProofBytes, type RelayChallenge } from './relay-control-protocol.ts'
import { isDeviceLanEndpoint, isDeviceLanPort } from './device-lan-address.ts'
import { transcriptBytes } from './signing-bytes.ts'
import { DEVICE_ENDPOINT_LEASE_MS } from './device-endpoint-exchange.ts'

export const DEVICE_REVERSE_SUBPROTOCOL = 'harmony-relay-reverse-lan-v1'
const offerSchema = z.object({
  address: z.string().max(15).refine(value => value !== '127.0.0.1' && isDeviceLanEndpoint(value, 1)),
  port: z.number().refine(isDeviceLanPort),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict()
export type ReverseLanOffer = z.infer<typeof offerSchema>
export interface ReverseProof { challenge: RelayChallenge; offer: ReverseLanOffer | null; signature: string }

/** @param value - untrusted reverse control frame. @returns the validated signed offer or desktop subscription. */
export function reverseProof(value: unknown): ReverseProof {
  const packet = z.object({ challenge: z.unknown(), offer: offerSchema.nullable(), signature: z.unknown() }).strict().parse(value)
  const proof = relayProof({ challenge: packet.challenge, signature: packet.signature })
  if ((proof.challenge.role === 'phone') !== (packet.offer !== null)) throw new Error('reverse role denied')
  return { ...proof, offer: packet.offer }
}

/** @param challenge - live relay challenge. @param offer - phone listener or null for subscription. @returns canonical reverse-only signing bytes. */
export function reverseProofBytes(challenge: RelayChallenge, offer: ReverseLanOffer | null): Uint8Array {
  return transcriptBytes([DEVICE_REVERSE_SUBPROTOCOL, new TextDecoder().decode(relayProofBytes(challenge)), JSON.stringify(offer)])
}

interface ReverseExchangeOptions {
  socket: RelaySocket
  trust: EndpointRelayTrust
  signer: P256IdentitySigner
  primitives: E2EPrimitives
  phonePublicSpki: string
  offer: ReverseLanOffer | null
  clock: () => number
  maxTtlMs: number
  maxBytes: number
  signal: AbortSignal
}

/** @param options - dedicated control port and a bounded exchange lifetime. @returns the phone offer on acknowledgement or verified delivery to the desktop. The caller closes the socket. */
export function exchangeReverseLan(options: ReverseExchangeOptions): Promise<ReverseLanOffer> {
  const { socket, trust, signer, primitives, clock, signal } = options
  return new Promise((resolve, reject) => {
    let done = false, pending = false, subscribed = false, challenge: RelayChallenge | undefined
    const stops: (() => void)[] = []
    const finish = (offer?: ReverseLanOffer) => {
      if (done) return
      done = true
      for (const stop of stops) stop()
      if (offer === undefined) reject(new Error('reverse rendezvous unavailable'))
      else resolve(offer)
    }
    const abort = () => finish()
    const current = (value: RelayChallenge, role: EndpointRelayTrust['role'], lease = 0) => !done && !signal.aborted
      && value.role === role && value.pairId === trust.pairId && value.epoch === trust.epoch && value.audience === trust.audience
      && Math.min(trust.expiresAt, value.expiresAt + lease) > clock() && value.expiresAt <= clock() + options.maxTtlMs
    const receive = (bytes: Uint8Array, binary: boolean) => {
      if (done || pending || binary || bytes.length === 0 || bytes.length > options.maxBytes) { finish(); return }
      pending = true
      void (async () => {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        if (challenge === undefined) {
          const request = relayChallenge(value)
          if (!current(request, trust.role) || request.credentialId !== trust.credentialId
            || request.credentialId !== await primitives.credentialId(signer.publicSpki)) throw new Error('reverse challenge denied')
          const offer = options.offer === null ? null : offerSchema.parse(options.offer)
          const signature = primitives.encode(await signer.sign(reverseProofBytes(request, offer)))
          if (!current(request, trust.role)) throw new Error('reverse challenge expired')
          const frame = new TextEncoder().encode(JSON.stringify(reverseProof({ challenge: request, offer, signature })))
          if (frame.length > options.maxBytes) throw new Error('reverse proof exceeds control limit')
          challenge = request
          pending = false
          socket.send(frame)
          return
        }
        if (trust.role === 'phone') {
          z.object({ kind: z.literal('delivered') }).strict().parse(value)
          if (!current(challenge, 'phone') || options.offer === null) throw new Error('reverse acknowledgement expired')
          finish(options.offer)
          return
        }
        if (!subscribed) {
          z.object({ kind: z.literal('subscribed') }).strict().parse(value)
          if (!current(challenge, 'desktop', DEVICE_ENDPOINT_LEASE_MS)) throw new Error('reverse subscription expired')
          subscribed = true
          pending = false
          return
        }
        const { proof: raw } = z.object({ kind: z.literal('reverse-offer'), proof: z.unknown() }).strict().parse(value)
        const proof = reverseProof(raw)
        if (!current(challenge, 'desktop', DEVICE_ENDPOINT_LEASE_MS) || !current(proof.challenge, 'phone')
          || proof.challenge.round !== challenge.round || proof.offer === null
          || proof.challenge.credentialId !== await primitives.credentialId(options.phonePublicSpki)
          || !await primitives.verify(options.phonePublicSpki, reverseProofBytes(proof.challenge, proof.offer), primitives.decode(proof.signature))
          || !current(proof.challenge, 'phone')) throw new Error('reverse offer denied')
        finish(proof.offer)
      })().catch(error => { void error; finish() })
    }
    signal.addEventListener('abort', abort, { once: true })
    stops.push(() => signal.removeEventListener('abort', abort), socket.onEnd(abort), socket.onFrame(receive))
    if (signal.aborted) finish()
    if (done) for (const stop of stops) stop()
  })
}
