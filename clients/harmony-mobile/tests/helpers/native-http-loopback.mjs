/** Node-only SDK callback substitute carrying real ephemeral-loopback bytes; it cannot establish native HTTP qualification. */
import { http, NativeHttpStream, NativeStreamPolicy, NativeHttpIo, NativeHttpIoPolicy, resetSdk } from '../../.build/native-adapters.js'
import { NativeHttpBytePort } from '../../.build/native-http-port.js'
import { privateHttpPort } from './native-private-http.mjs'
import { request as nodeRequest } from 'node:http'

/** @param baseUrl - parent-owned ephemeral BFF. @returns byte port and awaited substitute cleanup; no browser/native credential or permission is used. */
export function nativeLoopbackPort(baseUrl, usePrivatePort = false) {
  if (process.env.DSH_SNAPSHOT_REPLAY_ONLY !== '1') throw new Error('Explicit offline guard required')
  resetSdk()
  const root = new URL(baseUrl), original = http.createHttp, tasks = new Set(), active = new Set(), requests = []
  if (root.protocol !== 'http:' || root.hostname !== '127.0.0.1' || root.pathname !== '/') throw new Error('Owned loopback required')
  http.createHttp = () => {
    const request = original(), destroy = request.destroy
    let client, response
    request.destroy = () => { response?.destroy(); client?.destroy(); destroy() }
    const start = request.requestInStream
    request.requestInStream = (url, options) => {
      if (!['/mobile/command', '/mobile/follow'].some(path => url === new URL(path, root).href)) throw new Error('Fixed BFF endpoint required')
      const result = start(url, options)
      requests.push({ url, options })
      const task = new Promise(accept => {
        let clientClosed = false, responseClosed = true
        const settled = () => { if (clientClosed && responseClosed) { active.delete(request); accept() } }
        client = nodeRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, agent: false }, value => {
          response = value; responseClosed = false
          value.once('close', () => { responseClosed = true; settled() })
          value.on('error', error => { void error; request.reject() })
          request.emit('headersReceive', { 'content-type': value.headers['content-type'] })
          request.respond(value.statusCode)
          value.on('data', chunk => {
            for (let offset = 0; offset < chunk.length; offset += 7) {
              const bytes = Uint8Array.from(chunk.subarray(offset, offset + 7))
              request.emit('dataReceive', bytes.buffer)
            }
          })
          value.once('end', () => request.emit('dataEnd'))
        })
        client.once('close', () => { clientClosed = true; settled() })
        client.on('error', error => { void error; request.reject() })
        active.add(request); client.end(options.extraData)
      })
      tasks.add(task); void task.then(() => tasks.delete(task), () => tasks.delete(task))
      return result
    }
    return request
  }
  const privateAdapter = usePrivatePort ? privateHttpPort(new NativeHttpIo(new NativeHttpIoPolicy(true, baseUrl, 1048576, 4194304, 2097152, 524288, 4, 20000)), baseUrl, 1048576) : undefined
  const port = privateAdapter?.port ?? new NativeHttpBytePort({ maxQueuedBytes: 2097152, maxChunks: 524288,
    create: url => new NativeHttpStream(new NativeStreamPolicy(true, url, 1048576, 4194304, 20000)) })
  return { port, requests, privateCalls: privateAdapter?.calls, async close() { let failure; try { await privateAdapter?.close() } catch(error) { failure=error } finally { http.createHttp = original; for (const request of active) request.destroy(); await Promise.all([...tasks]) } if (tasks.size !== 0 || active.size !== 0) throw new Error('Native substitute request still active'); if(failure)throw failure } }
}
