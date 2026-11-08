/** Normal command composition with public fixture identities and memory-only credentials; no device or DPAPI access. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { launchWebScaffold } from '../../../apps/web/tests/scaffold.ts'
import { MemoryCredentials } from '../../../packages/credentials/authorization/tests/memory.ts'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Authorization from '@deepseek-ai/dsh-authorization'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { installLlmReplay } from '@deepseek-ai/dsh-llm-replay'
import { validateTypertManifest } from '@deepseek-ai/dsh-typert-loader'
import { TYPERT as SESSION_TYPERT } from '../../../packages/api/session-controller/lib/typert.host.js'
import * as DeviceCommand from '../desktop-plugin/src/device-binding-command.ts'
import { WindowsCurrentUserProtection } from '../desktop-plugin/src/windows-protection.ts'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { CredentialDeviceBindingStorage } from '../desktop-plugin/src/device-binding-storage.ts'
import { DeviceWorkspaceAccess } from '../desktop-plugin/src/workspace-access.ts'
import { DeviceBindingClient } from '../src/device-binding-client.ts'
import { DeviceProductRpc } from '../src/device-product-rpc.ts'
import { NativeDeviceCore } from '../src/native-device-bridge.ts'
import { WorkspaceClient } from '../src/workspace-client.ts'
import { deviceBindingOfferSchema, deviceBindingSchema, deviceRelayPairId } from '../src/device-binding-protocol.ts'
import { deviceWorkspaceOrigin } from '../src/workspace-origin.ts'
import { workspaceBodySchema } from '../src/workspace-protocol.ts'
import * as desktopWss from './desktop-wss.ts'
import { desktopKey, FixtureClock, phoneKey } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'
import { FixedIdentityProtection, fixedProtectedIdentity } from './fixed-identity-protection.ts'
import { id } from '../src/protocol.ts'
import { loadProfileServices } from './profile-services.ts'
import { WorkspaceMemoryRelay } from './workspace-memory-relay.ts'

it('device commands require fresh workspace approval after revocation and automatic recovery from room expiry', async () => {
  const world = process.env.DSH_HARMONY_WORKSPACE_WORLD; assert.ok(world)
  const lifetime = new AbortController(), cleanups: Array<() => void | Promise<void>> = []
  onTestFinished(async () => {
    lifetime.abort()
    const failures: unknown[] = []
    for (const close of cleanups.reverse()) { try { await close() } catch (error) { failures.push(error) } }
    if (failures.length > 0) throw new AggregateError(failures, 'device workspace command fixture cleanup failed')
  })
  const scaffold = await launchWebScaffold({ firstUse: true })
  cleanups.push(() => scaffold.close())
  const modulesOwner: { dispose?: () => Promise<void> } = {}
  const makeContext = async (label: string, modules: boolean) => {
    const directory = join(world, label); await mkdir(directory)
    const configuration = await readFile(new URL('./cordis.yml', import.meta.url), 'utf8')
    const ctx = await loadProfileServices(directory, modules ? configuration.replace('cordis:disabledCarrier', 'cordis:sharedCarrier') : configuration)
    cleanups.push(() => ctx.fiber.dispose())
    ctx.provide('profileContext', { name: 'desktop', dir: directory, patchPath: join(directory, 'patch.yml'), cwd: directory, home: directory, installAnchor: directory, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
    await ctx.plugin(Gateway)
    if (ctx.get('credentials') === undefined) await ctx.plugin(MemoryCredentials)
    await ctx.plugin(Authorization); await ctx.plugin(UserQuestions)
    if (modules) {
      const provider = ctx.plugin({ name: 'workspace-command-client-modules-provider', apply: inner => { inner.provide('clientModules', scaffold.ctx.clientModules) } })
      modulesOwner.dispose = () => provider.dispose(); await provider
    }
    return ctx
  }
  const ctx = await makeContext('command-profile', true)
  ctx.effect(() => ctx.typert.register(validateTypertManifest('@deepseek-ai/dsh-api-session-controller', SESSION_TYPERT)))
  const protection = new FixedIdentityProtection(), alias = 'workspace-command-public-desktop', authority = {}
  const unprotect = vi.spyOn(WindowsCurrentUserProtection.prototype, 'unprotect').mockImplementation((bytes, binding) => protection.unprotect(bytes, binding))
  cleanups.push(() => { unprotect.mockRestore() })
  let owner: DeviceBindingOwner | undefined, access: DeviceWorkspaceAccess | undefined
  const originalOffer = DeviceBindingOwner.prototype.offer, originalAllow = DeviceWorkspaceAccess.prototype.allow
  const offer = vi.spyOn(DeviceBindingOwner.prototype, 'offer').mockImplementation(function (this: DeviceBindingOwner, ...args) { owner = this; return originalOffer.apply(this, args) })
  const allow = vi.spyOn(DeviceWorkspaceAccess.prototype, 'allow').mockImplementation(function (this: DeviceWorkspaceAccess, ...args) { access = this; return originalAllow.apply(this, args) })
  cleanups.push(() => { offer.mockRestore(); allow.mockRestore() })
  const budget = join(world, 'command-four-response-budget.json')
  await writeFile(budget, JSON.stringify(Array.from({ length: 4 }, () => ({ kind: 'chunks', chunks: [{ type: 'finish', reason: { kind: 'stop' } }] }))) + '\n')
  const replay = installLlmReplay(ctx, { file: budget, overrideFile: budget, offline: true, providers: [{ id: 'workspace-command-replay', models: [{ id: 'main', contextWindow: 100000, defaultMaxTokens: 1000 }] }] })
  cleanups.push(() => replay.dispose())
  let calls = 0, decision: 'Allow' | 'Deny' = 'Allow'
  const stopCalls = ctx.on('llm-replay/request', () => { calls++ })
  cleanups.push(() => { stopCalls() })
  const questions: string[] = []
  let delayedConfirmation: { enter(signal: AbortSignal): void; answer: Promise<void> } | undefined
  const stopQuestions = ctx.on('user-questions/request', async (request, next) => {
    if (!request.questions.every(question => question.id === 'harmony-device')) return next()
    questions.push(...request.questions.map(question => question.question))
    if (delayedConfirmation !== undefined) {
      assert.ok(request.signal)
      delayedConfirmation.enter(request.signal)
      await delayedConfirmation.answer
    }
    return { answers: request.questions.map(question => ({ id: question.id, selected: [decision] })) }
  })
  cleanups.push(() => { stopQuestions() })
  let disposeCommand: (() => Promise<void>) | undefined, client: WorkspaceClient | undefined
  cleanups.push(async () => { await disposeCommand?.() })
  cleanups.push(async () => { await client?.close() })
  let phoneRecord: string | null = null
  const phone = new DeviceBindingClient(authority, { desktopId: 'workspace-command-desktop', profileId: 'desktop', deviceId: 'workspace-command-phone',
    identityAlias: 'workspace-command-public-phone', audience: 'relay.example', desktopCredentialId: p256CredentialId(desktopKey.publicSpki), maxPublicBytes: 65536, maxProofs: 64, maxChallengeTtlMs: 15000,
  }, { read: async () => phoneRecord, compareAndSet: async (before, next) => { assert.equal(phoneRecord, before); phoneRecord = next } }, phoneKey, nodeE2EPrimitives, Date.now)
  cleanups.push(() => phone.close())
  {
    const key = credentialKey('harmony-desktop-identity', alias)
    await ctx.credentials.modifyRecord(key, async () => fixedProtectedIdentity(alias, desktopKey, protection))
    const originalIdentity = await ctx.credentials.readRecord(key)
    const session = await ctx.sessionController.create({ cwd: scaffold.workspaceCwd }), agent = ctx.agents.get(id<'SessionId'>(session.sessionId)); assert.ok(agent)
    const target = await ctx.sessionController.create({ cwd: scaffold.workspaceCwd })
    const targetSession = ctx.sessions.get(id<'SessionId'>(target.sessionId)); assert.ok(targetSession)
    const targetBody = 'Existing history in a Session separate from workspace approval.'
    const targetMessage = createUserMessage({ content: [{ type: 'text', text: targetBody }], source: { kind: 'user' } })
    targetSession.append('user/message', targetMessage, { surfaceOp: 'append' })
    const targetBefore = targetSession.snapshotEvents()
    const run = (verb: string) => ctx.commands.execute(agent, '/harmony-device ' + verb, [], lifetime.signal)
    const output = async (verb: string) => {
      const value = await run(verb); assert.ok(value?.result.kind === 'success' && value.result.text !== undefined, verb + ': ' + JSON.stringify(value))
      return z.object({ sessionId: z.literal(session.sessionId), state: z.string(), publicResult: z.unknown().optional() }).parse(JSON.parse(value.result.text))
    }
    const defaults = JSON.parse(await readFile(new URL('../desktop-plugin/device.enabled.example.json', import.meta.url), 'utf8'))
    const workspace = { ttlMs: 60000, channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
      wire: { maxChunkBytes: 524288, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: 1048576 },
      shell: { distIndex: resolve(import.meta.dirname, '../../../apps/web/dist/index.html'), limits: { maxFiles: 2000, maxFileBytes: 16777216, maxTotalBytes: 134217728 } } }
    const options = { ...defaults, enabled: true, connectionMode: 'window', desktopId: 'workspace-command-desktop', deviceId: 'workspace-command-phone', identityAlias: alias,
      phoneIdentityAlias: 'workspace-command-public-phone', audience: 'relay.example', wss: { ...defaults.wss, host: 'relay.example' },
      relay: { ...defaults.relay, e2e: { ...defaults.relay.e2e, maxPlaintextBytes: 1048576 } }, workspace }
    await expect(DeviceCommand.apply(ctx, { ...options, workspace: { ...workspace, wire: { ...workspace.wire, maxChunkBytes: 1048576 } } }))
      .rejects.toThrow('workspace messages exceed device envelope capacity')
    expect(DeviceCommand.inject.filter(key => ctx.get(key) === undefined)).toEqual([])
    const plugin = ctx.plugin(DeviceCommand, { ...options, workspace: { ...workspace, traceRequests: true } }); disposeCommand = () => plugin.dispose(); await plugin
    expect((await output('status')).state).toBe('not-bound')
    expect((await output('workspace-status')).publicResult).toEqual({ enabled: false, expiresAt: null })
    expect((await output('workspace-stop')).publicResult).toEqual({ enabled: false, expiresAt: null })
    decision = 'Deny'
    expect((await run('workspace-allow'))?.result).toMatchObject({ kind: 'error', text: 'Workspace access was not approved.' })
    expect(unprotect).not.toHaveBeenCalled()
    decision = 'Allow'
    const pending = deviceBindingOfferSchema.parse((await output('start ' + JSON.stringify({ identityAlias: options.phoneIdentityAlias, publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) }))).publicResult)
    const signed = await phone.signOffer(authority, JSON.stringify(pending), true)
    const binding = deviceBindingSchema.parse((await output('confirm ' + signed)).publicResult); await phone.accept(authority, JSON.stringify(binding), true)
    expect((await output('workspace-status')).publicResult).toEqual({ enabled: false, expiresAt: null })
    decision = 'Deny'; expect((await run('workspace-allow'))?.result.kind).toBe('error')
    expect((await output('workspace-status')).publicResult).toEqual({ enabled: false, expiresAt: null })
    decision = 'Allow'; expect((await output('workspace-allow')).state).toBe('workspace-enabled')
    assert.ok(owner && access)
    const commandOwner = owner, workspaceAccess = access
    const transport = { id: id<'harmony-device-channel'>('workspace-command-channel'), remoteCredentialId: p256CredentialId(phoneKey.publicSpki), signal: lifetime.signal }
    const remote = { ...transport, remoteCredentialId: p256CredentialId(desktopKey.publicSpki) }
    const challenge = await commandOwner.challenge(transport), ticket = await commandOwner.authenticate(transport, await phone.connectionProof(authority, remote, JSON.stringify(challenge)))
    const wire = await workspaceAccess.open(transport, ticket)
    client = new WorkspaceClient({ request: (value, signal) => wire.request(value, signal), encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')) },
      { origin: deviceWorkspaceOrigin(binding.desktopCredentialId), maxRequestBytes: 1048576, maxResponseBytes: 16777216, maxChunkBytes: 65536 })
    expect(await client.bootstrap(lifetime.signal)).toContainEqual(expect.objectContaining({ name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) }))
    const manifest = await client.manifest(lifetime.signal); expect(manifest.resources.length).toBeGreaterThan(0)
    expect((await output('workspace-stop')).state).toBe('workspace-disabled')
    await expect(client.bootstrap(lifetime.signal)).rejects.toMatchObject({ code: 'workspace-closed' })
    const reading = Promise.withResolvers<void>(), releaseRecord = Promise.withResolvers<void>()
    const publicRecord = commandOwner.publicRecord.bind(commandOwner)
    const pausedRead = vi.spyOn(commandOwner, 'publicRecord').mockImplementationOnce(async capability => {
      reading.resolve()
      await releaseRecord.promise
      return publicRecord(capability)
    })
    try {
      const pending = run('workspace-allow')
      await Promise.race([reading.promise, pending.then(() => { throw new Error('approval did not reach the binding read') })])
      const grant = allow.mock.results.at(-1)
      assert.ok(grant?.type === 'return')
      const stopped = output('workspace-stop')
      expect((await run('workspace-status'))?.result.kind).toBe('error')
      releaseRecord.resolve()
      await expect(grant.value).rejects.toMatchObject({ name: 'AbortError' })
      expect((await pending)?.result.kind).toBe('error')
      expect((await stopped).state).toBe('workspace-disabled')
      await expect(workspaceAccess.open(transport, ticket)).rejects.toMatchObject({ code: 'workspace-grant-required' })
    } finally {
      releaseRecord.resolve()
      pausedRead.mockRestore()
    }
    const rejectedLateApprovals: string[] = []
    for (const [verb, state] of [['stop', 'stopped'], ['workspace-stop', 'workspace-disabled']] as const) {
      const entered = Promise.withResolvers<AbortSignal>(), answer = Promise.withResolvers<void>()
      delayedConfirmation = { enter: entered.resolve, answer: answer.promise }
      const pending = run('workspace-allow'), previousGrants = allow.mock.calls.length
      try {
        const signal = await Promise.race([entered.promise, pending.then(() => { throw new Error('approval did not reach the question provider') })])
        const cancelled = new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
        const stopped = output(verb)
        await Promise.race([cancelled, stopped])
        answer.resolve()
        expect((await stopped).state).toBe(state)
        expect((await pending)?.result.kind).toBe('error')
        expect(signal.aborted).toBe(true)
        expect(allow.mock.calls).toHaveLength(previousGrants)
        expect((await output('workspace-status')).publicResult).toEqual({ enabled: false, expiresAt: null })
        rejectedLateApprovals.push(verb)
      } finally {
        answer.resolve()
        delayedConfirmation = undefined
      }
    }
    expect((await output('workspace-allow')).state).toBe('workspace-enabled')
    expect((await output('workspace-stop')).state).toBe('workspace-disabled')
    expect(await ctx.credentials.readRecord(key)).toEqual(originalIdentity)
    expect(questions.some(question => question.includes('global settings, project paths, visible Sessions and newly enabled standard plugins'))).toBe(true)
    await disposeCommand(); disposeCommand = undefined

    const savedRegistration = phoneRecord
    assert.ok(savedRegistration)
    const desktopRegistration = new CredentialDeviceBindingStorage(ctx, binding.desktopId, binding.deviceId)
    const savedDesktopRegistration = await desktopRegistration.read()
    expect(savedDesktopRegistration).toBe(savedRegistration)
    const clock = new FixtureClock()
    clock.now = Date.now()
    const roomTtlMs = 10000, routingExpiresAt = clock.now + options.routingTtlMs
    const relay = new WorkspaceMemoryRelay(binding, options.relay, () => clock.now, clock, { challengeTtlMs: 10000, roomTtlMs })
    cleanups.push(() => relay.close())
    const desktopPorts = vi.spyOn(desktopWss, 'openDesktopWssPorts').mockImplementation((_policy, trust, signer, remotePublicSpki) => {
      expect(trust).toMatchObject({ pairId: deviceRelayPairId(binding), epoch: binding.epoch, role: 'desktop' })
      expect(remotePublicSpki).toBe(binding.phonePublicSpki)
      return { ...relay.ports('desktop'), signer }
    })
    cleanups.push(() => { desktopPorts.mockRestore() })
    const paired = ctx.plugin(DeviceCommand, { ...options, connectionMode: 'paired', reconnectMs: 50 })
    const stopPaired = () => paired.dispose()
    cleanups.push(stopPaired); await paired
    const rpcScheduler = { after(ms: number, callback: () => void) {
      const timer = setTimeout(callback, ms)
      return () => clearTimeout(timer)
    } }
    const connectPhone = async (label: string) => {
      const ports = relay.ports('phone')
      const states: string[] = []
      let rpc: DeviceProductRpc | undefined
      const core = new NativeDeviceCore(savedRegistration, routingExpiresAt, options.relay, ports, state => states.push(state), raw => rpc?.receive(raw), undefined)
      cleanups.push(() => core.close())
      await core.initialize()
      const deadline = new AbortController()
      try {
        await Promise.race([core.ready(), wait(options.relay.handshakeMs, undefined, { signal: deadline.signal }).then(() => {
          assert.fail(label + ' did not authorize: ' + states.join(', '))
        })])
      } finally { deadline.abort() }
      const product = rpc = new DeviceProductRpc(core, rpcScheduler, 10000, 16, label, 16)
      cleanups.push(() => product.close())
      const workspaceClient = new WorkspaceClient({ request: (argument, signal) => product.call({ method: 'workspace', argument }, signal),
        encode: bytes => Buffer.from(bytes).toString('base64url'), decode: value => Uint8Array.from(Buffer.from(value, 'base64url')) },
        { origin: deviceWorkspaceOrigin(binding.desktopCredentialId), maxRequestBytes: workspace.wire.maxRequestBytes,
          maxResponseBytes: workspace.channel.maxResponseBytes, maxChunkBytes: workspace.wire.maxChunkBytes })
      cleanups.push(() => workspaceClient.close())
      return { core, product, workspaceClient }
    }
    await vi.waitFor(() => expect(desktopPorts).toHaveBeenCalledTimes(1), { timeout: 8000 })
    const first = await connectPhone('room-expiry-original'), oldBinding = first.core.binding
    await vi.waitFor(async () => expect((await output('status')).state).toBe('transport-started'))
    const grant = await output('workspace-allow')
    expect(grant.state).toBe('workspace-enabled')
    const oldGrant = z.object({ expiresAt: z.number() }).parse(grant.publicResult)
    expect(oldGrant.expiresAt).toBe(clock.now + roomTtlMs)
    expect((await output('workspace-status')).publicResult).toEqual({ enabled: true, expiresAt: oldGrant.expiresAt })
    expect(await first.workspaceClient.bootstrap(lifetime.signal)).toContainEqual(expect.objectContaining({ name: '__DSH_REMOTE_ACCESS__' }))
    const oldBody = workspaceBodySchema.parse(await first.product.call({ method: 'workspace', argument: { operation: 'bootstrap' } }))
    const entered = Promise.withResolvers<AbortSignal>(), answer = Promise.withResolvers<void>()
    delayedConfirmation = { enter: entered.resolve, answer: answer.promise }
    const oldApproval = run('workspace-allow')
    try {
      await Promise.race([entered.promise, oldApproval.then(() => { throw new Error('approval did not reach the confirmation') })])
      clock.now += roomTtlMs - 1; relay.sweep()
      expect(oldBinding.signal.aborted).toBe(false)
      clock.now++; relay.sweep()
      expect(oldBinding.signal.aborted).toBe(true)
      answer.resolve()
      expect((await oldApproval)?.result).toMatchObject({ kind: 'error', text: 'The encrypted phone connection changed. Approve workspace access again after reconnecting.' })
    } finally {
      answer.resolve()
      delayedConfirmation = undefined
    }
    await expect(first.product.call({ method: 'workspace', argument: { operation: 'bootstrap' } })).rejects.toThrow()

    await vi.waitFor(() => expect(desktopPorts).toHaveBeenCalledTimes(2), { timeout: 8000 })
    const recovered = await connectPhone('room-expiry-recovered')
    expect(recovered.core.binding.id).not.toBe(oldBinding.id)
    expect(phoneRecord).toBe(savedRegistration)
    expect(await desktopRegistration.read()).toBe(savedDesktopRegistration)
    expect(await ctx.credentials.readRecord(key)).toEqual(originalIdentity)
    await expect(recovered.product.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: binding.desktopId })
    const recoveredStatus = await vi.waitFor(() => output('workspace-status'))
    expect(recoveredStatus.publicResult).toEqual({ enabled: false, expiresAt: null })
    await expect(recovered.workspaceClient.bootstrap(lifetime.signal)).rejects.toMatchObject({ code: 'workspace-grant-required' })
    expect((await output('workspace-allow')).state).toBe('workspace-enabled')
    expect(await recovered.workspaceClient.bootstrap(lifetime.signal)).toContainEqual(expect.objectContaining({ name: '__DSH_REMOTE_ACCESS__', value: expect.objectContaining({ owner: false }) }))
    expect((await recovered.workspaceClient.manifest(lifetime.signal)).resources.length).toBeGreaterThan(0)
    let targetOpening: unknown
    for await (const frame of recovered.workspaceClient.openStream('session/follow', {
      args: { request: { address: { kind: 'session', sessionId: target.sessionId } } },
    }, lifetime.signal)) {
      targetOpening = frame
      break
    }
    expect(targetOpening).toMatchObject({ type: 'snapshot', header: { id: target.sessionId }, records: expect.arrayContaining([
      expect.objectContaining({ type: 'event', event: expect.objectContaining({ type: 'user/message', data: targetMessage }) }),
    ]) })
    await expect(recovered.product.call({ method: 'workspace', argument: { operation: 'read', id: oldBody.id, offset: 0 } })).rejects.toMatchObject({ code: 'unknown-outcome' })
    expect((await output('workspace-stop')).state).toBe('workspace-disabled')
    await expect(recovered.workspaceClient.bootstrap(lifetime.signal)).rejects.toMatchObject({ code: 'workspace-grant-required' })
    await expect(recovered.product.call({ method: 'metadata', argument: null })).resolves.toMatchObject({ desktopId: binding.desktopId })
    expect(targetSession.snapshotEvents()).toEqual(targetBefore)
    await stopPaired()
    expect(calls).toBe(0); ctx.llm.assertZeroRealCalls()

    const { workspace: unusedWorkspace, ...bareOptions } = options; void unusedWorkspace
    const bare = await makeContext('native-only', false); expect(bare.get('clientModules')).toBeUndefined()
    const nativeOnly = bare.plugin(DeviceCommand, bareOptions); disposeCommand = () => nativeOnly.dispose(); await nativeOnly
    const bareSession = await bare.sessionController.create({ cwd: join(world, 'native-only') }), bareAgent = bare.agents.get(id<'SessionId'>(bareSession.sessionId)); assert.ok(bareAgent)
    const bareRun = (verb: string) => bare.commands.execute(bareAgent, '/harmony-device ' + verb, [], lifetime.signal)
    expect((await bareRun('status'))?.result.kind).toBe('success')
    expect((await bareRun('workspace-status'))?.result.kind).toBe('error')
    let builtRegistration = false
    const builtPath = process.env.DSH_HARMONY_DEVICE_COMMAND_ENTRY
    if (builtPath !== undefined) {
      const built: typeof DeviceCommand = await import(pathToFileURL(builtPath).href)
      const compiled = ctx.plugin(built, options); cleanups.push(() => compiled.dispose()); await compiled
      expect(ctx.commands.list(agent).some(command => command.name === 'harmony-device')).toBe(true)
      const stopModules = modulesOwner.dispose; assert.ok(stopModules); await stopModules()
      await vi.waitFor(() => expect(ctx.commands.list(agent).some(command => command.name === 'harmony-device')).toBe(false))
      expect(await ctx.credentials.readRecord(key)).toEqual(originalIdentity)
      builtRegistration = true
    }
    await writeFile(join(world, 'observed.json'), JSON.stringify({ normalCommand: true, sourceEntry: true, memoryCredentials: true, fixedPublicProtection: true, dpapi: false,
      approvedWorkspaceOnly: true, owner: false, resources: manifest.resources.length, revokedLiveWorkspace: true, nativeOnlyWithoutClientModules: true, providerIsSibling: true,
      rejectedLateApprovals, cancelledDuringBindingRead: true, freshApprovalAfterStop: true, builtRegistration, builtEntry: builtPath, modelCalls: calls, realModels: 0, questions,
      separateApprovalSession: { standardHistoryRead: true, targetJournalUnchanged: true, workspaceStopped: true, nativeMetadataPreserved: true },
      roomLeaseRecovery: { roomTtlMs, desktopAutomaticallyReconnected: true, phoneExplicitlyReconnected: true, originalRegistrationRetained: true,
        freshChannel: true, nativeMetadataRecovered: true, oldGrantDenied: true, freshGrantOpened: true, retiredBodyDenied: true } }, null, 2) + '\n')
  }
})
