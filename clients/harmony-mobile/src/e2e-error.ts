/** Shared content-free crypto errors; importing public verification does not construct an endpoint channel or schemas. */
export class E2EError extends Error {
  /** @param code - failure category; no keys, proof, identity or plaintext is included. */
  constructor(readonly code: 'invalid' | 'key-invalid' | 'signature-denied' | 'not-ready' | 'sequence' | 'capacity' | 'closed' | 'decrypt-failed') { super(code); this.name = 'E2EError' }
}
