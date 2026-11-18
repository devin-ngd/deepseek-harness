/** Closed phone diagnostic vocabulary. Never derive UI/log text from an exception, payload or remote string. */
import { TransportError } from './wire.ts'
export type DeviceConnectionStage = 'identity-read' | 'route-verify' | 'native-channel' | 'control-handshake' | 'encrypted-handshake' | 'ticket' | 'first-catalog' | 'active-channel' | 'connection-expiry' | 'local-stop'
export type DeviceConnectionCategory = 'unavailable' | 'refused' | 'timeout' | 'closed' | 'invalid' | 'lan-unavailable' | 'mesh-required' | 'endpoints-unavailable'
export interface DeviceConnectionDiagnostic { readonly stage: DeviceConnectionStage; readonly category: DeviceConnectionCategory; readonly cleanupFailed: boolean }
const stages: readonly string[] = ['identity-read','route-verify','native-channel','control-handshake','encrypted-handshake','ticket','first-catalog','active-channel','connection-expiry','local-stop']
const categories: readonly string[] = ['unavailable','refused','timeout','closed','invalid','lan-unavailable','mesh-required','endpoints-unavailable']
/** The first private cause is retained non-enumerably; only this closed projection may cross the native view boundary. */
export class DeviceConnectionFailure extends Error {
  private cleanup = false
  readonly stage: DeviceConnectionStage
  readonly category: DeviceConnectionCategory
  constructor(stage: DeviceConnectionStage, category: DeviceConnectionCategory, cause?: unknown) {
    super('device connection failed', { cause }); this.name = 'DeviceConnectionFailure'
    this.stage = stages.includes(stage) ? stage : 'native-channel'; this.category = categories.includes(category) ? category : 'unavailable'
  }
  cleanupFailed(): void { this.cleanup = true }
  get diagnostic(): DeviceConnectionDiagnostic { return { stage: this.stage, category: this.category, cleanupFailed: this.cleanup } }
}
/** Preserve an earlier typed failure and its private cause; never inspect arbitrary error properties. */
export function deviceConnectionFailure(error: unknown, stage: DeviceConnectionStage, category: DeviceConnectionCategory = 'unavailable'): DeviceConnectionFailure { if (error instanceof DeviceConnectionFailure) return error; const safe = error instanceof TransportError ? error.code === 'timeout' ? 'timeout' : error.code === 'closed' ? 'closed' : error.code === 'scope-denied' ? 'refused' : category : error instanceof SyntaxError ? 'invalid' : category; return new DeviceConnectionFailure(stage, safe, error) }
/** Only reviewed literals are emitted, even if a caller supplies an invalid runtime object. */
export function deviceConnectionDiagnosticText(value: DeviceConnectionDiagnostic | undefined): string { return value === undefined || !stages.includes(value.stage) || !categories.includes(value.category) ? '' : value.stage + '/' + value.category + (value.cleanupFailed === true ? ' / cleanup-failed' : '') }
