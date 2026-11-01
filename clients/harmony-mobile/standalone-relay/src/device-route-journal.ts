/** Independent append-only finite routes anchored to retained legacy trust. No listener or private key is owned here. */
import { open, lstat, unlink, type FileHandle } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { deviceBindingSchema, deviceBindingBytes, type DeviceBinding } from '../../src/device-binding-protocol.ts'
import { deviceRouteSchema, verifyDeviceRoute, type DeviceRoute } from '../../src/device-route-protocol.ts'
import { routeVerifier } from './route-verifier.ts'
import { id } from '../../src/protocol.ts'
import { publicTrustWrites, type PublicTrustPolicy, type PublicTrustWrites } from './public-trust.ts'
import type { RelayPairTrust } from './broker-policy.ts'
const eventSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('register'), acceptedAt: z.number().int().nonnegative(), route: deviceRouteSchema }).strict(), z.object({ kind: z.literal('revoke-route'), routeId: z.string().min(1).max(128), epoch: z.literal(2) }).strict(), z.object({ kind: z.literal('revoke-device'), binding: deviceBindingSchema }).strict()])
type Event = z.infer<typeof eventSchema>
const frameSchema = z.object({ schema: z.literal('harmony-device-route-journal/1'), sequence: z.number().int().positive(), previous: z.string().regex(/^[a-f0-9]{64}$/), anchor: z.string().regex(/^[a-f0-9]{64}$/), event: eventSchema.nullable() }).strict()
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
interface Entry { readonly route: DeviceRoute; revoked: boolean }
export class DeviceRouteJournal {
  private readonly routes = new Map<string, Entry>()
  private readonly devices = new Map<string, DeviceBinding>()
  private sequence = 0
  private head = '0'.repeat(64)
  private bytes = 0
  private closed = false
  private failed = false
  private tail: Promise<void> = Promise.resolve()
  private closing: Promise<void> | undefined
  private constructor(private readonly policy: PublicTrustPolicy, private readonly anchor: string, private readonly pins: readonly RelayPairTrust[], private readonly maxActive: number, private readonly clock: () => number, private readonly file: FileHandle, private readonly marker: FileHandle, private readonly lock: FileHandle, private readonly io: PublicTrustWrites) {}
  private static async check(policy: PublicTrustPolicy): Promise<void> {
    if (!isAbsolute(policy.path) || resolve(policy.path) !== policy.path || ![policy.maxBytes, policy.maxRecords].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('route journal policy denied')
    for (let value = dirname(policy.path); ; value = dirname(value)) { const info = await lstat(value); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('route journal directory denied'); if (dirname(value) === value) break }
  }
  private static async bounded(file: FileHandle, max: number): Promise<Buffer> { const info = await file.stat(); if (!info.isFile() || info.nlink !== 1 || info.size <= 0 || info.size > max || process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('route journal file denied'); const bytes = Buffer.alloc(info.size + 1); let offset = 0; while (offset < bytes.length) { const read = await file.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead }; if (offset !== info.size || (await file.stat()).size !== info.size) throw new Error('route journal read changed'); return bytes.subarray(0, offset) }
  /** Exclusively create an empty new route journal only after explicit migration approval; never modifies legacy files. */
  static async initialize(policy: PublicTrustPolicy, anchor: string, io: PublicTrustWrites = publicTrustWrites): Promise<void> {
    await this.check(policy); if (!/^[a-f0-9]{64}$/.test(anchor)) throw new Error('route journal anchor denied')
    const lock = await open(policy.path + '.lock', constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); let file: FileHandle | undefined, marker: FileHandle | undefined, complete = false
    try {
      file = await open(policy.path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); marker = await open(policy.path + '.head', constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      const bytes = Buffer.from(JSON.stringify(frameSchema.parse({ schema: 'harmony-device-route-journal/1', sequence: 1, previous: '0'.repeat(64), anchor, event: null })) + '\n')
      if (bytes.length > policy.maxBytes) throw new Error('route journal capacity')
      await io.append(file, bytes); await io.sync(file); await io.append(marker, Buffer.from(JSON.stringify({ sequence: 1, digest: hash(bytes) }) + '\n')); await io.sync(marker); await io.directorySync(dirname(policy.path)); complete = true
    } finally { const result = await Promise.allSettled([file?.close(), marker?.close(), lock.close()]); if (complete && result.every(item => item.status === 'fulfilled')) { await unlink(policy.path + '.lock'); await io.directorySync(dirname(policy.path)) } }
  }
  /** Reconstruct every signed registration and terminal tombstone before any server listener exists. */
  static async reopen(policy: PublicTrustPolicy, anchor: string, pins: readonly RelayPairTrust[], maxActive: number, clock: () => number, io: PublicTrustWrites = publicTrustWrites): Promise<DeviceRouteJournal> {
    await this.check(policy); if (!Number.isSafeInteger(maxActive) || maxActive <= 0 || pins.length === 0) throw new Error('route journal pins denied')
    const lock = await open(policy.path + '.lock', constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); let file: FileHandle | undefined, marker: FileHandle | undefined
    try {
      await io.directorySync(dirname(policy.path))
      for (const path of [policy.path, policy.path + '.head']) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw new Error('route journal file denied') }
      file = await open(policy.path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW); marker = await open(policy.path + '.head', constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW)
      const bytes = await this.bounded(file, policy.maxBytes), heads = await this.bounded(marker, policy.maxBytes)
      if (bytes.at(-1) !== 10 || heads.at(-1) !== 10) throw new Error('route journal torn')
      const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trimEnd().split('\n'), marks = new TextDecoder('utf-8', { fatal: true }).decode(heads).trimEnd().split('\n')
      if (lines.length !== marks.length || lines.length > policy.maxRecords) throw new Error('route journal count denied')
      const store = new DeviceRouteJournal(policy, anchor, pins, maxActive, clock, file, marker, lock, io)
      for (const [index, line] of lines.entries()) {
        const frame = frameSchema.parse(JSON.parse(line)), mark = z.object({ sequence: z.number(), digest: z.string() }).strict().parse(JSON.parse(marks[index]!)), digest = hash(Buffer.from(line + '\n'))
        if (frame.anchor !== anchor || frame.sequence !== index + 1 || frame.previous !== store.head || mark.sequence !== frame.sequence || mark.digest !== digest || (index === 0 ? frame.event !== null : frame.event === null)) throw new Error('route journal history denied')
        if (frame.event !== null) await store.apply(frame.event, false)
        store.sequence = frame.sequence; store.head = digest
      }
      store.bytes = bytes.length; return store
    } catch (error) { await Promise.allSettled([file?.close(), marker?.close(), lock.close()]); throw new Error('route journal recovery refused; retained lock', { cause: error }) }
  }
  private pin(binding: DeviceBinding): void { if (!this.pins.some(pin => pin.pairId === binding.bindingId && pin.desktopPublicSpki === binding.desktopPublicSpki && pin.phonePublicSpki === binding.phonePublicSpki)) throw new Error('route journal original binding denied') }
  private async apply(event: Event, live: boolean): Promise<void> {
    if (event.kind === 'register') {
      const route = await verifyDeviceRoute(event.route, routeVerifier, undefined, live ? this.clock() : undefined), offer = route.offer; this.pin(offer.binding)
      if (this.devices.has(offer.binding.bindingId) || this.routes.has(offer.routeId) || [...this.routes.values()].some(item => item.route.offer.nonce === offer.nonce)) throw new Error('route registration revoked or replayed')
      const at = event.acceptedAt
      if (at < offer.issuedAt || at >= offer.expiresAt || live && at > this.clock()) throw new Error('route registration clock denied')
      if ([...this.routes.values()].filter(item => !item.revoked && !this.devices.has(item.route.offer.binding.bindingId) && item.route.offer.expiresAt > at).length >= this.maxActive) throw new Error('route active capacity')
      this.routes.set(offer.routeId, { route, revoked: false }); return
    }
    if (event.kind === 'revoke-route') { const current = this.routes.get(event.routeId); if (current === undefined || current.revoked) throw new Error('route revocation absent or replayed'); current.revoked = true; return }
    const value = event.binding, { signature, ...unsigned } = value; this.pin(value)
    if (!value.revoked || value.epoch < 2 || this.devices.has(value.bindingId) || !await routeVerifier.verify(value.desktopPublicSpki, deviceBindingBytes(unsigned), routeVerifier.decode(signature)) || [...this.routes.values()].some(item => item.route.offer.binding.bindingId === value.bindingId && item.route.offer.binding.epoch >= value.epoch)) throw new Error('device routing revocation denied')
    this.devices.set(value.bindingId, value); for (const item of this.routes.values()) if (item.route.offer.binding.bindingId === value.bindingId) item.revoked = true
  }
  private append(event: Event): Promise<void> {
    const operation = this.tail.then(async () => {
      if (this.closed || this.failed || this.closing !== undefined) throw new Error('route journal unavailable')
      if (event.kind === 'revoke-route' && this.routes.get(event.routeId)?.revoked) return
      if (this.sequence >= this.policy.maxRecords) throw new Error('route journal capacity')
      const frame = frameSchema.parse({ schema: 'harmony-device-route-journal/1', sequence: this.sequence + 1, previous: this.head, anchor: this.anchor, event }), bytes = Buffer.from(JSON.stringify(frame) + '\n')
      if (this.bytes + bytes.length > this.policy.maxBytes) throw new Error('route journal capacity')
      // Admission changes precede IO. Any uncertain write terminally denies this owner.
      await this.apply(event, true)
      try { await this.io.append(this.file, bytes); await this.io.sync(this.file); const digest = hash(bytes); await this.io.append(this.marker, Buffer.from(JSON.stringify({ sequence: frame.sequence, digest }) + '\n')); await this.io.sync(this.marker); this.sequence = frame.sequence; this.head = digest; this.bytes += bytes.length }
      catch (error) { this.failed = true; throw new Error('route journal write outcome unknown', { cause: error }) }
    }); this.tail = operation.then(() => {}, () => {}); return operation
  }
  register(route: DeviceRoute): Promise<void> { return this.append({ kind: 'register', acceptedAt: this.clock(), route: deviceRouteSchema.parse(route) }) }
  revokeDevice(binding: DeviceBinding): Promise<void> { if (this.closed || this.failed || this.closing !== undefined) return Promise.reject(new Error('route journal unavailable')); const parsed = deviceBindingSchema.parse(binding), previous = this.devices.get(parsed.bindingId); return previous !== undefined && JSON.stringify(previous) === JSON.stringify(parsed) ? Promise.resolve() : this.append({ kind: 'revoke-device', binding: parsed }) }
  async revokeRoute(routeId: string): Promise<void> { if (this.closed || this.failed || this.closing !== undefined) throw new Error('route journal unavailable'); const item = this.routes.get(routeId); if (item?.revoked) return; await this.append({ kind: 'revoke-route', routeId, epoch: 2 }) }
  /** Existing broker's durable route-only revocation adapter; the persistent device binding is untouched. */
  async commit(pair: RelayPairTrust): Promise<void> { const item = this.routes.get(pair.pairId); if (item === undefined || !pair.revoked || pair.epoch !== 2 || pair.desktopPublicSpki !== item.route.offer.binding.desktopPublicSpki || pair.phonePublicSpki !== item.route.offer.binding.phonePublicSpki || pair.expiresAt !== item.route.offer.expiresAt) throw new Error('route broker revocation denied'); await this.revokeRoute(pair.pairId) }
  pairs(): readonly RelayPairTrust[] { if (this.closed || this.failed) throw new Error('route journal unavailable'); return [...this.routes.values()].filter(item => !item.revoked && !this.devices.has(item.route.offer.binding.bindingId) && item.route.offer.expiresAt > this.clock()).map(({ route }) => ({ pairId: id<'harmony-relay-pair'>(route.offer.routeId), desktopPublicSpki: route.offer.binding.desktopPublicSpki, phonePublicSpki: route.offer.binding.phonePublicSpki, epoch: route.offer.routeEpoch, expiresAt: route.offer.expiresAt, revoked: false })) }
  status(routeId: string): { routeId: string; epoch: number; revoked: boolean; expiresAt: number } { if (this.closed || this.failed) throw new Error('route journal unavailable'); const item = this.routes.get(routeId); if (item === undefined) throw new Error('route record absent'); return { routeId, epoch: item.revoked ? 2 : 1, revoked: item.revoked, expiresAt: item.route.offer.expiresAt } }
  verifySelection(route: DeviceRoute): void { if (this.closed || this.failed || JSON.stringify(this.routes.get(route.offer.routeId)?.route) !== JSON.stringify(deviceRouteSchema.parse(route))) throw new Error('route public selection mismatch') }
  deviceStatus(binding: DeviceBinding): { bindingId: string; epoch: number; revoked: true } { if (this.closed || this.failed || JSON.stringify(this.devices.get(binding.bindingId)) !== JSON.stringify(deviceBindingSchema.parse(binding))) throw new Error('device route tombstone absent'); return { bindingId: binding.bindingId, epoch: binding.epoch, revoked: true } }
  close(): Promise<void> { if (this.closing !== undefined) return this.closing; this.closing = (async () => { await this.tail; this.closed = true; const results = await Promise.allSettled([this.file.close(), this.marker.close(), this.lock.close()]); if (this.failed || results.some(item => item.status === 'rejected')) throw new Error('route journal cleanup or write unknown; lock retained'); await unlink(this.policy.path + '.lock'); await this.io.directorySync(dirname(this.policy.path)) })(); return this.closing }
}
