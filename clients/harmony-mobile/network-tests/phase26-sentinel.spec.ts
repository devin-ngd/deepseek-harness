/** Read-only source reproduction of the legitimate initial transport sentinel; no native execution or task dispatch. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { nativeReplayLab } from '../integration/native-replay-lab.ts'
import { nativeAcceptancePublications } from '../integration/native-acceptance-publications.ts'
import { finishNativeReplayLab } from '../integration/native-service-outcome.ts'
import { NetworkPhone } from '../src/network-phone.ts'
import { SemanticPhone } from '../src/semantic-phone.ts'
import { id, canonical } from '../src/protocol.ts'
import { MOBILE_LINK_PROTOCOL } from '../src/link-protocol.ts'
import type { MobileCommand } from '../src/link-protocol.ts'
import { CommandEpochClock } from '../src/command-clock.ts'
import { object } from '../src/domain.ts'
import { TransportError } from '../src/wire.ts'

it('fresh read-only service generation emits the protocol-valid -1 reset cursor with the saved cancelled session', async () => {
  const world = process.env.DSH_HARMONY_INTEGRATION_WORLD
  if (!world?.startsWith('D:/Temp/dsh-harmony-phase26-sentinel-') || process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw Error('Owned replay-only source reproduction required')
  const clockAuthority = new CommandEpochClock({ wall: Date.now, monotonic: () => performance.now() }, 1000)
  const lab = await nativeReplayLab(join(world, 'services'), 'reopen', { port: 0, clockAuthority, grantTtlMs: 180000, followSegmentMs: 50, publications: nativeAcceptancePublications(false) })
  const phone = new NetworkPhone({ enabled: true, mode: 'loopback-fixed-replay', baseUrl: lab.carrier.url, maxFrameBytes: 1048576, maxReadChunkBytes: 65536, requestTimeoutMs: 1000, maxInFlight: 4 }, fetch)
  const command: MobileCommand = { protocol: MOBILE_LINK_PROTOCOL, desktopId: id<'mobile-desktop'>('phase11-desktop'), deviceId: id<'mobile-device'>('phase11-phone'), grantEpoch: 1, commandId: id<'mobile-command'>('phase26-source-sentinel'), expiresAt: clockAuthority.now() + 53000, operation: 'session.sync', payload: { sessionId: lab.sessionId, afterSeq: -1 } }
  const abort = new AbortController(), stream = phone.follow(command, { instance: null, relayCursor: -1 }, abort.signal)[Symbol.asyncIterator]()
  const prompt = vi.spyOn(lab.ctx.sessionController, 'prompt')
  try {
    const first = await stream.next()
    if (first.done) throw Error('Expected initial reset')
    expect(first.value.kind).toBe('reset'); expect(first.value.relayCursor).toBe(-1)
    const model = new SemanticPhone({ desktopId: command.desktopId, deviceId: command.deviceId, sessionId: lab.sessionId }, { maxBytes: 1048576, maxEvents: 512, maxBlocks: 256, maxText: 262144, maxRichBlocks: 8 }, 512)
    expect(model.accept(first.value)).toBe(true); expect(model.view.task).toBe('cancelled'); expect(model.view.readOnly).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
    await writeFile(join(world, 'source-wire-frame.json'), JSON.stringify(first.value, null, 2) + '\n')
    await writeFile(join(world, 'source-reset.json'), JSON.stringify({ kind: first.value.kind, instance: first.value.instance, relayCursor: first.value.relayCursor, domainCursor: object(first.value.payload).cursor, payloadSha256: createHash('sha256').update(canonical(first.value.payload)).digest('hex'), task: model.view.task, readOnly: model.view.readOnly, promptCalls: 0, replayCalls: 0, actualSourceServices: true, nativeExecuted: false }, null, 2) + '\n')
  } finally {
    abort.abort()
    const cleanup = await Promise.allSettled([stream.return?.(), phone.close()])
    const outcome = await finishNativeReplayLab(lab)
    expect(outcome.realCalls).toBe(0); expect(outcome.replay[0]?.calls).toBe(0)
    for (const result of cleanup) if (result.status === 'rejected' && !(result.reason instanceof TransportError && result.reason.code === 'cancelled')) throw result.reason
  }
})
