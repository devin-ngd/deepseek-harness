/** Dedicated public device-registration namespace with durable pending markers; no legacy grant or identity payload is read. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { deviceBindingSchema } from '../../src/device-binding-protocol.ts'
import type { DeviceBindingStorage } from './device-binding.ts'

const ready = z.object({ schema: z.literal('harmony-device-binding-store/1'), state: z.literal('ready'), current: deviceBindingSchema, history: z.array(deviceBindingSchema) }).strict()
const pending = z.object({ schema: z.literal('harmony-device-binding-store/1'), state: z.literal('pending'), previous: deviceBindingSchema.nullable(), next: deviceBindingSchema, history: z.array(deviceBindingSchema) }).strict()
const envelope = z.discriminatedUnion('state', [ready, pending])
/** Credentials provider adapter for exactly one public device binding, scoped independently of DPAPI keys and old Session grants. */
export class CredentialDeviceBindingStorage implements DeviceBindingStorage {
  private readonly key
  private blocked = false
  /** @param ctx - actual desktop profile with its existing isolated provider. @param desktopId - exact original desktop instance. @param deviceId - exact original phone. */
  constructor(private readonly ctx: Context, private readonly desktopId: string, private readonly deviceId: string) {
    if (ctx.get('profileContext')?.name !== 'desktop') throw new Error('device binding storage profile denied')
    this.key = credentialKey('harmony-device-binding-v1', 'device-' + createHash('sha256').update(JSON.stringify([desktopId, 'desktop', deviceId])).digest('hex'))
  }
  private available(): void { if (this.blocked || this.ctx.get('profileContext')?.name !== 'desktop') throw new Error('device binding storage blocked') }
  private parse(record: CredentialRecord | undefined) {
    if (record === undefined) return null
    if (record.kind !== 'grant') throw new Error('device binding storage record denied')
    const value = envelope.parse(record.payload), records = value.state === 'ready' ? [...value.history, value.current] : [...value.history, ...(value.previous === null ? [] : [value.previous]), value.next]
    if (records.some(record => record.desktopId !== this.desktopId || record.profileId !== 'desktop' || record.deviceId !== this.deviceId)) throw new Error('device binding storage identity denied')
    for (let n = 1; n < records.length; n++) {
      const previous = records[n - 1]!, current = records[n]!
      if (previous.epoch >= current.epoch || previous.desktopCredentialId !== current.desktopCredentialId || previous.credentialId !== current.credentialId || previous.desktopPublicSpki !== current.desktopPublicSpki || previous.phonePublicSpki !== current.phonePublicSpki) throw new Error('device binding storage history denied')
    }
    return value
  }
  /** @returns only this namespace's ready current public record; pending or corrupt state remains blocked across adapter recreation. */
  async read(): Promise<string | null> { this.available(); const value = this.parse(await this.ctx.credentials.readRecord(this.key)); this.available(); if (value?.state === 'pending') throw new Error('device binding storage transition outcome unknown'); return value === null ? null : JSON.stringify(value.current) }
  /** @param previous - exact previously read canonical registration, absent only for initial enrollment. @param next - strict signed successor. @returns after write-ahead pending marker and ready commit; errors never clear a pending marker or retry. */
  async compareAndSet(previous: string | null, next: string): Promise<void> {
    this.available(); const candidate = deviceBindingSchema.parse(JSON.parse(next)); if (candidate.desktopId !== this.desktopId || candidate.profileId !== 'desktop' || candidate.deviceId !== this.deviceId) throw new Error('device binding storage identity denied'); let transition: z.infer<typeof pending> | undefined
    try {
      await this.ctx.credentials.modifyRecord(this.key, async record => {
        this.available(); const value = this.parse(record)
        if (value?.state === 'pending' || (value === null ? null : JSON.stringify(value.current)) !== previous) throw new Error('device binding storage compare conflict')
        const old = value?.current
        if (old === undefined ? candidate.epoch !== 1 || candidate.revoked : candidate.bindingId !== old.bindingId || old.revoked || !candidate.revoked || candidate.epoch !== old.epoch + 1 || candidate.desktopPublicSpki !== old.desktopPublicSpki || candidate.phonePublicSpki !== old.phonePublicSpki) throw new Error('device binding storage successor denied')
        transition = pending.parse({ schema: 'harmony-device-binding-store/1', state: 'pending', previous: old ?? null, next: candidate, history: value?.history ?? [] })
        return { kind: 'grant', payload: transition }
      })
      if (transition === undefined) throw new Error('device binding pending acknowledgement missing')
      const expected = JSON.stringify(transition), selected = transition
      await this.ctx.credentials.modifyRecord(this.key, async record => {
        const value = this.parse(record)
        if (value?.state !== 'pending' || JSON.stringify(value) !== expected) throw new Error('device binding pending owner changed')
        return { kind: 'grant', payload: ready.parse({ schema: 'harmony-device-binding-store/1', state: 'ready', current: selected.next, history: [...selected.history, ...(selected.previous === null ? [] : [selected.previous])] }) }
      })
    } catch (error) { this.blocked = true; throw new Error('device binding storage write outcome unknown', { cause: error }) }
  }
  /** @param changed - host-owned invalidation callback. @returns disposer; only this exact registration key is observed, never key material. */
  onChange(changed: () => void): () => void { return this.ctx.on('credentials/record-updated', key => { if (key === this.key) changed() }) }
}
