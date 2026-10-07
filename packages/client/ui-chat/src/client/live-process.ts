/** Session-scoped contributions to compact live execution without changing transcript settings. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** A presentation contribution follows its own settings or selected Session mode. */
export interface LiveProcessContribution {
  /** @param sessionId - viewed Session. @returns whether its live process may fold. */
  enabled(sessionId: SessionId): boolean
  /** @param listener - invalidation callback. @returns subscription disposer. */
  subscribe(listener: () => void): () => void
}

/** Live process policy registry; contributions and subscriptions unwind with their owners. */
export class ChatLiveProcess {
  private readonly contributions = new Set<LiveProcessContribution>()
  private readonly listeners = new Set<() => void>()

  /**
   * Register one reversible presentation contribution.
   * @param contribution - Session decision and its change notifications.
   * @returns idempotent removal, including its change subscription.
   */
  register(contribution: LiveProcessContribution): () => void {
    this.contributions.add(contribution)
    const off = contribution.subscribe(() => { this.notify() })
    this.notify()
    return () => {
      if (!this.contributions.delete(contribution)) return
      off()
      this.notify()
    }
  }

  /**
   * Read a stable boolean through the framework's Session hook.
   * @param sessionId - viewed Session.
   * @returns observable true while any current contribution requests compaction.
   */
  forSession(sessionId: SessionId): ObservableSnapshot<boolean> {
    return {
      getSnapshot: () => [...this.contributions].some(item => item.enabled(sessionId)),
      subscribe: (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } },
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try { listener() } catch (error) { console.error('Live process subscriber failed', error) }
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Reversible Session-specific live process presentation. */
    chatLiveProcess: ChatLiveProcess
  }
}
