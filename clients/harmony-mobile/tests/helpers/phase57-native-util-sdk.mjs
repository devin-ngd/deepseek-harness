/** SDK codec substitute: native empty encodeInto returns undefined; constructor selection and decoder failures remain observable. */
export const state = { encodings: [], encodeCalls: 0 }
const util = {
  TextEncoder: class {
    constructor(encoding) { state.encodings.push(encoding); if (encoding !== 'utf-8') throw new Error('explicit UTF-8 required by this fixture') }
    encodeInto(text) { state.encodeCalls++; return text === '' ? undefined : new TextEncoder().encode(text) }
  },
  TextDecoder: { create(label, options) { const decoder = new TextDecoder(label, options); return { decodeToString: bytes => decoder.decode(bytes) } } }
}
export default util
