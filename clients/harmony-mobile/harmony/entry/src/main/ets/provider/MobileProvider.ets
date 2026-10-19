/** Inactive native seam. Shared TS PhoneCore owns decoding and normalization; native code supplies transport/port lifetimes. */
export interface NativePresentationSink {
  publish(viewJson: string): void
  transportFailed(code: string): void
}
/** Trusted ArkUI owner; credentials and these methods must never be exposed to rich HTML. */
export interface MobileProvider {
  /** Packets are created by trusted PhoneLibrary; a guest cannot call native reads. */
  read(packetJson: string): Promise<string>
  follow(sessionId: string, sink: NativePresentationSink): Promise<void>
  submit(sessionId: string, requestId: string, text: string): Promise<string>
  cancel(sessionId: string): Promise<void>
  disconnect(): Promise<void>
}
/** Only a bound native message-port identity may supply this receiver; no arbitrary JavaScript proxy is enabled. */
export interface ScopedRichReceiver {
  receive(packetJson: string): Promise<string>
  revoke(): Promise<void>
}
/** Default source build has no network transport, pairing or device permission activation. */
export class DisabledMobileProvider implements MobileProvider {
  async read(packetJson: string): Promise<string> {
    if (packetJson.length > 0) throw new Error('disabled')
    throw new Error('invalid-request')
  }
  async follow(sessionId: string, sink: NativePresentationSink): Promise<void> {
    if (sessionId.length > 0) sink.transportFailed('disabled')
  }
  async submit(sessionId: string, requestId: string, text: string): Promise<string> {
    if (sessionId.length > 0 && requestId.length > 0 && text.length > 0) throw new Error('disabled')
    throw new Error('invalid-request')
  }
  async cancel(sessionId: string): Promise<void> {
    if (sessionId.length > 0) throw new Error('disabled')
    throw new Error('invalid-request')
  }
  async disconnect(): Promise<void> {}
}
/** App-owned cache implementation must bound reads before allocation and atomically replace one file. No filesystem provider is active in this source fixture. */
export interface NativeCacheStorage {
  read(maxBytes: number): Promise<string | null>
  write(text: string): Promise<void>
  clear(): Promise<void>
}
