/** Process-local replay readiness and exact call budgets; no provider I/O. */

/** One explicitly scripted provider/model pair. */
export interface OfflineReplayRoute {
  /** Exact provider id registered by the replay adapter. */
  provider: string
  /** Exact recorded model id. */
  model: string
}

/** Detached counters for one finite replay script collection. */
export interface OfflineReplayCounts {
  /** Required number of scripted calls. */
  expectedCalls: number
  /** Admitted replay invocations, including cancelled invocations. */
  calls: number
  /** Calls refused before dispatch. */
  blockedCalls: number
  /** Replay counters never grant a real-provider invocation. */
  realCalls: 0
}

/** An adapter-owned readiness receipt; routes and budget are explicit, with no fallback. */
export class OfflineReplayCounter {
  private readonly routes: ReadonlySet<string>
  private calls = 0
  private blockedCalls = 0

  /**
   * @param routes - explicitly configured scripted routes.
   * @param expectedCalls - positive total calls across all recorded scripts.
   * @param assertScriptConsumed - optional adapter-owned script-cursor completion check.
   */
  constructor(
    routes: readonly OfflineReplayRoute[],
    private readonly expectedCalls: number,
    private readonly assertScriptConsumed?: () => void,
  ) {
    if (!Number.isSafeInteger(expectedCalls) || expectedCalls < 1) throw new Error('offline replay requires a positive call budget')
    const keys = routes.map(({ provider, model }) => {
      if (!provider.trim() || !model.trim()) throw new Error('offline replay requires explicit provider and model')
      return JSON.stringify([provider, model])
    })
    if (keys.length === 0 || new Set(keys).size !== keys.length) throw new Error('offline replay routes must be non-empty and unique')
    this.routes = new Set(keys)
  }

  /**
   * Refuse a missing route or exhausted budget without invoking an adapter.
   * @param provider - selected provider id.
   * @param model - selected model id.
   */
  assertReady(provider: string, model: string): void {
    this.assertRoute(provider, model)
    if (this.calls >= this.expectedCalls) {
      this.blockedCalls++
      throw new Error('offline replay route is unavailable or its call budget is exhausted')
    }
  }

  /**
   * Require a scripted route without consuming or checking the invocation budget.
   * @param provider - selected provider id.
   * @param model - selected model id.
   */
  assertRoute(provider: string, model: string): void {
    if (!this.routes.has(JSON.stringify([provider, model]))) {
      this.blockedCalls++
      throw new Error('offline replay route is unavailable')
    }
  }

  /**
   * Admit exactly one invocation before middleware or adapter dispatch.
   * @param provider - selected provider id.
   * @param model - selected model id.
   */
  enter(provider: string, model: string): void {
    this.assertReady(provider, model)
    this.calls++
  }

  /**
   * Read the finite replay budget and admitted or refused invocation counts.
   * @returns copied counters; this receipt never permits real-provider calls.
   */
  snapshot(): OfflineReplayCounts {
    return { expectedCalls: this.expectedCalls, calls: this.calls, blockedCalls: this.blockedCalls, realCalls: 0 }
  }

  /** Reject incomplete consumption or any refused invocation at the owning test's completion. */
  assertConsumed(): void {
    if (this.calls !== this.expectedCalls || this.blockedCalls !== 0) throw new Error('offline replay did not consume its exact call budget cleanly')
    this.assertScriptConsumed?.()
  }
}
