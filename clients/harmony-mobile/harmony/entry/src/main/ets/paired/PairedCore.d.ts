/** Typed native import face; implementation is generated from the shared TypeScript owners and never exposed to Web guests. */
export interface NativeSignal { readonly aborted: boolean; addEventListener(type: string, callback: () => void, options?: { once: boolean }): void; removeEventListener(type: string, callback: () => void): void }
export interface NativeLease { readonly receipt: { readonly room: string; readonly role: string; readonly token: string }; readonly signal: NativeSignal }
export interface NativePort { readonly bufferedAmount: number; onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void; onEnd(callback: () => void): () => void; send(bytes: Uint8Array): void; ready(): void; terminate(): void }
export interface NativeSchedule { after(ms: number, callback: () => void): () => void }
export interface NativeAgreement { readonly publicSpki: string; derive(publicSpki: string): Promise<Uint8Array>; close(): void }
export interface NativePrimitives { encode(bytes: Uint8Array): string; decode(text: string): Uint8Array; publicKey(key: string): Promise<void>; credentialId(key: string): Promise<string>; hash(bytes: Uint8Array): Promise<Uint8Array>; hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array>; verify(key: string, bytes: Uint8Array, signature: Uint8Array): Promise<boolean>; encrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, bytes: Uint8Array): Promise<Uint8Array>; decrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> }
export interface NativeCryptoPorts { readonly diagnostic?: (stage: string) => void; readonly signer: { readonly publicSpki: string; sign(bytes: Uint8Array): Promise<Uint8Array> }; readonly primitives: NativePrimitives; readonly remotePublicSpki: string; readonly scheduler: NativeSchedule; readonly clock: () => number; agreement(): Promise<{ readonly key: NativeAgreement; readonly nonce: Uint8Array }> }
export interface NativePorts extends NativeCryptoPorts { readonly controlDiagnostic?: (stage: string) => void; readonly control: NativePort; data(lease: NativeLease): Promise<NativePort> }
export interface NativeLanSocket { open(signal: NativeSignal): Promise<NativePort>; close(): Promise<void> }
export interface NativeLanPorts extends NativeCryptoPorts { readonly lan: NativeLanSocket }
export type NativeDeviceLinkPorts = NativePorts | NativeLanPorts
export declare const DEVICE_LAN_PATH: string
export declare const DEVICE_LAN_PROTOCOL: string
export declare const DEVICE_ENDPOINT_SUBPROTOCOL: string
export declare const DEVICE_REVERSE_SUBPROTOCOL: string
export interface NativeReverseOffer { address: string; port: number; nonce: string }
export interface NativeReverseController { readonly signal: NativeSignal; abort(): void }
export declare function reverseAttemptController(): NativeReverseController
export declare class ReverseTcpPort implements NativePort {
  constructor(maxFrame: number, maxQueued: number, write: (bytes: Uint8Array) => void, buffered: () => number, release: () => void)
  readonly bufferedAmount: number
  receive(bytes: Uint8Array): void
  onFrame(callback: (bytes: Uint8Array, binary: boolean) => void): () => void
  onEnd(callback: () => void): () => void
  send(bytes: Uint8Array): void
  ready(): void
  terminate(): void
}
export declare function admitReverseTcp(port: ReverseTcpPort, nonce: string, role: 'desktop' | 'phone', signal: NativeSignal): Promise<boolean>
export declare function publishNativeReverse(socket: NativePort, pair: string, epoch: number, host: string, expiresAt: number,
  offer: NativeReverseOffer, signer: NativeCryptoPorts['signer'], primitives: NativePrimitives, maxTtlMs: number, maxBytes: number, signal: NativeSignal): Promise<void>
export interface NativeDeviceEndpoints { wlan: string | null; tailnet: string | null; port: number }
export declare function lookupNativeDeviceEndpoints(socket: NativePort, pair: string, epoch: number, host: string, expiresAt: number,
  desktopPublicSpki: string, signer: NativeCryptoPorts['signer'], primitives: NativePrimitives, maxTtlMs: number, maxBytes: number, signal: NativeSignal): Promise<NativeDeviceEndpoints | null>
export declare const DEVICE_LAN_DISCOVERY_BYTES: number
export declare function isDeviceLanEndpoint(address: string, port: number): boolean
export declare function isDeviceLanPort(port: number): boolean
export declare function isDeviceTailnetAddress(address: string): boolean
export declare function isIpv4InSubnet(address: string, network: string, prefixLength: number): boolean
export declare function ipv4SubnetBroadcast(address: string, prefixLength: number): string | undefined
export interface DeviceMeshRoute { address: string; prefixLength: number; excluded: boolean }
export declare function hasDeviceMeshRoute(target: string, localAddresses: readonly string[], routes: readonly DeviceMeshRoute[]): boolean
export declare function lanDiscoveryScope(pairId: string, desktopPublicSpki: string): string
export declare function lanDiscoveryMessage(scope: string, nonce: string, kind: 'q' | 'r', digest: (value: string) => Promise<string>): Promise<string>
export interface NativeRelayBudgets { readonly maxProofs: number; readonly maxQueuedBytes: number; readonly maxChallengeTtlMs: number; readonly maxRoomTtlMs: number; readonly handshakeMs: number; readonly e2e: { readonly maxFrameBytes: number; readonly maxPlaintextBytes: number; readonly maxFrames: number } }
export declare class NativePairedCore { constructor(record: string, policy: NativeRelayBudgets, ports: NativePorts, status: (state: string) => void, received: (packet: string) => void, diagnostic?: (stage: string) => void, controlDiagnostic?: (stage: string) => void); request(id: string, packet: string): Promise<void>; follow(id: string, packet: string): Promise<void>; stop(id: string): Promise<void>; close(): Promise<void> }
