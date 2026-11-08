/** Test-only preload for acceptance of unmodified third-party plugins: records and refuses every non-loopback network attempt made by the host process. */
import net from 'node:net'
import { appendFileSync } from 'node:fs'

const log = process.env.DSH_HARMONY_OUTBOUND_LOG
if (!log) throw new Error('DSH_HARMONY_OUTBOUND_LOG is required for the outbound guard')
const loopback = host => host === undefined || host === '' || host === 'localhost' || host === '::1' || host === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(host)
const record = (kind, target) => appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), kind, target }) + '\n')

const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (loopback(url.hostname)) return originalFetch(input, init)
  record('fetch', url.origin + url.pathname)
  return Promise.reject(new TypeError('fetch failed: non-loopback network is refused by the acceptance guard'))
}

const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function connect(...args) {
  // Node passes either the caller's arguments or an already normalized `[options, callback]` array.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  const options = first !== null && typeof first === 'object' ? first : typeof first === 'number' ? { port: first, host: typeof args[1] === 'string' ? args[1] : undefined } : { path: first }
  if (options.path === undefined && !loopback(options.host)) {
    record('socket', options.host + ':' + options.port)
    process.nextTick(() => this.destroy(new Error('connect refused by the acceptance guard: non-loopback network')))
    return this
  }
  return originalConnect.apply(this, args)
}
