/** A selected Session may read metadata immediately when its borrowed transport becomes connected. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { PairedProductTransport } from '../.build/paired-product-transport.js'

test('the first metadata read works when authorization arrives before or after acquisition', async () => {
  for (const early of [true, false]) {
    const reads = [], requests = [], metadata = { desktopId: 'saved-desktop' }
    let authorize
    const transport = new PairedProductTransport({ maxPending: 8, maxQueuedFrames: 8, maxPacketBytes: 4096, timeoutMs: 1000, recovery: { maxAttempts: 1, retryDelayMs: 100 } }, 100000, () => 100, { after: () => () => {} }, async (status, receive) => {
      authorize = () => status('authorized')
      if (early) authorize()
      return {
        request: async (id, packet) => { requests.push(JSON.parse(packet)); receive(JSON.stringify({ kind: 'result', id, value: metadata })) },
        follow: async () => { throw new Error('No stream belongs to this metadata check') },
        stop: async () => {}, close: async () => {},
      }
    }, state => { if (state === 'connected') reads.push(transport.metadata().then(value => ({ value }), error => ({ error: error.code }))) }, new AbortController().signal)
    try {
      await transport.start()
      if (!early) authorize()
      assert.deepEqual(await Promise.all(reads), [{ value: metadata }], early ? 'authorization before factory return' : 'authorization after factory return')
      assert.deepEqual(requests, [{ method: 'metadata', argument: null }])
    } finally { await transport.close() }
  }
})
