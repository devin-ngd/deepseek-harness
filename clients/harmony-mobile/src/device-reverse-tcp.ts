/** Framing and one-use admission for the reverse TCP carrier. Application data still uses the paired encrypted channel. */
import type { RelaySocket } from '../integration/relay-core.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const acknowledged = 'dsh-reverse-tcp-v1:accepted'
const binaryFlag = 0x80000000

type Frame = { bytes: Uint8Array; binary: boolean }
type Receive = (bytes: Uint8Array, binary: boolean) => void

/** Reassembles bounded frames across arbitrary TCP reads and owns delivery until the encrypted consumer attaches. */
export class ReverseTcpPort implements RelaySocket {
  private readonly header = new Uint8Array(4)
  private headerBytes = 0
  private frame: Frame | undefined
  private frameBytes = 0
  private readonly queue: Frame[] = []
  private queuedBytes = 0
  private receiver: Receive | undefined
  private readonly ends = new Set<() => void>()
  private closed = false

  /** @param maxFrame - shared E2E frame cap. @param maxQueued - receive and send byte cap. @param write - owned TCP writer. @param buffered - outstanding TCP writes. @param release - starts transport cleanup. */
  constructor(private readonly maxFrame: number, private readonly maxQueued: number,
    private readonly write: (bytes: Uint8Array) => void, private readonly buffered: () => number,
    private readonly release: () => void) {}

  get bufferedAmount(): number { return this.buffered() }

  /** @param chunk - bytes from one native TCP read. */
  receive(chunk: Uint8Array): void {
    let offset = 0
    while (!this.closed && offset < chunk.length) {
      if (this.frame === undefined) {
        const count = Math.min(4 - this.headerBytes, chunk.length - offset)
        this.header.set(chunk.subarray(offset, offset + count), this.headerBytes)
        offset += count
        this.headerBytes += count
        if (this.headerBytes < 4) return
        const field = new DataView(this.header.buffer).getUint32(0)
        const binary = field >= binaryFlag, length = binary ? field - binaryFlag : field
        if (length === 0 || length > this.maxFrame || this.queuedBytes + length > this.maxQueued) { this.terminate(); return }
        this.frame = { bytes: new Uint8Array(length), binary }
        this.frameBytes = 0
        this.headerBytes = 0
      }
      const frame = this.frame
      const count = Math.min(frame.bytes.length - this.frameBytes, chunk.length - offset)
      frame.bytes.set(chunk.subarray(offset, offset + count), this.frameBytes)
      offset += count
      this.frameBytes += count
      if (this.frameBytes === frame.bytes.length) {
        this.frame = undefined
        this.queue.push(frame)
        this.queuedBytes += frame.bytes.length
        this.drain()
      }
    }
  }

  private drain(): void {
    while (!this.closed && this.receiver !== undefined && this.queue.length > 0) {
      const frame = this.queue.shift()!
      this.queuedBytes -= frame.bytes.length
      try { this.receiver(frame.bytes, frame.binary) } catch (error) { void error; this.terminate() }
    }
  }

  /** @param callback - sole current frame consumer. @returns the consumer's disposer. */
  onFrame(callback: Receive): () => void {
    if (this.receiver !== undefined) throw new Error('reverse TCP receiver already attached')
    this.receiver = callback
    this.drain()
    return () => { if (this.receiver === callback) this.receiver = undefined }
  }

  /** @param callback - terminal notice. @returns the notice's disposer. */
  onEnd(callback: () => void): () => void {
    if (this.closed) { callback(); return () => {} }
    this.ends.add(callback)
    return () => { this.ends.delete(callback) }
  }

  /** @param bytes - one E2E frame. */
  send(bytes: Uint8Array): void { this.sendFrame(bytes, true) }
  /** Queue the existing desktop transport-ready marker. */
  ready(): void { this.sendText('{"relay":"ready","v":1}') }
  /** @param text - fixed admission or readiness message. */
  sendText(text: string): void { this.sendFrame(encoder.encode(text), false) }

  private sendFrame(bytes: Uint8Array, binary: boolean): void {
    if (this.closed || bytes.length === 0 || bytes.length > this.maxFrame || this.bufferedAmount + bytes.length + 4 > this.maxQueued) {
      this.terminate()
      throw new Error('reverse TCP send denied')
    }
    const frame = new Uint8Array(bytes.length + 4)
    new DataView(frame.buffer).setUint32(0, bytes.length + (binary ? binaryFlag : 0))
    frame.set(bytes, 4)
    try { this.write(frame) } catch (error) { this.terminate(); throw error }
  }

  /** Stop delivery and initiate release exactly once. */
  terminate(): void {
    if (this.closed) return
    this.closed = true
    this.frame = undefined
    this.queue.length = 0
    this.queuedBytes = 0
    this.receiver = undefined
    try { this.release() } catch (error) { void error; console.warn('DSH_REVERSE_TCP_RELEASE_FAILED') }
    for (const end of this.ends) {
      try { end() } catch (error) { void error; console.warn('DSH_REVERSE_TCP_END_NOTICE_FAILED') }
    }
    this.ends.clear()
  }
}

/** @param port - connected TCP transport. @param nonce - signed request's one-use random value. @param role - endpoint initiating or accepting TCP. @param signal - admission deadline and cancellation. @returns whether the intended listener acknowledged the request. */
export function admitReverseTcp(port: ReverseTcpPort, nonce: string, role: 'desktop' | 'phone', signal: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(false); return }
    const request = 'dsh-reverse-tcp-v1:' + nonce
    let done = false
    let stopFrame: () => void = () => {}
    let stopEnd: () => void = () => {}
    const finish = (accepted: boolean) => {
      if (done) return
      done = true
      signal.removeEventListener('abort', abort)
      stopFrame()
      stopEnd()
      resolve(accepted)
    }
    const abort = () => finish(false)
    signal.addEventListener('abort', abort, { once: true })
    stopEnd = port.onEnd(abort)
    if (done) return
    stopFrame = port.onFrame((bytes, binary) => {
      if (binary || decoder.decode(bytes) !== (role === 'phone' ? request : acknowledged)) { finish(false); return }
      if (role === 'phone') port.sendText(acknowledged)
      finish(true)
    })
    if (done) stopFrame()
    else if (role === 'desktop') {
      try { port.sendText(request) } catch (error) { void error; finish(false) }
    }
  })
}
