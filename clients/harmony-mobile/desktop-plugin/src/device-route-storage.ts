/** Separate public route history with a durable refusal marker on uncertain writes. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import { credentialKey, isCredentialKeySegment, type CredentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import type { DeviceBindingStorage } from './device-binding.ts'
const recordSchema = z.discriminatedUnion('state', [z.object({ schema: z.literal('harmony-device-route-store/1'), state: z.literal('ready'), current: z.string() }).strict(), z.object({ schema: z.literal('harmony-device-route-store/1'), state: z.literal('pending'), previous: z.string().nullable(), next: z.string() }).strict()])
/** Stable local dispositions exclude provider output and stored payloads. */
export class DeviceRouteStorageError extends Error {
  constructor(readonly code: 'profile-denied' | 'blocked' | 'read-unavailable' | 'ambiguous-namespace' | 'namespace-changed' | 'invalid-record' | 'persistence-unknown' | 'history-capacity' | 'compare-conflict') { super(code === 'persistence-unknown' ? 'device route persistence outcome unknown' : 'device route storage ' + code); this.name = 'DeviceRouteStorageError' }
}
/** New keys have a fixed letter prefix; legal unprefixed histories remain in place without copying or merging. */
export class CredentialDeviceRouteStorage implements DeviceBindingStorage {
  private readonly key: CredentialKey
  private readonly legacyKey: CredentialKey | undefined
  private selected: CredentialKey | undefined
  private blocked = false
  constructor(private readonly ctx: Context, desktopId: string, deviceId: string) {
    if (ctx.get('profileContext')?.name !== 'desktop') throw new DeviceRouteStorageError('profile-denied')
    const digest = createHash('sha256').update(JSON.stringify([desktopId, 'desktop', deviceId])).digest('hex')
    this.key = credentialKey('harmony-device-route-v1', 'route-' + digest)
    this.legacyKey = isCredentialKeySegment(digest) ? credentialKey('harmony-device-route-v1', digest) : undefined
  }
  private local(): void { if (this.blocked) throw new DeviceRouteStorageError('blocked'); if (this.ctx.get('profileContext')?.name !== 'desktop') throw new DeviceRouteStorageError('profile-denied') }
  private async locate(): Promise<{ key: CredentialKey; record: CredentialRecord | undefined }> {
    this.local()
    let current: CredentialRecord | undefined, legacy: CredentialRecord | undefined
    try { current = await this.ctx.credentials.readRecord(this.key); legacy = this.legacyKey === undefined ? undefined : await this.ctx.credentials.readRecord(this.legacyKey) }
    catch (error) { void error; throw new DeviceRouteStorageError('read-unavailable') }
    this.local()
    if (current !== undefined && legacy !== undefined) throw new DeviceRouteStorageError('ambiguous-namespace')
    const key = legacy !== undefined && this.legacyKey !== undefined ? this.legacyKey : this.key
    if (this.selected !== undefined && this.selected !== key) throw new DeviceRouteStorageError('namespace-changed')
    this.selected = key
    return { key, record: legacy === undefined ? current : legacy }
  }
  private parse(record: CredentialRecord | undefined): string | null {
    if (record === undefined) return null
    if (record.kind !== 'grant') throw new DeviceRouteStorageError('invalid-record')
    const value = recordSchema.safeParse(record.payload)
    if (!value.success) throw new DeviceRouteStorageError('invalid-record')
    if (value.data.state !== 'ready') throw new DeviceRouteStorageError('persistence-unknown')
    return value.data.current
  }
  async read(): Promise<string | null> { const selected = await this.locate(); return this.parse(selected.record) }
  async compareAndSet(previous: string | null, next: string): Promise<void> {
    this.local(); if (Buffer.byteLength(next) > 524288) throw new DeviceRouteStorageError('history-capacity')
    const selected = await this.locate(), pending = { schema: 'harmony-device-route-store/1' as const, state: 'pending' as const, previous, next }
    try {
      await this.ctx.credentials.modifyRecord(selected.key, async record => {
        this.local(); if (this.parse(record) !== previous) throw new DeviceRouteStorageError('compare-conflict')
        return { kind: 'grant', payload: pending }
      })
      await this.locate()
      await this.ctx.credentials.modifyRecord(selected.key, async record => {
        this.local(); if (record?.kind !== 'grant' || JSON.stringify(recordSchema.parse(record.payload)) !== JSON.stringify(pending)) throw new DeviceRouteStorageError('persistence-unknown')
        return { kind: 'grant', payload: { schema: 'harmony-device-route-store/1', state: 'ready', current: next } }
      })
      await this.locate()
    } catch (error) { void error; this.blocked = true; throw new DeviceRouteStorageError('persistence-unknown') }
  }
}
