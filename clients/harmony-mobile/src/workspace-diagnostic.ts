/** Content-free failure labels for the standard workspace carrier. */
import { E2EError } from './e2e-error.ts'
import { TransportError } from './wire.ts'
import type { WorkspaceRequest } from './workspace-protocol.ts'

/** @param request - validated operation, if parsing succeeded. @returns the operation or a fixed boot endpoint label without logging the URL. */
export function workspaceDiagnosticOperation(request: WorkspaceRequest | undefined): string {
  if (request === undefined) return 'invalid-request'
  if (request.operation !== 'fetch') return request.operation
  const path = /^https:\/\/[^/?#]+(\/[^?#]*)/.exec(request.url)?.[1]
  switch (path) {
    case '/api/richInline/appearance': return 'rich-appearance'
    case '/api/dynamicCordisRunner/inventory': return 'cordis-inventory'
    case '/api/dynamicCordisRunner/syncInspectManifest': return 'inspect-manifest'
    default: return 'fetch'
  }
}

/** @param error - private carrier failure. @returns a fixed diagnostic label that never contains the exception text. */
export function workspaceDiagnosticFailure(error: unknown): string {
  if (error instanceof E2EError) return error.code === 'capacity' ? 'encrypted-capacity' : 'encrypted-failure'
  if (error instanceof TransportError) {
    switch (error.code) {
      case 'cancelled': case 'closed': case 'invalid-packet': case 'queue-full': case 'scope-denied': case 'timeout': case 'unknown-outcome': case 'workspace-grant-required':
        return error.code
    }
  }
  return 'unclassified'
}
