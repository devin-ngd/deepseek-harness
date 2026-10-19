/** All phase-two scenarios are synthetic; no sockets, keys, subprocesses or model requests. */
import { RestrictedDesktopAdapter } from '../../.build/desktop-adapter.js'
import { SyntheticHost } from '../../.build/host-fixture.js'
import { MockDeviceRegistry } from '../../.build/link-protocol.js'
import { MockOutboundRelay } from '../../.build/relay.js'
import { MockPhoneClient } from '../../.build/phone.js'
import { id } from '../../.build/protocol.js'
import { MemoryAdmissionJournal } from '../../.build/admission-journal.js'

export const operations = ['task.submit', 'task.receipt', 'session.cancel', 'session.sync', 'rich.mount',
  'rich.saveDraft', 'rich.invoke', 'rich.status', 'rich.snapshot', 'rich.dispose', 'approval.list']

export function createLinkLab(options = {}) {
  let now = 1000
  const clock = () => now
  const registry = new MockDeviceRegistry('mock', clock)
  const relay = new MockOutboundRelay('mock', registry, { clock, eventTtlMs: options.eventTtlMs ?? 100,
    maxEventsPerSession: options.maxEvents ?? 64, maxEventBytes: 131072, maxSessions: 2 })
  const host = new SyntheticHost({ sessionFormatVersion: 4, clock, publish: (sid, frame) => relay.publish(sid, frame),
    beforePrompt: options.beforePrompt ?? (async () => {}), losePromptReply: options.losePromptReply ?? (() => false) })
  const sid = host.desktop.sessions[0].sessionId, other = host.desktop.sessions[1].sessionId
  const desktopId = host.desktop.desktopId, deviceId = id('mock-phone-a')
  registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions: [sid], operations, expiresAt: 100000, revoked: false })
  const adapter = new RestrictedDesktopAdapter(desktopId, host, registry, {
    clock, maxPacketBytes: 131072, maxCommandTtlMs: 1000, maxCachedCommands: options.maxCommands ?? 128, maxMountedBlocks: options.maxMounts ?? 4 },
    options.journal ?? new MemoryAdmissionJournal(options.maxCommands ?? 128))
  relay.attachDesktop(adapter)
  const peer = { desktopId, deviceId, epoch: 1 }
  const phone = new MockPhoneClient(relay, peer, 500, 4)
  return { host, sid, other, phone, relay, adapter, registry, peer, clock,
    elapse: delta => { now += delta },
    addPhone(name, sessions = [sid], expiresAt = 100000) {
      const deviceId = id(name)
      registry.addFixtureGrant({ desktopId, deviceId, epoch: 1, sessions, operations, expiresAt, revoked: false })
      return new MockPhoneClient(relay, { desktopId, deviceId, epoch: 1 }, 500, 4)
    },
    async close() { try { await adapter.close() } finally { relay.close() } },
  }
}
