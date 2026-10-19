/** Local secret protection is selected by the host; no remote or guest method exposes it. */
export interface DesktopSecretProtection {
  readonly kind: 'windows-dpapi-current-user/1'
  /** @param plaintext - temporary private bytes. @param binding - public record identity. @returns authenticated opaque bytes; failures must not return plaintext. */
  protect(plaintext: Uint8Array, binding: Uint8Array): Promise<Uint8Array>
  /** @param ciphertext - persisted opaque bytes. @param binding - exact public record identity. @returns temporary private bytes owned by the caller, which must clear them. */
  unprotect(ciphertext: Uint8Array, binding: Uint8Array): Promise<Uint8Array>
}

/** Protection failures deliberately exclude child output, input bytes and native diagnostic text. */
export class SecretProtectionError extends Error {
  /** @param code - unsupported host, failed operation, or invalid bounded subprocess response. */
  constructor(readonly code: 'unsupported-platform' | 'protection-failed' | 'protection-protocol', readonly disposition?: { readonly stage: string; readonly exitCode: number | null; readonly timedOut: boolean }) { super('desktop secret protection ' + code + (disposition ? ' at ' + disposition.stage : '')); this.name = 'SecretProtectionError' }
}
