/** Typed synthetic test face; records and model data remain synthetic. */
import type { NativeRelayBudgets } from '../../harmony/entry/src/main/ets/paired/PairedCore'
export interface ProductConfig { deviceBindingMode?: boolean; deviceRoutingTtlMs?: number; deviceCatalogRefreshMs?: number; enabled: boolean; approvedHost: string; identityAlias: string; deviceApiVerified: number; maxCryptoBytes: number; maxTotalSendBytes: number; publicTrustMaxBytes: number; corePolicyJson: string; relay: NativeRelayBudgets }
export interface NativeProductOwner { previewRoute(raw: string): Promise<string>; signRoute(raw: string, approved: boolean): Promise<string>; stopRoute(): Promise<void> }
export class NativeProductOwner { constructor(config: ProductConfig); initialize(context: object, publish: (view: string) => void): Promise<void>; start(storage: { read(maxBytes: number): Promise<string | null>; write(raw: string): Promise<void>; close(): Promise<void> }, publish: (view: string) => void): Promise<void>; initializeIdentity(alias: string, confirmed: boolean): Promise<string>; publicIdentity(alias: string): Promise<string>; previewEnrollment(raw: string): Promise<string>; signEnrollment(raw: string, compared: boolean): Promise<string>; pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void>; savedPairing(confirmed: boolean): Promise<string>; listSavedScopes(confirmed: boolean): Promise<string>; selectSavedScope(key: string, confirmed: boolean): Promise<string>; saveNewScope(raw: string, compared: boolean, networkApproved: boolean): Promise<void>; connectionEnabled(): boolean; connectionHost(): string; preview(raw: string): string; pair(raw: string, compared: boolean): Promise<void>; connect(networkApproved?: boolean): Promise<void>; select(session: string): Promise<void>; submit(request: string, text: string): Promise<string>; receipt(request: string): Promise<string>; cancel(): Promise<void>; richRequest(packet: string): Promise<string>; richRefusal(packet: string): string; revoke(): Promise<void>; close(): Promise<void>; foreground(): Promise<void> }
export class NativePublicTrustFile { constructor(dir: string, maxBytes: number, scope?: string); read(maxBytes: number): Promise<string | null>; write(raw: string): Promise<void>; close(): Promise<void> }
export class NativeProductRichOwner { constructor(owner: { richRequest(packet: string): Promise<string>; richRefusal(packet: string): string }, policy: string); initialize(context: object): void; controller: { url: string; html: string; ports: { callback: ((raw: string) => void) | null; emit(raw: string): void; close(): void; posted: string[] }[] }; attached(): void; bind(url: string): void; setMount(mount: string): void; close(): Promise<void>; foreground(): Promise<void>; allow(url: string, main: boolean): boolean }
export const network: { factory: (() => { on(name: string, callback: (...args: unknown[]) => void): void; connect(url: string, options: { header: Record<string, string>; protocol: string; skipServerCertVerification: boolean }): Promise<boolean>; send(raw: string | ArrayBuffer): Promise<boolean>; close(): Promise<boolean> }) | undefined; sockets: unknown[]; requests: { url: string; options: { header: Record<string, string>; protocol: string; skipServerCertVerification: boolean } }[] }
export const deviceInfo: { sdkApiVersion: number }
export const state: { aliases: Set<string>; calls: string[] }
export const sdk: { files: Map<string, { bytes: Uint8Array }>; dirs: Set<string>; fds: Map<number, object>; faults: Map<string, number>; calls: string[]; resources: Map<string, Uint8Array> }
export function context(): object
export function resetProductSdk(): void
export function closeActiveProducts(): Promise<void>
export class NativeWorkspaceOwner {
  constructor(product: NativeProductOwner, policyJson: string)
  close(): Promise<void>
}
export class NativeLifecycle {
  static registerProduct(product: NativeProductOwner, rich: NativeProductRichOwner): void
  static registerWorkspace(workspace: NativeWorkspaceOwner): void
  static background(): Promise<void>
  static foreground(): Promise<void>
  static destroy(): Promise<void>
}
