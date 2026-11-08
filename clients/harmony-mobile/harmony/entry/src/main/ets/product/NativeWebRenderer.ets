/** One native Web component; the app uses FAST_MODE to destroy its JavaScript and rendering contexts on removal. */
import { webview } from '@kit.ArkWeb'

/** Controller detachment confirms removal independently of abnormal renderer-exit callbacks. */
export class NativeWebRenderer {
  private readonly controller: webview.WebviewController
  private readonly timeoutMs: number
  private attached: boolean = false
  private stopping: boolean = false
  private readonly remove: () => void
  private acknowledge: (() => void) | undefined = undefined
  private closing: Promise<void> | undefined = undefined
  private readonly changed = (state: webview.ControllerAttachState): void => { if (state === webview.ControllerAttachState.UNATTACHED) this.acknowledge?.() }
  constructor(controller: webview.WebviewController, timeoutMs: number, remove: () => void) { this.controller = controller; this.timeoutMs = timeoutMs; this.remove = remove }
  /** Called after native association and before any executable document is loaded. */
  attach(): void {
    this.attached = true
    this.controller.on('controllerAttachStateChange', this.changed)
    if (webview.WebviewController.getRenderProcessMode() !== webview.RenderProcessMode.MULTIPLE) throw new Error('native renderer isolation unavailable')
  }
  /** @returns whether the component is already being removed; process exit alone does not confirm removal. */
  exited(): boolean { return this.stopping }
  /** @returns after this controller detaches from its FAST_MODE Web; rejection is retained for repeated cleanup. */
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    this.stopping = true
    this.closing = (async () => {
      if (!this.attached) { this.remove(); return }
      let timer: number = -1
      const stopped = new Promise<void>((resolve, reject) => { this.acknowledge = resolve; timer = setTimeout(() => reject(new Error('native Web removal unconfirmed')), this.timeoutMs) })
      void stopped.catch((error: Error) => { void error /* A synchronous removal failure still clears this timer below. */ })
      try { this.remove(); if (this.controller.getAttachState() === webview.ControllerAttachState.UNATTACHED) this.acknowledge?.(); await stopped }
      finally { clearTimeout(timer); this.acknowledge = undefined; this.controller.off('controllerAttachStateChange', this.changed) }
    })()
    return this.closing
  }
}
