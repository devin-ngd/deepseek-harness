/** Narrow native facade; implementation is generated from the shared TS product owners. */
export interface ProductConnection { request(id: string, packet: string): Promise<void>; follow(id: string, packet: string): Promise<void>; stop(id: string): Promise<void>; close(): Promise<void> }
export interface ProductStorage { read(maxBytes: number): Promise<string | null>; write(raw: string): Promise<void>; close(): Promise<void> }
export interface ProductScheduler { after(ms: number, callback: () => void): () => void }
export interface ProductPorts { readonly storage: ProductStorage; readonly scheduler: ProductScheduler; readonly clock: () => number; connect(recordJson: string, status: (state: string) => void, received: (packet: string) => void): Promise<ProductConnection>; verifyTrust(recordJson: string, previousJson?: string): Promise<void> }
export declare class NativeProductFacade { scopeInput(raw: string): string; scopeCatalog(raw: string | null): string; scopeAdd(raw: string | null, document: string): string; constructor(authority: object, policy: string, ports: ProductPorts, publish: (view: string) => void); preview(raw: string): string; trustInput(raw: string): string; renewalInput(raw: string, previous?: string): string; firstUseInput(raw: string, now: number): string; pairingState(): string; boot(): Promise<void>; pair(authority: object, raw: string, compared: boolean): Promise<void>; pairOrResume(authority: object, raw: string, compared: boolean): Promise<void>; connect(authority: object): Promise<void>; select(authority: object, session: string): Promise<void>; submit(authority: object, request: string, text: string): Promise<string>; receipt(authority: object, request: string): Promise<string>; cancel(authority: object): Promise<void>; richRequest(packet: string): Promise<string>; richRefusal(packet: string): string; revoke(authority: object): Promise<void>; close(): Promise<void> }

/** Device mode reuses original native ports and exposes only reviewed public JSON and selected-session operations. */
import { NativePorts, NativePrimitives, NativeRelayBudgets } from '../paired/PairedCore'
export interface NativeDeviceCrypto { signer: { publicSpki: string; sign(bytes: Uint8Array): Promise<Uint8Array> }; primitives: NativePrimitives }
export interface NativeDeviceNetwork { readonly ports: NativePorts; open(): Promise<void>; authenticated(): void; close(): Promise<void> }
export declare class NativeDeviceProductFacade {
  constructor(authority: object, policy: string, identityAlias: string, host: string, routingExpiresAt: number, relay: NativeRelayBudgets, storage: ProductStorage, crypto: NativeDeviceCrypto, scheduler: ProductScheduler, clock: () => number, acquire: (registration: string, diagnostic?: (stage: string) => void) => Promise<NativeDeviceNetwork>, publish: (view: string) => void, catalogRefreshMs: number, routeStorage?: ProductStorage, pairedConnection?: boolean)
  verifyStorageRecovery(expected: string): Promise<string>
  bootStatus(): Promise<void>
  static startupDiagnostic(error: Error, stage: string): string
  static selectionInput(raw: string): string
  static routingInput(raw: string): string
  static previewReceipt(raw: string): string
  boot(): Promise<void>
  bound(): boolean
  connectionHost(): string
  routeReady(): boolean
  previewRoute(raw: string): Promise<string>
  signRoute(raw: string, approved: boolean): Promise<string>
  stopRoute(): Promise<void>
  previewEnrollment(raw: string): Promise<string>
  signEnrollment(raw: string, compared: boolean): Promise<string>
  preview(raw: string): string
  pairWithConnection(raw: string, compared: boolean, networkApproved: boolean): Promise<void>
  savedPairing(confirmed: boolean): Promise<string>
  connect(networkApproved: boolean): Promise<void>
  select(session: string): Promise<void>
  refresh(): Promise<void>
  manage(raw: string): Promise<string>
  submit(request: string, text: string): Promise<string>
  receipt(request: string): Promise<string>
  cancel(): Promise<void>
  richRequest(raw: string): Promise<string>
  richRefusal(raw: string): string
  revoke(): Promise<void>
  close(): Promise<void>
}

/** App-owned automatic saved-device connection; no pairing or task is created. */
export interface AutomaticConnectionPort { available(): boolean; connected(): boolean; connect(): Promise<void>; disconnect(): Promise<void>; failed(): void }
export declare class AutomaticConnection {
  constructor(port: AutomaticConnectionPort, scheduler: { after(ms: number, callback: () => void): () => void }, retryDelayMs: number)
  start(): Promise<void>
  stop(): Promise<void>
}
