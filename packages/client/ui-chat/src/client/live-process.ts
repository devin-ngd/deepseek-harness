/** Reversible preferences for individual parts of the Session transcript. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** A presentation contribution follows its own settings or selected Session mode. */
export interface SessionPresentationContribution {
  /** @param sessionId - viewed Session. @returns whether compact presentation is requested. */
  enabled(sessionId: SessionId): boolean
  /** @param listener - invalidation callback. @returns subscription disposer. */
  subscribe(listener: () => void): () => void
}

/** Contributions and their subscriptions unwind with their owners. */
export class ChatSessionPresentation {
  private readonly contributions = new Set<SessionPresentationContribution>()
  private readonly listeners = new Set<() => void>()

  /**
   * Register one reversible presentation contribution.
   * @param contribution - Session decision and its change notifications.
   * @returns idempotent removal, including its change subscription.
   */
  register(contribution: SessionPresentationContribution): () => void {
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
      try { listener() } catch (error) { console.error('Chat presentation subscriber failed', error) }
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Reversible Session-specific live process presentation. */
    chatLiveProcess: ChatSessionPresentation
    /** Reversible Session-specific preference for a collapsed edited-files list. */
    chatChangedFiles: ChatSessionPresentation
  }
}
