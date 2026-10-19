/** Ephemeral mock carrier used only by tests; never loads or launches DSH. */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { MockDesktop } from '../../.build/mock.js'

/** @returns a loopback-only fixture with explicit awaited teardown. */
export async function startLoopbackFixture() {
  const desktop = new MockDesktop('mock')
  const sockets = new Set()
  const server = createServer(async (req, res) => {
    const respond = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)) }
    const address = server.address()
    const authority = `127.0.0.1:${address.port}`
    if (req.headers.host !== authority) { respond(403, { code: 'forbidden' }); return }
    const staticNames = ['browser.html', 'mock.js', 'protocol.js', 'fixtures.js', 'upstream.js', 'upstream-validate.js', 'bridge.js', 'upstream-guest-sdk.js']
    const asset = typeof req.url === 'string' && req.url.startsWith('/assets/') ? req.url.slice('/assets/'.length) : null
    if (req.method === 'GET' && staticNames.includes(asset)) {
      if (req.headers.origin !== undefined && req.headers.origin !== 'http://' + authority) { respond(403, { code: 'forbidden' }); return }
      try {
        const bytes = await readFile(fileURLToPath(new URL('../../.build/' + asset, import.meta.url)))
        res.writeHead(200, { 'content-type': asset.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        res.end(bytes)
      } catch (error) { respond(500, { code: 'fixture-asset-missing' }) }
      return
    }
    if (req.headers.origin !== undefined) { respond(403, { code: 'forbidden' }); return }
    if (req.method !== 'POST' || req.url !== '/mock' || req.headers['content-type'] !== 'application/json') { respond(404, { code: 'not-found' }); return }
    let bytes = 0, chunks = []
    try {
      for await (const chunk of req) {
        bytes += chunk.byteLength
        if (bytes > 65536) { respond(413, { code: 'invalid-request' }); return }
        chunks.push(chunk)
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (input === null || typeof input !== 'object' || Array.isArray(input)) { respond(400, { code: 'invalid-request' }); return }
      let value
      if (input.operation === 'sessions' && Object.keys(input).length === 1) value = desktop.sessions
      else if (input.operation === 'prompt' && Object.keys(input).sort().join() === 'operation,request') value = desktop.prompt(input.request)
      else if (input.operation === 'receipt' && Object.keys(input).sort().join() === 'operation,requestId,sessionId') value = desktop.receipt(input.sessionId, input.requestId)
      else if (input.operation === 'replay' && Object.keys(input).sort().join() === 'cursor,operation,sessionId') value = desktop.replay(input.sessionId, input.cursor)
      else { respond(400, { code: 'invalid-request' }); return }
      respond(200, value)
    } catch (error) {
      respond(400, { code: error instanceof SyntaxError ? 'invalid-request' : error.code ?? 'fixture-failure' })
    }
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    desktop,
    url: `http://127.0.0.1:${server.address().port}/mock`,
    close: async () => {
      const done = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      for (const socket of sockets) socket.destroy()
      await done
    },
  }
}
