/** Isolated public Host commands with fixture identities and a non-network relay mount. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { loadProfileServices } from './profile-services.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { desktopKey, phoneKey, fixtureSource } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { DeviceBindingDesktopRelay } from '../desktop-plugin/src/device-binding-relay.ts'
import { CredentialDeviceBindingStorage } from '../desktop-plugin/src/device-binding-storage.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { deviceProfileSessionPorts } from '../desktop-plugin/src/device-binding-profile.ts'
import * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { DeviceRouteOwner } from '../src/device-route-owner.ts'
import { deviceBindingReplyBytes } from '../src/device-binding-protocol.ts'
import { id } from '../src/protocol.ts'

/** @param world - fresh synthetic storage. @param onQuestion - browser fixture's official question composer. @returns tracked command operations and awaited teardown; no installed profile is read. */
export async function createControlPanelHost(world: string, onQuestion: (sessionId: string, questions: readonly AskUserQuestionItem[]) => Promise<AskUserQuestionAnswer>) {
  const client = process.env.DSH_HARMONY_CLIENT_ROOT
  if (client === undefined) throw new Error('Synthetic client source root required')
  const ctx = await loadProfileServices(world, await readFile(join(client, 'integration/cordis.yml'), 'utf8'))
  const lifetime = new AbortController(), protection = new FixedIdentityProtection(), originalProtection = WindowsCurrentUserProtection.prototype.unprotect, originalMount = DeviceBindingDesktopRelay.prototype.mount
  const calls: { sessionId: string; action: string }[] = [], work = new Set<Promise<unknown>>()
  const authority = {}, native = {}, alias = 'panel-fixture-desktop'
  const policy = { desktopId: 'field-replay-desktop', profileId: 'desktop' as const, deviceId: 'field-phone', identityAlias: 'panel-fixture-phone', audience: 'relay.example', enrollmentTtlMs: 60000, connectionTtlMs: 60000, challengeTtlMs: 10000, maxChallenges: 100, maxCatalogRows: 100, maxPublicBytes: 65536 }
  let owner: DeviceBindingOwner | undefined, routes: DeviceRouteOwner | undefined, stoppedMounts = 0
  WindowsCurrentUserProtection.prototype.unprotect = (value, binding) => protection.unprotect(value, binding)
  DeviceBindingDesktopRelay.prototype.mount = async () => async () => { stoppedMounts++ }
  const close = async () => {
    lifetime.abort()
    try {
      await Promise.allSettled(work)
      await Promise.all([routes?.close(), owner?.close()])
      await ctx.fiber.dispose()
    } finally { WindowsCurrentUserProtection.prototype.unprotect = originalProtection; DeviceBindingDesktopRelay.prototype.mount = originalMount }
  }
  try {
    ctx.provide('profileContext', { name: 'desktop', dir: world, patchPath: join(world, 'patch.yml'), cwd: world, installAnchor: world, home: world, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
    await ctx.plugin(Gateway); await ctx.plugin(MemoryCredentials); await ctx.plugin(Authorization); await ctx.plugin(UserQuestions)
    await ctx.credentials.modifyRecord(credentialKey('harmony-desktop-identity', alias), async () => fixedProtectedIdentity(alias, desktopKey, protection))
    const identityBefore = await ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias))
    for (const sessionId of ['panel-empty', 'panel-second']) await ctx.sessionController.create({ sessionId: id<'SessionId'>(sessionId), cwd: world })
    const storage = new CredentialDeviceBindingStorage(ctx, policy.desktopId, policy.deviceId)
    owner = new DeviceBindingOwner(authority, policy, storage, desktopKey, deviceProfileSessionPorts(ctx), Date.now, fixtureSource(), { after: (ms, callback) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } })
    const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    const binding = await owner.confirm(authority, { schema: 'harmony-device-binding-reply/1', offer, signature: nodeE2EPrimitives.encode(await phoneKey.sign(deviceBindingReplyBytes(offer))) }, async () => true)
    const bindingBefore = await storage.read()
    let routeRecord: string | null = null
    routes = new DeviceRouteOwner(native, 'phone', async () => binding, { read: async () => routeRecord, compareAndSet: async (previous, next) => { assert.equal(previous, routeRecord); routeRecord = next } }, phoneKey, nodeE2EPrimitives, Date.now)
    ctx.on('user-questions/request', async (request, next) => request.questions.every(question => question.id === 'harmony-device') ? onQuestion(String(request.agent!.id), request.questions) : next())
    const options = JSON.parse(await readFile(join(client, 'desktop-plugin/device.enabled.example.json'), 'utf8'))
    Object.assign(options, { enabled: true, desktopId: policy.desktopId, deviceId: policy.deviceId, identityAlias: alias, phoneIdentityAlias: policy.identityAlias, audience: policy.audience, wss: { ...options.wss, host: policy.audience } })
    const plugin = ctx.plugin(DeviceCommand, options); await plugin
    return {
      calls,
      execute: async (sessionId: string, line: string) => {
        calls.push({ sessionId, action: line.split(' ')[1]! })
        const agent = ctx.agents.get(id<'SessionId'>(sessionId)); if (agent === undefined) throw new Error('fixture Session ended')
        const operation = ctx.commands.execute(agent, line, [], lifetime.signal); work.add(operation)
        try { return { ok: true as const, value: await operation } } finally { work.delete(operation) }
      },
      signRoute: (offer: unknown) => routes!.acceptOffer(native, offer, true),
      verify: async () => {
        assert.equal(await storage.read(), bindingBefore)
        assert.deepEqual(await ctx.credentials.readRecord(credentialKey('harmony-desktop-identity', alias)), identityBefore)
        for (const sid of ['panel-empty', 'panel-second']) assert.equal(ctx.sessions.get(id<'SessionId'>(sid))!.snapshotEvents().filter(event => event.type === 'turn/start').length, 0)
        ctx.llm.assertZeroRealCalls()
        return { syntheticBindingUnchanged: true, syntheticIdentityUnchanged: true, modelTurns: 0, stoppedMounts }
      },
      close,
    }
  } catch (error) { await close(); throw error }
}
