/** Synthetic original-device proofs and the production workspace grant for standard frontend checks. */
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { DeviceBindingOwner } from '../desktop-plugin/src/device-binding.ts'
import { deviceProfileSessionPorts, DeviceBindingProfileProvider } from '../desktop-plugin/src/device-binding-profile.ts'
import { DeviceBindingDesktopRelay } from '../desktop-plugin/src/device-binding-relay.ts'
import { resolveOptions } from '../desktop-plugin/src/index.ts'
import { DeviceProductRpc } from '../src/device-product-rpc.ts'
import { NativeDeviceCore } from '../src/native-device-bridge.ts'
import type { PairedRelayPolicy } from '../src/paired-relay.ts'
import { deviceRelayPairId } from '../src/device-binding-protocol.ts'
import { workspaceRequestSchema } from '../src/workspace-protocol.ts'
import { jsonPayload } from '../src/wire.ts'
import { WorkspaceMemoryRelay } from './workspace-memory-relay.ts'
import { DeviceWorkspaceAccess } from '../desktop-plugin/src/workspace-access.ts'
import { DeviceBindingClient } from '../src/device-binding-client.ts'
import { deviceWorkspaceOrigin } from '../src/workspace-origin.ts'
import { id } from '../src/protocol.ts'
import { desktopKey, phoneKey, fixtureSource } from './phase39-fixture.ts'
import { nodeE2EPrimitives, p256CredentialId } from './p256-channel.ts'

/** @param parent - isolated test Host, never the daily profile. @param shellIndex - standard shell under test. @param ownCleanup - register teardown before the first awaited acquisition. @param encrypted - include the real native device RPC and crypto using memory-only sockets. @returns the actual grant provider and an awaited owner for synthetic identities and tickets. */
export async function workspaceAdmissionFixture(parent: Context, shellIndex: string, ownCleanup: (close: () => Promise<void>) => void, encrypted = false) {
  const profile = parent.get('profileContext'); assert.ok(profile)
  const ctx = parent.isolate('profileContext')
  ctx.provide('profileContext', { ...profile, name: 'desktop' })
  const authority = {}, native = {}, transportLifetime = new AbortController()
  const stops: Array<() => void | Promise<void>> = []
  let closing: Promise<void> | undefined, scans = 0
  const close = (): Promise<void> => closing ??= (async () => {
    transportLifetime.abort()
    const failed: unknown[] = []
    for (const stop of stops.reverse()) { try { await stop() } catch (error) { failed.push(error) } }
    if (failed.length) throw new AggregateError(failed, 'workspace admission fixture cleanup failed')
  })()
  ownCleanup(close)
  const memory = () => {
    let raw: string | null = null
    return { read: async () => raw, compareAndSet: async (previous: string | null, next: string) => { assert.equal(raw, previous); raw = next } }
  }
  const scheduler = { after: (ms: number, callback: () => void) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer) } }
  try {
    const policy = { desktopId: 'admission-desktop', deviceId: 'admission-phone', profileId: 'desktop' as const,
      identityAlias: 'admission-public-fixture', audience: 'relay.example', enrollmentTtlMs: 60000,
      connectionTtlMs: 600000, challengeTtlMs: 10000, maxChallenges: 128, maxCatalogRows: 1000, maxPublicBytes: 524288 }
    const source = deviceProfileSessionPorts(ctx)
    transportLifetime.signal.throwIfAborted()
    const owner = new DeviceBindingOwner(authority, policy, memory(), desktopKey, { ...source, list: async signal => {
      scans++
      const real = await source.list(signal)
      return [...real, ...Array.from({ length: Math.max(0, 313 - real.length) }, (_, i) => ({ profileId: 'desktop' as const,
        sessionId: 'admission-synthetic-' + i, title: 'Synthetic visible Session ' + i, projectId: null,
        updatedAt: 0, running: false, pinned: false, archived: false, blank: true }))]
    } }, Date.now, fixtureSource(), scheduler)
    stops.push(() => owner.close())
    transportLifetime.signal.throwIfAborted()
    const phone = new DeviceBindingClient(native, { ...policy, desktopCredentialId: p256CredentialId(desktopKey.publicSpki), maxProofs: 128, maxChallengeTtlMs: 60000 }, memory(), phoneKey, nodeE2EPrimitives, Date.now)
    stops.push(() => phone.close())
    const offer = await owner.offer(authority, { publicSpki: phoneKey.publicSpki, credentialId: p256CredentialId(phoneKey.publicSpki) })
    const record = await owner.confirm(authority, JSON.parse(await phone.signOffer(native, JSON.stringify(offer), true)), async () => true)
    await phone.accept(native, JSON.stringify(record), true)
    const transport = { id: id<'harmony-device-channel'>('admission-connection'), remoteCredentialId: p256CredentialId(phoneKey.publicSpki), signal: transportLifetime.signal }
    const challenge = await owner.challenge(transport)
    const ticket = await owner.authenticate(transport, await phone.connectionProof(native, { ...transport, remoteCredentialId: p256CredentialId(desktopKey.publicSpki) }, JSON.stringify(challenge)))
    transportLifetime.signal.throwIfAborted()
    const access = new DeviceWorkspaceAccess(ctx, authority, owner, { ttlMs: 600000,
      channel: { maxRequestBytes: 1048576, maxResponseBytes: 16777216 },
      wire: { maxChunkBytes: 524288, maxBufferedBytes: 33554432, maxBodyBytes: 16777216, maxBodies: 64, maxStreams: 32, maxRequestBytes: 1048576 },
      shell: { distIndex: shellIndex, limits: { maxFiles: 2000, maxFileBytes: 16777216, maxTotalBytes: 134217728 } },
    }, Date.now, scheduler)
    stops.push(() => access.close())
    await access.allow(authority)
    if (encrypted) {
      const policy: PairedRelayPolicy = { maxProofs: 64, maxQueuedBytes: 16777216, maxChallengeTtlMs: 15000,
        maxRoomTtlMs: 600000, handshakeMs: 10000, e2e: { maxFrameBytes: 2097152, maxPlaintextBytes: 1048576, maxFrames: 4096 } }
      const relay = new WorkspaceMemoryRelay(record, policy, Date.now, scheduler)
      stops.push(() => relay.close())
      const provider = new DeviceBindingProfileProvider(ctx, Date.now)
      stops.push(() => provider.close())
      const expiresAt = Date.now() + 600000
      const desktop = new DeviceBindingDesktopRelay(owner, provider, { paired: record, desktopId: record.desktopId,
        workspace: access, isRouteCurrent: async () => !transportLifetime.signal.aborted,
        trust: { pairId: deviceRelayPairId(record), epoch: record.epoch, role: 'desktop', audience: record.audience,
          credentialId: id<'harmony-device-credential'>(record.desktopCredentialId), expiresAt },
        policy, limits: resolveOptions({ enabled: true, desktopId: record.desktopId, profileId: 'desktop' }, Date.now).limits,
        openPorts: () => relay.ports('desktop'),
      })
      stops.push(await desktop.mount(ctx))
      let rpc: DeviceProductRpc | undefined
      const core = new NativeDeviceCore(JSON.stringify(record), expiresAt, policy, relay.ports('phone'), () => {}, raw => rpc?.receive(raw), undefined)
      stops.push(() => core.close())
      await core.initialize(); await core.ready()
      rpc = new DeviceProductRpc(core, scheduler, 10000, 8, 'admission-native', 32)
      const calls = rpc
      stops.push(() => calls.close())
      const wire = { request: async (value: unknown, signal: AbortSignal) => jsonPayload(await calls.call({ method: 'workspace', argument: workspaceRequestSchema.parse(value) }, signal)),
        close: async () => { await calls.call({ method: 'workspace', argument: { operation: 'close' } }) } }
      return { wire, origin: deviceWorkspaceOrigin(record.desktopCredentialId), scans: () => scans, close, encrypted: true }
    }
    const wire = await access.open(transport, ticket)
    return { wire, origin: deviceWorkspaceOrigin(record.desktopCredentialId), scans: () => scans, close, encrypted: false }
  } catch (error) { await close(); throw error }
}
