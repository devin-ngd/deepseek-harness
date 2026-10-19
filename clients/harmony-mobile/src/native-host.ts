/** Explicit offline composition preserves the synthetic provider; shared app orchestration owns lifecycle and rich rendering. */
import { NativeAppHost } from './native-app-host.ts'
import type { NativeHostPolicy, NativeHostView } from './native-app-host.ts'
import { OfflineNativeProvider, OFFLINE_NATIVE_SESSIONS } from './native-offline.ts'
import type { NativeIo } from './native-port.ts'
import { TransportError } from './wire.ts'
export type { NativeHostPolicy, NativeHostView } from './native-app-host.ts'

/** Only the explicit offline entry selects MockDesktop. */
export class NativeOfflineHost extends NativeAppHost {
  /** @param io - private app IO. @param policy - HAP-owned caps. @param publish - native UI sink. @param frame - isolated rich realm, absent in unit tests. */
  constructor(io: NativeIo, policy: NativeHostPolicy, publish: (view: NativeHostView) => void, frame?: HTMLIFrameElement) {
    super(io, policy, publish, frame, OFFLINE_NATIVE_SESSIONS, (port, sessionId, limits) => {
      if (sessionId !== 'mock-session-a' && sessionId !== 'mock-session-b') throw new TransportError('scope-denied')
      const provider = new OfflineNativeProvider(port, sessionId, { maxBytes: limits.domain.maxBytes, maxFrames: limits.maxFrames, chunkBytes: limits.chunkBytes, ttlMs: limits.ttlMs, maxMounts: limits.maxMounts })
      return { provider, owner: provider.owner, mode: 'synthetic-only', metrics: () => ({ tasks: provider.host.desktop.admittedTasks, actions: provider.host.desktop.admittedActions, mounts: provider.host.mountCount }) }
    })
  }
}
