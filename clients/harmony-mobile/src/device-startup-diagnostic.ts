/** Closed startup facts; private causes and stored records never enter the native view. */
export type DeviceStartupStage = 'binding-read' | 'identity-init' | 'route-history-restore'
export type DeviceStartupCategory = 'unavailable' | 'invalid'
const stages: readonly string[] = ['binding-read', 'identity-init', 'route-history-restore']
/** The original failure is retained privately; bindingVerified is set only after receipt and original-key verification. */
export class DeviceStartupFailure extends Error {
  constructor(readonly stage: DeviceStartupStage, readonly category: DeviceStartupCategory, readonly bindingVerified: boolean, cause?: unknown) { super('device startup failed', { cause }); this.name = 'DeviceStartupFailure' }
}
/** @param error - private first cause. @param stage - current owned step. @param verified - completed original binding verification. @returns the first typed failure. */
export function deviceStartupFailure(error: unknown, stage: DeviceStartupStage, verified = false): DeviceStartupFailure { return error instanceof DeviceStartupFailure ? error : new DeviceStartupFailure(stage, error instanceof SyntaxError ? 'invalid' : 'unavailable', verified, error) }
/** @param error - retained typed cause or an opaque native failure. @param fallback - native owned startup step. @returns fixed vocabulary only, never an exception message. */
export function deviceStartupDiagnosticText(error: unknown, fallback: string): string { const stage = error instanceof DeviceStartupFailure ? error.stage : fallback, category = error instanceof DeviceStartupFailure ? error.category : error instanceof SyntaxError ? 'invalid' : 'unavailable'; return (stages.includes(stage) ? stage : 'binding-read') + '/' + (category === 'invalid' ? 'invalid' : 'unavailable') }
