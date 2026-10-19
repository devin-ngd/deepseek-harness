/** Offline configuration refusal coverage; no identity generation, journal initialization, service or network is used. */
import { it, expect } from 'vitest'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { relayEndpointTimers, parseRelayEndpointTimers } from '../standalone-relay/src/endpoint-timers.ts'
import { prepareFirstUseRelayConfig, firstUseRelayPreview, initializeFirstUseRelay } from '../standalone-relay/src/first-use.ts'
import { desktopKey, phoneKey } from './phase39-fixture.ts'
const desktop = JSON.parse(await readFile(new URL('../replay-profile/field.enabled.example.json', import.meta.url), 'utf8')), phone = JSON.parse(await readFile(new URL('../product.config.json', import.meta.url), 'utf8')), template = JSON.parse(await readFile(new URL('../standalone-relay/config.first-use.proposal.json', import.meta.url), 'utf8'))
const limits = relayEndpointTimers(desktop, phone), pair = { pairId: 'timer-fixture-pair', desktopPublicSpki: desktopKey.publicSpki, phonePublicSpki: phoneKey.publicSpki, epoch: 1, expiresAt: Date.now() + 60000, revoked: false }
function destination(name: string): string { const parent = process.env.DSH_HARMONY_INTEGRATION_WORLD; if (!parent) throw new Error('isolated test world required'); return join(parent, name) }

it('generated relay proposal stays within the unchanged desktop and phone limits, including exact accepted limits', () => {
  expect(limits.desktop).toEqual({ maxChallengeTtlMs: 15000, maxRoomTtlMs: 60000 }); expect(limits.phone).toEqual(limits.desktop)
  const config = prepareFirstUseRelayConfig(template, pair, destination('compatible.jsonl'), limits)
  expect(config.broker).toMatchObject({ challengeTtlMs: 10000, roomTtlMs: 30000 })
  expect(() => prepareFirstUseRelayConfig({ ...template, maxRoomTtlMs: 60000, broker: { ...template.broker, challengeTtlMs: 15000, roomTtlMs: 60000 } }, pair, destination('exact.jsonl'), limits)).not.toThrow()
})

it.each([['challenge-exceeds-endpoint', { challengeTtlMs: 15001 }], ['room-exceeds-endpoint', { roomTtlMs: 60001 }]] as const)('refuses %s before proposal, preview or public state initialization', async (code: 'challenge-exceeds-endpoint' | 'room-exceeds-endpoint', incompatible: { readonly challengeTtlMs?: number; readonly roomTtlMs?: number }) => {
  const path = destination(code + '.jsonl'), changed = { ...template, maxRoomTtlMs: 300000, broker: { ...template.broker, ...incompatible } }, enabled = { ...changed, broker: { ...changed.broker, pairs: [pair] }, publicTrust: { ...changed.publicTrust, path } }
  expect(() => prepareFirstUseRelayConfig(changed, pair, path, limits)).toThrow(code)
  expect(() => firstUseRelayPreview(enabled, pair, limits)).toThrow(code)
  const authority = {}; await expect(initializeFirstUseRelay(authority, authority, true, enabled, pair, limits)).rejects.toMatchObject({ code })
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' }); await expect(access(path + '.head')).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects malformed endpoint documents and checks the more restrictive phone policy', () => {
  expect(() => parseRelayEndpointTimers({ ...limits, ignored: true })).toThrow('invalid-endpoint-timers')
  expect(() => relayEndpointTimers({ relay: { maxChallengeTtlMs: 0, maxRoomTtlMs: 60000 } }, phone)).toThrow('invalid-endpoint-timers')
  const restrictive = parseRelayEndpointTimers({ ...limits, phone: { ...limits.phone, maxRoomTtlMs: 20000 } })
  expect(() => prepareFirstUseRelayConfig(template, pair, destination('restrictive.jsonl'), restrictive)).toThrow('room-exceeds-endpoint')
})
