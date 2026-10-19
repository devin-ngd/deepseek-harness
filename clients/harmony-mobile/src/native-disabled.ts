/** Native default refuses every operation; fixture network transports are never selected implicitly. */
import type { NativeProvider } from './phone-core.ts'
import type { MobileCommand } from './link-protocol.ts'
import type { JsonValue } from './upstream.ts'
import type { WireItem, WireResume } from './wire.ts'
import { TransportError } from './wire.ts'

/** This provider has no activation, identity, credentials or network implementation. SDK/platform work cannot enable it with configuration. */
export class DisabledNativeProvider implements NativeProvider {
  private closed = false
  /** @param command - native intent retained only by the caller. @param signal - caller wait lifetime. @returns always rejects before external work. */
  request(command: MobileCommand, signal?: AbortSignal): Promise<JsonValue> {
    void command; void signal
    return Promise.reject(new TransportError(this.closed ? 'closed' : 'unpaired'))
  }
  /** @param command - selected follow owner. @param resume - discarded hint. @param signal - foreground lifetime. @returns no frames and an explicit refusal. */
  async *follow(command: MobileCommand, resume: WireResume, signal?: AbortSignal): AsyncIterable<WireItem> {
    void command; void resume; void signal
    throw new TransportError(this.closed ? 'closed' : 'unpaired')
  }
  /** Close this inactive provider; no accepted desktop work is cancelled. */
  async close(): Promise<void> { this.closed = true }
}
