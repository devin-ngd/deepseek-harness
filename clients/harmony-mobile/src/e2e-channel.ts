/** Shared asynchronous E2E state; primitives are injected and no Node, network, key generation or persistence enters this module. */
import { z } from 'zod'
import { id } from './protocol.ts'
import type { JsonValue } from './upstream.ts'
import { jsonPayload } from './wire.ts'
import type { DeviceTransportBinding, DeviceCredentialId } from '../integration/device-auth.ts'
/** Private prototype protocol; algorithm tests do not qualify production security. */
export const E2E_PROTOCOL = 'dsh-mobile-e2e/1'
/** Signed endpoint role. */
export type E2ERole = 'phone' | 'desktop'
/** Temporary routing identifier, independent of Sessions/devices. */
export type RelayRoomId = ReturnType<typeof id<'harmony-relay-room'>>
import { E2EError } from './e2e-error.ts'
export { E2EError } from './e2e-error.ts'
import { transcriptBytes } from './signing-bytes.ts'
export { transcriptBytes } from './signing-bytes.ts'
/** Maintained platform crypto/codec implementations; native byte representations must be verified before deployment. */
export interface E2EPrimitives {
  encode(bytes: Uint8Array): string; decode(value: string): Uint8Array
  publicKey(publicSpki: string): Promise<void>; credentialId(publicSpki: string): Promise<DeviceCredentialId>
  hash(bytes: Uint8Array): Promise<Uint8Array>; hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>
  verify(publicSpki: string, message: Uint8Array, signature: Uint8Array): Promise<boolean>
  encrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>
  decrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertextAndTag: Uint8Array): Promise<Uint8Array>
}
/** Transient agreement handle; private-key export never enters the protocol. */
export interface P256Agreement { readonly publicSpki: string; derive(remotePublicSpki: string): Promise<Uint8Array>; close(): void }
/** Identity signer belongs only to trusted transport code. */
export interface P256IdentitySigner { readonly publicSpki: string; sign(message: Uint8Array): Promise<Uint8Array> }
/** Explicit limits, with a fixed 2^32-1 GCM invocation ceiling. */
export interface E2ELimits { readonly maxFrameBytes: number; readonly maxPlaintextBytes: number; readonly maxFrames: number }
const helloSchema = z.object({ protocol: z.literal(E2E_PROTOCOL), role: z.enum(['phone', 'desktop']), ephemeralSpki: z.string(), nonce: z.string() }).strict()
/** Ephemeral hello fields only. */
export type E2EHello = z.infer<typeof helloSchema>
const frameSchema = z.object({ protocol: z.literal(E2E_PROTOCOL), bindingId: z.string().transform(value => id<'harmony-device-channel'>(value)), role: z.enum(['phone', 'desktop']), sequence: z.number().int().nonnegative(), kind: z.enum(['finished', 'data']), ciphertext: z.string() }).strict()
/** Header is authenticated as AAD; relay sees no plaintext body. */
export type E2EFrame = z.infer<typeof frameSchema>
const encoder = new TextEncoder()
function opposite(role: E2ERole): E2ERole { return role === 'phone' ? 'desktop' : 'phone' }
/** One shared state machine for asynchronous Node/native primitives; counters serialize and late results cannot revive a closed binding. */
export class P256SecureChannel {
  private readonly localHello: E2EHello
  private bindingValue: DeviceTransportBinding | undefined
  private sendKey: Uint8Array | undefined
  private receiveKey: Uint8Array | undefined
  private sendPrefix: Uint8Array | undefined
  private receivePrefix: Uint8Array | undefined
  private sendSequence = 0
  private receiveSequence = 0
  private localFinished = false
  private remoteFinished = false
  private helloClaimed = false
  private finishing = false
  private closed = false
  private readonly controller = new AbortController()
  private sendTail: Promise<void> = Promise.resolve()
  private receiveTail: Promise<void> = Promise.resolve()
  /** @param role - signed role. @param room - temporary room id. @param agreement - unique connection key. @param nonce - fresh approved entropy, deterministic in tests. @param remoteIdentity - preconfirmed identity pin. @param limits - explicit budgets. @param primitives - maintained platform implementation. */
  constructor(private readonly role: E2ERole, private readonly room: RelayRoomId, private readonly agreement: P256Agreement, nonce: Uint8Array, private readonly remoteIdentity: string, private readonly limits: E2ELimits, private readonly primitives: E2EPrimitives) {
    for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new E2EError('invalid')
    if (limits.maxFrames > 0xffffffff || nonce.length !== 32 || room.length < 1 || room.length > 256) throw new E2EError('invalid')
    this.localHello = { protocol: E2E_PROTOCOL, role, ephemeralSpki: agreement.publicSpki, nonce: primitives.encode(nonce) }
  }
  private available(): void { if (this.closed) throw new E2EError('closed') }
  private ready(): void { this.available(); if (!this.localFinished || !this.remoteFinished) throw new E2EError('not-ready') }
  private bytes(value: string, limit: number): Uint8Array {
    if (value.length > Math.ceil(limit * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) throw new E2EError('invalid')
    const bytes = this.primitives.decode(value); if (bytes.length > limit || this.primitives.encode(bytes) !== value) throw new E2EError('invalid'); return bytes
  }
  /** @returns ephemeral hello without long-term identity or Session data. */
  hello(): E2EHello { this.available(); return { ...this.localHello } }
  /** @param candidate - opposite hello. @returns after key/binding derivation; failure closes this channel. */
  async receiveHello(candidate: unknown): Promise<void> {
    this.available(); if (this.helloClaimed) throw new E2EError('invalid'); this.helloClaimed = true
    let secret: Uint8Array | undefined
    let send: Uint8Array | undefined
    let receive: Uint8Array | undefined
    try {
      const parsed = helloSchema.safeParse(candidate)
      if (!parsed.success || parsed.data.role === this.role || this.bytes(parsed.data.nonce, 32).length !== 32) throw new E2EError('invalid')
      await this.primitives.publicKey(this.remoteIdentity); await this.primitives.publicKey(this.agreement.publicSpki); await this.primitives.publicKey(parsed.data.ephemeralSpki)
      const remote = parsed.data, phone = this.role === 'phone' ? this.localHello : remote, desktop = this.role === 'desktop' ? this.localHello : remote
      const digest = await this.primitives.hash(transcriptBytes([E2E_PROTOCOL, this.room, phone.role, phone.ephemeralSpki, phone.nonce, desktop.role, desktop.ephemeralSpki, desktop.nonce]))
      secret = await this.agreement.derive(remote.ephemeralSpki)
      send = await this.primitives.hkdf(secret, digest, transcriptBytes([E2E_PROTOCOL, 'traffic-key', this.role]), 36)
      receive = await this.primitives.hkdf(secret, digest, transcriptBytes([E2E_PROTOCOL, 'traffic-key', opposite(this.role)]), 36)
      const remoteCredentialId = await this.primitives.credentialId(this.remoteIdentity)
      this.available(); this.sendKey = send.slice(0, 32); this.sendPrefix = send.slice(32); this.receiveKey = receive.slice(0, 32); this.receivePrefix = receive.slice(32); this.bindingValue = { id: id<'harmony-device-channel'>(this.primitives.encode(digest)), remoteCredentialId, signal: this.controller.signal }
    } catch (error) { this.close(); if (error instanceof E2EError) throw error; throw new E2EError('key-invalid') }
    finally { secret?.fill(0); send?.fill(0); receive?.fill(0); this.agreement.close() }
  }
  private nonce(prefix: Uint8Array, sequence: number): Uint8Array { const nonce = new Uint8Array(12); nonce.set(prefix); new DataView(nonce.buffer).setUint32(8, sequence, false); return nonce }
  private aad(frame: Omit<E2EFrame, 'ciphertext'>): Uint8Array { return transcriptBytes([frame.protocol, frame.bindingId, frame.role, frame.sequence, frame.kind]) }
  private serial<T>(direction: 'send' | 'receive', operation: () => Promise<T>): Promise<T> {
    const next = (direction === 'send' ? this.sendTail : this.receiveTail).then(operation), settled = next.then(() => {}, () => {})
    if (direction === 'send') this.sendTail = settled; else this.receiveTail = settled
    return next
  }
  private async encrypt(kind: E2EFrame['kind'], value: JsonValue): Promise<E2EFrame> {
    this.available(); if (this.bindingValue === undefined || this.sendKey === undefined || this.sendPrefix === undefined) throw new E2EError('not-ready')
    const plaintext = encoder.encode(JSON.stringify(value)); if (plaintext.length > this.limits.maxPlaintextBytes) throw new E2EError('capacity')
    if (this.sendSequence >= this.limits.maxFrames) { this.close(); throw new E2EError('capacity') }
    const head: Omit<E2EFrame, 'ciphertext'> = { protocol: E2E_PROTOCOL, bindingId: this.bindingValue.id, role: this.role, sequence: this.sendSequence++, kind }
    try {
      const sealed = await this.primitives.encrypt(this.sendKey, this.nonce(this.sendPrefix, head.sequence), this.aad(head), plaintext)
      this.available(); const frame = { ...head, ciphertext: this.primitives.encode(sealed) }; if (encoder.encode(JSON.stringify(frame)).length > this.limits.maxFrameBytes) throw new E2EError('capacity'); return frame
    } catch (error) { this.close(); if (error instanceof E2EError) throw error; throw new E2EError('closed') }
    finally { plaintext.fill(0) }
  }
  private async decrypt(candidate: unknown, kind: E2EFrame['kind']): Promise<JsonValue> {
    this.available(); let plaintext: Uint8Array | undefined
    try {
      if (typeof candidate !== 'string' || encoder.encode(candidate).length > this.limits.maxFrameBytes) throw new E2EError('invalid')
      const raw: unknown = JSON.parse(candidate), parsed = frameSchema.safeParse(raw)
      if (!parsed.success || this.bindingValue === undefined || this.receiveKey === undefined || this.receivePrefix === undefined) throw new E2EError('invalid')
      const frame = parsed.data
      if (frame.bindingId !== this.bindingValue.id || frame.role !== opposite(this.role) || frame.kind !== kind || frame.sequence !== this.receiveSequence || frame.sequence >= this.limits.maxFrames) throw new E2EError('sequence')
      const ciphertext = this.bytes(frame.ciphertext, this.limits.maxPlaintextBytes + 16); if (ciphertext.length < 16) throw new E2EError('invalid')
      plaintext = await this.primitives.decrypt(this.receiveKey, this.nonce(this.receivePrefix, frame.sequence), this.aad(frame), ciphertext)
      this.available(); const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)); const result = jsonPayload(value); this.receiveSequence++; return result
    } catch (error) { this.close(); if (error instanceof E2EError) throw error; throw new E2EError('decrypt-failed') }
    finally { plaintext?.fill(0) }
  }
  /** @param signer - trusted local key handle. @returns encrypted role/transcript identity proof. */
  async finish(signer: P256IdentitySigner): Promise<E2EFrame> {
    this.available(); if (this.bindingValue === undefined || this.localFinished || this.finishing) throw new E2EError('not-ready'); this.finishing = true
    try {
      const credentialId = await this.primitives.credentialId(signer.publicSpki), signature = this.primitives.encode(await signer.sign(transcriptBytes([E2E_PROTOCOL, 'finished', this.role, this.bindingValue.id, credentialId])))
      const frame = await this.serial('send', () => this.encrypt('finished', { credentialId, signature })); this.available(); this.localFinished = true; return frame
    } catch (error) { this.close(); if (error instanceof E2EError) throw error; throw new E2EError('signature-denied') }
  }
  /** @param raw - encrypted proof. @returns after checking a separately pinned identity, never a public key provided in this frame. */
  async acceptFinished(raw: unknown): Promise<void> {
    return this.serial('receive', async () => {
      if (this.remoteFinished) { this.close(); throw new E2EError('sequence') }
      try {
        const decoded = await this.decrypt(raw, 'finished'), proof = z.object({ credentialId: z.string(), signature: z.string() }).strict().safeParse(decoded), credentialId = await this.primitives.credentialId(this.remoteIdentity)
        if (!proof.success || proof.data.credentialId !== credentialId || this.bindingValue === undefined || !await this.primitives.verify(this.remoteIdentity, transcriptBytes([E2E_PROTOCOL, 'finished', opposite(this.role), this.bindingValue.id, credentialId]), this.bytes(proof.data.signature, 80))) throw new E2EError('signature-denied')
        this.available(); this.remoteFinished = true
      } catch (error) { this.close(); if (error instanceof E2EError) throw error; throw new E2EError('signature-denied') }
    })
  }
  /** @returns host-only verified connection object; its visible id cannot substitute for object identity. */
  binding(): DeviceTransportBinding { this.ready(); if (this.bindingValue === undefined) throw new E2EError('not-ready'); return this.bindingValue }
  /** @param value - application JSON. @returns serialized encrypted frame after mutual proof verification. */
  seal(value: JsonValue): Promise<E2EFrame> { return this.serial('send', async () => { this.ready(); return this.encrypt('data', value) }) }
  /** @param raw - complete bounded encrypted frame. @returns authenticated application JSON in exact order. */
  open(raw: unknown): Promise<JsonValue> { return this.serial('receive', async () => { this.ready(); return this.decrypt(raw, 'data') }) }
  /** Abort identity, clear owned derived-key buffers and release agreement; no garbage-collected erasure guarantee. */
  close(): void { this.closed = true; this.controller.abort(); this.sendKey?.fill(0); this.receiveKey?.fill(0); this.sendPrefix?.fill(0); this.receivePrefix?.fill(0); this.agreement.close() }
}
