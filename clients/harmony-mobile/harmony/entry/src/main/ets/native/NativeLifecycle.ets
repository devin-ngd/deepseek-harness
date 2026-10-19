/** Ability owns background teardown; foreground recreates only the local document, never a task or desktop connection. */
import { NativeRuntimeOwner } from './NativeRuntimeOwner'
import { closeActivePairedConnections } from './NativePairedConnectionOwner'
import { NativeProductOwner, closeActiveProducts } from '../product/NativeProductOwner'
import { NativeProductRichOwner } from '../product/NativeProductRichOwner'

export class NativeLifecycle {
  private static current: NativeRuntimeOwner | null = null
  private static product: NativeProductOwner | null = null
  private static rich: NativeProductRichOwner | null = null
  static registerProduct(product: NativeProductOwner, rich: NativeProductRichOwner): void { NativeLifecycle.product = product; NativeLifecycle.rich = rich }
  static register(owner: NativeRuntimeOwner): void { NativeLifecycle.current = owner }
  static async background(): Promise<void> { const results = await Promise.allSettled([NativeLifecycle.current?.close(), NativeLifecycle.rich?.close(), closeActiveProducts(), closeActivePairedConnections()]); for (const result of results) if (result.status === 'rejected') throw new Error('native background cleanup failed') }
  static async foreground(): Promise<void> { await NativeLifecycle.current?.foreground(); await NativeLifecycle.product?.foreground(); await NativeLifecycle.rich?.foreground() }
  static async destroy(): Promise<void> { const owner = NativeLifecycle.current; NativeLifecycle.current = null; NativeLifecycle.product = null; const rich = NativeLifecycle.rich; NativeLifecycle.rich = null; const results = await Promise.allSettled([owner?.close(), rich?.close(), closeActiveProducts(), closeActivePairedConnections()]); for (const result of results) if (result.status === 'rejected') throw new Error('native destroy cleanup failed') }
}
