/** @param fields - fixed ordered protocol fields. @returns shared transcript bytes without a key, transport or model. */
export function transcriptBytes(fields: readonly (string | number)[]): Uint8Array { return new TextEncoder().encode(JSON.stringify(fields)) }
