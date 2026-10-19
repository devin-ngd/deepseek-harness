/** Local-native fingerprint confirmation. It holds public display facts only and cannot generate keys, grants or a host execution bridge. */
export class PairingView {
  readonly desktopFingerprint: string
  readonly phoneFingerprint: string
  readonly desktopId: string
  readonly profileId: string
  readonly deviceId: string
  readonly sessionIds: string
  readonly operations: string
  readonly expiresAt: number
  readonly grantTtlMs: number
  constructor(desktopFingerprint: string, phoneFingerprint: string, desktopId: string, profileId: string, deviceId: string, sessionIds: string, operations: string, expiresAt: number, grantTtlMs: number) {
    this.desktopFingerprint = desktopFingerprint; this.phoneFingerprint = phoneFingerprint; this.desktopId = desktopId; this.profileId = profileId; this.deviceId = deviceId; this.sessionIds = sessionIds; this.operations = operations; this.expiresAt = expiresAt; this.grantTtlMs = grantTtlMs
  }
}
/** Human result stays bound to the exact trusted native offer instance and cannot be supplied by a guest JSON message. */
export class NativePairingConsent {
  private current: PairingView | undefined = undefined
  private compared: boolean = false
  private authority: object
  private clock: () => number
  constructor(authority: object, clock: () => number) { this.authority = authority; this.clock = clock }
  offer(authority: object, value: PairingView): void {
    if (authority !== this.authority || !/^p256-sha256-[a-f0-9]{64}$/.test(value.desktopFingerprint) || !/^p256-sha256-[a-f0-9]{64}$/.test(value.phoneFingerprint) || value.expiresAt <= this.clock() || !Number.isSafeInteger(value.grantTtlMs) || value.grantTtlMs <= 0) throw new Error('pairing offer denied')
    this.current = value; this.compared = false
  }
  compare(authority: object, value: PairingView, compared: boolean): void { this.check(authority, value); this.compared = compared }
  accept(authority: object, value: PairingView): PairingView { this.check(authority, value); if (!this.compared) throw new Error('fingerprints not compared'); this.clear(authority); return value }
  clear(authority: object): void { if (authority !== this.authority) throw new Error('local only'); this.current = undefined; this.compared = false }
  private check(authority: object, value: PairingView): void { if (authority !== this.authority || value !== this.current || value.expiresAt <= this.clock()) throw new Error('pairing confirmation stale') }
}
