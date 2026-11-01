/** Safe diagnostics never display arbitrary exception messages, causes, stacks or provider payloads. */
import { DesktopIdentityError } from './identity.ts'
import { DeviceRouteStorageError } from './device-route-storage.ts'
import { ProfileJournalError } from './journal.ts'
import { LinkError } from '../../src/link-protocol.ts'
import { DeviceCommandStepError, type DeviceCommandStage } from './device-command-step.ts'
/** Preparation has no route mutation; later failures may require persistence inspection. */
export class DeviceCommandPreparationError extends Error {
  constructor(readonly stage: 'identity-open' | 'owner-create', cause: unknown) { super('device preparation failed', { cause }); this.name = 'DeviceCommandPreparationError' }
}
/** @param error - contained failure. @param aborted - invocation cancellation. @returns static diagnostics containing only closed local dispositions. */
export function deviceCommandFailure(error: unknown, aborted: boolean): string {
  let stage: DeviceCommandStage = 'operation', failure = error, cleanupFailed = false
  for (let depth = 0; depth < 8; depth++) {
    if (failure instanceof DeviceCommandPreparationError) { stage = failure.stage; failure = failure.cause }
    else if (failure instanceof DeviceCommandStepError) { stage = failure.stage; cleanupFailed ||= failure.cleanupFailed; failure = failure.cause }
    else break
  }
  const stages = new Set(['operation', 'identity-open', 'owner-create', 'transport-stop', 'binding-read', 'route-read', 'profile-provider', 'transport-policy', 'relay-provider', 'product-activate', 'journal-open', 'executor-mount', 'relay-mount'])
  const identities = new Set(['denied', 'absent', 'exists', 'plaintext-refused', 'invalid-record', 'unavailable', 'write-unknown'])
  const storage = new Set(['profile-denied', 'blocked', 'read-unavailable', 'ambiguous-namespace', 'namespace-changed', 'invalid-record', 'persistence-unknown', 'history-capacity', 'compare-conflict'])
  const links = new Set(['mock-only', 'invalid-packet', 'protocol-mismatch', 'scope-denied', 'revoked', 'grant-expired', 'request-expired', 'id-conflict', 'unknown-outcome', 'stale-mount', 'desktop-offline', 'phone-suspended', 'transport-lost', 'resync-needed', 'queue-full', 'closed', 'approval-expired', 'read-disabled', 'read-expired'])
  const journals = new Set(['journal-already-exists', 'journal-recovery-invalid'])
  const code = aborted ? 'cancelled'
    : failure instanceof DesktopIdentityError && identities.has(failure.code) ? 'identity-' + failure.code
      : failure instanceof DeviceRouteStorageError && storage.has(failure.code) ? 'route-storage-' + failure.code
        : failure instanceof ProfileJournalError && journals.has(failure.code) ? failure.code
          : failure instanceof LinkError && links.has(failure.code) ? 'link-' + failure.code
            : failure instanceof TypeError ? 'type-error' : failure instanceof SyntaxError ? 'syntax-error' : 'unclassified-failure'
  return 'Device operation failed [' + (stages.has(stage) ? stage : 'operation') + '/' + code + ']' + (cleanupFailed ? ' [cleanup-failed]' : '') + '. Preserve original identities and public history. Inspect local binding and route state before repeating writes; relay revocation remains separately owned.'
}
