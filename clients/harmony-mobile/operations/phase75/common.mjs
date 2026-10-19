/** Content-free operation failures and hashes; contains no desktop plan or identity metadata. */
import { createHash } from 'node:crypto'
/** @param bytes - selected public bytes. @returns SHA-256 hex. */
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
/** @param code - stable refusal category. @returns never. */
export function deny(code) { const error = new Error('phase75: ' + code); error.code = code; throw error }
