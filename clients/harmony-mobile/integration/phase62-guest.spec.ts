/** Current rich validators with unchanged guest/mobile packets; these are source tests, not ArkWeb evidence. */
import { expect, it } from 'vitest'
import { RelayGuestGate } from '../src/relay-guest.ts'
import { GuestGate } from '../src/bridge.ts'
import { MockDesktop } from '../src/mock.ts'
import { id } from '../src/protocol.ts'
function fixture() {
  const desktop = new MockDesktop('mock'), mounted = desktop.mount(id<'SessionId'>('mock-session-a')), source = {}
  const binding = { source, sessionId: mounted.snapshot.scope.sessionId, mountId: mounted.mountId, renderRevision: mounted.snapshot.scope.renderRevision, packetBytes: 131072, maxPackets: 8 }
  const draft = { baseRevision: mounted.snapshot.draft.draftRevision, stateSchemaVersion: mounted.snapshot.manifest.stateSchemaVersion, fields: { title: 'alpha4 input' }, dirty: ['title'] }
  const packet = (payload: Record<string, unknown>, type = 'draft.save', seq = 1) => JSON.stringify({ protocol: 'lumina-rich/1', mountId: mounted.mountId, renderRevision: binding.renderRevision, packetId: 'packet-' + seq, seq, type, payload })
  return { desktop, source, binding, draft, packet }
}
it('the asynchronous guest carrier validates with trusted Session context and preserves the mobile payload and duplicate fingerprint', async () => {
  const f = fixture(), calls: unknown[] = [], gate = new RelayGuestGate({ request: async (operation, payload) => { calls.push({ operation, payload }); return { accepted: true } } }, f.binding)
  const raw = f.packet({ draft: f.draft })
  expect(await gate.receive(raw, f.source)).toEqual({ accepted: true }); expect(await gate.receive(raw, f.source)).toEqual({ accepted: true })
  expect(calls).toEqual([{ operation: 'rich.saveDraft', payload: { mountId: f.binding.mountId, draft: f.draft } }])
  await gate.close()
})
it('both guest carriers reject a guest-selected Session instead of overwriting it with trusted routing', async () => {
  const f = fixture(), relay = new RelayGuestGate({ request: async () => { throw new Error('unexpected dispatch') } }, f.binding), direct = new GuestGate(f.desktop, f.binding)
  const raw = f.packet({ draft: f.draft, sessionId: f.binding.sessionId })
  await expect(relay.receive(raw, f.source)).rejects.toMatchObject({ code: 'invalid-request' }); expect(() => direct.receive(raw, f.source)).toThrow()
})
it('the direct fixture gate admits the unchanged guest draft through alpha.4 validation', () => {
  const f = fixture(), gate = new GuestGate(f.desktop, f.binding)
  expect(gate.receive(f.packet({ draft: f.draft }), f.source)).toMatchObject({ accepted: true })
  gate.close()
})
