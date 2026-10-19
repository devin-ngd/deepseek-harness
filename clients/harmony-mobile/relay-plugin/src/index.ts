/** Default-disabled relay plugin. Only dsh profiles launch it; no app bin, model, Session, cookie, operator RPC or HTTP grant route exists. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { RelayUpgrade, type RelayNativeOrigin } from '../../integration/relay-upgrade.ts'
import { RelayRooms, type RelayRoomPlan, type RelayLimits } from '../../integration/relay-core.ts'
import { RELAY_PATH } from '../../integration/relay-protocol.ts'
/** Private unactivated artifact identity. */
export const name = '@deepseek-ai/dsh-experimental-harmony-relay'
/** Bounded deployment fields; enabling is a separate approved action. */
export interface Config { readonly enabled: boolean; readonly publicHost: string; readonly proxyLoopback: boolean; readonly nativeOrigin: RelayNativeOrigin; readonly sweepIntervalMs: number; readonly maxRooms: number; readonly maxRoomTtlMs: number; readonly pairTimeoutMs: number; readonly maxFrameBytes: number; readonly maxBufferedBytes: number; readonly maxFrames: number; readonly idleTimeoutMs: number; readonly maxControlFrames: number }
/** Parser defaults never open a listener. */
export const Config = z.object({ enabled: z.boolean().default(false), publicHost: z.string().default('dsh.devinho.me'), proxyLoopback: z.boolean().default(false), nativeOrigin: z.union(['deny', 'networkkit-v1']).default('deny'),
  sweepIntervalMs: z.number().min(1).default(1000), maxRooms: z.number().min(1).default(2), maxRoomTtlMs: z.number().min(1).default(300000), pairTimeoutMs: z.number().min(1).default(30000),
  maxFrameBytes: z.number().min(1).default(2097152), maxBufferedBytes: z.number().min(1).default(4194304), maxFrames: z.number().min(1).default(4096), idleTimeoutMs: z.number().min(1).default(60000), maxControlFrames: z.number().min(1).default(64) })
declare module '@deepseek-ai/cordis' { interface Context { harmonyRelay: HarmonyRelay } }
/** Local-only provisioning seat. No Remote decorator or transport exposes its authority. */
export class HarmonyRelay extends Service {
  private readonly authority = Object.freeze({})
  readonly rooms: RelayRooms
  /** @param ctx - isolated relay profile. @param limits - resolved budgets. */
  constructor(ctx: Context, limits: RelayLimits) { super(ctx, 'harmonyRelay'); this.rooms = new RelayRooms(this.authority, limits, Date.now) }
  /** @param plan - approved local ephemeral provisioning, containing only digests. @returns nothing; requires a separately reviewed local owner, never an HTTP create-room request. */
  provision(plan: RelayRoomPlan): void { this.rooms.provision(this.authority, plan) }
  /** @param room - locally selected routing room. @returns nothing; both socket lifetimes end. */
  revoke(room: RelayRoomPlan['room']): void { this.rooms.revoke(this.authority, room) }
}
/** @param ctx - isolated dsh relay profile. @param config - resolved Config. @returns after owned route registration; disabled mode touches no Context, timer or socket. */
export function apply(ctx: Context, config: Config): void {
  if (!config.enabled) return
  if (!/^[a-z0-9.-]+$/.test(config.publicHost) || config.publicHost.endsWith('.invalid') || !Number.isSafeInteger(config.sweepIntervalMs) || config.sweepIntervalMs <= 0 || !Number.isSafeInteger(config.maxControlFrames) || config.maxControlFrames <= 0) throw new Error('invalid relay configuration')
  const server = ctx.webServer
  if (server === undefined || server.protocol !== 'https:' && !(config.proxyLoopback && server.host === '127.0.0.1')) throw new Error('relay requires HTTPS or explicit loopback TLS proxy')
  const relay = new HarmonyRelay(ctx, { maxRooms: config.maxRooms, maxRoomTtlMs: config.maxRoomTtlMs, pairTimeoutMs: config.pairTimeoutMs, idleTimeoutMs: config.idleTimeoutMs, maxFrameBytes: config.maxFrameBytes, maxBufferedBytes: config.maxBufferedBytes, maxFrames: config.maxFrames })
  ctx.effect(async () => {
    const upgrade = new RelayUpgrade(relay.rooms, { publicHost: config.publicHost, maxFrameBytes: config.maxFrameBytes, maxControlFrames: config.maxControlFrames, nativeOrigin: config.nativeOrigin }, () => relay.rooms.close())
    let stop: () => void
    try { stop = server.registerUpgrade({ path: RELAY_PATH, handler: (req, socket, head) => upgrade.handle(req, socket, head) }) }
    catch (error) { await upgrade.close(); throw error }
    const timer = setInterval(() => relay.rooms.sweep(), config.sweepIntervalMs); timer.unref()
    return async () => { stop(); clearInterval(timer); await upgrade.close() }
  })
}
