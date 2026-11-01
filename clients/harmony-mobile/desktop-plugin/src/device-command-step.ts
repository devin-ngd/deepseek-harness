/** Bounded command phases retain the first exception while every owned cleanup is attempted. */
export type DeviceCommandStage = 'operation' | 'identity-open' | 'owner-create' | 'transport-stop' | 'binding-read' | 'route-read' | 'profile-provider' | 'transport-policy' | 'relay-provider' | 'product-activate' | 'journal-open' | 'executor-mount' | 'relay-mount'
/** The original cause stays local; cleanup messages and payloads never enter public diagnostics. */
export class DeviceCommandStepError extends Error {
  /** @param stage - closed local phase. @param cause - first failed operation. @param cleanupFailed - at least one owned cleanup rejected. */
  constructor(readonly stage: DeviceCommandStage, cause: unknown, readonly cleanupFailed: boolean) { super('device command step failed', { cause }); this.name = 'DeviceCommandStepError' }
}
/** @param stage - static phase label. @param operation - one real operation. @param cleanup - ordered owned cleanup, all attempted on failure. @returns the operation result; failure retains its first cause even when cleanup rejects. */
export async function deviceCommandStep<T>(stage: DeviceCommandStage, operation: () => T | PromiseLike<T>, cleanup: readonly (() => unknown | PromiseLike<unknown>)[] = []): Promise<T> {
  try { return await operation() } catch (cause) {
    let cleanupFailed = false
    for (const action of cleanup) { try { await action() } catch { cleanupFailed = true } }
    throw new DeviceCommandStepError(stage, cause, cleanupFailed)
  }
}
