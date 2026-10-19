/** Diagnostic failure is sticky qualification evidence and cannot stop product IO, publication or disposal. */
export class NativeDiagnostics {
  private count: number = 0
  /** @returns failures retained even when the platform logger also fails. */
  get failures(): number { return this.count }
  /** @param make - diagnostic serialization only, never a product operation. */
  observe(make: () => string): void {
    try { console.info(make()) }
    catch (error) { void error; this.reject('native-diagnostic-log-failed') }
  }
  /** @param code - fixed sanitized diagnostic validation or sink failure. */
  reject(code: string): void {
    this.count++
    try { console.warn('DSH native diagnostic failed: ' + code) }
    catch (error) { void error } // The retained count remains available when diagnostic logging itself is unavailable.
  }
}
