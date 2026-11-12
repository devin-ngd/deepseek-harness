/** Durable desktop workspace consent for one signed device binding. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { deviceBindingSchema } from '../../src/device-binding-protocol.ts'

const consent = z.object({ schema: z.literal('harmony-workspace-consent/1'), signature: deviceBindingSchema.shape.signature }).strict()

/** One desktop-local consent record, independent of the device registration and its tickets. */
export class WorkspaceConsent {
  private readonly key
  private blocked = false

  /** @param ctx - original profile credentials. @param desktopId - configured desktop. @param deviceId - configured phone. */
  constructor(private readonly ctx: Context, desktopId: string, deviceId: string) {
    this.key = credentialKey('harmony-workspace-consent-v1', 'device-' + createHash('sha256').update(JSON.stringify([desktopId, 'desktop', deviceId])).digest('hex'))
  }

  /** @returns the exact previously approved binding signature. An uncertain write blocks automatic restoration. */
  async read(): Promise<string | undefined> {
    this.available()
    const record = await this.ctx.credentials.readRecord(this.key)
    this.available()
    if (record === undefined) return undefined
    if (record.kind !== 'grant') throw new Error('Workspace consent record unavailable')
    return consent.parse(record.payload).signature
  }

  /** @param signature - the approved binding signature, or undefined to forget it. @returns after durable acknowledgement. */
  async write(signature: string | undefined): Promise<void> {
    if (this.ctx.get('profileContext')?.name !== 'desktop') throw new Error('Workspace consent profile denied')
    this.blocked = true
    if (signature === undefined) await this.ctx.credentials.deleteRecord(this.key)
    else await this.ctx.credentials.modifyRecord(this.key, async () => ({
      kind: 'grant', payload: consent.parse({ schema: 'harmony-workspace-consent/1', signature }),
    }))
    this.blocked = false
  }

  private available(): void {
    if (this.blocked || this.ctx.get('profileContext')?.name !== 'desktop') throw new Error('Workspace consent unavailable')
  }
}
