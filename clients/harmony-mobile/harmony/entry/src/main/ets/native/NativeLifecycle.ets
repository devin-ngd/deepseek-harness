/** Orders Ability transitions so foreground restoration follows teardown of the previous native resources. */
import { NativeRuntimeOwner } from './NativeRuntimeOwner'
import { closeActivePairedConnections } from './NativePairedConnectionOwner'
import { NativeProductOwner, closeActiveProducts } from '../product/NativeProductOwner'
import { NativeProductRichOwner } from '../product/NativeProductRichOwner'
import { NativeWorkspaceOwner } from '../product/NativeWorkspaceOwner'

export class NativeLifecycle {
  private static current: NativeRuntimeOwner | null = null
  private static product: NativeProductOwner | null = null
  private static rich: NativeProductRichOwner | null = null
  private static workspace: NativeWorkspaceOwner | null = null
  private static settled: Promise<void> = Promise.resolve()
  static registerProduct(product: NativeProductOwner, rich: NativeProductRichOwner): void { NativeLifecycle.product = product; NativeLifecycle.rich = rich }
  static registerWorkspace(workspace: NativeWorkspaceOwner): void { NativeLifecycle.workspace = workspace }
  static register(owner: NativeRuntimeOwner): void { NativeLifecycle.current = owner }
  private static enqueue(operation: () => Promise<void>): Promise<void> {
    const result = NativeLifecycle.settled.then(operation)
    NativeLifecycle.settled = result.catch((error: Error) => { void error /* The Ability reports the original result. */ })
    return result
  }
  static background(): Promise<void> {
    return NativeLifecycle.enqueue(async () => {
      const workspace = await Promise.allSettled([NativeLifecycle.workspace?.close()])
      const results = await Promise.allSettled([NativeLifecycle.current?.close(), NativeLifecycle.rich?.close(), closeActiveProducts(), closeActivePairedConnections()])
      if (workspace.some(result => result.status === 'rejected') || results.some(result => result.status === 'rejected')) throw new Error('native background cleanup failed')
    })
  }
  static foreground(): Promise<void> {
    return NativeLifecycle.enqueue(async () => {
      await NativeLifecycle.current?.foreground()
      await NativeLifecycle.product?.foreground()
      await NativeLifecycle.rich?.foreground()
    })
  }
  static destroy(): Promise<void> {
    return NativeLifecycle.enqueue(async () => {
      const owner = NativeLifecycle.current, rich = NativeLifecycle.rich, workspace = NativeLifecycle.workspace
      NativeLifecycle.current = null; NativeLifecycle.product = null; NativeLifecycle.rich = null; NativeLifecycle.workspace = null
      const retired = await Promise.allSettled([workspace?.close()])
      const results = await Promise.allSettled([owner?.close(), rich?.close(), closeActiveProducts(), closeActivePairedConnections()])
      if (retired.some(result => result.status === 'rejected') || results.some(result => result.status === 'rejected')) throw new Error('native destroy cleanup failed')
    })
  }
}
