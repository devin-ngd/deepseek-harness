/** In-memory public SDK substitutes for executing actual adapter logic; no OS/network/device calls are made. */
import { createHash, randomUUID } from 'node:crypto'
export const sdk = { files: new Map(), dirs: new Set(['/app']), fds: new Map(), calls: [], faults: new Map(), maxRead: Infinity, maxWrite: Infinity, statSize: null, resources: new Map(), resourceReads: 0, requests: [], api: 26 }
export function resetSdk() { sdk.files.clear(); sdk.dirs = new Set(['/app']); sdk.fds.clear(); sdk.calls = []; sdk.faults.clear(); sdk.maxRead = Infinity; sdk.maxWrite = Infinity; sdk.statSize = null; sdk.resources.clear(); sdk.resourceReads = 0; sdk.requests = []; sdk.api = 26 }
function operation(name) { sdk.calls.push(name); const count = sdk.faults.get(name) ?? 0; if (count > 0) { sdk.faults.set(name, count - 1); throw Object.assign(new Error(name), { code: 13900001 }) } }
function missing() { return Object.assign(new Error('absent'), { code: 13900002 }) }
export const fileIo = {
  OpenMode: { READ_ONLY: 0, READ_WRITE: 2, CREATE: 64, NOFOLLOW: 131072 },
  openSync(path, mode) { operation('open'); const value = sdk.files.get(path); if (value?.symlink && mode & 131072) throw new Error('NOFOLLOW'); if (!value && !(mode & 64)) throw missing(); if (!value) sdk.files.set(path, { bytes: Buffer.alloc(0) }); const fd = Math.max(0, ...sdk.fds.keys()) + 1; sdk.fds.set(fd, { path, offset: 0 }); return { fd } },
  statSync(fd) { operation('stat'); return { size: sdk.statSize ?? sdk.files.get(sdk.fds.get(fd).path).bytes.length } },
  readSync(fd, buffer) { operation('read'); const handle = sdk.fds.get(fd), bytes = sdk.files.get(handle.path).bytes; const length = Math.min(buffer.byteLength, bytes.length - handle.offset, sdk.maxRead); new Uint8Array(buffer).set(bytes.subarray(handle.offset, handle.offset + length)); handle.offset += length; return length },
  writeSync(fd, buffer) { operation('write'); const handle = sdk.fds.get(fd), prior = sdk.files.get(handle.path).bytes, input = Buffer.from(buffer); const length = Math.min(input.length, sdk.maxWrite), next = Buffer.alloc(Math.max(prior.length, handle.offset + length)); prior.copy(next); input.copy(next, handle.offset, 0, length); sdk.files.set(handle.path, { bytes: next }); handle.offset += length; return length },
  closeSync(fd) { operation('close'); sdk.fds.delete(fd) }, fsyncSync() { operation('fsync') },
  renameSync(from, to) { operation('rename'); sdk.files.set(to, sdk.files.get(from)); sdk.files.delete(from) },
  mkdirSync(path) { operation('mkdir'); if (sdk.dirs.has(path)) throw new Error('exists'); sdk.dirs.add(path) },
  rmdirSync(path) { operation('rmdir'); sdk.dirs.delete(path) },
  unlinkSync(path) { operation('unlink'); if (!sdk.files.delete(path)) throw missing() },
}
export const util = {
  TextEncoder: class { encodeInto(text) { return new TextEncoder().encode(text) } },
  TextDecoder: { create(label, options) { return { decodeToString: bytes => new TextDecoder(label, options).decode(bytes) } } },
  Base64Helper: class { encodeToStringSync(bytes) { return Buffer.from(bytes).toString('base64') } },
  generateRandomUUID: () => randomUUID(),
}
export const deviceInfo = { get sdkApiVersion() { return sdk.api } }
export const cryptoFramework = { createMd(name) { if (name !== 'SHA256') throw new Error('algorithm'); const hash = createHash('sha256'); return { updateSync: ({ data }) => hash.update(data), digestSync: () => ({ data: new Uint8Array(hash.digest()) }) } } }
export function context() { return { filesDir: '/app', resourceManager: { getRawFdSync(name) { sdk.resourceReads++; const bytes = sdk.resources.get(name); if (!bytes) throw missing(); return { length: bytes.length } }, closeRawFdSync() {}, getRawFileContentSync(name) { return new Uint8Array(sdk.resources.get(name)) } } } }
export const http = { RequestMethod: { POST: 'POST' }, createHttp() {
  operation('http.create'); const listeners = new Map(); let accept, reject
  const pending = new Promise((a, r) => { accept = a; reject = r })
  const request = { destroyed: false, listeners, options: null, on(name, fn) { operation('http.on'); listeners.set(name, fn) }, off(name) { operation('http.off'); listeners.delete(name) }, destroy() { operation('http.destroy'); request.destroyed = true }, requestInStream(url, options) { operation('http.request'); request.options = { url, ...options }; return pending }, emit(name, data) { listeners.get(name)?.(data) }, respond(code) { accept(code) }, reject(error = new Error('HTTP')) { reject(error) } }
  sdk.requests.push(request); return request
} }
class FakeWebPort { callback = null; posted = []; closed = false; deliver = null; onMessageEvent(fn) { this.callback = fn } postMessageEvent(raw) { if (this.closed) throw new Error('closed'); this.posted.push(raw); this.deliver?.(raw) } emit(raw) { this.callback?.(raw) } close() { this.closed = true } }
class FakeController { url = ''; html = ''; ports = []; bootstrap = null; onLoad = null; onBootstrap = null
  static setWebDebuggingAccess() {}
  loadData(html, mime, encoding, url) { this.html = html; this.url = url; this.onLoad?.(html, url) }
  getUrl() { return this.url }
  createWebMessagePorts() { this.ports = [new FakeWebPort(), new FakeWebPort()]; return this.ports }
  postMessage(raw, ports, uri) { this.bootstrap = { raw, ports, uri }; this.onBootstrap?.(raw, ports, uri) }
}
export const webview = { WebviewController: FakeController, WebCookieManager: { putAcceptCookieEnabled() {}, putAcceptThirdPartyCookieEnabled() {} } }
