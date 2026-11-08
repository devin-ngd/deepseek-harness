/** Loopback-only translation responses for an unchanged installed official plugin. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export const officialReasoning = 'STANDARD_PLUGIN_REASONING'
export const officialTranslation = 'STANDARD_PLUGIN_TRANSLATED_JA'
/** @param {string} runtime Copied installed runtime. @returns {Promise<object[]>} Exact package bytes without installation or lifecycle scripts. */
export async function officialPackageInventory(runtime) {
  const rows = []
  for (const name of ['cot-translation-bundle', 'client-ui-cot-translation', 'translator']) {
    const directory = join(runtime, 'node_modules/@deepseek-ai/dsh-experimental-' + name)
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')), files = []
    async function visit(relative = '') {
      for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
        const path = relative ? relative + '/' + entry.name : entry.name
        if (entry.name === 'node_modules') continue
        if (entry.isDirectory()) await visit(path)
        else { assert.equal(entry.isFile(), true); const bytes = await readFile(join(directory, path)); files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
      }
    }
    await visit(); files.sort((a, b) => a.path.localeCompare(b.path))
    rows.push({ name: metadata.name, version: metadata.version, directory, files, excluded: ['node_modules dependency edges'] })
  }
  return rows
}
/** @returns {Promise<object>} Owned finite endpoint, accepted synthetic requests and cleanup. */
export async function createOfficialTranslationReplay() {
  const requests = [], errors = [], server = createServer()
  server.on('request', (request, response) => {
    void (async () => {
      const url = new URL(request.url, 'http://127.0.0.1'), chunks = []; let bytes = 0
      assert.equal(request.method, 'POST'); assert.ok(['/google', '/bing'].includes(url.pathname))
      for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes <= 8192); chunks.push(chunk) }
      const body = Buffer.concat(chunks).toString('utf8')
      const text = url.pathname === '/google' ? new URLSearchParams(body).get('q') : JSON.parse(body)[0]
      const target = url.pathname === '/google' ? new URLSearchParams(body).get('tl') : url.searchParams.get('to')
      assert.equal(text, officialReasoning); assert.equal(target, 'ja'); assert.ok(requests.length < 4)
      requests.push({ provider: url.pathname.slice(1), text, target })
      const value = url.pathname === '/google' ? [[[officialTranslation, officialReasoning, null, null, 1]], null, 'en'] : [{ translations: [{ text: officialTranslation, to: 'ja' }] }]
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value))
    })().catch(error => { errors.push(String(error)); if (!response.headersSent) response.writeHead(400); response.end() })
  })
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept) })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  return { endpoint: 'http://127.0.0.1:' + address.port, requests, errors,
    async close() { server.closeAllConnections(); await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())) } }
}
