/** Original command implementation on synthetic records in the full shell's temporary profile. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { vi } from 'vitest'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { desktopKey, phoneKey, fixtureSource } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { CredentialDeviceBindingStorage } from '../desktop-plugin/src/device-binding-storage.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { deviceBindingReplyBytes } from '../src/device-binding-protocol.ts'

/** @param ctx - full Web shell root. @param world - private test directory containing the profile. @returns synthetic binding verification and teardown; no answerer or transport is substituted. */
export async function installShellDeviceFixture(ctx: Context, world: string) {
  assert.equal(ctx.profileContext.name, 'desktop')
  assert.ok(resolve(ctx.profileContext.dir).startsWith(resolve(world) + sep))
  const authority = {}, protection = new FixedIdentityProtection(), alias = 'shell-fixture-desktop'
  const unprotect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'unprotect').mockImplementation((value, binding) => protection.unprotect(value, binding))
  const policy = { desktopId: 'field-replay-desktop', profileId: 'desktop' as const, deviceId: 'field-phone', identityAlias: 'shell-fixture-phone', audience: 'relay.example', enrollmentTtlMs: 60000, connectionTtlMs: 60000, challengeTtlMs: 10000, maxChallenges: 100, maxCatalogRows: 100, maxPublicBytes: 65536 }
  const storage = new CredentialDeviceBindingStorage(ctx, policy.desktopId, policy.deviceId)
  const owner = new DeviceBindingOwner(authority, policy, storage, desktopKey, deviceProfileSessionPorts(ctx), Date.now, fixtureSource(), { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } })
  let plugin: ReturnType<Context['plugin']> | undefined
  const close = async () => {
    const failures: unknown[] = []
    try {
      try { await plugin?.dispose() } catch (error) { failures.push(error) }
      try { await owner.close() } catch (error) { failures.push(error) }
    } finally { unprotect.mockRestore() }
    if (failures.length) throw new AggregateError(failures, 'Synthetic device fixture cleanup failed')
  }
  try {
    await ctx.credentials.modifyRecord(credentialKey('harmony-desktop-identity', alias), async () => fixedProtectedIdentity(alias, desktopKey, protection))
    const originalIdentity = await ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias))
    const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    await owner.confirm(authority, { schema: 'harmony-device-binding-reply/1', offer, signature: nodeE2EPrimitives.encode(await phoneKey.sign(deviceBindingReplyBytes(offer))) }, async () => true)
    const originalBinding = await storage.read()
    const options = JSON.parse(await readFile(new URL('../desktop-plugin/device.enabled.example.json', import.meta.url), 'utf8'))
    Object.assign(options, { enabled: true, desktopId: policy.desktopId, deviceId: policy.deviceId, identityAlias: alias, phoneIdentityAlias: policy.identityAlias, audience: policy.audience, wss: { ...options.wss, host: policy.audience } })
    plugin = ctx.plugin(DeviceCommand, options); await plugin
    const events: { sessionId: string; type: string; commandId: string; state?: string; kind?: string }[] = []
    const turns: string[] = []
    const stopEvents = ctx.on('session/event', (session, event) => {
      if (event.type === 'turn/start') turns.push(session.id)
      if (event.type !== 'command/run' && event.type !== 'command/done') return
      if (event.type === 'command/run') { if (event.data.name === 'harmony-device') events.push({ sessionId: session.id, type: event.type, commandId: event.data.commandId }); return }
      if (!events.some(row => row.commandId === event.data.commandId)) return
      let state: string | undefined
      if (event.data.kind === 'success' && event.data.text !== undefined) state = JSON.parse(event.data.text).state
      events.push({ sessionId: session.id, type: event.type, commandId: event.data.commandId, kind: event.data.kind, ...(state === undefined ? {} : { state }) })
    })
    return {
      events,
      verify: async () => {
        assert.deepEqual(turns, [], 'Panel interactions must not start model turns')
        assert.equal(await storage.read(), originalBinding)
        assert.deepEqual(await ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias)), originalIdentity)
        return { syntheticBindingUnchanged: true, syntheticIdentityUnchanged: true, modelTurns: turns.length, signingProtection: 'fixed public-key fixture substitute' }
      },
      close: async () => { stopEvents(); await close() },
    }
  } catch (error) { await close(); throw error }
}
