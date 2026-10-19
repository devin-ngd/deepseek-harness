/** Strict static deployment settings. No room, bearer capability, private key, DSH profile or model setting is accepted. */
import type { RelayLimits } from '../../integration/relay-core.ts'
import { resolveBrokerPolicy, type BrokerPolicy, type DisabledBroker } from './broker-policy.ts'
import { isAbsolute, resolve } from 'node:path'
import type { PublicTrustPolicy } from './public-trust.ts'
import type { RelayNativeOrigin } from '../../integration/relay-upgrade.ts'
/** Disabled settings do not allocate a listener, timer or WS server. */
export interface DisabledRelay { readonly enabled: false }
/** All variable budgets are explicit. The loopback address and exact public WS route are security invariants. Port zero is an ephemeral local test listener. */
export interface EnabledRelay extends RelayLimits {
  readonly enabled: true; readonly host: '127.0.0.1'; readonly port: number; readonly publicHost: string
  readonly sweepIntervalMs: number; readonly maxControlFrames: number; readonly maxConnections: number
  readonly shutdownTimeoutMs: number; readonly requestTimeoutMs: number; readonly headersTimeoutMs: number; readonly connectionCheckIntervalMs: number; readonly maxHeaderBytes: number
  readonly broker: BrokerPolicy | DisabledBroker
  readonly publicTrust?: PublicTrustPolicy
  readonly nativeOrigin: RelayNativeOrigin
}
/** @param value - untrusted configuration JSON. @returns explicit disabled or fully resolved enabled settings; unknown fields and non-loopback listeners fail before allocation. */
export function resolveRelayConfig(value: unknown): DisabledRelay | EnabledRelay {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid relay configuration')
  if (!('enabled' in value) || typeof value.enabled !== 'boolean') throw new Error('invalid relay configuration')
  if (!value.enabled) { if (Object.keys(value).length !== 1) throw new Error('invalid relay configuration'); return { enabled: false } }
  const fields = ['enabled', 'host', 'port', 'publicHost', 'sweepIntervalMs', 'maxControlFrames', 'maxConnections', 'shutdownTimeoutMs', 'requestTimeoutMs', 'headersTimeoutMs', 'connectionCheckIntervalMs', 'maxHeaderBytes', 'maxRooms', 'maxRoomTtlMs', 'pairTimeoutMs', 'maxFrameBytes', 'maxBufferedBytes', 'maxFrames', 'idleTimeoutMs']
  if (Object.keys(value).length !== fields.length + (Object.hasOwn(value, 'broker') ? 1 : 0) + (Object.hasOwn(value, 'publicTrust') ? 1 : 0) + (Object.hasOwn(value, 'nativeOrigin') ? 1 : 0) || !fields.every(key => key in value)) throw new Error('invalid relay configuration')
  const nativeOrigin = Object.hasOwn(value, 'nativeOrigin') ? Reflect.get(value, 'nativeOrigin') : 'deny'
  if (nativeOrigin !== 'deny' && nativeOrigin !== 'networkkit-v1') throw new Error('invalid relay configuration')
  const numeric = (key: string, minimum = 1) => { const result: unknown = Reflect.get(value, key); if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < minimum) throw new Error('invalid relay configuration'); return result }
  const host: unknown = Reflect.get(value, 'host'), publicHost: unknown = Reflect.get(value, 'publicHost'), port = numeric('port', 0)
  if (host !== '127.0.0.1' || typeof publicHost !== 'string' || publicHost.length > 253 || !/^[a-z0-9.-]+$/.test(publicHost) || publicHost.endsWith('.invalid') || port > 65535) throw new Error('invalid relay configuration')
  const config: EnabledRelay = { enabled: true, host, port, publicHost, nativeOrigin, sweepIntervalMs: numeric('sweepIntervalMs'), maxControlFrames: numeric('maxControlFrames'), maxConnections: numeric('maxConnections'), shutdownTimeoutMs: numeric('shutdownTimeoutMs'), requestTimeoutMs: numeric('requestTimeoutMs'), headersTimeoutMs: numeric('headersTimeoutMs'), connectionCheckIntervalMs: numeric('connectionCheckIntervalMs'), maxHeaderBytes: numeric('maxHeaderBytes'), maxRooms: numeric('maxRooms'), maxRoomTtlMs: numeric('maxRoomTtlMs'), pairTimeoutMs: numeric('pairTimeoutMs'), maxFrameBytes: numeric('maxFrameBytes'), maxBufferedBytes: numeric('maxBufferedBytes'), maxFrames: numeric('maxFrames'), idleTimeoutMs: numeric('idleTimeoutMs'), broker: resolveBrokerPolicy(Reflect.get(value, 'broker')) }
  if ([config.maxFrameBytes, config.sweepIntervalMs, config.shutdownTimeoutMs, config.requestTimeoutMs, config.headersTimeoutMs, config.connectionCheckIntervalMs].some(value => value > 0x7fffffff) || config.maxBufferedBytes < config.maxFrameBytes || config.headersTimeoutMs > config.requestTimeoutMs || config.connectionCheckIntervalMs > config.headersTimeoutMs) throw new Error('invalid relay configuration')
  if (config.broker.enabled && (config.broker.roomTtlMs > config.maxRoomTtlMs || config.broker.maxControlQueuedBytes < config.broker.maxControlPayloadBytes)) throw new Error('invalid broker configuration')
  if (Object.hasOwn(value, 'publicTrust')) {
    const trust: unknown = Reflect.get(value, 'publicTrust'); if (!config.broker.enabled || trust === null || typeof trust !== 'object' || Array.isArray(trust) || Object.keys(trust).length !== 3 || !('path' in trust) || !('maxBytes' in trust) || !('maxRecords' in trust) || typeof trust.path !== 'string' || !isAbsolute(trust.path) || resolve(trust.path) !== trust.path || typeof trust.maxBytes !== 'number' || typeof trust.maxRecords !== 'number' || ![trust.maxBytes, trust.maxRecords].every(number => Number.isSafeInteger(number) && number > 0)) throw new Error('invalid public trust configuration')
    return { ...config, publicTrust: { path: trust.path, maxBytes: trust.maxBytes, maxRecords: trust.maxRecords } }
  }
  return config
}
