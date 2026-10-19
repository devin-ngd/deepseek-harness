/** Exact typed test substitute face; not a native runtime declaration or credential provider. */
import type { NativeRelayBudgets } from '../../harmony/entry/src/main/ets/paired/PairedCore'
export class NativePairedPolicy { constructor(host: string, pairId: string, identityAlias: string, storage: number, deviceApiVerified: number, maxCryptoBytes: number, maxTotalSendBytes: number, budgets: NativeRelayBudgets) }
export class NativePairedConnectionOwner { constructor(authority: object, policy: NativePairedPolicy); connectNative(authority: object, record: string, remoteSpki: string, status: (state: string) => void, received: (packet: string) => void): Promise<void>; requestNative(authority: object, id: string, packet: string): Promise<void>; followNative(authority: object, id: string, packet: string): Promise<void>; closeNative(authority: object): Promise<void> }
export interface FakeSocketOptions { readonly header: Record<string, string>; readonly protocol: string; readonly skipServerCertVerification: boolean }
export interface FakeSocket { on(name: string, callback: (...args: unknown[]) => void): void; connect(url: string, options: FakeSocketOptions): Promise<boolean>; send(bytes: string | ArrayBuffer): Promise<boolean>; close(): Promise<boolean> }
export const network: { factory: (() => FakeSocket) | undefined; readonly sockets: unknown[]; readonly requests: { readonly url: string; readonly options: FakeSocketOptions }[] }
export const state: { readonly aliases: Set<string>; readonly calls: string[] }
export const huks: { readonly HuksAuthStorageLevel: { readonly HUKS_AUTH_STORAGE_LEVEL_ECE: number } }
export function reset(): void
export function closeActivePairedConnections(): Promise<void>
