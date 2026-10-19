/** Native IO failures expose stable codes, never paths, response bodies or credentials. */
export class NativeFailure extends Error {
  code: string
  cleanupFailed: boolean
  constructor(code: string, cleanupFailed: boolean = false) {
    super(code)
    this.code = code
    this.cleanupFailed = cleanupFailed
  }
}
