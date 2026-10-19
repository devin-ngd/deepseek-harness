/** Bounded epoch clocks for command admission; no operating-system clock or wire field is changed. */
import { TransportError } from './wire.ts'

/** Deployment budget in milliseconds; peer skew includes wall-clock differences between the devices. */
export interface CommandClockPolicy { readonly maxPeerSkewMs: number; readonly maxWallDriftMs: number }
/** System clock providers are private to the owning app/service. */
export interface CommandClockPorts { readonly wall: () => number; readonly monotonic: () => number }
/** Local failure detail; peers still receive the existing request-expired refusal. */
export class CommandClockError extends TransportError {
  /** @param reason - unsafe local clock state; recovery requires replacing its owner, not retrying an old command. */
  constructor(readonly reason: 'wall-jump' | 'monotonic-regression' | 'invalid-clock') { super('request-expired'); this.name = 'CommandClockError' }
}
/** Client lifetime is shortened by peer skew and both owners' possible wall/monotonic drift. */
export interface CommandLifetime { readonly nominalTtlMs: number; readonly safetyBudgetMs: number; readonly wireTtlMs: number }
/** @param ttlMs - nominal lifetime, never a server override. @param policy - explicit nonnegative budgets. @returns positive conservative wire lifetime; impossible budgets reject at load. */
export function resolveCommandLifetime(ttlMs: number, policy: CommandClockPolicy): CommandLifetime {
  for (const value of [ttlMs, policy.maxPeerSkewMs, policy.maxWallDriftMs]) if (!Number.isSafeInteger(value) || value < 0) throw new TransportError('invalid-config')
  const safetyBudgetMs = policy.maxPeerSkewMs + 2 * policy.maxWallDriftMs
  if (!Number.isSafeInteger(safetyBudgetMs) || ttlMs <= safetyBudgetMs) throw new TransportError('invalid-config')
  return { nominalTtlMs: ttlMs, safetyBudgetMs, wireTtlMs: ttlMs - safetyBudgetMs }
}
/** Monotonic elapsed time prevents deadline renewal; large wall jumps/regressions permanently stop this owner. */
export class CommandEpochClock {
  private readonly wallAnchor: number
  private readonly monoAnchor: number
  private lastMono: number
  private failure: CommandClockError | undefined
  /** @param ports - epoch-millisecond wall time and process-monotonic milliseconds. @param maxWallDriftMs - maximum accepted divergence from the anchored epoch. */
  constructor(private readonly ports: CommandClockPorts, readonly maxWallDriftMs: number) {
    if (!Number.isSafeInteger(maxWallDriftMs) || maxWallDriftMs < 0) throw new TransportError('invalid-config')
    this.monoAnchor = ports.monotonic(); this.wallAnchor = ports.wall(); this.lastMono = this.monoAnchor
    if (!Number.isSafeInteger(this.wallAnchor) || this.wallAnchor < 0 || !Number.isFinite(this.monoAnchor) || this.monoAnchor < 0) throw new CommandClockError('invalid-clock')
  }
  /** @returns guarded, nondecreasing epoch milliseconds. A failed clock cannot be refreshed by reconnecting or retrying. */
  now(): number {
    if (this.failure) throw this.failure
    const mono = this.ports.monotonic(), wall = this.ports.wall(), epoch = this.wallAnchor + Math.floor(mono - this.monoAnchor)
    let reason: CommandClockError['reason'] | undefined
    if (!Number.isFinite(mono) || !Number.isSafeInteger(wall) || !Number.isSafeInteger(epoch) || wall < 0 || epoch < 0) reason = 'invalid-clock'
    else if (mono < this.lastMono) reason = 'monotonic-regression'
    else if (Math.abs(wall - epoch) > this.maxWallDriftMs) reason = 'wall-jump'
    if (reason) { this.failure = new CommandClockError(reason); throw this.failure }
    this.lastMono = mono
    return epoch
  }
  /** @returns local clock failure state without refreshing or repairing its anchor. */
  get status() { return this.failure?.reason ?? 'trusted' }
}
