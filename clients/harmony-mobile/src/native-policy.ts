/** Bootstrap JSON admission for the immutable native-owned offline policy. */
import type { JsonValue } from './upstream.ts'
import type { NativeHostPolicy } from './native-host.ts'
import { integer, object } from './domain.ts'
import { TransportError, jsonPayload } from './wire.ts'
import type { FollowPolicy } from './follow-policy.ts'
import { resolveCommandLifetime } from './command-clock.ts'

function numbers<T extends string>(value: JsonValue | undefined, names: readonly T[]): Record<T, number> {
  const row = object(value)
  if (Object.keys(row).length !== names.length || names.some(name => !Object.hasOwn(row, name))) throw new TransportError('native-config-invalid')
  return Object.fromEntries(names.map(name => { const number = integer(row[name], 1); if (number > 2147483647) throw new TransportError('native-config-invalid'); return [name, number] })) as Record<T, number>
}
/** @param raw - native bootstrap text, bounded before parsing. @returns a fully admitted host policy, without URL, credentials or live dispatch settings. */
export function nativeBootstrapPolicy(raw: string): NativeHostPolicy {
  if (new TextEncoder().encode(raw).byteLength > 16384) throw new TransportError('native-config-invalid')
  const envelope = object(jsonPayload(JSON.parse(raw)))
  if (Object.keys(envelope).length !== 2 || envelope.protocol !== 'dsh-native-bootstrap/1') throw new TransportError('native-config-invalid')
  const row = object(envelope.policy), scalarNames = ['maxRows', 'maxFrames', 'chunkBytes', 'maxIntents', 'maxMounts', 'cacheAgeMs', 'ttlMs'] as const
  if (Object.keys(row).length !== scalarNames.length + 5 || Object.keys(row).some(key => ![...scalarNames, 'port', 'domain', 'read', 'follow', 'commandClock'].includes(key))) throw new TransportError('native-config-invalid')
  const followRow = object(row.follow)
  let follow: FollowPolicy
  if (followRow.mode === 'once' && Object.keys(followRow).length === 1) follow = { mode: 'once' }
  else if (followRow.mode === 'bounded' && Object.keys(followRow).length === 4) follow = { mode: 'bounded', ...numbers({ maxSegments: followRow.maxSegments!, maxFailures: followRow.maxFailures!, retryDelayMs: followRow.retryDelayMs! }, ['maxSegments', 'maxFailures', 'retryDelayMs']) }
  else throw new TransportError('native-config-invalid')
  const scalar = numbers(Object.fromEntries(scalarNames.map(name => [name, row[name]!])), scalarNames)
  const clockRow = object(row.commandClock)
  if (Object.keys(clockRow).length !== 2 || !Object.hasOwn(clockRow, 'maxPeerSkewMs') || !Object.hasOwn(clockRow, 'maxWallDriftMs')) throw new TransportError('native-config-invalid')
  const commandClock = { maxPeerSkewMs: integer(clockRow.maxPeerSkewMs), maxWallDriftMs: integer(clockRow.maxWallDriftMs) }
  resolveCommandLifetime(scalar.ttlMs, commandClock)
  const port = numbers(row.port, ['generation', 'maxBytes', 'maxPending', 'timeoutMs'])
  const domain = numbers(row.domain, ['maxBytes', 'maxEvents', 'maxBlocks', 'maxText', 'maxRichBlocks'])
  const read = numbers(row.read, ['maxSourceItems', 'maxPageItems', 'maxSnapshots', 'maxSnapshotBytes', 'snapshotTtlMs', 'maxHistoryEvents', 'maxImageBytes', 'maxImageDimension', 'maxImagePixels', 'maxImageHandles', 'imageTtlMs', 'maxImageChunkBytes', 'maxInFlight'])
  return { ...scalar, port, domain, read, follow, commandClock }
}
